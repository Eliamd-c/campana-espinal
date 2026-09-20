"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { queryClient } from "@/lib/queryClient";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/**
        * La sesión se revalida contra el servidor cada cinco minutos y al
        * volver a la pestaña. Esa comprobación pasa por el callback `jwt`,
        * que consulta la base: si la cuenta se desactivó o cambió la
        * contraseña, el panel echa a la persona sin esperar a que caduque el
        * token.
        */}
      <SessionProvider refetchInterval={300} refetchOnWindowFocus>
        {children}
      </SessionProvider>
    </QueryClientProvider>
  );
}
