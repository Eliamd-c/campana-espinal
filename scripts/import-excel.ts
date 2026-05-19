import * as XLSX from 'xlsx';
import * as fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const filePath = 'c:/Users/elamd/Downloads/PLANILLA  ALCALDE CON EL CORAZON AL DIA (Autoguardado).xlsx';

async function importData() {
  console.log("🚀 Iniciando importación desde Excel...");

  // 1. Asegurar el Líder
  const lider = await prisma.lider.upsert({
    where: { id: 9999 }, // Usamos un ID alto para el importador general o buscamos por nombre
    update: { nombre: "Base de datos Johan" },
    create: { id: 9999, nombre: "Base de datos Johan", estado: "activo" }
  });

  const workbook = XLSX.readFile(filePath);
  let totalImportados = 0;
  let totalErrores = 0;

  for (const sheetName of workbook.SheetNames) {
    console.log(`\n📂 Procesando hoja: ${sheetName}...`);
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });

    // Encontrar la fila de encabezados
    let headerRowIndex = -1;
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      if (row && row.includes('Cedula')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.warn(`⚠️ No se encontró encabezado 'Cedula' en la hoja ${sheetName}. Saltando...`);
      continue;
    }

    const headers = data[headerRowIndex];
    const rows = data.slice(headerRowIndex + 1);

    const idxNombre = headers.indexOf('Nombres y Apellidos');
    const idxCedula = headers.indexOf('Cedula');
    const idxBarrio = headers.indexOf('Barrio ó vereda');
    const idxCelular = headers.indexOf('Celular');

    const contactosHoja = [];

    for (const row of rows) {
      const cedulaRaw = row[idxCedula];
      if (!cedulaRaw) continue;

      const cedula = String(cedulaRaw).replace(/\D/g, '').trim();
      if (cedula.length < 5) continue; // Cédulas inválidas

      const nombre = String(row[idxNombre] || "").trim();
      const barrio = String(row[idxBarrio] || sheetName).trim(); 
      const telefono = String(row[idxCelular] || "").replace(/\D/g, '').trim();

      contactosHoja.push({
        cedula,
        nombre,
        barrio,
        telefono
      });
    }

    console.log(`[Import Excel] Hoja "${sheetName}": Encontrados ${contactosHoja.length} registros válidos.`);

    const chunkSize = 500;
    for (let j = 0; j < contactosHoja.length; j += chunkSize) {
      const chunk = contactosHoja.slice(j, j + chunkSize);
      
      try {
        await prisma.$transaction(
          chunk.map((contacto) =>
            prisma.contacto.upsert({
              where: { cedula: contacto.cedula },
              update: {
                nombre: contacto.nombre || undefined,
                telefono: contacto.telefono || undefined,
                barrio: contacto.barrio || undefined,
                lider_id: lider.id
              },
              create: {
                cedula: contacto.cedula,
                nombre: contacto.nombre || "Desconocido",
                telefono: contacto.telefono || null,
                barrio: contacto.barrio || null,
                lider_id: lider.id,
                municipio: "El Espinal",
                es_nuevo: true
              }
            })
          )
        );
        totalImportados += chunk.length;
        console.log(`[Import Excel] ✅ Procesados ${totalImportados} contactos totales...`);
      } catch (err: any) {
        console.error(`[Import Excel] ❌ Error en lote de hoja ${sheetName}:`, err.message);
        totalErrores += chunk.length;
      }
    }
  }

  console.log(`\n✅ Importación finalizada.`);
  console.log(`📊 Total exitosos: ${totalImportados}`);
  console.log(`⚠️ Errores/Saltados: ${totalErrores}`);

  await prisma.$disconnect();
}

importData();

export {};
