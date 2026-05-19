import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const filePath = 'c:\\Users\\elamd\\Desktop\\PLANILLA  ALCALDE CON EL CORAZON AL DIA.csv';
  
  if (!fs.existsSync(filePath)) {
    console.error(`El archivo no existe en: ${filePath}`);
    return;
  }

  const content = fs.readFileSync(filePath, 'latin1');
  const lines = content.split('\n').filter(line => line.trim() !== '');

  // Buscar el nombre del líder
  let liderName = "Desconocido";
  let liderId = null;
  
  const liderLine = lines.find(l => l.includes('LIDER:'));
  if (liderLine) {
    const match = liderLine.match(/LIDER:\s*([^;]+?)\s+(CONCEJO|FECHA|REUNION)/);
    if (match && match[1]) {
      liderName = match[1].trim();
    } else {
      // Intentar extraer si no tiene CONCEJO/FECHA al lado
      const parts = liderLine.split('LIDER:');
      if (parts.length > 1) {
        liderName = parts[1].split(';')[0].split('  ')[0].trim();
      }
    }
  }

  console.log(`Líder detectado: ${liderName}`);

  // Crear o buscar el líder
  let lider = await prisma.lider.findFirst({
    where: { nombre: liderName }
  });

  if (!lider) {
    lider = await prisma.lider.create({
      data: {
        nombre: liderName,
        barrio: "Primero de Mayo", // Por defecto según el texto
        estado: "activo",
        score: 10
      }
    });
    console.log(`Líder ${liderName} creado en BD con ID ${lider.id}`);
  } else {
    console.log(`Líder ${liderName} encontrado en BD con ID ${lider.id}`);
  }

  liderId = lider.id;

  // Encontrar la línea de encabezados (contiene "Cedula" o "Nombres")
  const headerIndex = lines.findIndex(l => l.toLowerCase().includes('nombres') && l.toLowerCase().includes('cedula'));
  if (headerIndex === -1) {
    console.error("No se encontraron los encabezados en el archivo.");
    return;
  }

  const headers = lines[headerIndex].split(';').map(h => 
    h.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  );

  let successCount = 0;
  let errorCount = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line || line.replace(/;/g, '').trim() === '') continue;

    const values = line.split(';');
    const data: any = { lider_id: liderId, municipio: "El Espinal", es_nuevo: true };

    for (let j = 0; j < headers.length; j++) {
      const val = values[j]?.trim();
      if (!val) continue;

      const head = headers[j];
      if (head.includes('nombre')) data.nombre = val;
      else if (head.includes('cedula') || head.includes('cc')) data.cedula = val;
      else if (head.includes('celular') || head.includes('telefono')) data.telefono = val;
      else if (head.includes('direccion')) data.notas = `Dirección: ${val}`; // Guardamos dirección en notas o barrio
      else if (head.includes('barrio')) data.barrio = val;
    }

    if (!data.cedula) continue;

    try {
      await prisma.contacto.upsert({
        where: { cedula: data.cedula },
        update: {
          nombre: data.nombre,
          telefono: data.telefono,
          barrio: data.barrio || "Primero de Mayo",
          notas: data.notas,
          lider_id: data.lider_id
        },
        create: {
          cedula: data.cedula,
          nombre: data.nombre || "Desconocido",
          telefono: data.telefono,
          barrio: data.barrio || "Primero de Mayo",
          municipio: data.municipio,
          notas: data.notas,
          lider_id: data.lider_id
        }
      });
      successCount++;
    } catch (error) {
      console.error(`Error insertando Cédula ${data.cedula}`);
      errorCount++;
    }
  }

  console.log(`\nImportación finalizada.`);
  console.log(`✅ Contactos importados/actualizados: ${successCount}`);
  console.log(`❌ Errores: ${errorCount}`);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
