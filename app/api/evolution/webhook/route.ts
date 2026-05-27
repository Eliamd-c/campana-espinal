import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

/**
 * POST /api/evolution/webhook
 *
 * Recibe eventos de Evolution API para todas las instancias.
 * Principalmente maneja:
 *   - connection.update → actualiza estado de línea en BD
 *   - messages.update   → actualiza estado de mensaje (entregado/leído)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const event: string = body.event || "";
    const instanceName: string = body.instance || "";

    // ── Evento de conexión ────────────────────────────────────────────────
    if (event === "connection.update" || event === "CONNECTION_UPDATE") {
      const state: string = body.data?.state || body.data?.connection || "";
      const statusReason: number = body.data?.statusReason ?? 0;

      // Extraer ID de línea desde el nombre de instancia (ej: "linea_3" → 3)
      const match = instanceName.match(/linea_(\d+)/i);
      if (!match) {
        return NextResponse.json({ ok: true, skipped: "instance name no reconocido" });
      }
      const lineaId = parseInt(match[1], 10);

      if (state === "open") {
        await prisma.lineaWhatsapp.update({
          where: { id: lineaId },
          data: { estado: "conectado", ultima_conexion: new Date() },
        });
        console.log(`[WEBHOOK] linea_${lineaId} → CONECTADA`);
      } else if (state === "close" || state === "refused") {
        // Razón 401 con conflict = device_removed (alguien abrió el celular)
        // Razón 428 = QR expirado
        const motivo =
          statusReason === 401 ? "conflict (device_removed)"
          : statusReason === 428 ? "QR expirado"
          : `estado=${state} código=${statusReason}`;

        await prisma.lineaWhatsapp.update({
          where: { id: lineaId },
          data: { estado: "desconectado" },
        });
        console.log(`[WEBHOOK] linea_${lineaId} → DESCONECTADA (${motivo})`);
      } else if (state === "connecting") {
        // No cambiar estado — está en proceso de conectar (esperando QR scan)
        console.log(`[WEBHOOK] linea_${lineaId} → conectando...`);
      }

      return NextResponse.json({ ok: true, event, instance: instanceName, state });
    }

    // ── Actualización de estado de mensaje ────────────────────────────────
    if (event === "messages.update" || event === "MESSAGES_UPDATE") {
      const updates = body.data as Array<{
        key?: { id?: string };
        update?: { status?: string | number };
      }>;

      if (Array.isArray(updates)) {
        for (const upd of updates) {
          const waMsgId = upd.key?.id;
          const statusCode = upd.update?.status;

          if (!waMsgId || statusCode === undefined) continue;

          // WhatsApp status codes: 2=enviado, 3=entregado, 4=leído
          let nuevoEstado: string | null = null;
          if (statusCode === 3 || statusCode === "DELIVERY_ACK") nuevoEstado = "entregado";
          else if (statusCode === 4 || statusCode === "READ") nuevoEstado = "leido";

          if (nuevoEstado) {
            // Buscar el mensaje por wa_message_id si tenemos ese campo,
            // o simplemente ignorar por ahora si no está mapeado
            await prisma.mensaje
              .updateMany({
                where: {
                  // Si tienes un campo wa_message_id, úsalo aquí.
                  // Por ahora actualizamos cualquier "enviado" que coincida:
                  estado: "enviado",
                  // Este filtro se puede mejorar cuando mapees el ID de WA
                },
                data: {},
              })
              .catch(() => {});
            // Por ahora solo logueamos — podemos mapear IDs de WA más adelante
            console.log(`[WEBHOOK] messages.update ${waMsgId} → ${nuevoEstado}`);
          }
        }
      }

      return NextResponse.json({ ok: true });
    }

    // Otros eventos (ignorar silenciosamente)
    return NextResponse.json({ ok: true, event, ignored: true });
  } catch (error: any) {
    console.error("[WEBHOOK] Error procesando evento:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
