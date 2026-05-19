const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Creando plantillas de checklist...");

  const plantillas = [
    {
      tipo_evento: "mitin",
      items: [
        { item: "Tarima/Escenario", cantidad_default: 1, categoria: "Infraestructura", obtenido: false },
        { item: "Sonido/Micrófonos", cantidad_default: 1, categoria: "Infraestructura", obtenido: false },
        { item: "Sillas", cantidad_default: 100, categoria: "Mobiliario", obtenido: false },
        { item: "Refrigerios", cantidad_default: 100, categoria: "Logística", obtenido: false },
        { item: "Permiso espacio público", cantidad_default: 1, categoria: "Legal", obtenido: false }
      ]
    },
    {
      tipo_evento: "casa_a_casa",
      items: [
        { item: "Volantes/Publicidad", cantidad_default: 500, categoria: "Material", obtenido: false },
        { item: "Planillas de recolección", cantidad_default: 5, categoria: "Material", obtenido: false },
        { item: "Camisetas/Gorras (Brigadistas)", cantidad_default: 10, categoria: "Logística", obtenido: false },
        { item: "Hidratación", cantidad_default: 20, categoria: "Logística", obtenido: false }
      ]
    },
    {
      tipo_evento: "reunion_lideres",
      items: [
        { item: "Salón/Lugar reservado", cantidad_default: 1, categoria: "Infraestructura", obtenido: false },
        { item: "Proyector/Pantalla", cantidad_default: 1, categoria: "Audiovisual", obtenido: false },
        { item: "Refrigerios ejecutivos", cantidad_default: 20, categoria: "Logística", obtenido: false },
        { item: "Material de capacitación", cantidad_default: 20, categoria: "Material", obtenido: false }
      ]
    }
  ];

  for (const p of plantillas) {
    const existe = await prisma.checklistPlantilla.findFirst({
      where: { tipo_evento: p.tipo_evento }
    });
    if (!existe) {
      await prisma.checklistPlantilla.create({
        data: {
          tipo_evento: p.tipo_evento,
          items: p.items,
          activa: true
        }
      });
      console.log(`✅ Plantilla para '${p.tipo_evento}' creada.`);
    } else {
      console.log(`⏭️ Plantilla para '${p.tipo_evento}' ya existe.`);
    }
  }

  console.log("¡Hecho!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
