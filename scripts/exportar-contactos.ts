import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function exportarContactos() {
  try {
    // Obtener todos los contactos que tengan teléfono y puesto de votación registrado en El Espinal
    const contactos = await prisma.contacto.findMany({
      where: {
        telefono: {
          not: null,
        },
        puesto_votacion: {
          not: null,
        },
      },
      select: {
        nombre: true,
        telefono: true,
      },
    });

    // Filtrar contactos con teléfono de 10 dígitos o más
    const contactosFiltrados = contactos.filter((c) => {
      // Remover caracteres no numéricos del teléfono
      const soloNumeros = c.telefono?.replace(/\D/g, "") || "";
      return soloNumeros.length >= 10;
    });

    // Procesar los datos para separar nombre y apellido
    const datosCSV = contactosFiltrados.map((c) => {
      const nombreCompleto = c.nombre || "";
      const partes = nombreCompleto.trim().split(/\s+/);

      // Si hay más de una palabra, la primera es el nombre y el resto es el apellido
      // Si hay una sola palabra, es solo el nombre
      const nombre = partes[0] || "";
      const apellido = partes.slice(1).join(" ") || "";
      const telefono = c.telefono || "";

      return {
        nombre,
        apellido,
        telefono,
      };
    });

    // Crear el contenido del CSV con headers
    const headers = ["nombre", "apellido", "telefono"];
    const csvContent = [
      headers.join(","),
      ...datosCSV.map((fila) =>
        [fila.nombre, fila.apellido, fila.telefono]
          .map((valor) => `"${valor}"`) // Envolver en comillas para evitar problemas con comas
          .join(",")
      ),
    ].join("\n");

    // Crear directorio de exports si no existe
    const exportsDir = path.join(process.cwd(), "exports");
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    // Guardar el archivo CSV
    const filename = `contactos_${new Date().toISOString().split("T")[0]}.csv`;
    const filepath = path.join(exportsDir, filename);
    fs.writeFileSync(filepath, csvContent, "utf-8");

    console.log(`✅ Exportación completada exitosamente`);
    console.log(`📊 Total de contactos: ${datosCSV.length}`);
    console.log(`📁 Archivo guardado en: ${filepath}`);
  } catch (error) {
    console.error("❌ Error al exportar contactos:", error);
  } finally {
    await prisma.$disconnect();
  }
}

exportarContactos();
