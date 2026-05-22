import {
  AuthenticationCreds,
  AuthenticationState,
  BufferJSON,
  SignalDataTypeMap,
  initAuthCreds,
} from "@whiskeysockets/baileys";
import prisma from "@/lib/db";

export const usePrismaAuthState = async (
  sessionId: string
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> => {
  const writeData = async (data: any, key: string) => {
    try {
      const dataString = JSON.stringify(data, BufferJSON.replacer);
      await prisma.whatsappAuthState.upsert({
        where: {
          sessionId_key: {
            sessionId,
            key,
          },
        },
        update: {
          value: dataString,
        },
        create: {
          sessionId,
          key,
          value: dataString,
        },
      });
    } catch (error) {
      console.error(`[Whatsapp Auth] Error saving ${key} for session ${sessionId}:`, error);
    }
  };

  const readData = async (key: string) => {
    try {
      const result = await prisma.whatsappAuthState.findUnique({
        where: {
          sessionId_key: {
            sessionId,
            key,
          },
        },
      });
      if (result && result.value) {
        return JSON.parse(result.value, BufferJSON.reviver);
      }
      return null;
    } catch (error) {
      console.error(`[Whatsapp Auth] Error reading ${key} for session ${sessionId}:`, error);
      return null;
    }
  };

  const removeData = async (key: string) => {
    try {
      await prisma.whatsappAuthState.delete({
        where: {
          sessionId_key: {
            sessionId,
            key,
          },
        },
      });
    } catch (error) {
      // Ignorar si no existe
    }
  };

  let creds: AuthenticationCreds;
  const dbCreds = await readData("creds");

  if (dbCreds) {
    creds = dbCreds;
  } else {
    creds = initAuthCreds();
    await writeData(creds, "creds");
  }

  return {
    state: {
      creds,
      keys: {
        get: async (type: keyof SignalDataTypeMap, ids: string[]) => {
          const data: { [key: string]: SignalDataTypeMap[typeof type] } = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === "app-state-sync-key" && value) {
                value = Buffer.from(value, 'base64');
              }
              data[id] = value;
            })
          );
          return data;
        },
        set: async (data: any) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              if (value) {
                tasks.push(writeData(value, key));
              } else {
                tasks.push(removeData(key));
              }
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, "creds"),
  };
};
