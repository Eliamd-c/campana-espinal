import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { traceBDOperation } from "@/lib/tracing-helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const diasAtras = parseInt(req.nextUrl.searchParams.get("dias") || "7");

    const fechaInicio = new Date();
    fechaInicio.setDate(fechaInicio.getDate() - diasAtras);

    // 1. Estadísticas generales
    const totalRespuestas = await traceBDOperation("RAG_Stats_Count_Total", () =>
      prisma.respuestaRAG.count({
        where: { fecha_creacion: { gte: fechaInicio } },
      })
    );

    const respuestasRechazadas = await traceBDOperation("RAG_Stats_Count_Rejections", () =>
      prisma.respuestaRAG.count({
        where: {
          fecha_creacion: { gte: fechaInicio },
          rechazada: true,
        },
      })
    );

    const scorePromedio = await traceBDOperation("RAG_Stats_Average_Score", () =>
      prisma.respuestaRAG.aggregate({
        where: { fecha_creacion: { gte: fechaInicio } },
        _avg: { score_validacion: true },
      })
    );

    const confianzaPromedio = await traceBDOperation("RAG_Stats_Average_Confidence", () =>
      prisma.respuestaRAG.aggregate({
        where: { fecha_creacion: { gte: fechaInicio } },
        _avg: { confianza_promedio: true },
      })
    );

    // 2. Problemas más frecuentes usando UNNEST sobre el array de PostgreSQL
    const problemasFrecuentes = await traceBDOperation("RAG_Stats_Frequent_Issues", () =>
      prisma.$queryRaw<
        Array<{ problema: string; cantidad: bigint }>
      >`
        SELECT 
          UNNEST(problemas_detectados) as problema,
          COUNT(*)::bigint as cantidad
        FROM respuestas_rag
        WHERE fecha_creacion >= ${fechaInicio}
        GROUP BY problema
        ORDER BY cantidad DESC
        LIMIT 5
      `
    );

    // Convertir BigInt de PostgreSQL a Number para evitar errores de serialización JSON en Next.js
    const problemasSerializados = problemasFrecuentes.map((item) => ({
      problema: item.problema,
      cantidad: Number(item.cantidad),
    }));

    // 3. Tendencia de alucinaciones/bloqueos
    const tasaAlucinaciones =
      totalRespuestas > 0
        ? ((respuestasRechazadas / totalRespuestas) * 100).toFixed(2)
        : "0";

    return NextResponse.json({
      periodo_dias: diasAtras,
      total_respuestas: totalRespuestas,
      respuestas_rechazadas: respuestasRechazadas,
      tasa_rechazo_porcentaje: parseFloat(tasaAlucinaciones),
      score_validacion_promedio: (
        scorePromedio._avg.score_validacion || 0
      ).toFixed(1),
      confianza_promedio: (confianzaPromedio._avg.confianza_promedio || 0).toFixed(2),
      problemas_frecuentes: problemasSerializados,
      recomendacion:
        parseFloat(tasaAlucinaciones) < 15
          ? "✅ Sistema de auditoría operando normalmente"
          : "⚠️ Tasa de bloqueo RAG elevada, revisar calidad de documentos cargados o especificidad de preguntas",
    });
  } catch (error: any) {
    console.error("Error en estadísticas de auditoría RAG:", error);
    return NextResponse.json(
      { error: "Error obteniendo estadísticas", detalles: error.message },
      { status: 500 }
    );
  }
}
