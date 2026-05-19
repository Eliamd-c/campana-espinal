import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";

const botDir = path.join(process.cwd(), "bot");
const WHITELIST_FILE = path.join(botDir, "whitelist.json");

export async function GET() {
  try {
    let whitelist: string[] = [];
    if (fs.existsSync(WHITELIST_FILE)) {
      whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf-8"));
    }
    return NextResponse.json({ data: whitelist });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { numero } = await req.json();
    if (!numero) return NextResponse.json({ error: "Número requerido" }, { status: 400 });

    let whitelist: string[] = [];
    if (fs.existsSync(WHITELIST_FILE)) {
      whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf-8"));
    }

    // Limpiar número (solo dígitos)
    const numLimpio = numero.replace(/\D/g, '');
    
    if (!whitelist.includes(numLimpio)) {
      whitelist.push(numLimpio);
      fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelist, null, 2), "utf-8");
    }

    return NextResponse.json({ data: whitelist });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const numero = searchParams.get("numero");
    if (!numero) return NextResponse.json({ error: "Número requerido" }, { status: 400 });

    let whitelist: string[] = [];
    if (fs.existsSync(WHITELIST_FILE)) {
      whitelist = JSON.parse(fs.readFileSync(WHITELIST_FILE, "utf-8"));
    }

    whitelist = whitelist.filter(n => n !== numero);
    fs.writeFileSync(WHITELIST_FILE, JSON.stringify(whitelist, null, 2), "utf-8");

    return NextResponse.json({ data: whitelist });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
