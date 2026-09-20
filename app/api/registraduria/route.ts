import { NextRequest, NextResponse } from "next/server";
import { exigirPermiso } from "@/lib/auth/permisos-ruta";
import { PERMISOS } from "@/lib/permisos";

// POST /api/registraduria
// Recibe: { cedula: string }
export async function POST(req: NextRequest) {
  try {
    // Sin permiso para editar contactos, no se pasa de aqui.
    const permiso = await exigirPermiso(PERMISOS.CONTACTOS_EDITAR);
    if (!permiso.ok) return permiso.respuesta;

    const { cedula } = await req.json();

    if (!cedula) {
      return NextResponse.json({ error: "La cédula es obligatoria" }, { status: 400 });
    }

    // Nota: el scraping de la Registraduria esta sin implementar; la ruta
    // devuelve datos de ejemplo. Cuando se retome, el navegador headless se
    // importa aqui dentro y no en la cabecera del modulo: un `import` de
    // puppeteer en el arbol de la aplicacion web arrastra Chromium entero y
    // sus vulnerabilidades a un codigo que no lo usa.
    
    // const browser = await puppeteer.launch({ headless: "new" });
    // const page = await browser.newPage();
    // await page.goto("URL_DE_LA_REGISTRADURIA");
    // await page.type("input[name='cedula']", cedula);
    // await page.click("button[type='submit']");
    // await page.waitForSelector(".resultado");
    // const puesto = await page.$eval(".puesto", (el) => el.textContent);
    // const mesa = await page.$eval(".mesa", (el) => el.textContent);
    // const direccion = await page.$eval(".direccion", (el) => el.textContent);
    // await browser.close();

    // Mock response
    const mockResponse = {
      puesto_votacion: "Institución Educativa Técnica",
      direccion_puesto: "Calle 123 # 4-56",
      mesa_numero: Math.floor(Math.random() * 50).toString(),
    };

    return NextResponse.json({ data: mockResponse });
  } catch (error) {
    console.error("POST /api/registraduria error:", error);
    return NextResponse.json({ error: "Error al consultar la registraduría" }, { status: 500 });
  }
}
