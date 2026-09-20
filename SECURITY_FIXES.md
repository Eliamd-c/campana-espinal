# Backlog de remediación de seguridad — campana-espinal

Auditoría inicial: 2026-09-19. Supervisor: `.claude/agents/supervisor-seguridad.md`.
Estados: `PENDIENTE` · `EN CURSO` · `RESUELTO` · `ACEPTADO` (riesgo asumido, con motivo).

| # | Hallazgo | Sev | Estado |
|---|----------|-----|--------|
| 1 | 49/51 rutas API sin autenticación; no existe `middleware.ts` | Crítica | **RESUELTO** |
| 2 | SQL arbitrario del LLM en `lib/ia-tools.ts` (`ejecutar_consulta_sql`) | Crítica | **RESUELTO** |
| 3 | Credenciales admin hardcodeadas (`admin/admin123`) en `lib/auth.ts` | Crítica | **RESUELTO** |
| 4 | `NEXTAUTH_SECRET` con fallback público en `lib/auth.ts:5` | Crítica | **RESUELTO** |
| 5 | Webhooks Evolution sin validar firma/origen | Crítica | **RESUELTO** (requiere reconfigurar el emisor) |
| 6 | 4 vulns críticas + 20 altas en dependencias de producción | Crítica | **RESUELTO** (de 35 a 3) |
| 7 | `ignoreBuildErrors` / `ignoreDuringBuilds` en `next.config.mjs` | Alta | **RESUELTO** |
| 8 | Sin cabeceras de seguridad ni CSP | Alta | **RESUELTO**, salvo la CSP en producción (#8b) |
| 9 | Rate limiting solo en 4 de 51 rutas | Alta | **RESUELTO** |
| 10 | Prompt injection vía WhatsApp entrante y OCR | Alta | **RESUELTO** |
| 11 | `server.js` sin TLS ni `trust proxy` | Alta | **RESUELTO** |
| 12 | Datos sensibles en disco (CSV, XLSX, proxies, sesiones WA) | Media | **REQUIERE ACCIÓN** |
| 13 | Claves en `.env` a rotar tras la auditoría | Media | **4 de 6 rotadas** |
| 14 | Swagger (`/api/docs`) expuesto sin auth | Media | **RESUELTO** |
| 15 | Logs con PII (teléfonos, contenido de mensajes) | Media | **RESUELTO** |
| 16 | Row Level Security sin verificar en Supabase | **Crítica** | **RESUELTO** |
| 17 | `/ir/[codigo]` acepta `contacto_cedula` sin validar (pública) | Media | **RESUELTO** |
| 2b | Rol de BD con `GRANT SELECT` acotado (defensa real del #2) | Alta | **RESUELTO** |
| 18 | Webhooks sin protección de reenvío (replay): falta timestamp/nonce | Media | **RESUELTO** |
| 22 | La aplicación no permite cambiar usuario ni contraseña | Alta | **RESUELTO** |
| 22b | La revocación no es inmediata: el middleware valida firma, no estado | Alta | **MITIGADO** |
| 16b | Storage de Supabase: bucket `media` con la clave pública | Alta | **RESUELTO** (falta la clave de servicio) |
| 10b | Inyección indirecta por documentos RAG y por campos de la base | Media | **RESUELTO** |
| 8b | El hosting recorta la CSP: solo llega `upgrade-insecure-requests` | Media | PENDIENTE |
| 19 | **El repositorio de GitHub es PÚBLICO** | Crítica | **REQUIERE DECISIÓN** |
| 20 | Sesión de WhatsApp (`creds.json` de Baileys) en el historial público | Crítica | **REQUIERE ACCIÓN** |
| 21 | Contraseña de Supabase escrita en dos scripts publicados | Crítica | **RESUELTO** en código, falta rotar |

## Bitácora

_(cada fix anota aquí: qué se cambió, qué verificó el supervisor)_

### #1 — Rutas API sin autenticación · RESUELTO (2026-09-19)

**Cambios**
- `middleware.ts` (nuevo): deny-by-default sobre páginas y API. 401 JSON para
  `/api/*`, redirección a `/login?callbackUrl=…` para páginas.
- Públicas, una a una y con motivo: `/login`, `/api/auth`, `/monitoring`
  (túnel Sentry), `/ir` (acortador que reciben los votantes por WhatsApp), y
  los tres webhooks externos — estos quedan pendientes de firma en el #5.
- `next` 14.2.3 → **14.2.33**: 14.2.3 permitía saltarse el middleware entero
  con la cabecera `x-middleware-subrequest` (CVE-2025-29927). Sin este
  parche el fix no valía de nada.
- `app/(dashboard)/layout.tsx`: `redirect("/login")` si no hay sesión, como
  segunda capa. El middleware no puede ser la única puerta.

**Correcciones sobre la primera versión, señaladas por el supervisor**
- El matcher llevaba `\.` dentro de un string: el backslash se perdía y el
  punto pasaba a ser "cualquier carácter", con lo que `/api/contactos/9xml`
  se saltaba el middleware. Ahora va como `[.]`.
- `esPublica` usaba `startsWith` sin separador: `/loginfake` o `/api/authz`
  habrían sido públicas. Ahora exige igualdad o subruta.
- El prefijo abierto `/api/webhooks/` habría hecho pública cualquier ruta
  futura colgada debajo. Ahora se listan las rutas concretas.

**Verificado en ejecución** (`next dev`, sin sesión)
| Petición | Resultado |
|---|---|
| `GET /api/contactos` | 401 |
| `GET /api/contactos` + cabecera de bypass CVE | 401 |
| `POST /api/ia/analisis` | 401 |
| `GET /dashboard` | 307 → `/login?callbackUrl=%2Fdashboard` |
| `GET /api/auth/csrf` | 200 (sigue pública, correcto) |
| `GET /ir/test` | 307 (acortador sigue público, correcto) |

**Abierto por el supervisor durante esta revisión**
- `[NUEVO]` `app/ir/[codigo]/route.ts` escribe `ClicRastreo` con
  `contacto_cedula` tomado de la query string sin validar, y es pública por
  necesidad: permite inyectar clics falsos y enumerar cédulas. Añadido como
  hallazgo #17.

### #2 — SQL arbitrario del LLM · RESUELTO (2026-09-19)

**Cambios**
- Eliminada por completo la vía de escritura: fuera el parámetro `clave_admin`
  y fuera el fallback `SUPERADMIN_PASSWORD || "admin123"`. El modelo ya no
  puede modificar datos por SQL; para eso están las herramientas específicas.
- `lib/sql-guard.ts` (nuevo): un statement, solo SELECT, palabras prohibidas,
  bloqueo de catálogos del sistema, denylist de tablas por identificador,
  allowlist en posición de origen de datos, rechazo de dollar-quoting y de
  comillas impares, y techo real de 500 filas.
- `lib/ia-tools.ts`: ejecución dentro de `prisma.$transaction` con
  `SET TRANSACTION READ ONLY` y `SET LOCAL statement_timeout`. PostgreSQL
  garantiza la no-escritura aunque el validador falle. El detalle del error
  de Postgres ya no se devuelve al modelo.
- `obtener_esquema_bd` filtra por la allowlist: el modelo ya no sabe siquiera
  que existe `whatsapp_auth_state`.
- `lib/gemini-tools.ts`: los prompts ya no instruyen sobre claves de admin.
- `__tests__/lib/sql-guard.test.ts`: 31 tests, cada uno un vector real.

**Defectos de mis primeras versiones, encontrados por el supervisor**
1. `` new RegExp(`${p}`) `` en un template literal: `` era el carácter
   backspace, no un límite de palabra. **Las 26 palabras prohibidas no
   filtraban nada** y los 17 tests en verde no lo detectaban, porque cada
   ataque caía por otra regla.
2. La extracción de tablas solo miraba la primera de una lista separada por
   comas: `FROM contactos c, whatsapp_auth_state a` devolvía las credenciales
   de las líneas de WhatsApp. Otras cuatro variantes colaban igual
   (`FROM"User"` sin espacio, UNION, LATERAL, subconsulta en SELECT).
3. `LIMIT 999999` y un LIMIT en subconsulta satisfacían el techo de filas.
4. El dollar-quoting con etiqueta atravesaba el normalizador sin ser
   entendido y desincronizaba el vaciado de literales.

**Veredicto final del supervisor: RESUELTO.** Intentó romperlo ejecutando el
validador real contra desincronización de E-strings, comentarios dentro del
FROM, `""` escapadas, `public . "User"`, `FROM ONLY`, `JOIN LATERAL`,
homoglifos unicode, `ANY(SELECT…)`, funciones que devuelven tablas y UNION
contra tablas prohibidas: todos bloqueados, sin estorbar al analista.

**Observación aceptada:** `SELECT 'whatsapp_auth_state'::regclass FROM contactos`
pasa. Confirma que el nombre existe — algo que el atacante ya sabe — pero no
lee filas ni escribe. Riesgo asumido.

### #2b — Rol de base de datos acotado · REQUIERE DECISIÓN

Un validador de texto siempre tendrá un agujero más; los cuatro de arriba lo
demuestran. La defensa que no depende de acertar con un regex es un rol de
PostgreSQL con `GRANT SELECT` solo sobre las tablas de `TABLAS_PERMITIDAS` y
sin permiso alguno sobre `whatsapp_auth_state`, `lineas_whatsapp`,
`chat_memoria`, `User`, `Account` ni `Session`, usado exclusivamente por esta
herramienta.

Toca el proyecto de Supabase y añade una variable de conexión nueva, así que
queda a la espera del visto bueno del responsable.

### #3 y #4 — Credenciales y secreto de firma · RESUELTOS (2026-09-19)

**Cambios**
- `lib/auth.ts` reescrito. `admin/admin123` y `coordinador/coord123` ya no
  existen: `authorize` consulta `prisma.user` por `username` y compara con
  bcrypt. Exige `activo`, registra los intentos fallidos con su motivo (nunca
  la contraseña) y anota `ultimoAcceso`.
- Hash señuelo para igualar tiempos: sin él, la diferencia entre «usuario
  inexistente» y «contraseña incorrecta» revela qué cuentas existen. Medido
  por el supervisor: 254 ms contra el señuelo, 245 ms contra un hash real.
- `exigirSecreto()` se evalúa al importar el módulo: sin `NEXTAUTH_SECRET`
  la aplicación no arranca. Ya no hay fallback.
- Sesión JWT con caducidad de 8 horas: un portátil abierto en la sede deja
  de ser una puerta permanente.
- `prisma/schema.prisma`: `User` gana `username` único, `passwordHash`,
  `activo` y `ultimoAcceso`.
- `scripts/crear-usuario.ts` (`npm run usuario:crear`): alta y cambio de
  contraseña pidiéndola por teclado, sin eco y sin pasar por `argv`, con
  exigencia de fortaleza y bcrypt de coste 12.
- `.env.example` y `.env`: fuera `SUPERADMIN_PASSWORD`, que ya no lee nadie.
- `package.json`: script `test` (antes no había, y la suite no se ejecutaba
  de un tirón).
- `__tests__/lib/auth.test.ts`: 13 tests.

**Señalado por el supervisor y corregido**
El `.env` real tenía un `NEXTAUTH_SECRET` de 37 caracteres escrito a mano,
con solo 20 distintos: pasaba la comprobación de longitud, pero se rompe
fuera de línea a partir de una cookie capturada, y con él cualquiera se firma
un token con `role: "admin"`. Dos consecuencias:
- La validación ahora mide variedad de caracteres, no solo longitud, y
  rechaza palabras predecibles.
- El secreto se rotó por 32 bytes aleatorios en base64 (44 caracteres, 32
  distintos). **Hay que copiarlo también al entorno del hosting**, y la
  rotación cierra las sesiones abiertas.

**Efecto colateral revelador**: al añadir `npm test`, los tests de
`__tests__/api/` empezaron a fallar con 401. No era una regresión sino la
demostración de que el #1 funciona: llamaban a la API sin sesión y hasta
ahora recibían los datos. Reescritos: comprueban primero que la ruta rechaza
a quien no ha entrado, y ejercitan la lógica solo si hay credenciales de
prueba (`TEST_USER` / `TEST_PASSWORD`). 49 tests en verde, 9 omitidos.

**Pendiente, y no lo puedo hacer yo**: la base de datos no es alcanzable
desde este entorno, así que queda por aplicar
`prisma/migrations/manual/001_credenciales_usuario.sql` y crear el primer
usuario. Hasta entonces el panel falla cerrado: nadie entra, que es el lado
correcto en el que quedarse.

**Vectores que siguen vivos** (van al #9)
- `/api/auth` no tiene freno de fuerza bruta: solo se registra el intento.
- `username` distingue mayúsculas: `Admin` y `admin` son cuentas distintas.

### #5 — Webhooks sin validar origen · RESUELTO (2026-09-19)

**Cambios**
- `lib/webhooks/verificar.ts` (nuevo): exige el secreto compartido, compara
  en tiempo constante (`timingSafeEqual` sobre hashes SHA-256, para que los
  buffers midan siempre lo mismo y la comparación no lance ni revele
  longitudes), y acepta el valor en `x-webhook-secret`, `x-internal-secret`,
  `apikey` o `Authorization: Bearer`.
- Si la variable de entorno falta, es corta o contiene palabras predecibles,
  se rechaza todo: un webhook sin secreto configurado es un webhook abierto,
  y es mejor que deje de funcionar visiblemente a que siga aceptando a
  cualquiera en silencio.
- Aplicado a las tres rutas, siempre como primera sentencia, antes de leer el
  cuerpo y antes de tocar la base.
- `app/api/whatsapp/webhook/route.ts` comparaba con `!==`, que termina en el
  primer carácter distinto y permite adivinar el secreto carácter a carácter.
- `__tests__/lib/webhooks-verificar.test.ts`: 12 tests.

**Secretos rotados**
- `INTERNAL_WEBHOOK_SECRET` era la frase `webhook_secreto_campaña_espinal_2024`:
  la escribe cualquiera que conozca el proyecto. Rotado a 24 bytes aleatorios.
- `EVOLUTION_WEBHOOK_SECRET`: nuevo, no existía.

**Verificado en ejecución**: sin secreto → 401; secreto erróneo → 401; secreto
viejo tras rotar → 401; secreto correcto → pasa a la lógica (400 con cuerpo
vacío, 200 con evento válido); `Bearer` funciona igual.

**Requiere acción fuera del repositorio.** Nada en el código envía estos
secretos: los emisores son externos. Hasta que se configuren, los mensajes
entrantes se pierden con 401.
- En Evolution API: añadir al webhook la cabecera `x-webhook-secret` con el
  valor de `EVOLUTION_WEBHOOK_SECRET`.
- En quien llame a `/api/whatsapp/webhook`: actualizar al nuevo
  `INTERNAL_WEBHOOK_SECRET`.

**Residuales anotados por el supervisor**
- Replay: sin timestamp ni nonce, una petición legítima capturada se puede
  reproducir indefinidamente. Abierto como #18.
- Sin rate limit en las tres rutas (va al #9).
- PII en los `console.log` de estos handlers: `app/api/webhooks/evolution/route.ts`
  imprime el teléfono y el **contenido del mensaje** en claro. Es el hueco más
  grave que queda; va al #15.

### #6 — Dependencias vulnerables · RESUELTO (2026-09-19)

**De 35 vulnerabilidades (4 críticas, 20 altas) a 3.**

**Cambios**
- `npm audit fix`: 35 → 12.
- `next` 14.2.3 → 14.2.35.
- `@whiskeysockets/baileys` 6.7.5 → 6.7.24, lo que arrastra
  `libsignal-node` y elimina la ejecución de código arbitrario de
  `protobufjs` (crítica). Se probó `@latest`, que instala una *release
  candidate* (7.0.0-rc14): revertido, una RC no va a producción.
- Eliminadas `puppeteer` y `whatsapp-web.js`, que concentraban 5 de las 9
  vulnerabilidades restantes y **no las usaba nadie**: el código de puppeteer
  en `app/api/registraduria/route.ts` estaba comentado y solo quedaba el
  `import`, y `whatsapp-web.js` solo aparece en `_bot_apagado/`. Con ellas se
  fueron `@puppeteer/browsers`, `puppeteer-core` y `extract-zip` (escritura
  arbitraria de ficheros por symlink), además de Chromium entero.
- `app/api/registraduria/route.ts`: fuera el `import` muerto, con una nota de
  por qué el navegador headless debe importarse dentro de la función el día
  que se retome.

**Las 3 que quedan, y por qué**
- `next` (crítica): DoS del optimizador de imágenes vía `remotePatterns`.
  **No aplica**: el proyecto no usa `next/image` en ningún componente ni tiene
  configuración `images`. El arreglo exige Next 16, que es una migración, no
  un parche.
- `postcss`: XSS en la salida de CSS, en tiempo de compilación; llega a través
  de Next y se resuelve con la misma migración.
- `xlsx`: contaminación de prototipo. **No tiene arreglo en el registro de
  npm**; el parche está en el CDN oficial de SheetJS, cuya instalación bloqueó
  la política de código no confiable de este entorno. Mitigante: `xlsx` solo
  se usa en scripts locales (`scripts/import-excel.ts`, `seed_from_excel.mjs`),
  nunca en una ruta de la aplicación web. Pendiente para el responsable:

      npm install https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz

**Verificado**: `tsc --noEmit` no añade ningún error nuevo tras eliminar las
dependencias, y los 54 tests siguen en verde.

### #2b — Rol de base de datos acotado · CÓDIGO LISTO

**Preparado**
- `prisma/migrations/manual/002_rol_analista_solo_lectura.sql`: crea el rol
  `analista_ia`, le revoca todo y le concede `SELECT` únicamente sobre las 18
  tablas de `TABLAS_PERMITIDAS`. `ALTER DEFAULT PRIVILEGES` se encarga de que
  una tabla futura nazca invisible para él.
- `lib/db-analista.ts`: cliente Prisma separado que usa
  `DATABASE_URL_ANALISTA` si existe. Si no, usa la conexión principal y deja
  un aviso en el log, para que la ausencia no pase inadvertida.
- `lib/ia-tools.ts` ejecuta las consultas del modelo con ese cliente.

**Por qué no lo apliqué yo.** El conector de Supabase de esta sesión está
autenticado en una cuenta que no contiene el proyecto de la campaña: solo
ofrece «Base de datos instagram» y «cerebro-rag», mientras el `.env` apunta a
`dotvlqkawnzzvenzmeqd`. Ejecutar SQL contra un proyecto que no es el de la
campaña habría sido tocar una base ajena a esta tarea.

## Revisión del repositorio en GitHub (2026-09-19)

`https://github.com/Eliamd-c/campana-espinal` — 14 commits, local y remoto en
el mismo punto.

### #19 — El repositorio es público · REQUIERE DECISIÓN

`"private": false, "visibility": "public"`. Creado el 19/05/2026.

Todo lo que sigue se agrava por esto: no son secretos en un repositorio
interno, son secretos publicados. El repositorio contiene además el esquema
completo de una base de datos con PII de votantes y la lógica de envío masivo
por WhatsApp de una campaña política.

Lo razonable es hacerlo privado. Es una decisión del responsable, no mía.

### #20 — Sesión de WhatsApp en el historial · REQUIERE ACCIÓN

`bot/auth_info_baileys/creds.json` se subió el **18/05/2026** y se borró en
`b4ce1cc`, pero **sigue en el historial**, que es público. Junto a él, 60+
ficheros `pre-key-*.json`, `session-*.json` y `app-state-sync-key-*.json`.

`creds.json` contiene las claves privadas de la sesión: `noiseKey.private`,
`signedIdentityKey.private`, `advSecretKey`, `registrationId`, y el número de
teléfono de la línea. Con eso se suplanta la sesión de WhatsApp de la campaña.

**Orden de actuación** (importa el orden):
1. Desde el móvil de esa línea: WhatsApp → Dispositivos vinculados → cerrar
   todas las sesiones. Esto invalida las claves filtradas y es lo único que
   surte efecto inmediato.
2. Después, purgar el historial (`git filter-repo` o BFG) y forzar el push.
3. Revisar en WhatsApp si hubo dispositivos vinculados desconocidos.

Borrar el historial **no deshace la exposición**: lo publicado pudo clonarse.
Por eso primero se invalida y luego se limpia, nunca al revés.

### #21 — Contraseña de base de datos en scripts publicados

`scripts/setup-indices.js` y `scripts/setup-vectores.js` llevaban la cadena de
conexión completa, con contraseña, del proyecto Supabase
`db.oizjzperhtadylqwdqve.supabase.co`. `setup-vectores.js` ni siquiera
consultaba `DATABASE_URL`: usaba siempre la hardcodeada.

No es el proyecto que usa hoy la aplicación (el `.env` apunta a otro), pero la
contraseña es real y está publicada desde el primer commit.

**Corregido**: ambos scripts exigen `DATABASE_URL` y abortan con un mensaje
claro si falta. **Falta**: rotar la contraseña de ese proyecto Supabase si
sigue existiendo, y comprobar si se reutilizó en otros sitios.

### Lo que NO está expuesto

- `.env` nunca se subió: `DATABASE_URL` actual, `GEMINI_API_KEY`,
  `EVOLUTION_API_KEY` y `NEXTAUTH_SECRET` no aparecen en ningún commit.
- No hay claves de Google, OpenAI, Slack ni tokens de GitHub en el historial.
- Ni padrón, ni CSV, ni planillas: los datos de votantes no se han publicado.
- Los teléfonos y cédulas de `MEJORAS/10-PROBLEMA-BULK-OPERATIONS.md` son
  datos de ejemplo inventados, y el `postgresql://` de `.env.example` es un
  marcador de posición.

## Migración a un proyecto Supabase nuevo (2026-09-19)

El proyecto anterior (`dotvlqkawnzzvenzmeqd`) había desaparecido: el pooler
respondía «tenant not found». La base se reconstruyó desde el respaldo
`db_cluster-11-08-2026@15-51-01.backup.gz` (del 11/08/2026), que estaba
guardado en `D:\Instagram Genius\`.

**Proyecto nuevo**: `campana-espinal` · `rovwlfxpviewxjmtkamd` · us-east-1 ·
0 USD/mes. Dedicado solo a la campaña; el proyecto de Instagram queda aparte.

**Restaurado y verificado, fila a fila**

| Tabla | Filas |
|---|---|
| mensajes | 49.808 |
| contactos | 5.985 (4.731 con puesto de votación) |
| lideres | 71 |
| campana_variaciones / campanas | 48 / 47 |
| whatsapp_auth_state | 66 |
| chat_memoria | 24 |
| lineas_whatsapp | 10 |
| mensajes_errores | 4 |

25 tablas, 24 claves primarias, 13 foráneas, 64 índices. Del respaldo se
tomó solo el esquema `public`: `auth`, `storage` y `realtime` los crea
Supabase, y las ACL del proyecto viejo se descartaron porque nombran roles
que ya no existen.

**#2b cerrado de verdad.** El rol `analista_ia` está creado y comprobado
contra la base real:

| Prueba | Resultado |
|---|---|
| Leer `contactos`, `lideres` | permitido |
| Leer `whatsapp_auth_state`, `lineas_whatsapp` | DENEGADO |
| Leer `"User"`, `"Session"`, `chat_memoria` | DENEGADO |
| INSERT / UPDATE / DELETE sobre `contactos` | DENEGADO |

Ya no depende de que `sql-guard.ts` acierte: aunque el validador falle,
PostgreSQL le niega el acceso.

**Confirmado sobre la filtración del #21**: la contraseña `SECRETO-ELIMINADO`
publicada en los scripts de GitHub era la misma que usaba el proyecto de
campaña en producción. No era una credencial de pruebas.

**Pendiente**: crear el primer usuario con `npm run usuario:crear`. Hasta
entonces `User` tiene 0 filas y nadie puede entrar — el panel falla cerrado.

### Primer usuario creado y acceso verificado (2026-09-19)

Usuario `admin`, rol admin, con contraseña temporal aleatoria de 18
caracteres (bcrypt coste 12). Probado de extremo a extremo contra el
servidor en marcha:

| Prueba | Resultado |
|---|---|
| Login con credenciales correctas | 200, sesión emitida |
| Login con contraseña incorrecta | 401, sin sesión |
| `GET /api/contactos` con sesión | 200, devuelve datos |
| `GET /api/contactos` sin sesión | 401 |

### #22 — La aplicación no permite cambiar usuario ni contraseña

No existe ninguna ruta ni pantalla de gestión de usuarios: ni cambio de
contraseña, ni alta, ni baja, ni recuperación. Hoy el único modo de cambiar
una credencial es volver a ejecutar `npm run usuario:crear`, desde la máquina
de quien administre, con acceso al `.env`.

Para una campaña con varios coordinadores esto no se sostiene: obliga a
compartir una sola cuenta, que es justo lo contrario de poder revocar el
acceso de alguien que se va. Hace falta, por orden de importancia:

1. Cambio de contraseña propia, exigiendo la actual.
2. Alta, baja y desactivación de usuarios, solo para el rol admin.
3. Registro en `auditoria` de cada cambio de credenciales.

### #7 — El build dejaba pasar errores · RESUELTO (2026-09-19)

`ignoreBuildErrors` e `ignoreDuringBuilds` a `false`, más `poweredByHeader:
false`. Para poder hacerlo hubo que arreglar 10 errores reales que el
silenciador tapaba, y el principal no era cosmético:

**Tres rutas llevaban rotas en producción.** `lib/validation.ts` no exportaba
`FiltroLideresSchema`, `LiderSchema`, `FiltroEventosSchema`, `EventoSchema`
ni `ScanSchema`, pero `/api/lideres`, `/api/eventos` y `/api/scan` los
importaban y llamaban `.safeParse()` sobre `undefined`: TypeError y 500 en
cada petición. Se escribieron los esquemas, ajustados campo a campo a
`prisma/schema.prisma`.

Además: `app/api/plantillas` no validaba nada (`data.texto.match(...)` sobre
un cuerpo vacío tumbaba el endpoint) y devolvía `error.message` de Postgres
al cliente, revelando nombres de columnas; se añadió validación y `handleError`.
Se corrigieron `lib/whatsapp/filters.ts` y `systemInstruction` en
`app/api/whatsapp/procesar-mensaje`. `tsconfig.json` excluye `_bot_apagado`,
que está desactivado y fuera de git.

**Corregido tras la auditoría**: `PlantillaSchema.nombre` era `max(120)` contra
una columna `VarChar(100)`; los filtros daban 400 ante cadenas vacías (lo que
manda un `<select>` en «Todos»); y el listado de líderes devolvía 50 de 71,
perdiendo 21 en silencio.

`npx tsc --noEmit`: **0 errores**.

### #8 — Cabeceras de seguridad · RESUELTO (2026-09-19)

CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options`, `Referrer-Policy`,
`Permissions-Policy` y HSTS en todas las respuestas. Verificado en ejecución:
las seis aparecen en páginas y en API, y `x-powered-by` ya no se emite.

La CSP mantiene `unsafe-inline`/`unsafe-eval` en `script-src` porque Next los
necesita sin migrar a nonces, y eso significa que **no protege contra XSS**.
Lo que sí hace, y es lo que importa con 5.985 cédulas detrás, es acotar
`connect-src` a Supabase, Sentry y Gemini: un script inyectado no puede
mandar el padrón a un servidor del atacante. `frame-ancestors 'none'` impide
enmarcar el panel para robar clics sobre «enviar campaña».

### #9 — Rate limiting · RESUELTO (2026-09-19)

Antes no había limitación real: `lib/ratelimit.ts` solo funciona con Upstash
por HTTP y, con `REDIS_URL` en formato TCP, caía en un objeto simulado que
devolvía siempre «permitido». Las cuatro rutas con `if (!success) return 429`
tenían un bloque que no se ejecutaba nunca, bajo un comentario `// ✅ Rate
Limiting`.

- `lib/rate-limit-edge.ts` (nuevo): ventana deslizante en memoria, sin
  dependencias, aplicada desde el middleware a las 51 rutas.
- Se aplica **antes** de comprobar la sesión y también a rutas públicas: si
  fuera al revés, el login y los webhooks —lo que un atacante martillea sin
  sesión— quedarían fuera.
- Cubos: login 15/5min por usuario, IA 20/min, envío 30/min, datos 120/min,
  webhooks 300/min, resto 200/min.
- `lib/ratelimit.ts` deja de mentir: sin Upstash cuenta en memoria, y ante un
  fallo del limitador remoto sigue contando en local en vez de abrir la puerta.

**Dos defectos graves corregidos tras la auditoría**, ambos reproducidos
contra el servidor:

1. **Evasión total.** El limitador se creía `x-forwarded-for`, que la escribe
   el cliente. Con una IP distinta en cada intento, **20 de 20 intentos de
   login pasaron**. Ahora esa cabecera solo se atiende si
   `TRUST_PROXY_HEADERS=true` declara que hay un proxy delante; si no, se usa
   la dirección de la conexión, que no se puede falsificar.
2. **Expulsión de terceros.** Poniendo la IP de un compañero se le dejaba
   fuera del panel 5 minutos, renovable: negación de servicio contra el
   equipo en plena jornada electoral, sin credenciales. El cubo de login se
   indexa ahora por origen **y** usuario.

También se sustituyó la limpieza del mapa por un desalojo real: antes solo
borraba claves de más de una hora, así que con claves frescas crecía sin
límite mientras recorría el mapa entero en cada petición — el limitador era
el amplificador de un ataque de memoria y CPU.

**Verificado en ejecución**: 9.º intento de login → 429; cabecera falsificada
ya no evade; otro coordinador sigue pudiendo entrar tras el ataque; 21.ª
llamada a `/api/ocr` → 429; 30 lecturas de `/api/contactos` → ninguna
bloqueada.

**Requiere acción al desplegar**: poner `TRUST_PROXY_HEADERS=true` en
Hostinger, donde sí hay un proxy que reescribe la cabecera. Sin ello, todas
las peticiones se contarán como si vinieran del mismo origen.

**Suite completa en verde por primera vez**: 9 ficheros, 80 tests, 9 omitidos
(los que necesitan credenciales de prueba). Se añadió `vitest.config.ts` con
el alias `@/`, que faltaba y mantenía `__tests__/rag-v2.test.ts` en rojo.

### #10 — Inyección de instrucciones en los prompts · RESUELTO (2026-09-19)

El texto de los votantes se metía en los prompts entre comillas dobles
(`"${mensajeUsuario}"`). Bastaba escribir una comilla para salirse del hueco y
que el resto se leyera como instrucciones. Con eso se podía: falsear la
intención de voto guardada en la ficha de una persona, y torcer la respuesta
automática que la campaña envía en su nombre.

**`lib/ia/sanitizar.ts` (nuevo)**
- `envolverNoConfiable()`: limpia caracteres invisibles (los de ancho cero y
  las marcas de dirección permiten esconder instrucciones que una persona no
  ve y el modelo sí lee), recorta la longitud y envuelve el texto en una
  etiqueta con **marca aleatoria distinta en cada llamada**. El atacante no
  puede cerrar un delimitador cuyo nombre no conoce.
- `AVISO_CONTENIDO_EXTERNO`: acompaña al bloque, después de las instrucciones
  reales.
- `elegirDeListaCerrada()`: la contención final. Aunque una inyección tuerza
  al modelo, lo que se guarda solo puede ser un valor previsto.
- `pareceInyeccion()`: solo registra. Quien lo intente en serio no usará
  palabras reconocibles, y bloquear por un falso positivo sería peor.

**Aplicado en las tres entradas de terceros**
| Punto | Qué entra | Qué se hizo |
|---|---|---|
| `lib/gemini.ts` → clasificador de intención | mensaje de WhatsApp del votante | bloque delimitado + aviso |
| `lib/whatsapp/profiler.ts` | lo anterior, y escribe en la ficha | salida contra lista cerrada; se registra el intento |
| `app/api/whatsapp/procesar-mensaje` | mensaje del votante, y **la respuesta se le envía** | entrada delimitada; intención, concepto y respuesta validados y acotados antes de guardar o enviar |
| `app/api/ocr` | texto escrito en la planilla fotografiada | aviso en el prompt y validación con zod de cada fila (solo dígitos en cédula y teléfono, longitudes acotadas, máx. 200 filas) |

De paso, `procesar-mensaje` y `ocr` reventaban con 500 si el modelo no
devolvía JSON —cosa que una inyección puede provocar—; ahora se descarta la
respuesta con un aviso.

`__tests__/lib/sanitizar.test.ts`: 12 tests con cargas de inyección reales,
incluida la comprobación de que ninguna consigue cerrar el bloque.

### #11 — Servidor sin TLS ni proxy de confianza · RESUELTO (2026-09-19)

`server.js` servía HTTP plano en todas las interfaces, sin tiempos de espera
y devolviendo el error al cliente.

- **Escucha solo en `127.0.0.1` cuando hay proxy delante.** Es lo que impide
  que alguien llegue directo al puerto 3000 saltándose el TLS y, con
  `TRUST_PROXY_HEADERS` activo, falsificando `x-forwarded-for` para burlar el
  límite de peticiones del #9. Sin proxy declarado se mantiene el
  comportamiento anterior, para no romper el arranque local.
- **Redirección 308 a HTTPS** cuando el proxy indica que la petición entró por
  HTTP: la sesión viaja en una cookie y por HTTP iría en claro.
- **Tiempos de espera** (cabeceras 20 s, petición 60 s, keep-alive 30 s): sin
  ellos, unas pocas conexiones lentas dejan el servidor sin plazas.
- El detalle del error se queda en el registro, no se devuelve.

**Cookie de sesión endurecida** en `lib/auth.ts`, que es la otra mitad del
problema: con `NEXTAUTH_URL` en `https://` la cookie pasa a llamarse
`__Secure-next-auth.session-token` y se marca `secure`, así que el navegador
no la manda nunca por HTTP. Con `sameSite: "lax"` no se envía desde otro sitio
web (CSRF) y con `httpOnly` no la puede leer JavaScript.

**Requiere acción al desplegar**: `NEXTAUTH_URL` debe empezar por `https://`
en producción, o la cookie no se marcará como segura.

**Suite completa**: 10 ficheros, 92 tests, 9 omitidos.

### Correcciones del #10 y #11 tras la auditoría (2026-09-19)

El supervisor encontró que **el fix principal del #10 no estaba aplicado**:
`app/api/whatsapp/procesar-mensaje` importaba `envolverNoConfiable` y no lo
llamaba; el mensaje del votante seguía interpolado entre comillas exactamente
igual que antes. Una edición que no coincidió y que ni los tipos ni los tests
podían detectar. Corregido en las dos ramas (ciudadano y líder), incluyendo
el nombre del contacto, que también sale de la base y pudo entrar por OCR.

Otros tres defectos, todos corregidos:

1. **`elegirDeListaCerrada` se podía dirigir.** Recorría la lista en orden y
   devolvía el primer valor que apareciera en cualquier parte del texto:
   `"negativo, no positivo"` devolvía `positivo`, y `"no-positivo"` también.
   Bastaba lograr que el modelo mencionara la palabra conveniente para fijar
   la intención de voto de cualquier ficha. Ahora exige coincidencia exacta o
   token único, y descarta la respuesta si aparece más de un valor.
2. **Contrabando Unicode.** La limpieza no cubría los caracteres «tag»
   (U+E0000–E007F), un alfabeto ASCII invisible con el que se puede escribir
   un prompt entero que el modelo lee y nadie ve. Tampoco el guion blando ni
   los rellenos Hangul, que parten palabras y esquivan la detección.
3. **La descripción del bloque se interpolaba cruda**, así que un llamador que
   pasara texto externo podía abrir la etiqueta. Ahora se restringe a
   `[a-z0-9-]`.

**Puntos adicionales cubiertos**: `app/api/mensajes/generar-variaciones` y
`ia-tools.generar_variaciones_antiban` (el texto que se envía a miles de
personas), con validación de lo que se guarda; y un aviso en `lib/ia/prompts.ts`,
que tiene plantillas sin delimitar y hoy sin uso.

**#11 — open redirect.** La redirección a HTTPS tomaba el dominio de
`x-forwarded-host`, que escribe el cliente. Con `x-forwarded-host: evil.example`
devolvía `308 Location: https://evil.example/...`, y un 308 conserva método y
cuerpo: **un POST de login se reenviaba entero al servidor del atacante**,
partiendo de un enlace con el dominio real de la campaña. Ahora el destino se
construye siempre desde `NEXTAUTH_URL`.

También: `requestTimeout` de 60 s cortaba subidas legítimas de planillas desde
el móvil (la foto viaja como data URL, un tercio más pesada); ampliado a 180 s.
Y se documentó `HOST` en `.env.example`, porque escuchar en `127.0.0.1` deja
inalcanzable un despliegue con contenedores si no se ajusta.

### [NUEVO] La cadena del webhook estaba rota desde el #1

`app/api/webhooks/evolution` llamaba a `/api/whatsapp/procesar-mensaje` sin
credenciales, y desde que existe el middleware esa ruta respondía 401: **las
auto-respuestas de IA llevaban sin funcionar desde el primer arreglo**. Ahora
la llamada va firmada con `INTERNAL_WEBHOOK_SECRET`, la ruta lo exige y el
middleware la trata como webhook.

De paso, la rama del líder hacía `JSON.parse` sin protección y creaba eventos
en la agenda con los datos sin validar: una fecha inválida se guardaba como
`Invalid Date`. Ahora se validan fechas, tipo y longitudes antes de escribir.

### #10b — Inyección indirecta, pendiente

Quedan dos caminos de segundo orden sin cubrir, señalados por el supervisor:
- `lib/rag-prompts-v2.ts` y `lib/rag-prompts.ts` meten `doc.titulo` y
  `doc.contenido` en el prompt sin delimitar: quien pueda subir un documento
  al RAG puede dar instrucciones al analista.
- `lib/gemini.ts` hace lo mismo con el historial de conversación y con los
  resultados de las consultas, que incluyen `concepto_ia` — un campo que se
  rellena con lo que escriben los votantes por WhatsApp. Es el bucle
  completo: lo que un votante escribe acaba, sin delimitar, en el prompt del
  analista que sí tiene herramientas.

## Cierre del bloque #10b, #12–#18 y #22 (2026-09-19)

### #16 — La fuga más grave de toda la auditoría · RESUELTO

Supabase publica el esquema `public` por una API REST que abre la clave
`anon`, **pública por diseño: viaja al navegador de cualquiera que entre a la
web**. Sin Row Level Security, esa clave daba acceso completo. Comprobado
contra el proyecto, no deducido:

```
GET /rest/v1/contactos            -> [{"cedula":"93126343","nombre":"…","telefono":"…"}]
GET /rest/v1/whatsapp_auth_state  -> [{"sessionId":"linea_1","value":{"private":…}}]
GET /rest/v1/User                 -> [{"username":"admin","password_h…"}]
```

El padrón entero, las claves de sesión de las líneas de WhatsApp y la tabla
de usuarios con sus hashes. Y con permiso de escritura. **No hacía falta
pasar por el login ni conocer ninguna contraseña.**

`prisma/migrations/manual/003_cerrar_acceso_publico.sql`, ya aplicado:
- Revocados todos los privilegios de `anon` y `authenticated`, incluido
  `USAGE` sobre el esquema, y `ALTER DEFAULT PRIVILEGES` para que una tabla
  futura nazca cerrada.
- RLS activado en las **25 tablas**.
- 18 políticas de solo lectura para `analista_ia`, que sí está sujeto a RLS y
  se habría quedado sin poder trabajar.

| Comprobación posterior | Resultado |
|---|---|
| Leer `contactos` con la clave pública | 42501 denegado |
| Leer `whatsapp_auth_state`, `User` | 42501 denegado |
| Escribir en `contactos` con la clave pública | 42501 denegado |
| La aplicación (Prisma) | 5.985 contactos, sin cambios |
| El asistente de IA (`analista_ia`) | lee lo suyo, denegado lo sensible |

La subida de imágenes y vídeos sigue funcionando: usa Storage, que es otro
subsistema.

### #10b — Inyección indirecta · RESUELTO
Delimitados los documentos del RAG (`lib/rag-prompts.ts` y `-v2`) y, en
`lib/gemini.ts`, el historial de conversación, la pregunta y **los resultados
de las consultas**, que incluyen `concepto_ia`: el campo que se rellena con
lo que escriben los votantes. Ese era el bucle completo.

### #14 — Swagger · RESUELTO
Ya exigía sesión desde el #1; ahora además rol de administrador. Es el mapa
completo de la API y un coordinador no lo necesita.

### #15 — PII en los registros · RESUELTO
El webhook imprimía el teléfono **y el contenido del mensaje** en claro; la
búsqueda, el término buscado (nombres y cédulas); la caché de embeddings,
fragmentos de texto. Sustituidos por métricas: longitud, duración, número de
resultados. Los logs se rotan, se copian y acaban en sitios que nadie audita.

### #17 — Acortador público · RESUELTO
`?u=` aceptaba cualquier cosa y creaba filas de rastreo con cédulas
inventadas. Ahora exige formato de cédula y que el contacto exista, sin que
la respuesta cambie (no sirve para averiguar qué cédulas hay). Además se
valida el esquema de la URL de destino: un `javascript:` guardado ahí
convertía cada enlace enviado a los votantes en un ataque.

### #18 — Reenvío de webhooks · RESUELTO
`esEventoNuevo()` recuerda los identificadores diez minutos. Una petición
capturada ya no se puede reproducir para duplicar mensajes o volver a
disparar respuestas automáticas.

### #22 — Gestión de usuarios · RESUELTO
- `lib/usuarios.ts`: las reglas de contraseña, compartidas por la pantalla y
  el script de consola.
- `/api/usuarios/password`: cambio de la propia contraseña, **exigiendo la
  actual** — si alguien deja el panel abierto, quien pase por delante no puede
  apropiarse de la cuenta. El identificador sale de la sesión, nunca del
  cuerpo de la petición.
- `/api/usuarios`: alta, listado y desactivación, solo para administradores.
  No se borra: se desactiva, para no perder el rastro de auditoría.
- `app/(dashboard)/cuenta`: la pantalla, con enlace en el menú.
- Cada cambio queda en la tabla `auditoria`.

Verificado en ejecución: un coordinador recibe 403 en la gestión de usuarios
y en `/api/docs`, pero sí puede cambiar su propia contraseña; el
administrador no puede desactivarse a sí mismo ni dejar la campaña sin
administradores; la lista nunca devuelve hashes.

### #12 — Datos sensibles en disco · REQUIERE ACCIÓN

Nada de esto está en git (verificado con `git check-ignore`), pero sigue en
el disco sin cifrar:

| Qué | Tamaño | Por qué importa |
|---|---|---|
| `.wwebjs_auth/` | **868 MB** | sesiones de WhatsApp Web |
| `_bot_apagado/auth_info_baileys/` | 93 ficheros | las mismas credenciales que están filtradas en GitHub |
| `PLANILLA … .xlsx` | 1,1 MB | padrón |
| `resultados_votacion.csv` | 471 KB | padrón |
| `exports/contactos_*.csv` | 138 KB | padrón exportado |
| `Webshare 100 proxies.txt` | 4 KB | credenciales de proxies |
| `D:\Instagram Genius\db_cluster-*.backup.gz` | 937 KB | **todo lo anterior junto** |

Tras invalidar las sesiones de WhatsApp desde el móvil (#20), las carpetas de
credenciales se pueden borrar. El resto debería vivir cifrado.

### #13 — Rotación de claves · 4 de 6

Rotadas: `NEXTAUTH_SECRET`, `INTERNAL_WEBHOOK_SECRET`,
`EVOLUTION_WEBHOOK_SECRET` y la conexión del analista. Nuevas por el cambio
de proyecto: `DATABASE_URL`, `DIRECT_URL` y las claves de Supabase.

Quedan dos que solo puede rotar el responsable, y conviene hacerlo porque han
estado en un equipo con material comprometido:
- `GEMINI_API_KEY`, en Google AI Studio.
- `EVOLUTION_API_KEY`, en la instancia de Evolution.

Ninguna de las dos apareció en el historial de GitHub.

## Correcciones tras la auditoría final (2026-09-19)

Por **tercera vez** el supervisor encontró una edición que no se había
aplicado: `lib/rag-prompts-v2.ts` importaba `envolverNoConfiable` y no lo
llamaba, y en `lib/gemini.ts` solo se había envuelto la pregunta, no el
historial ni los resultados de la base. Es el mismo fallo silencioso: una
sustitución de texto que no coincide, tipos que compilan y tests que pasan.

**Para que no vuelva a pasar**: `__tests__/lib/prompts-delimitados.test.ts`
no comprueba que se llame a la sanitización, sino el resultado — genera los
prompts reales con una carga marcada y exige que **no aparezca fuera de un
bloque delimitado**. Si alguien deshace el envoltorio, el test falla.

### #22b — La revocación no era inmediata

El supervisor señaló que desactivar a alguien no lo echaba: el middleware
valida la **firma** del token, no el estado de la cuenta, así que un
coordinador despedido seguía dentro hasta ocho horas.

- `User.tokenVersion` (migración `004`): sube al desactivar la cuenta y al
  cambiar la contraseña. El callback `jwt` lo compara en cada renovación y
  vacía la sesión si no coincide.
- Sesión de 8 h → **2 h**, con renovación cada 15 min.
- `SessionProvider` revalida cada 5 minutos y al volver a la pestaña.

**Verificado**: una cuenta desactivada no puede volver a entrar y
`/api/auth/session` le devuelve vacío, así que el panel la expulsa.

**Limitación, dicha claramente**: una petición directa a la API con una
cookie ya emitida sigue pasando el middleware hasta que el token caduca o se
renueva. La ventana era de 8 horas y ahora es de 2 como máximo, y de ~5
minutos para quien use el panel por el navegador. Cerrarla del todo exige
comprobar la sesión en cada handler, o pasar a sesiones en base de datos;
queda anotado como #22b y no está hecho.

### #15 — Restos de PII
Quitados el teléfono y la cédula de `app/api/whatsapp/webhook`, los
argumentos del modelo en `lib/gemini.ts` (incluían cédulas y el SQL
generado) y el término de búsqueda en `lib/tracing-helpers.ts`.

### #16b — Storage, pendiente
El supervisor advierte que la migración cierra el esquema `public` pero no
toca `storage.objects`. La subida de imágenes y vídeos usa la clave pública
contra el bucket `media`, y el mensaje de error del propio componente pide
«hazlo público». Si ese bucket admite escritura para `anon`, cualquiera puede
subir ficheros al almacenamiento de la campaña leyendo la clave del bundle.
Hay que auditar sus políticas y, mejor, mover la subida a una ruta de
servidor con sesión.

### #16b — Storage de Supabase · RESUELTO (2026-09-19)

**Lo que había.** Los editores de imagen y vídeo subían archivos desde el
navegador con `supabaseClient.storage`, es decir con la clave `anon`, que es
pública. El propio mensaje de error del componente pedía «crea el bucket
'media' y **hazlo público**». Con esa configuración, cualquiera que leyera el
JavaScript de la web podía escribir en el almacenamiento de la campaña, y
todo lo subido quedaba accesible a quien acertara la URL. Además no se
validaba ni el tipo ni el tamaño: el nombre salía de `Math.random()` y la
extensión, del propio archivo.

**Comprobado antes de tocar nada**: en el proyecto nuevo no existía ningún
bucket ni ninguna política en `storage`, así que la exposición no estaba
activa — pero la funcionalidad tampoco: subir una imagen fallaba.

**Lo que hay ahora**
- Bucket `media` **privado**, con tope de 25 MB y lista cerrada de tipos.
- `app/api/media/subir`: la subida pasa por el servidor, que exige sesión.
- `lib/media.ts`: el tipo se deduce de la **firma binaria del contenido**, no
  del `Content-Type` ni de la extensión, porque ambos los elige quien sube.
- El nombre del archivo lo genera el servidor (`randomUUID`): nada que venga
  del cliente entra en la ruta, así que no se puede escribir fuera de su
  sitio.
- Se devuelve un **enlace firmado con caducidad de una semana**, no una URL
  pública permanente.
- El navegador ya no habla con el almacenamiento: `supabaseClient` solo
  queda como cliente sin uso en el código.

**Verificado en ejecución**

| Petición | Resultado |
|---|---|
| Subir sin sesión | 401 |
| HTML con `<script>` renombrado a `.png`, con `Content-Type: image/png` | 415 rechazado |
| SVG con `<script>` renombrado a `.png` | 415 rechazado |
| PNG legítimo | pasa la validación |

Más 8 tests de reconocimiento por contenido, incluidos ejecutable de Windows,
script de shell y una firma PNG colocada más adelante en el archivo para
engañar al comprobador.

**Requiere acción**: pegar `SUPABASE_SECRET_KEY` en el `.env` (Dashboard >
Project Settings > API Keys > *secret*). Hasta entonces, subir una imagen
devuelve 503 con un mensaje claro. Esa clave **solo puede vivir en el
servidor**: se salta Row Level Security por completo, así que nunca debe ir
en una variable `NEXT_PUBLIC_*`.

## Despliegue en producción (2026-09-20)

`https://app.conectados.art`, en Hostinger. Comprobado desde fuera:

| Petición | Respuesta |
|---|---|
| `GET /` sin sesión | 307 → `/login?callbackUrl=%2F` |
| `GET /api/contactos` sin sesión | 401 |
| `GET /api/auth/csrf` | 200 |

El control de acceso funciona en producción, no solo en local.

**Cabeceras que llegan íntegras**: `X-Frame-Options: DENY`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
`Strict-Transport-Security`. Y `x-powered-by` no se emite.

### #8b — La CSP llega recortada

Lo que recibe el navegador es solo `upgrade-insecure-requests`, seguido de
unos 440 espacios en blanco. Desaparecen `default-src`, `script-src`,
`connect-src`, `form-action`, `object-src` y `base-uri`.

El relleno con espacios indica que algo la reescribe **en el sitio**,
sobrescribiendo el valor y rellenando el hueco: apunta a LiteSpeed o al panel
de Hostinger, no al código. La aplicación la envía completa, verificado en
local.

Lo que se pierde es la mitad útil: `connect-src` era lo que impedía que un
script inyectado enviara el padrón a un servidor ajeno. Amortigua el golpe
que `X-Frame-Options: DENY` sí llega, así que el clickjacking sigue cubierto.

Por revisar, en este orden:
1. Si hPanel tiene una sección de cabeceras de seguridad imponiendo su propia
   política.
2. Acortar la política a lo esencial, por si el límite es de longitud
   (la actual ronda los 600 caracteres; la recortada, unos 250).
3. Emitirla desde el middleware en vez de `next.config.mjs`.

### Pendiente del responsable

- Cambiar la contraseña de `admin`: se generó durante la auditoría y viajó por
  el chat.
- Poner el repositorio en privado.
- Rotar `GEMINI_API_KEY`.
- Ficheros sensibles en disco (#12): `.wwebjs_auth/` (868 MB),
  `_bot_apagado/auth_info_baileys/`, el padrón en CSV y XLSX, y el respaldo
  en `D:\Instagram Genius\`.
