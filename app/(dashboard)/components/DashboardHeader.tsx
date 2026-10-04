"use client";

import { memo } from "react";
import { MapPin } from "lucide-react";
import { SearchWithAutocomplete } from "./SearchWithAutocomplete";

export const DashboardHeader = memo(function Header() {
  return (
    <header className="bg-surface border-b border-line h-16 flex items-center justify-between px-6 md:px-8 flex-shrink-0">
      <div className="flex-1 flex items-center">
        <SearchWithAutocomplete />
      </div>
      <div className="flex items-center gap-4">
        <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-ink-muted bg-surface-2 border border-line rounded-full px-3 py-1.5">
          <MapPin className="w-3.5 h-3.5 text-brand" aria-hidden="true" />
          Espinal, Tolima
        </div>
      </div>
    </header>
  );
});
