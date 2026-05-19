import { NextRequest } from "next/server";
import { getMetricasGlobales, getTopLideres, getEstadisticasCampanas, getEstadisticasPuestos } from "@/lib/cache-strategies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();
  let cancelled = false;

  const readable = new ReadableStream({
    async start(controller) {
      const interval = setInterval(async () => {
        if (cancelled) {
          clearInterval(interval);
          try {
            controller.close();
          } catch {}
          return;
        }

        try {
          const [metricas, lideres, campanas, puestosStats] = await Promise.all([
            getMetricasGlobales(),
            getTopLideres(10),
            getEstadisticasCampanas(),
            getEstadisticasPuestos(20)
          ]);

          const puestosCriticos = puestosStats
            .map(p => ({ nombre: p.nombre, contactos: p.contactos }))
            .sort((a: any, b: any) => a.contactos - b.contactos)
            .slice(0, 3);

          const data = {
            metricas: {
              ...metricas,
              puestos_criticos: puestosCriticos
            },
            lideres,
            campanas,
            timestamp: new Date().toISOString(),
          };

          if (!cancelled) {
            try {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
              );
            } catch {}
          }
        } catch (error) {
          console.error("Error en SSE:", error);
          if (!cancelled) {
            try {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ error: "Error al actualizar datos" })}\n\n`
                )
              );
            } catch {}
          }
        }
      }, 5000); // Cada 5 segundos

      // Enviar datos iniciales inmediatamente
      try {
        const [metricas, lideres, campanas, puestosStats] = await Promise.all([
          getMetricasGlobales(),
          getTopLideres(10),
          getEstadisticasCampanas(),
          getEstadisticasPuestos(20)
        ]);

        const puestosCriticos = puestosStats
          .map(p => ({ nombre: p.nombre, contactos: p.contactos }))
          .sort((a: any, b: any) => a.contactos - b.contactos)
          .slice(0, 3);

        const data = {
          metricas: {
            ...metricas,
            puestos_criticos: puestosCriticos
          },
          lideres,
          campanas,
          timestamp: new Date().toISOString(),
        };

        if (!cancelled) {
          try {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          } catch {}
        }
      } catch (error) {
        console.error("Error en SSE inicial:", error);
      }

      // Limpiar al cerrar conexión
      req.signal.addEventListener("abort", () => {
        cancelled = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {}
      });
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
