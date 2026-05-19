import sys
import os
import requests
import json
import re
import time
from dotenv import load_dotenv

# Añadimos la carpeta Registraduria al path para poder importar el consultor original
ruta_registraduria = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'Registraduria'))
sys.path.append(ruta_registraduria)

try:
    from consultor_cedulas import ConsultorCedulasAutomatico
except ImportError:
    print("❌ No se pudo importar ConsultorCedulasAutomatico de la carpeta Registraduria.")
    sys.exit(1)

# Cargar las variables del .env de la aplicación
load_dotenv()

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")
CAPSOLVER_API_KEY = os.getenv("CAPSOLVER_API_KEY")

# Si no está capsolver en este env, cargamos el de Registraduria
if not CAPSOLVER_API_KEY:
    load_dotenv(os.path.join(ruta_registraduria, ".env"))

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal"
}

def obtener_contactos_sin_mesa():
    print("📥 Obteniendo contactos desde Supabase que no tienen puesto asignado...")
    url = f"{SUPABASE_URL}/rest/v1/contactos?select=cedula,nombre&puesto_votacion=is.null"
    try:
        response = requests.get(url, headers=HEADERS)
        if response.status_code == 200:
            return response.json()
        else:
            print("❌ Error obteniendo contactos:", response.text)
            return []
    except Exception as e:
        print(f"❌ Error de red conectando a Supabase: {str(e)}")
        return []

def actualizar_contacto(cedula, puesto, direccion, mesa):
    url = f"{SUPABASE_URL}/rest/v1/contactos?cedula=eq.{cedula}"
    payload = {}
    if puesto: payload["puesto_votacion"] = puesto
    if direccion: payload["direccion_puesto"] = direccion
    if mesa: payload["mesa_numero"] = mesa
    
    if not payload:
        return
        
    try:
        response = requests.patch(url, headers=HEADERS, json=payload)
        if response.status_code in (200, 204):
            print(f"  ✓ Supabase actualizado correctamente.")
        else:
            print(f"  ❌ Error actualizando Supabase para {cedula}:", response.text)
    except Exception as e:
         print(f"  ❌ Error de red guardando en Supabase: {str(e)}")

def parse_resultado(texto):
    """Extrae el puesto, dirección y mesa del texto de la Registraduría."""
    puesto = direccion = mesa = None
    
    # Expresiones regulares que buscan palabras clave (ajustado para español sin tildes obligatorias)
    match_puesto = re.search(r"Puesto[:\s]+(.*?)(?:\n|Direcci)", texto, re.IGNORECASE)
    if match_puesto: puesto = match_puesto.group(1).strip()
        
    match_dir = re.search(r"Direcci[oó]n[:\s]+(.*?)(?:\n|Mesa)", texto, re.IGNORECASE)
    if match_dir: direccion = match_dir.group(1).strip()
        
    match_mesa = re.search(r"Mesa[:\s]+(\d+)", texto, re.IGNORECASE)
    if match_mesa: mesa = match_mesa.group(1).strip()
        
    return puesto, direccion, mesa

def main():
    contactos = obtener_contactos_sin_mesa()
    if not contactos:
        print("✅ No hay contactos pendientes por sincronizar (todos tienen puesto de votación).")
        return
        
    print(f"📋 Encontrados {len(contactos)} contactos sin mesa de votación asignada.")
    
    consultor = None
    try:
        # Iniciamos el scraper original que usa Selenium y Capsolver
        print("🚀 Iniciando el navegador (Selenium) y CapSolver...")
        consultor = ConsultorCedulasAutomatico()
        
        for idx, contacto in enumerate(contactos):
            cedula = contacto["cedula"]
            print(f"\n[{idx+1}/{len(contactos)}] Sincronizando {contacto['nombre']} ({cedula})")
            
            # Reutiliza el método automático que resuelve el captcha
            resultado = consultor.consultar_cedula(cedula)
            
            if resultado["exito"]:
                texto = resultado["datos"]
                puesto, direccion, mesa = parse_resultado(texto)
                
                # Si encuentra al menos la mesa o el puesto
                if puesto or mesa:
                    print(f"  📊 Datos detectados -> Puesto: {puesto} | Mesa: {mesa}")
                    actualizar_contacto(cedula, puesto, direccion, mesa)
                else:
                    print("  ⚠️ No se encontró información estructurada de puesto/mesa.")
                    # Guardamos el resultado crudo en notas por si acaso
                    payload = {"notas": texto[:1000]}
                    requests.patch(f"{SUPABASE_URL}/rest/v1/contactos?cedula=eq.{cedula}", headers=HEADERS, json=payload)
            else:
                print(f"  ❌ Falló la consulta para {cedula}: {resultado.get('error')}")
                
            print("  ⏳ Esperando 3 segundos...")
            time.sleep(3)
            
        print("\n✅ Proceso de sincronización finalizado.")
            
    except Exception as e:
        print(f"❌ Error fatal en la sincronización: {str(e)}")
    finally:
        if consultor:
            consultor.cerrar()

if __name__ == "__main__":
    main()
