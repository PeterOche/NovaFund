import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="bg-black text-gray-400 mt-10">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col md:flex-row justify-between items-center text-sm">
        <span>© 2026 NovaFund. All rights reserved.</span>
        <span className="mt-2 md:mt-0">Designed with a Cosmic touch </span>
      </div>
    </footer>
  );
};

export default Footer;
