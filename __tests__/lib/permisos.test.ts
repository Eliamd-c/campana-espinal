import { describe, test, expect } from "vitest";
import {
  PERMISOS,
  TODOS_LOS_PERMISOS,
  GRUPOS_DE_PERMISOS,
  esPermisoValido,
  depurarPermisos,
  tienePermiso,
  tieneAlguno,
} from "../../lib/permisos";

/**
 * Los permisos son lo que separa a quien captura planillas de las 5.985
 * cédulas del padrón. Si algo de aquí deja de cumplirse, esa separación se
 * cae sin que nadie lo note.
 */

describe("concesión de permisos", () => {
  test("una cuenta sin permisos no puede nada", () => {
    for (const permiso of TODOS_LOS_PERMISOS) {
      expect(tienePermiso([], permiso)).toBe(false);
      expect(tienePermiso(null, permiso)).toBe(false);
      expect(tienePermiso(undefined, permiso)).toBe(false);
    }
  });

  test("tener un permiso no concede los demás", () => {
    const soloCaptura = [PERMISOS.CONTACTOS_CAPTURAR];
    expect(tienePermiso(soloCaptura, PERMISOS.CONTACTOS_CAPTURAR)).toBe(true);
    expect(tienePermiso(soloCaptura, PERMISOS.CONTACTOS_LISTAR)).toBe(false);
    expect(tienePermiso(soloCaptura, PERMISOS.CONTACTOS_EXPORTAR)).toBe(false);
    expect(tienePermiso(soloCaptura, PERMISOS.USUARIOS_GESTIONAR)).toBe(false);
  });

  /**
   * Capturar planillas y poder descargar el padrón son cosas distintas. Si
   * alguna vez se juntan, una cuenta de campo pasa a ser una copia de la base.
   */
  test("capturar no implica ver, listar ni exportar", () => {
    const captura = [PERMISOS.CONTACTOS_CAPTURAR, PERMISOS.CONTACTOS_COMPROBAR];
    expect(tienePermiso(captura, PERMISOS.CONTACTOS_VER)).toBe(false);
    expect(tienePermiso(captura, PERMISOS.CONTACTOS_LISTAR)).toBe(false);
    expect(tienePermiso(captura, PERMISOS.CONTACTOS_EXPORTAR)).toBe(false);
  });

  test("tieneAlguno acepta si hay al menos uno", () => {
    const permisos = [PERMISOS.CONTACTOS_VER];
    expect(tieneAlguno(permisos, [PERMISOS.CONTACTOS_VER, PERMISOS.CONTACTOS_LISTAR])).toBe(true);
    expect(tieneAlguno(permisos, [PERMISOS.CONTACTOS_EXPORTAR])).toBe(false);
    expect(tieneAlguno([], [PERMISOS.CONTACTOS_VER])).toBe(false);
  });
});

describe("depuración de lo que llega del cliente", () => {
  test("descarta permisos inventados", () => {
    const depurados = depurarPermisos([
      PERMISOS.CONTACTOS_CAPTURAR,
      "inventado.falso",
      "usuarios.gestionar.todo",
      "",
      null,
      42,
    ]);
    expect(depurados).toEqual([PERMISOS.CONTACTOS_CAPTURAR]);
  });

  test("no repite permisos", () => {
    const repetidos = depurarPermisos([
      PERMISOS.CONTACTOS_VER,
      PERMISOS.CONTACTOS_VER,
      PERMISOS.CONTACTOS_VER,
    ]);
    expect(repetidos).toEqual([PERMISOS.CONTACTOS_VER]);
  });

  test("aguanta lo que no es una lista", () => {
    expect(depurarPermisos(null)).toEqual([]);
    expect(depurarPermisos("contactos.ver")).toEqual([]);
    expect(depurarPermisos({ permiso: "contactos.ver" })).toEqual([]);
  });

  test("reconoce todos los del catálogo y rechaza el resto", () => {
    for (const p of TODOS_LOS_PERMISOS) expect(esPermisoValido(p)).toBe(true);
    for (const p of ["admin", "*", "contactos", "contactos.*"]) {
      expect(esPermisoValido(p)).toBe(false);
    }
  });
});

describe("catálogo", () => {
  test("la pantalla de gestión muestra todos los permisos que existen", () => {
    const enPantalla = GRUPOS_DE_PERMISOS.flatMap((g) => g.permisos.map((p) => p.permiso));
    // Si se añade un permiso y se olvida ponerlo en un grupo, quedaría
    // invisible para quien crea cuentas y nadie podría concederlo.
    expect([...enPantalla].sort()).toEqual([...TODOS_LOS_PERMISOS].sort());
  });

  test("los permisos peligrosos llevan advertencia", () => {
    const conAdvertencia = GRUPOS_DE_PERMISOS.flatMap((g) => g.permisos)
      .filter((p) => p.advertencia)
      .map((p) => p.permiso);

    for (const critico of [
      PERMISOS.CONTACTOS_EXPORTAR,
      PERMISOS.CONTACTOS_LISTAR,
      PERMISOS.USUARIOS_GESTIONAR,
      PERMISOS.MENSAJES_ENVIAR,
    ]) {
      expect(conAdvertencia).toContain(critico);
    }
  });

  test("no hay permisos duplicados en el catálogo", () => {
    expect(new Set(TODOS_LOS_PERMISOS).size).toBe(TODOS_LOS_PERMISOS.length);
  });
});
