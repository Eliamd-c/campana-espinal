import { describe, test, expect } from "vitest";
import { evaluar, type CampoPlantilla } from "../../lib/agenda/reglas";
import { puedeTransicionar, sePuedeBorrar, ESTADOS_INICIALES } from "../../lib/agenda/estados";

/**
 * El motor decide si una reunión se puede dar por confirmada. Si se equivoca,
 * o bloquea agendamientos legítimos, o deja confirmar reuniones sin dirección
 * ni hora — que es justo lo que el módulo existe para evitar.
 */

const campo = (over: Partial<CampoPlantilla> = {}): CampoPlantilla => ({
  clave: "direccion",
  etiqueta: "Dirección exacta",
  tipo: "texto_corto",
  requerido_para_confirmar: true,
  orden: 1,
  ...over,
});

describe("campos requeridos", () => {
  test("sin reglas, se puede confirmar", () => {
    expect(evaluar([], {}).puedeConfirmar).toBe(true);
  });

  test("un requerido vacío impide confirmar", () => {
    const r = evaluar([campo()], {});
    expect(r.puedeConfirmar).toBe(false);
    expect(r.faltantes[0]).toMatchObject({ campo: "direccion", motivo: "vacio" });
  });

  test("un requerido relleno deja confirmar", () => {
    expect(evaluar([campo()], { direccion: "carrera 12 # 11-18" }).puedeConfirmar).toBe(true);
  });

  test("los espacios en blanco no cuentan como valor", () => {
    expect(evaluar([campo()], { direccion: "   " }).puedeConfirmar).toBe(false);
  });

  test("un campo no requerido y vacío no estorba", () => {
    const r = evaluar([campo({ requerido_para_confirmar: false })], {});
    expect(r.puedeConfirmar).toBe(true);
  });

  test("cero y falso son valores, no huecos", () => {
    const reglas = [
      campo({ clave: "asistentes", tipo: "numero", etiqueta: "Asistentes" }),
      campo({ clave: "con_tarima", tipo: "si_no", etiqueta: "Tarima" }),
    ];
    expect(evaluar(reglas, { asistentes: 0, con_tarima: false }).puedeConfirmar).toBe(true);
  });
});

describe("por confirmar", () => {
  /**
   * El caso que originó el diseño: se olvidó la hora. Si la persona declara
   * que no se sabe, el agendamiento se guarda, pero como cupo — nunca como
   * reunión confirmada.
   */
  test("un campo declarado pendiente no es un olvido, pero sigue frenando", () => {
    const reglas = [campo({ clave: "hora", tipo: "hora", etiqueta: "Hora" })];
    const r = evaluar(reglas, {}, [{ campo: "hora" }]);

    expect(r.faltantes).toHaveLength(0);
    expect(r.porConfirmar).toHaveLength(1);
    expect(r.puedeConfirmar).toBe(false);
  });

  test("resuelto el pendiente, se puede confirmar", () => {
    const reglas = [campo({ clave: "hora", tipo: "hora", etiqueta: "Hora" })];
    expect(evaluar(reglas, { hora: "18:30" }, []).puedeConfirmar).toBe(true);
  });

  test("marcado como pendiente pero con valor: se señala la contradicción", () => {
    const reglas = [campo({ clave: "hora", tipo: "hora", etiqueta: "Hora" })];
    const r = evaluar(reglas, { hora: "18:30" }, [{ campo: "hora" }]);

    expect(r.puedeConfirmar).toBe(false);
    expect(r.porConfirmar[0].detalle).toMatch(/resuélvelo/i);
  });

  test("un pendiente sobre un campo que no existe en la plantilla se ignora", () => {
    const r = evaluar([campo()], { direccion: "calle 1" }, [{ campo: "inventado" }]);
    expect(r.puedeConfirmar).toBe(true);
  });
});

describe("validación de tipos", () => {
  test("un número con letras no pasa", () => {
    const r = evaluar([campo({ clave: "n", tipo: "numero", etiqueta: "Cantidad" })], { n: "abc" });
    expect(r.faltantes[0]).toMatchObject({ motivo: "invalido" });
  });

  test("una fecha sin sentido no pasa", () => {
    const r = evaluar([campo({ clave: "f", tipo: "fecha", etiqueta: "Fecha" })], { f: "cuando sea" });
    expect(r.puedeConfirmar).toBe(false);
  });

  test("la hora exige formato de reloj", () => {
    const regla = [campo({ clave: "h", tipo: "hora", etiqueta: "Hora" })];
    expect(evaluar(regla, { h: "6:30" }).puedeConfirmar).toBe(true);
    expect(evaluar(regla, { h: "18:45" }).puedeConfirmar).toBe(true);
    expect(evaluar(regla, { h: "25:00" }).puedeConfirmar).toBe(false);
    expect(evaluar(regla, { h: "por la tarde" }).puedeConfirmar).toBe(false);
  });

  test("la cédula solo admite dígitos", () => {
    const regla = [campo({ clave: "p", tipo: "persona", etiqueta: "Persona" })];
    expect(evaluar(regla, { p: "93125551" }).puedeConfirmar).toBe(true);
    expect(evaluar(regla, { p: "Juan Pérez" }).puedeConfirmar).toBe(false);
  });

  test("una opción fuera de la lista no pasa", () => {
    const regla = [
      campo({ clave: "t", tipo: "opciones", etiqueta: "Tipo", opciones: ["mitin", "foro"] }),
    ];
    expect(evaluar(regla, { t: "mitin" }).puedeConfirmar).toBe(true);
    expect(evaluar(regla, { t: "otra cosa" }).puedeConfirmar).toBe(false);
  });

  /**
   * Un dato roto es peor que uno ausente: el hueco se ve, el dato malo
   * parece bueno. Por eso se revisa aunque el campo no sea obligatorio.
   */
  test("un campo opcional con valor inválido también frena", () => {
    const regla = [
      campo({ clave: "n", tipo: "numero", etiqueta: "Cantidad", requerido_para_confirmar: false }),
    ];
    expect(evaluar(regla, { n: "muchos" }).puedeConfirmar).toBe(false);
  });
});

describe("estados", () => {
  test("no se puede nacer confirmado", () => {
    expect(ESTADOS_INICIALES).not.toContain("confirmado");
  });

  test("las transisiones siguen el ciclo previsto", () => {
    expect(puedeTransicionar("cupo", "confirmado")).toBe(true);
    expect(puedeTransicionar("confirmado", "ejecutado")).toBe(true);
    expect(puedeTransicionar("borrador", "confirmado")).toBe(false);
    expect(puedeTransicionar("ejecutado", "cupo")).toBe(false);
  });

  test("lo comprometido o ejecutado no se borra, se cancela", () => {
    expect(sePuedeBorrar("borrador")).toBe(true);
    expect(sePuedeBorrar("cupo")).toBe(true);
    expect(sePuedeBorrar("confirmado")).toBe(false);
    expect(sePuedeBorrar("ejecutado")).toBe(false);
  });
});
