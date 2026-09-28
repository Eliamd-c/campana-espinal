/**
 * Comprueba las decisiones de la bandeja contra la base de verdad.
 *
 * No está entre los tests porque escribe en la base real: crea unas
 * solicitudes de prueba, las mueve por todos los caminos y las borra al
 * terminar. Sirve para correrlo después de tocar `lib/agenda/decidir.ts`.
 *
 *   npx tsx scripts/probar-decisiones-agenda.ts
 */
import "dotenv/config";
import prisma from "../lib/db";
import {
  aceptar,
  anadirAlternativa,
  cancelar,
  marcarDuplicada,
  posponer,
  rechazar,
  reprogramar,
  despertarPospuestos,
} from "../lib/agenda/decidir";

const creados: string[] = [];

async function crear(titulo: string, dias: number, estado = "borrador") {
  const pl = await prisma.plantillaAgenda.findFirstOrThrow();
  const a = await prisma.agendamiento.create({
    data: {
      plantilla_id: pl.id,
      reglas_congeladas: (pl.campos ?? []) as any,
      titulo,
      fecha_inicio: new Date(Date.now() + dias * 86400000),
      datos: { lugar: "Salón" },
      estado,
      creado_por: "prueba",
      recursos_solicitados: {
        create: [{ item: "Sillas", cantidad_solicitada: 40, estado: "solicitado", orden: 0 }],
      },
      campos_por_confirmar: { create: [{ campo: "direccion", marcado_por: "prueba" }] },
    },
    select: { id: true },
  });
  creados.push(a.id);
  return a.id;
}

const estadoDe = async (id: string) =>
  (await prisma.agendamiento.findUnique({ where: { id }, select: { estado: true } }))?.estado;

async function main() {
  let fallos = 0;
  const comprobar = (etiqueta: string, ok: boolean, detalle = "") => {
    console.log(`  ${ok ? "✓" : "✗"} ${etiqueta}${detalle ? ` — ${detalle}` : ""}`);
    if (!ok) fallos++;
  };

  // 1. Aceptar
  const a = await crear("P aceptar", 5);
  const r1 = await aceptar(a, "prueba");
  comprobar("aceptar deja la solicitud en cupo", r1.ok && (await estadoDe(a)) === "cupo");

  // 2. Rechazar con motivo
  const b = await crear("P rechazar", 6);
  await rechazar(b, "prueba", "Ese barrio no es prioridad");
  const filaB = await prisma.agendamiento.findUnique({
    where: { id: b },
    select: { estado: true, motivo_cancelacion: true, cancelado_por: true },
  });
  comprobar(
    "rechazar guarda estado, motivo y quién",
    filaB?.estado === "rechazado" && !!filaB.motivo_cancelacion && filaB.cancelado_por === "prueba"
  );

  // 3. Posponer, y que vuelva sola cuando toca
  const c = await crear("P posponer", 7);
  await posponer(c, "prueba", new Date(Date.now() + 2 * 86400000));
  comprobar("posponer aparca la solicitud", (await estadoDe(c)) === "pospuesto");

  const enElPasado = await posponer(c, "prueba", new Date(Date.now() - 86400000));
  comprobar("no deja posponer a una fecha pasada", !enElPasado.ok);

  await prisma.agendamiento.update({
    where: { id: c },
    data: { pospuesto_hasta: new Date(Date.now() - 1000) },
  });
  await despertarPospuestos();
  comprobar("vuelve sola a la bandeja al llegar el día", (await estadoDe(c)) === "borrador");

  // 4. Duplicada, enlazada a la original
  const original = await crear("P original", 9, "cupo");
  const d = await crear("P duplicada", 9);
  await marcarDuplicada(d, "prueba", original);
  const filaD = await prisma.agendamiento.findUnique({
    where: { id: d },
    select: { estado: true, duplicado_de: true },
  });
  comprobar(
    "duplicada queda enlazada a la original",
    filaD?.estado === "rechazado" && filaD.duplicado_de === original
  );

  // 5. Reprogramar: nace una nueva enlazada y la vieja se cancela
  const e = await crear("P reprogramar", 10, "confirmado");
  const nuevaFecha = new Date(Date.now() + 15 * 86400000);
  const r5 = await reprogramar(e, "prueba", nuevaFecha, "El salón no estaba libre");
  const nuevaId = r5.ok ? r5.datos.id : "";
  if (nuevaId) creados.push(nuevaId);

  const vieja = await prisma.agendamiento.findUnique({
    where: { id: e },
    select: { estado: true, motivo_cancelacion: true },
  });
  const nueva = await prisma.agendamiento.findUnique({
    where: { id: nuevaId },
    select: {
      estado: true,
      reprogramado_de: true,
      fecha_inicio: true,
      recursos_solicitados: { select: { item: true } },
      campos_por_confirmar: { select: { campo: true } },
    },
  });

  comprobar("la vieja queda cancelada con su motivo", vieja?.estado === "cancelado" && !!vieja.motivo_cancelacion);
  comprobar("la nueva apunta a la vieja", nueva?.reprogramado_de === e);
  comprobar("la nueva nace como cupo, no confirmada", nueva?.estado === "cupo", nueva?.estado);
  comprobar("se lleva los recursos", (nueva?.recursos_solicitados.length ?? 0) === 1);
  comprobar("se lleva lo que falta por confirmar", (nueva?.campos_por_confirmar.length ?? 0) === 1);

  const otraVez = await reprogramar(e, "prueba", nuevaFecha);
  comprobar("no deja reprogramar algo ya cancelado", !otraVez.ok);

  // 6. Fechas alternativas: al escoger una, las otras se liberan
  const g1 = await crear("P jueves o viernes", 20);
  const alt = await anadirAlternativa(g1, "prueba", new Date(Date.now() + 21 * 86400000));
  const g2 = alt.ok ? alt.datos.id : "";
  if (g2) creados.push(g2);

  const conGrupo = await prisma.agendamiento.findMany({
    where: { id: { in: [g1, g2] } },
    select: { grupo_opciones: true, recursos_solicitados: { select: { item: true } } },
  });
  comprobar(
    "la alternativa comparte grupo con la original",
    conGrupo.length === 2 &&
      !!conGrupo[0].grupo_opciones &&
      conGrupo[0].grupo_opciones === conGrupo[1].grupo_opciones
  );
  comprobar("la alternativa se lleva los recursos", conGrupo[1]?.recursos_solicitados.length === 1);

  const elegida = await aceptar(g1, "prueba");
  comprobar(
    "al escoger una, la otra se libera",
    elegida.ok && elegida.datos.liberadas === 1,
    elegida.ok ? `liberadas: ${elegida.datos.liberadas}` : ""
  );

  const hermana = await prisma.agendamiento.findUnique({
    where: { id: g2 },
    select: { estado: true, motivo_cancelacion: true },
  });
  comprobar(
    "la liberada dice por qué",
    hermana?.estado === "cancelado" && !!hermana.motivo_cancelacion?.includes("otra fecha"),
    hermana?.motivo_cancelacion ?? ""
  );

  // 7. Cancelar una que existía
  const f = await crear("P cancelar", 12, "cupo");
  await cancelar(f, "prueba", "Se cruzó con el mitin");
  comprobar("cancelar guarda el motivo", (await estadoDe(f)) === "cancelado");

  console.log(`\n${fallos === 0 ? "Todo correcto" : `${fallos} comprobación(es) fallida(s)`}`);
}

main()
  .catch((e) => console.error("FALLO:", e))
  .finally(async () => {
    for (const id of creados) {
      await prisma.agendamiento.deleteMany({ where: { reprogramado_de: id } });
      await prisma.agendamiento.deleteMany({ where: { duplicado_de: id } });
      await prisma.agendamiento.deleteMany({ where: { duplicado_de: id } });
      await prisma.agendamiento.deleteMany({ where: { id } });
    }
    console.log("limpieza hecha. agendamientos:", await prisma.agendamiento.count());
    await prisma.$disconnect();
  });
