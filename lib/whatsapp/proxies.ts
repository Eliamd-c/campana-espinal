import fs from 'fs';
import path from 'path';
import prisma from "@/lib/db";

/**
 * Lee el archivo de proxies, los formatea y retorna una lista de URLs proxy válidas.
 */
export function obtenerListaProxies(): string[] {
  try {
    const filePath = path.join(process.cwd(), 'Webshare 100 proxies.txt');
    if (!fs.existsSync(filePath)) {
      console.warn(`Archivo de proxies no encontrado en: ${filePath}`);
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && line.includes(':'))
      .map(line => {
        // Formato original: IP:PORT:USER:PASS
        const parts = line.split(':');
        if (parts.length === 4) {
          const [ip, port, user, pass] = parts;
          return `http://${user}:${pass}@${ip}:${port}`;
        }
        return '';
      })
      .filter(url => url !== '');
  } catch (error) {
    console.error('Error al leer el archivo de proxies:', error);
    return [];
  }
}

/**
 * Busca el primer proxy disponible en la lista que no esté asignado a ninguna línea activa.
 */
export async function obtenerProxyDisponible(): Promise<string | null> {
  const proxies = obtenerListaProxies();
  if (proxies.length === 0) return null;

  // Obtener todos los proxies actualmente en uso
  const lineasConProxy = await prisma.lineaWhatsapp.findMany({
    where: {
      proxyUrl: { not: null }
    },
    select: { proxyUrl: true }
  });

  const proxiesEnUso = new Set(lineasConProxy.map(l => l.proxyUrl));

  // Encontrar el primero que no esté en uso
  for (const proxy of proxies) {
    if (!proxiesEnUso.has(proxy)) {
      return proxy;
    }
  }

  // Si todos están ocupados, reutilizar uno aleatorio o el primero
  return proxies[Math.floor(Math.random() * proxies.length)];
}

/**
 * Asigna proxies automáticamente a todas las líneas que actualmente no tengan uno asignado.
 */
export async function asignarProxiesPendientes(): Promise<number> {
  const lineasSinProxy = await prisma.lineaWhatsapp.findMany({
    where: {
      OR: [
        { proxyUrl: null },
        { proxyUrl: "" }
      ]
    }
  });

  let asignados = 0;
  for (const linea of lineasSinProxy) {
    const proxyDisponible = await obtenerProxyDisponible();
    if (proxyDisponible) {
      await prisma.lineaWhatsapp.update({
        where: { id: linea.id },
        data: { proxyUrl: proxyDisponible }
      });
      asignados++;
      console.log(`Asignado proxy auto a línea ${linea.nombre} (ID: ${linea.id}) -> ${proxyDisponible.replace(/\/\/.*@/, '//***:***@')}`);
    }
  }

  return asignados;
}
