import { NextRequest, NextResponse } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { requireRole } from "@/lib/auth/middleware";
import { handleError } from "@/lib/api/errors";

// Configurar ruta correcta independientemente de dónde se ejecute Next.js
const botDir = path.join(process.cwd(), "bot");
const QR_FILE = path.join(botDir, "qr.txt");
const STATUS_FILE = path.join(botDir, "status.txt");

export async function GET(req: NextRequest) {
  return requireRole(req, "admin", async () => {
    try {
      let estado = "desconectado";
      let qr = null;

      if (fs.existsSync(STATUS_FILE)) {
        estado = fs.readFileSync(STATUS_FILE, "utf-8");
      }

      if (estado === "qr_listo" && fs.existsSync(QR_FILE)) {
        qr = fs.readFileSync(QR_FILE, "utf-8");
      }

      let logs = [];
      if (fs.existsSync(path.join(botDir, "logs.json"))) {
        try {
          logs = JSON.parse(fs.readFileSync(path.join(botDir, "logs.json"), "utf-8"));
        } catch (e) {}
      }

      return NextResponse.json({
        data: {
          estado,
          qr,
          logs
        }
      });
    } catch (error) {
      return handleError(error, "GET /api/whatsapp/estado");
    }
  });
}
