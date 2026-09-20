const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

/**
 * Servidor de producción.
 *
 * Sirve HTTP plano porque delante hay un proxy (Hostinger) que termina TLS.
 * Eso trae tres consecuencias que aquí se atienden:
 *
 *  1. Si alguien puede llegar directo a este puerto, se salta el TLS del
 *     proxy y, cuando `TRUST_PROXY_HEADERS` está activo, puede falsificar
 *     `x-forwarded-for` y burlar el límite de peticiones. Por eso el puerto
 *     se escucha solo en la interfaz local cuando hay proxy delante.
 *  2. Una petición que llegue por HTTP a través del proxy debe redirigirse a
 *     HTTPS: la sesión del panel viaja en una cookie, y por HTTP va en claro.
 *  3. Sin tiempos de espera, unas pocas conexiones lentas dejan el servidor
 *     sin capacidad (slowloris).
 */

const dev = false; // Forzado a producción en Hostinger
const app = next({ dev });
const handle = app.getRequestHandler();

const port = Number(process.env.PORT) || 3000;

/** ¿Hay un proxy delante que termina TLS y reescribe las cabeceras? */
const trasProxy = process.env.TRUST_PROXY_HEADERS === 'true';

/**
 * Con proxy delante se escucha solo en loopback: el proxy llega por ahí y
 * nadie de fuera puede saltárselo. Sin proxy (desarrollo o arranque manual),
 * se mantiene el comportamiento de antes para no romper nada.
 */
const host = process.env.HOST || (trasProxy ? '127.0.0.1' : '0.0.0.0');

/**
 * Dominio propio, tomado de `NEXTAUTH_URL`. Es el único destino al que esta
 * aplicación se redirige a sí misma. Si no está configurado, simplemente no
 * se redirige: mejor servir por HTTP tras el proxy que mandar a la gente a
 * un sitio que no controlamos.
 */
const anfitrionCanonico = (() => {
  try {
    const url = new URL(process.env.NEXTAUTH_URL || '');
    return url.protocol === 'https:' ? url.host : null;
  } catch {
    return null;
  }
})();

app.prepare().then(() => {
  const servidor = createServer(async (req, res) => {
    try {
      /**
       * El proxy dice por qué protocolo entró la petición. Si entró por HTTP,
       * se responde con una redirección permanente en vez de servir el panel:
       * de lo contrario la cookie de sesión viajaría en claro.
       */
      if (trasProxy && anfitrionCanonico) {
        const protocolo = req.headers['x-forwarded-proto'];
        if (protocolo && protocolo.split(',')[0].trim() === 'http') {
          /**
           * El destino se construye con el dominio propio, NUNCA con
           * `x-forwarded-host` ni `host`: esas cabeceras las escribe quien
           * hace la petición, y muchos proxies las reenvían tal cual. Usarlas
           * convertiría esta redirección en un salto a cualquier dominio, con
           * el agravante de que un 308 conserva método y cuerpo: un POST de
           * login acabaría entero en el servidor del atacante, partiendo de
           * un enlace con el dominio real de la campaña.
           */
          const destino = new URL(req.url, `https://${anfitrionCanonico}`);
          res.writeHead(308, { Location: destino.toString() });
          res.end();
          return;
        }
      }

      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      // El detalle del error se queda en el registro del servidor: un mensaje
      // de excepción puede incluir rutas internas o fragmentos de consulta.
      console.error('Error al atender', req.url, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      }
      res.end('Error interno');
    }
  });

  /**
   * Tiempos de espera. Sin ellos, unas pocas conexiones que envían la
   * petición byte a byte mantienen ocupadas todas las plazas del servidor.
   */
  servidor.headersTimeout = 20_000;   // cabeceras completas en 20 s
  /**
   * 180 s y no 60: el escaneo de planillas sube la foto como data URL dentro
   * del JSON, que abulta un tercio más que el binario. Una foto de 4 MB desde
   * el móvil en la calle, con mala subida, tarda varios minutos; con 60 s se
   * cortaba una petición legítima.
   */
  servidor.requestTimeout = 180_000;
  servidor.keepAliveTimeout = 30_000;
  servidor.timeout = 120_000;

  servidor
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, host, () => {
      console.log(`> Escuchando en ${host}:${port}`);
      if (!trasProxy) {
        console.log(
          '> Aviso: TRUST_PROXY_HEADERS no está activo. En el despliegue, ' +
          'ponlo a "true" para que el límite de peticiones identifique la IP ' +
          'real y se fuerce HTTPS.'
        );
      }
    });
});
