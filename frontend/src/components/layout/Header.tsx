import React from "react";
import { Button } from "../ui";

const Header: React.FC = () => {
  return (
    <header className="bg-black text-white shadow-md">
      <nav className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
        <div className="text-2xl font-bold text-purple-400">NovaFund</div>
        <div className="space-x-4">
          <Button variant="primary" size="md">
            Mock Connect
          </Button>
        </div>
      </nav>
    </header>
  );
};

export default Header;
