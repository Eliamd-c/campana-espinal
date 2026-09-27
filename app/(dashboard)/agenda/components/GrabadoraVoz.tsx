"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, X } from "lucide-react";

/**
 * Grabar y dictar, en vez de escribir.
 *
 * Quien lleva la agenda del candidato captura de pie, en la calle, con una
 * mano ocupada y alguien hablándole. Escribir eso en un teléfono es lo que
 * hace que se vuelva a la libreta de papel. Aquí pulsa, habla, y el texto
 * aparece en el recuadro para que lo corrija antes de que nada se guarde.
 *
 * Tres decisiones de comportamiento, todas por cómo se usa:
 *
 *  - **Un solo botón grande.** Pulsar para empezar, pulsar para parar. Nada
 *    de mantener pulsado: al caminar se suelta sin querer.
 *  - **Se ve el tiempo y se puede cancelar.** Una grabación que no se sabe si
 *    está corriendo se abandona.
 *  - **Corta sola al llegar al tope**, en vez de dejar que se grabe un audio
 *    que el servidor va a rechazar después.
 */

/** Tope de grabación. Coincide con el del servidor. */
const MAX_SEGUNDOS = 180;

/** Avisa cuando falta poco, para que dé tiempo a cerrar la idea. */
const AVISO_DESDE = 150;

/**
 * El formato lo decide el navegador: Chrome en Android da webm/opus y Safari
 * da mp4. Se prueba en orden y se deja que elija el primero que soporte; el
 * tipo viaja al servidor, que reparte entre los dos proveedores según quién
 * sepa leerlo.
 */
const FORMATOS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function formatoSoportado(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f));
}

const reloj = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

interface Props {
  /** Se llama con lo transcrito, para que la pantalla lo use. */
  alTranscribir: (texto: string) => void;
}

export function GrabadoraVoz({ alTranscribir }: Props) {
  const [estado, setEstado] = useState<"quieto" | "grabando" | "enviando">("quieto");
  const [segundos, setSegundos] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const grabadora = useRef<MediaRecorder | null>(null);
  const trozos = useRef<Blob[]>([]);
  const cancelado = useRef(false);
  const cronometro = useRef<NodeJS.Timeout | null>(null);

  /**
   * El contador vive también en una referencia porque el `onstop` de la
   * grabadora se cierra sobre el valor que tenía el estado al empezar, y
   * entonces toda grabación parecería durar cero segundos.
   */
  const segundosRef = useRef(0);

  /**
   * Si la pantalla se cierra a media grabación hay que soltar el micrófono.
   * Sin esto, el punto rojo del navegador se queda encendido y el teléfono
   * sigue escuchando, que es de las cosas que hacen desinstalar una
   * herramienta.
   */
  useEffect(() => {
    return () => {
      if (cronometro.current) clearInterval(cronometro.current);
      grabadora.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function empezar() {
    setError(null);

    const formato = formatoSoportado();
    if (!formato) {
      setError("Este navegador no permite grabar. Escribe el texto a mano.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      /**
       * Casi siempre es que se denegó el permiso del micrófono, y eso no se
       * arregla reintentando: hay que ir a los ajustes del navegador.
       */
      setError("No se pudo usar el micrófono. Revisa el permiso en el navegador.");
      return;
    }

    const rec = new MediaRecorder(stream, { mimeType: formato });
    grabadora.current = rec;
    trozos.current = [];
    cancelado.current = false;

    rec.ondataavailable = (e) => {
      if (e.data.size > 0) trozos.current.push(e.data);
    };

    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (cronometro.current) clearInterval(cronometro.current);

      const duracion = segundosRef.current;
      setSegundos(0);

      if (cancelado.current) {
        setEstado("quieto");
        return;
      }

      // Menos de un segundo es un toque sin querer, no una grabación.
      if (duracion < 1) {
        setEstado("quieto");
        return;
      }

      await enviar(new Blob(trozos.current, { type: formato }), duracion);
    };

    rec.start();
    setEstado("grabando");
    setSegundos(0);
    segundosRef.current = 0;

    cronometro.current = setInterval(() => {
      segundosRef.current += 1;
      setSegundos(segundosRef.current);
      if (segundosRef.current >= MAX_SEGUNDOS) detener();
    }, 1000);
  }

  function detener() {
    if (grabadora.current?.state === "recording") {
      setEstado("enviando");
      grabadora.current.stop();
    }
  }

  function cancelar() {
    cancelado.current = true;
    if (grabadora.current?.state === "recording") grabadora.current.stop();
    setEstado("quieto");
    setSegundos(0);
  }

  async function enviar(audio: Blob, duracion: number) {
    setEstado("enviando");
    try {
      const cuerpo = new FormData();
      cuerpo.append("audio", audio, "nota.webm");
      cuerpo.append("segundos", String(duracion));

      const res = await fetch("/api/agenda/transcribir", { method: "POST", body: cuerpo });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || "No se pudo transcribir");

      alTranscribir(String(json.data.texto || ""));
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setEstado("quieto");
    }
  }

  return (
    <div className="space-y-2">
      {estado === "quieto" && (
        <button
          type="button"
          onClick={empezar}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-3.5 font-medium shadow-sm"
        >
          <Mic className="w-5 h-5" />
          Dictar en vez de escribir
        </button>
      )}

      {estado === "grabando" && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={detener}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-700 text-white px-4 py-3.5 font-medium shadow-sm"
          >
            <Square className="w-4 h-4 fill-current" />
            Listo · {reloj(segundos)}
            <span className="relative flex h-2.5 w-2.5 ml-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" />
            </span>
          </button>
          <button
            type="button"
            onClick={cancelar}
            aria-label="Descartar la grabación"
            className="rounded-xl border border-slate-300 text-slate-600 px-3.5 py-3.5 hover:bg-slate-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {estado === "enviando" && (
        <div className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-100 text-slate-600 px-4 py-3.5 font-medium">
          <Loader2 className="w-5 h-5 animate-spin" />
          Pasando a texto…
        </div>
      )}

      {estado === "grabando" && segundos >= AVISO_DESDE && (
        <p className="text-xs text-amber-700">
          Quedan {MAX_SEGUNDOS - segundos} segundos: se corta sola al llegar a{" "}
          {MAX_SEGUNDOS / 60} minutos.
        </p>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {estado === "quieto" && !error && (
        <p className="text-xs text-slate-500">
          Cuenta la reunión como se la contarías a alguien: el día, la hora, el barrio, quién
          responde y qué hace falta. Después lo revisas antes de guardar.
        </p>
      )}
    </div>
  );
}
