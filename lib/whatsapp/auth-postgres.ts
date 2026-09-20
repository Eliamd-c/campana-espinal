import {
  initAuthCreds,
  BufferJSON,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import prisma from "@/lib/db";

/**
 * Credenciales de WhatsApp guardadas en Postgres.
 *
 * Baileys trae `useMultiFileAuthState`, que escribe la sesión en una carpeta:
 * un `creds.json` y, junto a él, cientos de ficheros diminutos de claves que
 * se reescriben en cada mensaje. Aquí eso no sirve por dos razones.
 *
 * La primera es el alojamiento. El plan compartido cuenta inodos y limita la
 * escritura en disco; una sesión activa de Baileys es exactamente el patrón
 * que peor le sienta. La segunda, y la que de verdad importa: el día que esto
 * se mude al VPS, una sesión en carpeta se queda en la máquina vieja y hay
 * que volver a escanear el QR. En Postgres viaja sola — se arranca el proceso
 * en el servidor nuevo y la línea sigue vinculada.
 *
 * La forma es la misma que la de la carpeta, traducida a filas: una clave por
 * fila (`creds`, `pre-key-31`, `session-57...`), el valor en JSON, y todo
 * acotado a un `sessionId` para que dos líneas no se pisen.
 */

/**
 * Baileys guarda búferes binarios dentro de sus objetos. `BufferJSON` los
 * convierte a texto y los recupera; sin él, un búfer vuelve de la base como
 * `{"type":"Buffer","data":[...]}` y la firma de los mensajes falla con
 * errores de criptografía que no dicen nada sobre la causa real.
 */
const aTexto = (valor: unknown) => JSON.stringify(valor, BufferJSON.replacer);
const aObjeto = (texto: string) => JSON.parse(texto, BufferJSON.reviver);

/** `pre-key` + `31` → `pre-key-31`. Una fila, una clave. */
const nombreClave = (tipo: string, id: string) => `${tipo}-${id}`;

/**
 * Estado de autenticación de una línea, respaldado por la tabla
 * `whatsapp_auth_state`.
 *
 * Devuelve también `guardarCreds`, que hay que enganchar al evento
 * `creds.update` del socket. Si no se engancha, la sesión parece funcionar
 * hasta el primer reinicio y entonces pide QR otra vez, porque lo que cambió
 * durante la conexión nunca llegó a la base.
 */
export async function estadoAuthPostgres(sessionId: string): Promise<{
  state: AuthenticationState;
  guardarCreds: () => Promise<void>;
}> {
  const filaCreds = await prisma.whatsappAuthState.findUnique({
    where: { sessionId_key: { sessionId, key: "creds" } },
  });

  const creds: AuthenticationCreds = filaCreds
    ? aObjeto(filaCreds.value)
    : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        async get(tipo, ids) {
          const filas = await prisma.whatsappAuthState.findMany({
            where: { sessionId, key: { in: ids.map((id) => nombreClave(tipo, id)) } },
          });

          const encontradas: { [id: string]: SignalDataTypeMap[typeof tipo] } = {};

          for (const fila of filas) {
            const id = fila.key.slice(tipo.length + 1);
            let valor = aObjeto(fila.value);

            /**
             * Las claves de sincronización de estado son el único tipo que no
             * vuelve como objeto plano: Baileys espera el mensaje de protocolo
             * ya construido y, si recibe el objeto pelado, falla al sincronizar
             * contactos y grupos.
             */
            if (tipo === "app-state-sync-key" && valor) {
              valor = proto.Message.AppStateSyncKeyData.fromObject(valor);
            }

            encontradas[id] = valor;
          }

          return encontradas;
        },

        async set(datos) {
          const escrituras: Promise<unknown>[] = [];

          for (const tipo in datos) {
            for (const id in datos[tipo as keyof SignalDataTypeMap]) {
              const valor = (datos as any)[tipo][id];
              const key = nombreClave(tipo, id);

              /**
               * Un valor nulo significa «olvida esta clave». Borrarla de
               * verdad importa: las pre-claves usadas se acumulan por miles y
               * hacen lenta cada consulta de la sesión.
               */
              escrituras.push(
                valor
                  ? prisma.whatsappAuthState.upsert({
                      where: { sessionId_key: { sessionId, key } },
                      create: { sessionId, key, value: aTexto(valor) },
                      update: { value: aTexto(valor) },
                    })
                  : prisma.whatsappAuthState
                      .delete({ where: { sessionId_key: { sessionId, key } } })
                      .catch(() => undefined) // ya no estaba: nada que borrar
              );
            }
          }

          await Promise.all(escrituras);
        },
      },
    },

    async guardarCreds() {
      const value = aTexto(creds);
      await prisma.whatsappAuthState.upsert({
        where: { sessionId_key: { sessionId, key: "creds" } },
        create: { sessionId, key: "creds", value },
        update: { value },
      });
    },
  };
}

/**
 * ¿Esta línea ya está vinculada a un teléfono?
 *
 * Se usa para decidir a quién reconectar sin intervención. Una línea que
 * nunca se vinculó no debe abrir sockets sola: generaría códigos QR que nadie
 * está mirando, una y otra vez.
 */
export async function tieneCredenciales(sessionId: string): Promise<boolean> {
  const fila = await prisma.whatsappAuthState.findUnique({
    where: { sessionId_key: { sessionId, key: "creds" } },
    select: { id: true },
  });
  return fila !== null;
}

/**
 * Borra la sesión entera. Se llama al desvincular desde el panel y cuando es
 * WhatsApp quien cierra la sesión desde el teléfono: en ese caso las
 * credenciales ya no valen para nada, y dejarlas solo consigue que el
 * siguiente arranque intente conectar con algo muerto.
 */
export async function borrarCredenciales(sessionId: string): Promise<void> {
  await prisma.whatsappAuthState.deleteMany({ where: { sessionId } });
}
