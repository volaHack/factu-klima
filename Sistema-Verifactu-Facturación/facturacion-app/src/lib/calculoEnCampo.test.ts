import { describe, it, expect } from 'vitest';
import { calcularEnCampo, esOperacion, numeroEspanol, numeroParaCasilla } from './calculoEnCampo';

describe('números a la española', () => {
  it('la coma es el decimal', () => {
    expect(numeroEspanol('3,5')).toBe(3.5);
    expect(numeroEspanol('0,125')).toBe(0.125);
    expect(numeroEspanol(',5')).toBe(0.5);
  });

  it('el punto separa los miles cuando lo parece', () => {
    expect(numeroEspanol('1.200')).toBe(1200);
    expect(numeroEspanol('1.200,50')).toBe(1200.5);
    expect(numeroEspanol('12.000.000')).toBe(12000000);
  });

  it('si no lo parece, el punto es el decimal del teclado numérico', () => {
    expect(numeroEspanol('3.5')).toBe(3.5);
    expect(numeroEspanol('12.50')).toBe(12.5);
    expect(numeroEspanol('0.125')).toBe(0.125);
  });

  it('lo que no es un número no se adivina', () => {
    expect(numeroEspanol('1,2,3')).toBeNull();
    expect(numeroEspanol('1.2.3')).toBeNull();
    expect(numeroEspanol('12.34,5')).toBeNull();
    expect(numeroEspanol('abc')).toBeNull();
  });
});

describe('la calculadora de la casilla', () => {
  it('resuelve las cuentas de mostrador', () => {
    expect(calcularEnCampo('12*3,5')).toBe(42);
    expect(calcularEnCampo('24/2')).toBe(12);
    expect(calcularEnCampo('3x12')).toBe(36);
    expect(calcularEnCampo('3 × 12')).toBe(36);
    expect(calcularEnCampo('1.200,50+30')).toBe(1230.5);
    expect(calcularEnCampo('10:4')).toBe(2.5);
  });

  it('el signo igual delante es opcional', () => {
    expect(calcularEnCampo('=100-15%')).toBe(85);
    expect(calcularEnCampo('=7')).toBe(7);
  });

  it('el porcentaje es de lo que hay a la izquierda, como en una calculadora', () => {
    expect(calcularEnCampo('100-15%')).toBe(85);
    expect(calcularEnCampo('100+21%')).toBe(121);
    expect(calcularEnCampo('200*15%')).toBe(30);
    expect(calcularEnCampo('50/50%')).toBe(100);
    expect(calcularEnCampo('(80+20)-10%')).toBe(90);
  });

  it('un porcentaje solo es el número (la casilla del descuento)', () => {
    expect(calcularEnCampo('15%')).toBe(15);
    expect(calcularEnCampo('7,5 %')).toBe(7.5);
  });

  it('respeta la precedencia y los paréntesis', () => {
    expect(calcularEnCampo('2+3*4')).toBe(14);
    expect(calcularEnCampo('(2+3)*4')).toBe(20);
    expect(calcularEnCampo('10-4-3')).toBe(3);
    expect(calcularEnCampo('24/2/3')).toBe(4);
    expect(calcularEnCampo('2*(3+(4-1))')).toBe(12);
    expect(calcularEnCampo('-5+8')).toBe(3);
    expect(calcularEnCampo('2*-3')).toBe(-6);
  });

  it('quita el ruido de los decimales', () => {
    expect(calcularEnCampo('0,1+0,2')).toBe(0.3);
    expect(calcularEnCampo('10/3')).toBe(3.333333);
  });

  it('lo que no se entiende devuelve null y no rompe nada', () => {
    for (const malo of ['', '   ', '12*', '*3', '(2+3', '2+3)', '5/0', '10/(5-5)', '2++', 'abc', '3 y 4',
      '15%%', '1,2,3+4', 'alert(1)', 'process.exit()', '2**3', '()', '=', '%']) {
      expect(calcularEnCampo(malo), malo).toBeNull();
    }
    expect(calcularEnCampo('1+'.repeat(100) + '1')).toBeNull();
    expect(calcularEnCampo(undefined as unknown as string)).toBeNull();
  });
});

describe('cuándo enseñar la pista', () => {
  it('sólo con una cuenta, no con un número suelto', () => {
    expect(esOperacion('12*3,5')).toBe(true);
    expect(esOperacion('=12')).toBe(true);
    expect(esOperacion('100-15%')).toBe(true);
    expect(esOperacion('3x12')).toBe(true);
    expect(esOperacion('12,5')).toBe(false);
    expect(esOperacion('1.200')).toBe(false);
    expect(esOperacion('-5')).toBe(false);
    expect(esOperacion('')).toBe(false);
  });

  it('el número vuelve a la casilla con coma y sin puntos de miles', () => {
    expect(numeroParaCasilla(1230.5)).toBe('1230,5');
    expect(numeroParaCasilla(42)).toBe('42');
    expect(numeroParaCasilla(Number.NaN)).toBe('');
  });
});
