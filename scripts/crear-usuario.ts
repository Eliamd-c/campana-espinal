/**
 * Alta y cambio de contraseña de usuarios del panel.
 *
 *   npx tsx scripts/crear-usuario.ts <usuario> <rol>
 *
 * El rol es "admin" o "coordinador". La contraseña no se pasa por argumento:
 * se pide por teclado y no queda en el historial del shell. El script la
 * guarda como hash bcrypt; nadie, tampoco quien administre la base, puede
 * leerla después.
 *
 * Si el usuario ya existe, se le cambia la contraseña.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { COSTE_BCRYPT, ROLES, normalizarUsuario, revisarFortaleza } from "../lib/usuarios";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const prisma = new PrismaClient();

/** Lee sin mostrar lo tecleado, para que la contraseña no quede en pantalla. */
async function pedirOculto(mensaje: string): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  const anterior = (rl as any).output?.write?.bind((rl as any).output);

  (rl as any)._writeToOutput = function (texto: string) {
    if (texto.includes(mensaje)) anterior?.(texto);
  };

  try {
    return await rl.question(mensaje);
  } finally {
    rl.close();
    stdout.write("\n");
  }
}

async function main() {
  const [usuarioBruto, rol] = process.argv.slice(2);
  const usuario = usuarioBruto ? normalizarUsuario(usuarioBruto) : usuarioBruto;

  if (!usuario || !rol) {
    console.error("Uso: npx tsx scripts/crear-usuario.ts <usuario> <admin|coordinador>");
    process.exit(1);
  }

  if (!ROLES.includes(rol as (typeof ROLES)[number])) {
    console.error(`Rol no válido: "${rol}". Debe ser ${ROLES.join(" o ")}.`);
    process.exit(1);
  }

  const clave = await pedirOculto(`Contraseña para "${usuario}": `);
  const repetida = await pedirOculto("Repítela: ");

  if (clave !== repetida) {
    console.error("Las contraseñas no coinciden.");
    process.exit(1);
  }

  const problema = revisarFortaleza(clave, usuario);
  if (problema) {
    console.error(`Contraseña rechazada: ${problema}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(clave, COSTE_BCRYPT);

  const existente = await prisma.user.findUnique({ where: { username: usuario } });

  if (existente) {
    await prisma.user.update({
      where: { id: existente.id },
      data: { passwordHash, role: rol, activo: true },
    });
    console.log(`Contraseña actualizada para "${usuario}" (rol: ${rol}).`);
  } else {
    await prisma.user.create({
      data: { username: usuario, name: usuario, role: rol, passwordHash, activo: true },
    });
    console.log(`Usuario "${usuario}" creado con rol ${rol}.`);
  }
}

main()
  .catch((e) => {
    console.error("Error:", e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
