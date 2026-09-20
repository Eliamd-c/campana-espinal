import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { spec } from "@/lib/swagger";
import { authOptions } from "@/lib/auth";

/**
 * Especificación de la API.
 *
 * El middleware ya exige sesión, pero esto se restringe además a
 * administradores: el documento es el mapa completo de la API — todas las
 * rutas, sus parámetros y sus formas — y con él se ahorra a un atacante la
 * mitad del trabajo de reconocimiento. Un coordinador no lo necesita.
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if ((session?.user as any)?.role !== "admin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return NextResponse.json(spec);
}
