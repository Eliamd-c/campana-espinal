import xlsx from 'xlsx';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const csvPath = 'resultados_votacion.csv';

async function main() {
    console.log("Leyendo archivo CSV...");
    const workbook = xlsx.readFile(csvPath);
    const sheetName = workbook.SheetNames[0];
    const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

    console.log(`Se encontraron ${data.length} registros en el CSV. Iniciando actualización...`);

    let countUpdated = 0;
    let countSinDatos = 0;
    let countExternos = 0;
    let countNormal = 0;

    for (const row of data) {
        let cedula = row['Cedula'] ? String(row['Cedula']).trim() : null;
        if (!cedula) continue;

        let estado = row['Estado'] ? String(row['Estado']).trim() : null;
        let municipio = row['Municipio'] ? String(row['Municipio']).trim() : null;
        let puesto = row['Puesto'] ? String(row['Puesto']).trim() : null;
        let mesa = row['Mesa'] ? String(row['Mesa']).trim() : null;
        let direccion = row['Dirección'] ? String(row['Dirección']).trim() : null;

        let updateData = {};
        let isSinDatos = false;
        let isExterno = false;

        if (estado === 'No Encontrado' || !puesto) {
            updateData.mesa_numero = 'ERR'; // La lógica del backend lee ERR para los no habilitados
            updateData.notas = 'sin datos';
            isSinDatos = true;
        } else {
            updateData.puesto_votacion = puesto.substring(0, 120);
            updateData.mesa_numero = mesa ? mesa.substring(0, 6) : null;
            updateData.direccion_puesto = direccion ? direccion.substring(0, 120) : null;
            updateData.municipio = municipio ? municipio.substring(0, 80) : null;

            if (municipio && municipio.toUpperCase() !== 'ESPINAL' && municipio.toUpperCase() !== 'EL ESPINAL') {
                updateData.notas = 'no votan en el espinal';
                isExterno = true;
            } else {
                countNormal++;
            }
        }

        try {
            await prisma.contacto.update({
                where: { cedula: cedula },
                data: updateData
            });
            countUpdated++;
            if (isSinDatos) countSinDatos++;
            else if (isExterno) countExternos++;

            if (countUpdated % 500 === 0) console.log(`Procesados ${countUpdated} contactos...`);
        } catch (e) {
            // Ignorar el error P2025 que es "Registro a actualizar no encontrado"
            if (e.code !== 'P2025') {
                console.error(`Error actualizando cedula ${cedula}:`, e.message);
            }
        }
    }

    console.log(`\n¡Actualización completada!`);
    console.log(`Total encontrados en DB y actualizados: ${countUpdated}`);
    console.log(`- Normales (Habilitados Espinal): ${countNormal}`);
    console.log(`- Sin datos (No Encontrado en Registraduría): ${countSinDatos}`);
    console.log(`- Externos (No votan en Espinal): ${countExternos}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
