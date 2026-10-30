/**
 * LA CALCULADORA DE LAS CASILLAS DE NÚMEROS
 *
 * Quien hace un albarán lleva la cuenta en la cabeza o en el móvil: doce
 * cajas a tres cincuenta, la mitad de veinticuatro, cien menos el quince.
 * Aquí se escribe la cuenta tal cual en la casilla (`12*3,5`, `24/2`,
 * `=100-15%`, `3x12`, `1.200,50+30`) y al salir de ella queda el resultado.
 *
 * Se analiza a mano, con un analizador pequeño de descenso recursivo, y
 * nunca con `eval` ni `Function`: lo que se teclea en una casilla no se
 * ejecuta jamás. Lo que no se entiende devuelve `null` y la casilla se
 * queda con el texto como estaba, para que se corrija sin perder nada.
 *
 * LOS NÚMEROS, A LA ESPAÑOLA
 * --------------------------
 *   · La coma es la de los decimales: `3,5` son tres y medio.
 *   · El punto separa los miles cuando lo parece: `1.200` son mil
 *     doscientos y `1.200,50` también lleva sus céntimos. Si no lo parece
 *     —`3.5`, `0.125`, `12.50`— es el decimal de siempre, el que pone el
 *     teclado numérico del ordenador.
 *
 * EL TANTO POR CIENTO
 * -------------------
 * Como en las calculadoras de mostrador: `100-15%` son 85 y `100+21%` son
 * 121 (el porcentaje es de lo que hay a la izquierda); `200*15%` son 30. Un
 * porcentaje solo, `15%`, es el número: en la casilla del descuento se
 * escribe así sin pensarlo.
 */

type Token =
  | { tipo: 'numero'; valor: number }
  | { tipo: 'op'; valor: '+' | '-' | '*' | '/' }
  | { tipo: 'pct' }
  | { tipo: 'abre' }
  | { tipo: 'cierra' };

/** Lo más largo que se acepta: una casilla no es una hoja de cálculo. */
const LARGO_MAXIMO = 120;

/** Un número tecleado a la española, o `null` si no lo es. */
export function numeroEspanol(texto: string): number | null {
  const t = texto.trim();
  if (!/^\d[\d.,]*$|^[.,]\d+$/.test(t)) return null;
  let limpio: string;
  if (t.includes(',')) {
    // Con coma: la coma es el decimal y los puntos, los miles.
    if ((t.match(/,/g) ?? []).length > 1) return null;
    const [entera, decimales] = t.split(',');
    if (entera.includes('.') && !/^\d{1,3}(\.\d{3})+$/.test(entera)) return null;
    if (decimales.includes('.')) return null;
    limpio = `${entera.replace(/\./g, '') || '0'}.${decimales}`;
  } else if (/^[1-9]\d{0,2}(\.\d{3})+$/.test(t)) {
    // 1.200 o 12.000.000: miles.
    limpio = t.replace(/\./g, '');
  } else {
    // 3.5, 0.125: el decimal del teclado numérico.
    if ((t.match(/\./g) ?? []).length > 1) return null;
    limpio = t.startsWith('.') ? `0${t}` : t;
  }
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function trocear(texto: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[\d.,]/.test(c)) {
      let j = i;
      while (j < texto.length && /[\d.,]/.test(texto[j])) j++;
      const valor = numeroEspanol(texto.slice(i, j));
      if (valor === null) return null;
      tokens.push({ tipo: 'numero', valor });
      i = j;
      continue;
    }
    if (c === '+' || c === '-') tokens.push({ tipo: 'op', valor: c });
    else if (c === '*' || c === 'x' || c === 'X' || c === '×' || c === '·') tokens.push({ tipo: 'op', valor: '*' });
    else if (c === '/' || c === '÷' || c === ':') tokens.push({ tipo: 'op', valor: '/' });
    else if (c === '%') tokens.push({ tipo: 'pct' });
    else if (c === '(') tokens.push({ tipo: 'abre' });
    else if (c === ')') tokens.push({ tipo: 'cierra' });
    else if (c === '−') tokens.push({ tipo: 'op', valor: '-' });
    else return null;
    i++;
  }
  return tokens;
}

/** Un valor intermedio: el número y si llevaba el signo de porcentaje. */
interface Valor { n: number; pct: boolean }

class Analizador {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private mira(): Token | undefined { return this.tokens[this.pos]; }

  analizar(): number | null {
    const v = this.suma();
    if (!v || this.pos !== this.tokens.length) return null;
    return v.n;
  }

  // suma := producto (('+' | '-') producto)*
  private suma(): Valor | null {
    let izq = this.producto();
    if (!izq) return null;
    for (;;) {
      const t = this.mira();
      if (t?.tipo !== 'op' || (t.valor !== '+' && t.valor !== '-')) return izq;
      this.pos++;
      const der = this.producto();
      if (!der) return null;
      // 100 - 15 % : el quince por ciento de lo que hay a la izquierda.
      const cuanto: number = der.pct ? izq.n * der.n / 100 : der.n;
      izq = { n: t.valor === '+' ? izq.n + cuanto : izq.n - cuanto, pct: false };
    }
  }

  // producto := unario (('*' | '/') unario)*
  private producto(): Valor | null {
    let izq = this.unario();
    if (!izq) return null;
    for (;;) {
      const t = this.mira();
      if (t?.tipo !== 'op' || (t.valor !== '*' && t.valor !== '/')) return izq;
      this.pos++;
      const der = this.unario();
      if (!der) return null;
      const a: number = izq.pct ? izq.n / 100 : izq.n;
      const b: number = der.pct ? der.n / 100 : der.n;
      if (t.valor === '/' && b === 0) return null;
      izq = { n: t.valor === '*' ? a * b : a / b, pct: false };
    }
  }

  // unario := ('-' | '+') unario | porcentaje
  private unario(): Valor | null {
    const t = this.mira();
    if (t?.tipo === 'op' && (t.valor === '-' || t.valor === '+')) {
      this.pos++;
      const v = this.unario();
      if (!v) return null;
      return t.valor === '-' ? { n: -v.n, pct: v.pct } : v;
    }
    return this.porcentaje();
  }

  // porcentaje := primario '%'?
  private porcentaje(): Valor | null {
    const v = this.primario();
    if (!v) return null;
    if (this.mira()?.tipo === 'pct') {
      if (v.pct) return null; // 15%% no es nada
      this.pos++;
      return { n: v.n, pct: true };
    }
    return v;
  }

  // primario := numero | '(' suma ')'
  private primario(): Valor | null {
    const t = this.mira();
    if (!t) return null;
    if (t.tipo === 'numero') {
      this.pos++;
      return { n: t.valor, pct: false };
    }
    if (t.tipo === 'abre') {
      this.pos++;
      const dentro = this.suma();
      if (!dentro || this.mira()?.tipo !== 'cierra') return null;
      this.pos++;
      return dentro;
    }
    return null;
  }
}

/**
 * El resultado de lo escrito en la casilla, o `null` si no se entiende.
 * Se redondea a seis decimales para que `0,1+0,2` no dé 0,30000000000000004.
 */
export function calcularEnCampo(texto: string): number | null {
  if (typeof texto !== 'string') return null;
  let t = texto.trim();
  if (!t || t.length > LARGO_MAXIMO) return null;
  if (t.startsWith('=')) t = t.slice(1);
  const tokens = trocear(t);
  if (!tokens || tokens.length === 0) return null;
  const n = new Analizador(tokens).analizar();
  if (n === null || !Number.isFinite(n)) return null;
  const redondo = Math.round(n * 1e6) / 1e6;
  return Object.is(redondo, -0) ? 0 : redondo;
}

/**
 * ¿Lo escrito es una cuenta y no un número suelto? Es lo que decide si se
 * enseña la pista con el resultado mientras se escribe: con `12,5` no hay
 * nada que enseñar; con `12*3,5`, sí.
 */
export function esOperacion(texto: string): boolean {
  const t = (texto ?? '').trim();
  if (!t) return false;
  if (t.startsWith('=')) return true;
  // Un signo menos delante de un número es un número negativo, no una cuenta.
  return /[+*/x×÷:%()·−]|\d\s*-/i.test(t.replace(/^[-+]/, ''));
}

/** Un número como se lee en España, sin separador de miles para que se pueda volver a editar. */
export function numeroParaCasilla(n: number, maxDecimales = 6): string {
  if (!Number.isFinite(n)) return '';
  return n.toLocaleString('es-ES', { maximumFractionDigits: maxDecimales, useGrouping: false });
}
