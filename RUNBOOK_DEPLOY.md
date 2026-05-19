# 🚀 Runbook de Deployment - Campaña Espinal

Este documento describe el proceso para desplegar la aplicación en producción de forma segura.

---

## 📋 Requisitos Previos

1.  **Infraestructura:**
    *   Base de Datos PostgreSQL (RDS, Supabase o similar).
    *   Redis (Upstash recomendado para Rate Limiting).
    *   Cuenta en Sentry para monitoreo.
    *   Servidor con Node.js 18+ o Plataforma Vercel/Railway.

2.  **Variables de Entorno:**
    *   Configurar todas las variables listadas en `.env.example` en el panel de control del hosting.

---

## 🚀 Proceso de Despliegue (Vercel / CI-CD)

1.  **Build:**
    ```bash
    npm run build
    ```
    *Esto generará los source maps y los subirá a Sentry automáticamente.*

2.  **Base de Datos:**
    Antes de iniciar el servidor, ejecutar las migraciones:
    ```bash
    npx prisma migrate deploy
    ```

3.  **Bot de WhatsApp (Servidor Independiente):**
    El bot debe correr en un proceso persistente (PM2 recomendado):
    ```bash
    npm install -g pm2
    pm2 start "npm run bot" --name "whatsapp-bot"
    ```

---

## ✅ Go-Live Checklist (Pre-Lanzamiento)

- [ ] **Seguridad:** Verificar que `NEXTAUTH_SECRET` sea una cadena aleatoria fuerte.
- [ ] **Base de Datos:** Verificar que los índices estén creados (`npx prisma migrate status`).
- [ ] **Rate Limiting:** Probar que el límite de 10 scans/min funciona.
- [ ] **WhatsApp:** Verificar que el webhook secret coincida con el configurado en el bot.
- [ ] **Logging:** Verificar que `logs/error.log` es escribible (si no es Vercel).
- [ ] **Sentry:** Realizar un error de prueba (`throw new Error("Sentry Test")`) y verificar recepción.
- [ ] **Mesa de Ayuda:** Asegurar que los coordinadores tengan sus credenciales.
- [ ] **Backup:** Configurar backups automáticos de PostgreSQL.

---

## 🆘 En caso de Error Crítico

1.  **Revertir:** Hacer rollback al último commit estable en GitHub.
2.  **Logs:** Revisar Sentry Dashboard para identificar la causa raíz.
3.  **Mantenimiento:** Activar la variable `MAINTENANCE_MODE=true` si es necesario bloquear el acceso.
