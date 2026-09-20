#!/usr/bin/env bash
#
# Purga del historial de git los secretos que se publicaron en GitHub.
# Hallazgos #20 y #21 del backlog de seguridad.
#
# QUÉ BORRA
#   1. bot/auth_info_baileys/ — las claves de sesión de las líneas de
#      WhatsApp: creds.json con noiseKey, signedIdentityKey y advSecretKey,
#      más las pre-keys y las claves de sincronización.
#   2. Los textos que se indiquen en la variable CLAVES_A_PURGAR, pensada
#      para la contraseña de base de datos que estaba escrita en
#      scripts/setup-indices.js y scripts/setup-vectores.js.
#
#      La contraseña NO se escribe aquí a propósito: este fichero vive en el
#      repositorio, y ponerla lo devolvería todo al punto de partida.
#
# LO QUE ESTO NO HACE
#   Borrar el historial NO deshace la publicación. Lo que estuvo en un
#   repositorio público pudo clonarse o quedar en la caché de GitHub. Por eso
#   el paso 1 de abajo es invalidar las credenciales, y no es opcional: es lo
#   único con efecto inmediato.
#
# ANTES DE EJECUTAR
#   1. Desde el móvil de cada línea: WhatsApp → Dispositivos vinculados →
#      cerrar todas las sesiones. Revisar si hay alguno desconocido.
#   2. Rotar la contraseña del proyecto Supabase antiguo, si aún existe.
#   3. Poner el repositorio en privado.
#   4. Commitear el trabajo pendiente: esto reescribe el historial.
#
# USO
#   bash scripts/purgar-historial.sh
#       Solo comprueba e informa. No toca nada.
#
#   CLAVES_A_PURGAR='la-contraseña-vieja' bash scripts/purgar-historial.sh --ejecutar
#       Reescribe el historial local. Varios secretos, separados por '|'.
#
# El push forzado no lo hace este script: se indica al final, para que sea
# una decisión consciente.

set -uo pipefail

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RAIZ"

EJECUTAR=false
[ "${1:-}" = "--ejecutar" ] && EJECUTAR=true

RUTA_CREDENCIALES="bot/auth_info_baileys/"

abortar() {
  echo
  echo "ERROR: $1"
  exit 1
}

echo "Purga del historial"
echo "  repositorio: $(git remote get-url origin 2>/dev/null || echo 'sin remoto configurado')"
echo

# ── Comprobaciones previas ───────────────────────────────────────────────
git rev-parse --git-dir > /dev/null 2>&1 || abortar "esto no es un repositorio git."

if git filter-repo --version > /dev/null 2>&1; then
  echo "  [ok] git-filter-repo disponible"
else
  abortar "falta git-filter-repo.  Instalar con:  python -m pip install git-filter-repo"
fi

pendientes=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$pendientes" -gt 0 ]; then
  echo "  [!]  Hay $pendientes cambios sin commitear."
  echo "       Commitéalos antes de reescribir: el historial se recompone"
  echo "       entero y conviene que el trabajo actual ya forme parte de él."
  [ "$EJECUTAR" = true ] && abortar "árbol de trabajo sucio."
else
  echo "  [ok] Árbol de trabajo limpio"
fi

# ── Qué hay que purgar ───────────────────────────────────────────────────
contar_credenciales() {
  git log --all --pretty=format: --name-only 2>/dev/null \
    | sort -u | grep -c "^${RUTA_CREDENCIALES}" || true
}

credenciales=$(contar_credenciales)
echo
echo "  Ficheros de credenciales de WhatsApp en el historial: $credenciales"
echo "  Commits totales:                                      $(git rev-list --all --count)"

if [ -n "${CLAVES_A_PURGAR:-}" ]; then
  echo "  Secretos a sustituir en el texto:                     $(echo "$CLAVES_A_PURGAR" | tr '|' '\n' | wc -l | tr -d ' ')"
else
  echo "  Secretos a sustituir en el texto:                     ninguno"
  echo "       (define CLAVES_A_PURGAR para limpiar además contraseñas escritas"
  echo "        en el código, separadas por '|')"
fi

if [ "$EJECUTAR" != true ]; then
  echo
  echo "Esto ha sido solo una comprobación. Para reescribir de verdad:"
  echo "    CLAVES_A_PURGAR='<la-contraseña-vieja>' bash scripts/purgar-historial.sh --ejecutar"
  exit 0
fi

# ── Copia de seguridad ───────────────────────────────────────────────────
RESPALDO="$RAIZ/../campana-espinal-respaldo-$(date +%Y%m%d-%H%M%S).git"
echo
echo "1/4  Copia de seguridad del historial completo"
if ! git clone --mirror . "$RESPALDO" 2>&1 | sed 's/^/     /'; then
  abortar "no se pudo crear la copia de seguridad; no se sigue adelante."
fi
echo "     guardada en: $RESPALDO"
echo "     si algo sale mal, ahí está el historial original intacto."

# ── Eliminar las credenciales ────────────────────────────────────────────
echo
echo "2/4  Eliminando $RUTA_CREDENCIALES del historial"
if ! git filter-repo --force --invert-paths --path "$RUTA_CREDENCIALES" 2>&1 | sed 's/^/     /'; then
  abortar "falló la eliminación de las credenciales."
fi

# ── Sustituir los secretos escritos en el código ─────────────────────────
if [ -n "${CLAVES_A_PURGAR:-}" ]; then
  echo
  echo "3/4  Sustituyendo los secretos en todos los commits"

  # El fichero se crea fuera del repositorio y se borra al terminar: si se
  # quedara dentro, el secreto volvería a entrar en el historial.
  REEMPLAZOS="$(mktemp)"
  trap 'rm -f "$REEMPLAZOS"' EXIT
  echo "$CLAVES_A_PURGAR" | tr '|' '\n' | while IFS= read -r secreto; do
    [ -n "$secreto" ] && printf '%s==>SECRETO-ELIMINADO\n' "$secreto"
  done > "$REEMPLAZOS"

  if ! git filter-repo --force --replace-text "$REEMPLAZOS" 2>&1 | sed 's/^/     /'; then
    abortar "falló la sustitución de secretos."
  fi
else
  echo
  echo "3/4  Sin secretos de texto que sustituir (CLAVES_A_PURGAR vacía)"
fi

# ── Comprobación ─────────────────────────────────────────────────────────
echo
echo "4/4  Comprobando el resultado"
quedan=$(contar_credenciales)
echo "     credenciales en el historial: $quedan   (debe ser 0)"

if [ -n "${CLAVES_A_PURGAR:-}" ]; then
  restantes=0
  while IFS= read -r secreto; do
    [ -z "$secreto" ] && continue
    n=$(git log --all --oneline -S "$secreto" 2>/dev/null | wc -l | tr -d ' ')
    restantes=$((restantes + n))
  done < <(echo "$CLAVES_A_PURGAR" | tr '|' '\n')
  echo "     secretos en el historial:     $restantes   (debe ser 0)"
else
  restantes=0
fi

echo
if [ "$quedan" = "0" ] && [ "$restantes" = "0" ]; then
  echo "Historial local limpio."
else
  abortar "algo ha quedado en el historial. Revísalo antes de publicar."
fi

cat <<'FIN'

FALTA EL ÚLTIMO PASO, y es irreversible para quien ya tenga copias.

  git filter-repo quita el remoto a propósito, para que nadie publique sin
  pensarlo. Para terminar:

      git remote add origin https://github.com/Eliamd-c/campana-espinal.git
      git push --force --all origin
      git push --force --tags origin

  Después, en GitHub:
    - Settings → General → Danger Zone → hacer el repositorio privado.
    - Comprobar que no queden forks: cada fork conserva el historial viejo.
    - Pedir a GitHub Support que purgue la caché de los commits antiguos,
      que siguen siendo accesibles por su hash durante un tiempo.

  Y lo más importante: quien clonara el repositorio mientras fue público
  sigue teniendo esas claves. Lo que de verdad protege es haber cerrado las
  sesiones de WhatsApp desde el móvil.
FIN
