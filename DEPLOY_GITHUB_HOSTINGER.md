# Guía de Despliegue: GitHub y Hostinger (Hosting Compartido) 🚀

Este documento contiene las instrucciones detalladas paso a paso para subir el proyecto **Campaña Espinal** a **GitHub** y desplegarlo en tu **Hosting Compartido de Hostinger** utilizando la función **Node.js App**.

---

## 🔒 Parte 1: Seguridad de Credenciales (Completado)
Nos hemos asegurado de proteger tus credenciales y bases de datos agregándolos a `.gitignore`:
- `.env` (No se subirá a GitHub para evitar robos).
- `whatsapp_auth/` (Sesiones activas del bot).
- Archivos `.xlsx` y `.csv` (Listas confidenciales de votantes).

---

## 🐙 Parte 2: Subir el Proyecto a GitHub (Paso a Paso)

### Paso 1: Crea tu repositorio en GitHub
1. Entra a [github.com](https://github.com) e inicia sesión.
2. Haz clic en el botón **New** (Nuevo) arriba a la izquierda.
3. Configura:
   - **Repository name:** `campana-espinal`
   - **Public/Private:** Selecciona **Private** (Privado) para proteger la lógica de tu campaña.
   - **NO** marques ninguna casilla adicional (*README*, *gitignore*, etc.).
4. Haz clic en **Create repository**.

### Paso 2: Ejecuta estos comandos en tu computadora
Abre la terminal de PowerShell en tu carpeta de proyecto (`c:\Users\elamd\Documents\Aplicativo\campana-espinal`) y corre:

```bash
# 1. Crear la rama principal 'main'
git branch -M main

# 2. Vincular con tu repositorio de GitHub (Reemplaza con la URL de tu repositorio creado)
git remote add origin https://github.com/TU_USUARIO/campana-espinal.git

# 3. Subir el proyecto
git push -u origin main
```

---

## 🌐 Parte 3: Configurar y Desplegar en Hostinger Compartido (Opción B)

Para que Next.js funcione en Hostinger Compartido, **he creado un archivo especial llamado `server.js` en la raíz de tu proyecto**. Hostinger necesita este archivo para arrancar tu app.

Sigue estos pasos en tu Panel de Hostinger (hPanel):

### Paso 1: Configurar la sección Node.js
1. Ve al panel de administración de tu hosting en Hostinger (**hPanel**).
2. En el menú de la izquierda, ve a **Avanzado** > **Node.js**.
3. Haz clic en **Crear Aplicación**.

### Paso 2: Configurar las rutas e iniciar
En el formulario de configuración, introduce los siguientes datos:
*   **Versión de Node.js:** Selecciona la versión recomendada más reciente (mínimo `18.x` o `20.x`).
*   **Directorio de la aplicación (Document Root):** `/` (o la carpeta donde clonarás el código).
*   **Archivo de entrada de la aplicación (Application Entry File):** `server.js` (este es el archivo personalizado que te acabo de crear).
*   **Tipo de entorno:** `Production` (Producción).

Haz clic en **Crear**.

### Paso 3: Configurar variables de entorno (.env)
En esa misma sección de la app Node.js en Hostinger, verás un apartado de **Variables de Entorno**. 
Añade una por una las variables que tienes en tu `.env` local:
- `DATABASE_URL` (Tu conexión PostgreSQL directa de Supabase).
- `REDIS_URL` (O déjala en blanco para que use nuestro mock ultra-robusto).
- `GEMINI_API_KEY` (Tu llave de Gemini).
- `NEXTAUTH_SECRET` (Tu secreto para cookies de autenticación).
- `NEXTAUTH_URL` (La URL pública de tu sitio web, ej: `https://tudominio.com`).

### Paso 4: Instalar y Compilar
1. En el panel de Node.js en Hostinger, verás una pequeña terminal o botón de consola web. O puedes usar la consola de Hostinger haciendo clic en **Instalar Dependencias** (`npm install`).
2. Una vez instaladas las dependencias, corre el comando de compilación:
   ```bash
   npm run build
   ```
3. Finalmente, haz clic en **Iniciar Aplicación** (o *Start*).

¡Listo! Tu sitio de Next.js estará en línea corriendo de forma nativa en tu hosting compartido de Hostinger. 
