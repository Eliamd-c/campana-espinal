import winston from "winston";

const isDev = process.env.NODE_ENV === "development";

export const logger = winston.createLogger({
  level: isDev ? "debug" : "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  defaultMeta: { service: "campana-espinal" },
  transports: [
    // Todos los logs
    new winston.transports.File({
      filename: "logs/combined.log",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Solo errores
    new winston.transports.File({
      filename: "logs/error.log",
      level: "error",
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

if (isDev) {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, ...meta }) =>
            `${timestamp} [${level}]: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta) : ""
            }`
        )
      ),
    })
  );
}

// ──────────────────────────────────────────────────────
// Helpers con contexto
// ──────────────────────────────────────────────────────

export const logAPI = {
  request: (method: string, path: string, userId?: string) => {
    logger.info(`${method} ${path}`, { userId, type: "request" });
  },
  
  response: (method: string, path: string, status: number, duration: number) => {
    logger.info(`${method} ${path} ${status}`, { duration, type: "response" });
  },
  
  error: (method: string, path: string, error: unknown) => {
    logger.error(`${method} ${path}`, {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      type: "request",
    });
  },
};
