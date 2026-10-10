/** Lo que devuelven las rutas `/api/banco*` al navegador. */

export interface SaldoVista { importe: number; fecha: string | null; tipo: string }

export interface CuentaVista { uid: string; iban: string | null; nombre: string | null; saldo: SaldoVista | null }

export interface ConexionVista {
  id: string;
  banco: string;
  cuentas: CuentaVista[];
  validoHasta: string | null;
  diasParaCaducar: number | null;
  ultimaLectura: string | null;
  caducada: boolean;
  ultimoError: string | null;
}

export interface EstadoBanco {
  disponible: boolean;
  conexiones: ConexionVista[];
  sinConciliar: number;
}

export interface MovimientoVista {
  id: string;
  cuenta: string;
  iban: string | null;
  fecha: string;
  importe: number;
  concepto: string;
  referencia?: string;
  saldo?: number;
  ignorado: boolean;
  conciliado: string | null;
}
