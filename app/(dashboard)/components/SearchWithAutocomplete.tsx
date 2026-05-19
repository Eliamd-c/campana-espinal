"use client";

import { useState, useRef, useEffect } from "react";
import { Search, User, MapPin, CheckCircle, Award, X, Sparkles, Loader2 } from "lucide-react";
import { useAutocomplete, Suggestion } from "../hooks/useAutocomplete";
import { useRouter } from "next/navigation";

export function SearchWithAutocomplete() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { suggestions, loading } = useAutocomplete(query);
  const router = useRouter();

  // Cerrar el dropdown al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSelect(suggestions[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setSelectedIndex(-1);
    }
  };

  const handleSelect = (item: Suggestion) => {
    setQuery("");
    setIsOpen(false);
    setSelectedIndex(-1);

    // Navegación inteligente basada en el tipo de elemento seleccionado
    if (item.type === "contacto" && item.id) {
      router.push(`/contactos?cedula=${item.id}`);
    } else if (item.type === "lider" && item.id) {
      router.push(`/lideres?id=${item.id}`);
    } else if (item.type === "barrio") {
      router.push(`/contactos?barrio=${encodeURIComponent(item.label)}`);
    } else if (item.type === "puesto") {
      router.push(`/mesas?puesto=${encodeURIComponent(item.label)}`);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "contacto":
        return <User className="w-4 h-4 text-blue-500" />;
      case "barrio":
        return <MapPin className="w-4 h-4 text-emerald-500" />;
      case "puesto":
        return <CheckCircle className="w-4 h-4 text-purple-500" />;
      case "lider":
        return <Award className="w-4 h-4 text-amber-500" />;
      default:
        return <Search className="w-4 h-4 text-gray-400" />;
    }
  };

  const getBadgeClass = (type: string) => {
    switch (type) {
      case "contacto":
        return "bg-blue-50 text-blue-700 border-blue-100";
      case "barrio":
        return "bg-emerald-50 text-emerald-700 border-emerald-100";
      case "puesto":
        return "bg-purple-50 text-purple-700 border-purple-100";
      case "lider":
        return "bg-amber-50 text-amber-700 border-amber-100";
      default:
        return "bg-gray-50 text-gray-600 border-gray-100";
    }
  };

  return (
    <div ref={containerRef} className="relative w-full max-w-md z-40">
      {/* Input Group */}
      <div className="relative flex items-center bg-white border border-gray-200 hover:border-blue-400 focus-within:border-blue-500 rounded-2xl px-4 py-2.5 transition-all shadow-sm">
        <Search className="w-4 h-4 text-gray-400 mr-2" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setSelectedIndex(-1);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Buscar contactos, barrios, líderes..."
          className="w-full bg-transparent text-sm outline-none text-gray-800 placeholder-gray-400 font-medium"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setIsOpen(false);
              setSelectedIndex(-1);
              inputRef.current?.focus();
            }}
            className="p-1 hover:bg-gray-100 rounded-full transition"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Sugerencias Dropdown */}
      {isOpen && (query.length >= 2) && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="px-4 py-2 border-b border-gray-50 bg-gray-50/50 flex justify-between items-center">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Sugerencias inteligentes</span>
            {loading && <Loader2 className="w-3 h-3 text-blue-500 animate-spin" />}
          </div>

          <div className="max-h-80 overflow-y-auto py-1">
            {suggestions.length > 0 ? (
              suggestions.map((item, idx) => (
                <div
                  key={idx}
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`px-4 py-3 cursor-pointer flex justify-between items-center transition-all ${
                    idx === selectedIndex ? "bg-blue-50/70" : "hover:bg-gray-50/50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl bg-white border border-gray-100 shadow-sm flex items-center justify-center`}>
                      {getIcon(item.type)}
                    </div>
                    <div>
                      <p className={`text-sm font-bold transition-colors ${idx === selectedIndex ? "text-blue-900" : "text-gray-800"}`}>
                        {item.label}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">{item.meta}</p>
                    </div>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border ${getBadgeClass(item.type)}`}>
                    {item.type}
                  </span>
                </div>
              ))
            ) : !loading ? (
              <div className="px-4 py-6 text-center text-gray-400 space-y-2">
                <Sparkles className="w-8 h-8 text-gray-200 mx-auto" />
                <p className="text-xs font-semibold">No se encontraron sugerencias</p>
                <p className="text-[10px]">Prueba con otros términos de búsqueda.</p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-8 h-8 bg-gray-100 rounded-xl" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3.5 bg-gray-100 rounded-md w-2/3" />
                      <div className="h-2.5 bg-gray-100 rounded-md w-1/3" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
