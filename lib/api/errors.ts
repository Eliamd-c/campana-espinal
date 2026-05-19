import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

// ──────────────────────────────────────────────────────
// Códigos de error personalizados
// ──────────────────────────────────────────────────────

export enum ErrorCode {
  // 4xx
  VALIDATION_ERROR = "VALIDATION_ERROR",
  NOT_FOUND = "NOT_FOUND",
  UNAUTHORIZED = "UNAUTHORIZED",
  FORBIDDEN = "FORBIDDEN",
  RATE_LIMIT = "RATE_LIMIT",

  // 5xx
  DATABASE_ERROR = "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR = "EXTERNAL_SERVICE_ERROR",
  INTERNAL_ERROR = "INTERNAL_ERROR",
}

export class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public statusCode: number,
    public message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ──────────────────────────────────────────────────────
// Funciones helpers
// ──────────────────────────────────────────────────────

export function notFound(resource: string): ApiError {
  return new ApiError(
    ErrorCode.NOT_FOUND,
    404,
    `${resource} no encontrado`
  );
}

export function unauthorized(reason = "No autenticado"): ApiError {
  return new ApiError(
    ErrorCode.UNAUTHORIZED,
    401,
    reason
  );
}

export function forbidden(reason = "Sin permisos"): ApiError {
  return new ApiError(
    ErrorCode.FORBIDDEN,
    403,
    reason
  );
}

export function rateLimit(reason = "Demasiadas solicitudes"): ApiError {
  return new ApiError(
    ErrorCode.RATE_LIMIT,
    429,
    reason
  );
}

// ──────────────────────────────────────────────────────
// Handler centralizado
// ──────────────────────────────────────────────────────

export function handleError(error: unknown, context: string) {
  console.error(`[${context}]`, error);

  // ✅ Reportar a Sentry
  Sentry.captureException(error, {
    tags: { context },
  });

  if (error instanceof ApiError) {
    logger.warn({
      context,
      code: error.code,
      message: error.message,
      details: error.details,
    });

    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof SyntaxError) {
    logger.warn({ context, message: "Invalid JSON" });
    return NextResponse.json(
      { error: "JSON inválido" },
      { status: 400 }
    );
  }

  // Error no esperado
  const errorId = generateErrorId();
  logger.error({
    errorId,
    context,
    message: error instanceof Error ? error.message : "Unknown error",
    stack: error instanceof Error ? error.stack : undefined,
  });

  return NextResponse.json(
    {
      error: "Error interno del servidor",
      code: ErrorCode.INTERNAL_ERROR,
      errorId, // Usuario puede reportar este ID
    },
    { status: 500 }
  );
}

function generateErrorId(): string {
  return `err_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
