import { describe, test, expect } from "vitest";
import {
  consultarLimite,
  limitePara,
  identificar,
  claveDeLogin,
  reiniciarRegistros,
  clavesRegistradas,
  LIMITES,
} from "../../lib/rate-limit-edge";

/**
 * El limitador es lo que separa una contraseña de 18 caracteres de un ataque
 * de fuerza bruta, y la cuota de Gemini de una factura sorpresa.
 */

describe("ventana deslizante", () => {
  test("permite hasta el tope y bloquea el siguiente", () => {
    const clave = `prueba-${Math.random()}`;
    const limite = { peticiones: 3, ventanaSegundos: 60 };

    expect(consultarLimite(clave, limite).permitido).toBe(true);
    expect(consultarLimite(clave, limite).permitido).toBe(true);
    const tercera = consultarLimite(clave, limite);
    expect(tercera.permitido).toBe(true);
    expect(tercera.restantes).toBe(0);

    const cuarta = consultarLimite(clave, limite);
    expect(cuarta.permitido).toBe(false);
    expect(cuarta.reintentarEn).toBeGreaterThan(0);
  });

  test("cuenta por separado a cada peticionario", () => {
    const limite = { peticiones: 1, ventanaSegundos: 60 };
    const a = `ip-a-${Math.random()}`;
    const b = `ip-b-${Math.random()}`;

    expect(consultarLimite(a, limite).permitido).toBe(true);
    expect(consultarLimite(a, limite).permitido).toBe(false);
    // Que una IP se pase de la raya no puede dejar fuera a las demás.
    expect(consultarLimite(b, limite).permitido).toBe(true);
  });

  test("libera la ventana cuando expira", async () => {
    const clave = `expira-${Math.random()}`;
    const limite = { peticiones: 1, ventanaSegundos: 1 };

    expect(consultarLimite(clave, limite).permitido).toBe(true);
    expect(consultarLimite(clave, limite).permitido).toBe(false);

    await new Promise((r) => setTimeout(r, 1100));
    expect(consultarLimite(clave, limite).permitido).toBe(true);
  });
});

describe("límites por tipo de ruta", () => {
  test("el login es el más estricto de todos", () => {
    const login = limitePara("/api/auth/callback/credentials");
    expect(login.nombre).toBe("login");
    for (const [nombre, otro] of Object.entries(LIMITES)) {
      if (nombre === "login") continue;
      const porSegundo = otro.peticiones / otro.ventanaSegundos;
      const loginPorSegundo = login.limite.peticiones / login.limite.ventanaSegundos;
      expect(loginPorSegundo).toBeLessThan(porSegundo);
    }
  });

  test("las rutas que cuestan dinero van al cubo de IA", () => {
    for (const ruta of ["/api/ia/analisis", "/api/ocr", "/api/rag/stats", "/api/scan"]) {
      expect(limitePara(ruta).nombre).toBe("ia");
    }
  });

  test("las rutas con datos de votantes van al cubo de datos", () => {
    for (const ruta of ["/api/contactos", "/api/contactos/123", "/api/lideres"]) {
      expect(limitePara(ruta).nombre).toBe("datos");
    }
  });

  test("el envío masivo tiene su propio tope", () => {
    expect(limitePara("/api/mensajes/enviar").nombre).toBe("envio");
  });
});

describe("identificación del peticionario", () => {
  /**
   * `x-forwarded-for` la escribe quien hace la petición. Fiarse de ella sin un
   * proxy delante permitía dos cosas: cambiarla en cada intento para saltarse
   * el límite, y poner la IP de un compañero para dejarlo fuera del panel.
   */
  test("NO se cree la cabecera del cliente si no hay proxy declarado", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    const h = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.5" });
    expect(identificar(h, "10.0.0.1")).toBe("10.0.0.1");
  });

  test("con proxy declarado, usa la IP real que este reenvía", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    const h = new Headers({ "x-forwarded-for": "190.85.1.2, 10.0.0.1" });
    expect(identificar(h, "10.0.0.1")).toBe("190.85.1.2");
    delete process.env.TRUST_PROXY_HEADERS;
  });

  test("con proxy declarado, recurre a x-real-ip si falta la otra", () => {
    process.env.TRUST_PROXY_HEADERS = "true";
    expect(identificar(new Headers({ "x-real-ip": "190.85.1.3" }), "10.0.0.1")).toBe("190.85.1.3");
    delete process.env.TRUST_PROXY_HEADERS;
  });

  test("nunca devuelve vacío", () => {
    expect(identificar(new Headers())).toBe("conexion-directa");
  });

  test("una cabecera falsificada no permite eludir el límite", () => {
    delete process.env.TRUST_PROXY_HEADERS;
    const limite = { peticiones: 2, ventanaSegundos: 60 };
    const marca = Math.random();
    let bloqueadas = 0;

    // Mismo origen real, cabecera distinta en cada intento.
    for (let i = 0; i < 6; i++) {
      const h = new Headers({ "x-forwarded-for": `9.9.9.${i}` });
      const quien = identificar(h, `socket-${marca}`);
      if (!consultarLimite(`prueba:${quien}`, limite).permitido) bloqueadas++;
    }
    expect(bloqueadas).toBeGreaterThan(0);
  });
});

describe("clave del cubo de login", () => {
  test("separa a cada usuario, para que uno no expulse a los demás", () => {
    expect(claveDeLogin("1.1.1.1", "ana")).not.toBe(claveDeLogin("1.1.1.1", "luis"));
  });

  test("no distingue mayúsculas ni espacios en el usuario", () => {
    expect(claveDeLogin("1.1.1.1", "  Ana ")).toBe(claveDeLogin("1.1.1.1", "ana"));
  });

  test("tolera que no venga usuario", () => {
    expect(claveDeLogin("1.1.1.1", null)).toContain("sin-usuario");
  });
});

describe("tope de memoria", () => {
  test("el mapa no crece sin control aunque se inventen claves nuevas", () => {
    reiniciarRegistros();
    const limite = { peticiones: 5, ventanaSegundos: 60 };
    for (let i = 0; i < 12_000; i++) consultarLimite(`inundacion-${i}`, limite);
    // Sin desalojo real serían 12.000; el tope es 10.000.
    expect(clavesRegistradas()).toBeLessThanOrEqual(10_000);
    reiniciarRegistros();
  });
});
