export type TipoCampo = 
  | 'texto_corto'
  | 'texto_largo'
  | 'numero'
  | 'dinero'
  | 'fecha'
  | 'hora'
  | 'fecha_hora'
  | 'si_no'
  | 'opciones'
  | 'barrio'
  | 'persona'
  | 'lider';

export interface CampoPlantilla {
  clave: string;
  etiqueta: string;
  tipo: TipoCampo;
  requerido_para_confirmar: boolean;
  ayuda?: string;
  orden: number;
}

export interface CampoPorConfirmar {
  campo: string;
  marcadoPor?: string;
  fecha?: Date;
}

export interface Faltante {
  campo: string;
  etiqueta: string;
  motivo: 'vacio' | 'invalido';
}

export interface ResultadoValidacion {
  puedeConfirmar: boolean;
  faltantes: Faltante[];
  porConfirmar: Faltante[];
}

export function evaluar(
  reglas: CampoPlantilla[],
  datos: Record<string, any>,
  camposPorConfirmar: CampoPorConfirmar[] = []
): ResultadoValidacion {
  const faltantes: Faltante[] = [];
  const porConfirmar: Faltante[] = [];

  const mapPorConfirmar = new Map(camposPorConfirmar.map(c => [c.campo, c]));

  for (const regla of reglas) {
    if (regla.requerido_para_confirmar) {
      const valor = datos[regla.clave];
      
      // Chequeo basico de si esta vacio
      let esVacio = false;
      if (valor === undefined || valor === null || valor === '') {
        esVacio = true;
      }

      if (esVacio) {
        if (mapPorConfirmar.has(regla.clave)) {
          const pc = mapPorConfirmar.get(regla.clave)!;
          porConfirmar.push({
            campo: regla.clave,
            etiqueta: regla.etiqueta,
            motivo: 'vacio' // o por confirmar
          });
        } else {
          faltantes.push({
            campo: regla.clave,
            etiqueta: regla.etiqueta,
            motivo: 'vacio'
          });
        }
      }
    }
  }

  const puedeConfirmar = faltantes.length === 0 && porConfirmar.length === 0;

  return {
    puedeConfirmar,
    faltantes,
    porConfirmar
  };
}
