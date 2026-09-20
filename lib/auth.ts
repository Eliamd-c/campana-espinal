import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Configuración de acceso al panel de campaña.
 *
 * Aquí no hay valores por defecto a propósito. Un secreto con fallback es un
 * secreto público: cualquiera que lea el repositorio puede firmar un token de
 * sesión con rol de administrador. Si falta la variable, la aplicación no
 * arranca.
 */
function exigirSecreto(): string {
  const secreto = process.env.NEXTAUTH_SECRET;

  const ayuda =
    "Genera uno con `openssl rand -base64 32` y ponlo en el entorno (también " +
    "en el del hosting). La aplicación no arranca sin él: quien conozca este " +
    "valor puede firmarse una sesión de administrador sin pasar por el login.";

  if (!secreto) {
    throw new Error(`NEXTAUTH_SECRET no está definido. ${ayuda}`);
  }

  if (secreto.length < 32) {
    throw new Error(
      `NEXTAUTH_SECRET es demasiado corto (${secreto.length} caracteres, mínimo 32). ${ayuda}`
    );
  }

  /**
   * La longitud sola no basta: una frase escrita a mano de 35 caracteres se
   * rompe fuera de línea a partir de una cookie capturada, mientras que 32
   * bytes aleatorios no. Se mide la variedad de caracteres, que es lo que
   * distingue una frase de una cadena aleatoria.
   */
  const distintos = new Set(secreto).size;
  if (distintos < 24) {
    throw new Error(
      `NEXTAUTH_SECRET parece escrito a mano (solo ${distintos} caracteres ` +
        `distintos): no tiene la aleatoriedad de un secreto de firma. ${ayuda}`
    );
  }

  if (/clave|secret|password|campana|espinal|12345/i.test(secreto)) {
    throw new Error(
      `NEXTAUTH_SECRET contiene palabras predecibles. ${ayuda}`
    );
  }

  return secreto;
}

/**
 * Hash con el que comparar cuando el usuario no existe. Sirve para gastar el
 * mismo tiempo en «usuario inexistente» que en «contraseña incorrecta»: sin
 * esto, la diferencia de tiempos permite averiguar qué usuarios existen.
 */
const HASH_SEÑUELO = "$2a$12$CjwJpnAfnb1hhPhTBBN.Eehf6ZDrrIXfRKX1uO6wX5rqIFQC2KFiy";

export const authOptions: NextAuthOptions = {
  secret: exigirSecreto(),
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        username: { label: "Usuario", type: "text" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        const usuario = credentials?.username?.trim();
        const clave = credentials?.password;

        if (!usuario || !clave) return null;

        const registro = await prisma.user.findUnique({
          where: { username: usuario },
        });

        // Se compara siempre, exista o no el usuario, para no revelar por
        // tiempo de respuesta cuáles existen.
        const hash = registro?.passwordHash ?? HASH_SEÑUELO;
        const coincide = await bcrypt.compare(clave, hash);

        if (!registro || !registro.passwordHash || !coincide || !registro.activo) {
          // El motivo no se le dice a quien intenta entrar; queda en el log.
          logger.warn("[auth] Intento de acceso fallido", {
            usuario,
            motivo: !registro
              ? "usuario inexistente"
              : !registro.passwordHash
                ? "usuario sin contraseña asignada"
                : !registro.activo
                  ? "usuario desactivado"
                  : "contraseña incorrecta",
          });
          return null;
        }

        await prisma.user.update({
          where: { id: registro.id },
          data: { ultimoAcceso: new Date() },
        });

        logger.info("[auth] Acceso correcto", { usuario, rol: registro.role });

        return {
          id: registro.id,
          name: registro.name ?? registro.username,
          email: registro.email ?? undefined,
          role: registro.role,
          tokenVersion: registro.tokenVersion,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sub = user.id;
        token.tv = (user as any).tokenVersion ?? 0;
        return token;
      }

      /**
       * En cada renovación se comprueba el estado real de la cuenta. Sin
       * esto, desactivar a alguien no lo echaba del panel: su token seguía
       * valiendo hasta ocho horas, con acceso completo al padrón. Tampoco
       * servía de nada cambiar la contraseña si alguien había robado la
       * sesión.
       *
       * `tokenVersion` sube al desactivar la cuenta y al cambiar la
       * contraseña; si no coincide con la del token, la sesión deja de valer.
       */
      if (token.sub) {
        try {
          const actual = await prisma.user.findUnique({
            where: { id: token.sub as string },
            select: { activo: true, role: true, tokenVersion: true },
          });

          if (!actual || !actual.activo || actual.tokenVersion !== token.tv) {
            logger.info("[auth] Sesión revocada", { usuario: token.sub });
            // Un token sin `sub` no identifica a nadie: el middleware lo
            // rechaza y la persona vuelve al login.
            return {} as typeof token;
          }

          // El rol puede haber cambiado desde que se emitió el token.
          token.role = actual.role;
        } catch (error) {
          // Si la base no responde, se conserva la sesión: cortar el acceso a
          // toda la campaña por un fallo de red sería peor.
          logger.warn("[auth] No se pudo revalidar la sesión", {
            error: String(error),
          });
        }
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        (session.user as any).id = token.sub;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },

  /**
   * La cookie de sesión es la llave del panel: quien la copie entra sin
   * contraseña. En producción (NEXTAUTH_URL con https) se marca `secure`, de
   * modo que el navegador no la envía nunca por HTTP en claro, y se le pone
   * el prefijo `__Secure-`, que impide que un subdominio la sobrescriba.
   *
   * `sameSite: "lax"` evita que se mande desde otro sitio web, que es lo que
   * hace falta para un ataque de petición forzada (CSRF); y `httpOnly` la
   * oculta a JavaScript, así que un XSS no puede leerla.
   */
  useSecureCookies: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
  cookies: {
    sessionToken: {
      name: (process.env.NEXTAUTH_URL ?? "").startsWith("https://")
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: (process.env.NEXTAUTH_URL ?? "").startsWith("https://"),
      },
    },
  },
  session: {
    strategy: "jwt",
    /**
     * Dos horas, no ocho.
     *
     * El token se valida por firma en el middleware, sin consultar la base:
     * eso lo hace barato, pero significa que una cuenta desactivada conserva
     * acceso hasta que su token caduca. `maxAge` es por tanto el peor caso de
     * esa ventana, y ocho horas era demasiado para un panel con 5.985
     * cédulas detrás.
     *
     * `updateAge` fuerza que el token se renueve cada quince minutos, y cada
     * renovación pasa por el callback `jwt`, que sí consulta la base y
     * revoca la sesión si la cuenta se desactivó o cambió la contraseña.
     */
    maxAge: 2 * 60 * 60,
    updateAge: 15 * 60,
  },
};
