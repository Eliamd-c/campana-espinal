import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campanaId = searchParams.get("campana_id");

  if (!campanaId) {
    return NextResponse.json({ error: "campana_id es requerido" }, { status: 400 });
  }

  const id = parseInt(campanaId);

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      const pushUpdate = async () => {
        try {
          const estados = await prisma.mensaje.groupBy({
            by: ['estado'],
            where: { campana_id: id },
            _count: { estado: true }
          });
          
          const stats = estados.reduce((acc, curr) => ({ ...acc, [curr.estado || 'unknown']: curr._count.estado }), {});
          
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(stats)}\n\n`));
        } catch (e) {
          console.error("Error SSE:", e);
        }
      };

      // Push inicial
      await pushUpdate();

      // En un entorno de producción ideal usaríamos Redis Pub/Sub, pero para Next.js App Router
      // hacemos polling en el servidor cada 2s
      const interval = setInterval(pushUpdate, 2000);

      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    }
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
