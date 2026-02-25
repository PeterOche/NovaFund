// ─────────────────────────────────────────────────────────────────────────────
// Data Pipeline — On-chain + Off-chain data ingestion
// Supports privacy-preserving mode (aggregated/anonymized data only)
// ─────────────────────────────────────────────────────────────────────────────

import type {
  ProjectRawData,
  ProjectOnChainData,
  ProjectOffChainData,
  DataFetchResult,
  DataPipelineConfig,
} from "./types";

const DEFAULT_CONFIG: DataPipelineConfig = {
  cacheTtlMs:   5 * 60 * 1000,  // 5-minute cache
  maxRetries:   3,
  timeoutMs:    8_000,
  privacyMode:  false,
};

// ─── Simple in-memory LRU cache ────────────────────────────────────────────────

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

class DataCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.data;
  }

  set<T>(key: string, data: T, ttlMs: number): void {
    if (this.store.size >= this.maxSize) {
      const firstKey = this.store.keys().next().value;
      if (firstKey !== undefined) this.store.delete(firstKey);
    }
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key: string): void {
    this.store.delete(key);
  }
}

const globalCache = new DataCache();

// ─── Retry-aware fetch wrapper ─────────────────────────────────────────────────

async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  timeoutMs: number,
): Promise<T> {
  let lastError: Error = new Error("Unknown error");

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError;
}

// ─── On-Chain Data Fetcher ─────────────────────────────────────────────────────

export async function fetchOnChainData(
  projectId: string,
  contractAddress: string | undefined,
  chainId: number,
  config: DataPipelineConfig = DEFAULT_CONFIG,
): Promise<DataFetchResult<ProjectOnChainData>> {
  const cacheKey = `on_chain:${projectId}:${chainId}`;
  const cached = globalCache.get<ProjectOnChainData>(cacheKey);

  if (cached) {
    return { data: cached, source: "ON_CHAIN", fetchedAt: Date.now(), fromCache: true };
  }

  try {
    const data = await fetchWithRetry<ProjectOnChainData>(
      async () => {
        // In production: call your blockchain indexer / subgraph API here.
        // Example integration points:
        //   - The Graph Protocol subgraph query
        //   - Moralis/Alchemy token transfer APIs
        //   - Custom event indexer
        const apiUrl = config.onChainRpcUrl
          ? `${config.onChainRpcUrl}/projects/${projectId}/on-chain`
          : `/api/internal/blockchain/${projectId}?chainId=${chainId}`;

        const response = await fetch(apiUrl, {
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(config.timeoutMs),
        });

        if (!response.ok) {
          throw new Error(`On-chain API responded with ${response.status}`);
        }

        return response.json() as Promise<ProjectOnChainData>;
      },
      config.maxRetries,
      config.timeoutMs,
    );

    // Privacy mode: redact individual contribution details
    const sanitized = config.privacyMode
      ? { ...data, largestContribution: -1, contractAddress: undefined }
      : data;

    globalCache.set(cacheKey, sanitized, config.cacheTtlMs);

    return { data: sanitized, source: "ON_CHAIN", fetchedAt: Date.now(), fromCache: false };
  } catch (error) {
    return {
      data: null,
      source: "ON_CHAIN",
      fetchedAt: Date.now(),
      fromCache: false,
      error: error instanceof Error ? error.message : "Unknown on-chain fetch error",
    };
  }
}

// ─── Off-Chain Data Fetcher ────────────────────────────────────────────────────

export async function fetchOffChainData(
  projectId: string,
  config: DataPipelineConfig = DEFAULT_CONFIG,
): Promise<DataFetchResult<ProjectOffChainData>> {
  const cacheKey = `off_chain:${projectId}`;
  const cached = globalCache.get<ProjectOffChainData>(cacheKey);

  if (cached) {
    return { data: cached, source: "OFF_CHAIN", fetchedAt: Date.now(), fromCache: true };
  }

  try {
    const data = await fetchWithRetry<ProjectOffChainData>(
      async () => {
        const apiUrl = config.offChainApiUrl
          ? `${config.offChainApiUrl}/projects/${projectId}`
          : `/api/projects/${projectId}/details`;

        const response = await fetch(apiUrl, {
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(config.timeoutMs),
        });

        if (!response.ok) {
          throw new Error(`Off-chain API responded with ${response.status}`);
        }

        return response.json() as Promise<ProjectOffChainData>;
      },
      config.maxRetries,
      config.timeoutMs,
    );

    globalCache.set(cacheKey, data, config.cacheTtlMs);

    return { data, source: "OFF_CHAIN", fetchedAt: Date.now(), fromCache: false };
  } catch (error) {
    return {
      data: null,
      source: "OFF_CHAIN",
      fetchedAt: Date.now(),
      fromCache: false,
      error: error instanceof Error ? error.message : "Unknown off-chain fetch error",
    };
  }
}

// ─── Unified Data Aggregator ───────────────────────────────────────────────────

export async function aggregateProjectData(
  projectId: string,
  chainId: number,
  contractAddress?: string,
  config: DataPipelineConfig = DEFAULT_CONFIG,
): Promise<{ raw: ProjectRawData | null; errors: string[]; dataSourcesUsed: string[] }> {
  const [onChainResult, offChainResult] = await Promise.allSettled([
    fetchOnChainData(projectId, contractAddress, chainId, config),
    fetchOffChainData(projectId, config),
  ]);

  const errors: string[] = [];
  const dataSourcesUsed: string[] = [];

  const onChain = onChainResult.status === "fulfilled" ? onChainResult.value : null;
  const offChain = offChainResult.status === "fulfilled" ? offChainResult.value : null;

  if (onChainResult.status === "rejected") {
    errors.push(`On-chain fetch failed: ${onChainResult.reason}`);
  } else if (onChain?.error) {
    errors.push(`On-chain fetch error: ${onChain.error}`);
  } else {
    dataSourcesUsed.push("ON_CHAIN");
  }

  if (offChainResult.status === "rejected") {
    errors.push(`Off-chain fetch failed: ${offChainResult.reason}`);
  } else if (offChain?.error) {
    errors.push(`Off-chain fetch error: ${offChain.error}`);
  } else {
    dataSourcesUsed.push("OFF_CHAIN");
  }

  if (!onChain?.data || !offChain?.data) {
    return { raw: null, errors, dataSourcesUsed };
  }

  const raw: ProjectRawData = {
    onChain: onChain.data,
    offChain: offChain.data,
    timestamp: Date.now(),
  };

  return { raw, errors, dataSourcesUsed };
}

// ─── Cache Management ──────────────────────────────────────────────────────────

export function invalidateProjectCache(projectId: string, chainId?: number): void {
  globalCache.invalidate(`off_chain:${projectId}`);
  if (chainId !== undefined) {
    globalCache.invalidate(`on_chain:${projectId}:${chainId}`);
  }
}

export function getCacheStats(): { size: number } {
  return { size: (globalCache as unknown as { store: Map<unknown, unknown> }).store.size };
}
