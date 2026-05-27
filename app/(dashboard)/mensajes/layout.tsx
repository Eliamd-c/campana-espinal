"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageSquare, Inbox, FileText, BarChart2 } from "lucide-react";

export default function MensajesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const tabs = [
    {
      name: "Enviar Mensajes",
      href: "/mensajes",
      icon: MessageSquare,
      exact: true,
    },
    {
      name: "Respuestas",
      href: "/mensajes/respuestas",
      icon: Inbox,
      exact: false,
    },
    {
      name: "Plantillas",
      href: "/mensajes/plantillas",
      icon: FileText,
      exact: false,
    },
    {
      name: "Analítica",
      href: "/mensajes/analitica",
      icon: BarChart2,
      exact: false,
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      {/* Tab Navigation Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10 px-6 pt-4">
        <div className="max-w-7xl xl:max-w-[1440px] mx-auto flex items-end space-x-1 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const isActive = tab.exact
              ? pathname === tab.href
              : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={`
                  relative flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-t-xl transition-all duration-200 min-w-max group
                  ${
                    isActive
                      ? "bg-indigo-50 text-indigo-700 before:absolute before:inset-x-0 before:bottom-0 before:h-0.5 before:bg-indigo-600 shadow-[0_-4px_10px_-4px_rgba(0,0,0,0.05)]"
                      : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }
                `}
              >
                <tab.icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-500"
                  }`}
                />
                {tab.name}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 w-full relative">
        <div className="absolute inset-0">
          <div className="h-full overflow-y-auto custom-scrollbar">
            {children}
          </div>
        </div>
      </main>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #cbd5e1;
          border-radius: 20px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
