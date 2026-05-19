"use client";

import { memo } from "react";
import { SearchWithAutocomplete } from "./SearchWithAutocomplete";

export const DashboardHeader = memo(function Header() {
  return (
    <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-6 md:px-8 flex-shrink-0">
      <div className="flex-1 flex items-center">
        <SearchWithAutocomplete />
      </div>
      <div className="flex items-center gap-4">
        <div className="text-xs font-semibold text-gray-400 bg-gray-50 border border-gray-100 rounded-xl px-3 py-1.5 hidden sm:block">
          Espinal, Tolima 📍
        </div>
      </div>
    </header>
  );
});
