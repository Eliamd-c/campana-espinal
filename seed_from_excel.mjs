import xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const filePath = 'PLANILLA  ALCALDE CON EL CORAZON AL DIA (Autoguardado).xlsx';

async function main() {
  try {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    
    // Extraer el nombre del líder
    let liderName = "CONCEJAL FERNANDO RUBIO"; // Valor por defecto
    for (let i = 0; i < 20; i++) {
       if (data[i] && data[i].length > 0) {
          const match = data[i].find(cell => typeof cell === 'string' && cell.includes("LIDER:"));
          if (match) {
              const regex = /LIDER:\s*(.*?)\s*FECHA:/;
              const extracted = regex.exec(match);
              if (extracted && extracted[1]) {
                  liderName = extracted[1].trim();
              }
          }
       }
    }

    console.log(`Registrando Líder: ${liderName}...`);
    // Crear el líder
    const lider = await prisma.lider.create({
       data: {
          nombre: liderName,
          estado: "activo",
       }
    });

    console.log("Líder creado con ID:", lider.id);

    let contactosParaUpsert = [];
    
    // Los datos empiezan en la fila 14 (índice 13 o 14, veamos)
    console.log("Procesando contactos...");
    for (let i = 13; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length < 3) continue;
      
      const nombre = row[1];
      const cedula = String(row[2]).trim();
      
      // Filtrar filas vacías o encabezados
      if (!nombre || !cedula || cedula === "undefined" || cedula === "Cedula" || nombre === "Nombres y Apellidos") continue;

      const direccion = row[3] ? String(row[3]) : null;
      const barrio = row[4] ? String(row[4]) : null;
      const celular = row[5] ? String(row[5]) : null;

      contactosParaUpsert.push({
        cedula,
        nombre,
        telefono: celular,
        barrio,
        notas: direccion,
        lider_id: lider.id
      });
    }

    console.log(`[Importer] Encontrados ${contactosParaUpsert.length} contactos válidos en el archivo Excel.`);
    console.log(`[Importer] Iniciando inserciones masivas en base de datos en lotes de 500...`);

    const chunkSize = 500;
    let inserted = 0;

    for (let j = 0; j < contactosParaUpsert.length; j += chunkSize) {
      const chunk = contactosParaUpsert.slice(j, j + chunkSize);
      
      await prisma.$transaction(
        chunk.map((contacto) =>
          prisma.contacto.upsert({
            where: { cedula: contacto.cedula },
            update: {
              nombre: contacto.nombre,
              telefono: contacto.telefono || undefined,
              barrio: contacto.barrio || undefined,
              notas: contacto.notas || undefined,
              lider_id: contacto.lider_id
            },
            create: {
              cedula: contacto.cedula,
              nombre: contacto.nombre || "Sin Nombre",
              telefono: contacto.telefono || "",
              barrio: contacto.barrio || "",
              notas: contacto.notas || "",
              lider_id: contacto.lider_id,
              municipio: "El Espinal",
              es_nuevo: true,
              intencion_voto: "desconocido"
            }
          })
        )
      );

      inserted += chunk.length;
      console.log(`[Importer] ✅ Procesados ${inserted}/${contactosParaUpsert.length} contactos...`);
    }

    console.log(`¡Éxito! Se han importado ${inserted} contactos asociados al líder ${liderName}.`);
  } catch (e) {
    console.error('Error durante la importación:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();
