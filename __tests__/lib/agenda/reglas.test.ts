import { describe, expect, it } from 'vitest';
import { evaluar, CampoPlantilla, CampoPorConfirmar } from '../../../lib/agenda/reglas';

describe('Motor de reglas de agenda', () => {
  it('puede confirmar si la plantilla no tiene requisitos', () => {
    const reglas: CampoPlantilla[] = [];
    const resultado = evaluar(reglas, {}, []);
    expect(resultado.puedeConfirmar).toBe(true);
    expect(resultado.faltantes).toHaveLength(0);
    expect(resultado.porConfirmar).toHaveLength(0);
  });

  it('no puede confirmar si falta un campo requerido', () => {
    const reglas: CampoPlantilla[] = [
      { clave: 'hora', etiqueta: 'Hora', tipo: 'hora', requerido_para_confirmar: true, orden: 1 }
    ];
    const resultado = evaluar(reglas, {}, []);
    
    expect(resultado.puedeConfirmar).toBe(false);
    expect(resultado.faltantes).toHaveLength(1);
    expect(resultado.faltantes[0].campo).toBe('hora');
    expect(resultado.porConfirmar).toHaveLength(0);
  });

  it('no puede confirmar si un campo requerido esta marcado como por confirmar', () => {
    const reglas: CampoPlantilla[] = [
      { clave: 'hora', etiqueta: 'Hora', tipo: 'hora', requerido_para_confirmar: true, orden: 1 }
    ];
    const porConfirmar: CampoPorConfirmar[] = [
      { campo: 'hora', marcadoPor: 'usuario', fecha: new Date() }
    ];
    
    const resultado = evaluar(reglas, {}, porConfirmar);
    
    expect(resultado.puedeConfirmar).toBe(false);
    expect(resultado.faltantes).toHaveLength(0);
    expect(resultado.porConfirmar).toHaveLength(1);
    expect(resultado.porConfirmar[0].campo).toBe('hora');
  });

  it('puede confirmar si tiene todos los campos exigidos y no hay nada por confirmar', () => {
    const reglas: CampoPlantilla[] = [
      { clave: 'hora', etiqueta: 'Hora', tipo: 'hora', requerido_para_confirmar: true, orden: 1 },
      { clave: 'lugar', etiqueta: 'Lugar', tipo: 'texto_corto', requerido_para_confirmar: true, orden: 2 },
      { clave: 'notas', etiqueta: 'Notas', tipo: 'texto_largo', requerido_para_confirmar: false, orden: 3 }
    ];
    const datos = {
      hora: '14:00',
      lugar: 'Centro',
      // notas falta pero no es requerido
    };
    
    const resultado = evaluar(reglas, datos, []);
    
    expect(resultado.puedeConfirmar).toBe(true);
    expect(resultado.faltantes).toHaveLength(0);
    expect(resultado.porConfirmar).toHaveLength(0);
  });
});
