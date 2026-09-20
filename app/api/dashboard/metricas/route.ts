// Esta ruta comprueba permisos, asi que depende de quien la pide:
// no se puede generar en tiempo de compilacion.
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getMetricasGlobales, getEstadisticasPuestos } from "@/lib/cache-strategies";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

export async function GET() {
  try {
    // Sin permiso para ver informes, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.INFORMES_VER);
    if (!permiso.ok) return permiso.respuesta;

    const metricas = await getMetricasGlobales();
    
    // Obtener los 3 puestos de votación con menos contactos (puestos críticos)
    // El original ordenaba por contactos de forma ascendente y tomaba los primeros 3
    const puestosStats = await getEstadisticasPuestos(20); // Traer una muestra más grande
    
    const puestosCriticos = puestosStats
      .map(p => ({ nombre: p.nombre, contactos: p.contactos }))
      .sort((a, b) => a.contactos - b.contactos)
      .slice(0, 3);

    const result = {
      ...metricas,
      puestos_criticos: puestosCriticos
    };

    return NextResponse.json({ data: result, source: "cache-stratified" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

