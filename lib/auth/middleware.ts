import { getServerSession } from "next-auth/next";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";

export async function requireAuth(
  req: NextRequest,
  handler: (req: NextRequest, session: any) => Promise<Response>
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 }
    );
  }

  return handler(req, session);
}

export async function requireRole(
  req: NextRequest,
  role: "admin" | "coordinador",
  handler: (req: NextRequest, session: any) => Promise<Response>
) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "No autenticado" },
      { status: 401 }
    );
  }

  const userRole = (session.user as any)?.role;

  if (userRole !== role && userRole !== "admin") {
    return NextResponse.json(
      { error: `Se requiere rol: ${role}` },
      { status: 403 }
    );
  }

  return handler(req, session);
}
