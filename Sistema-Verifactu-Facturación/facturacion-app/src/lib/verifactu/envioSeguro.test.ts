/**
 * REGRESIÓN DE LA AUDITORÍA · ENVÍO A LA AEAT
 *
 * Duplicados (3000) que no se dan por aceptados ni se reenvían en bucle,
 * subsanación de rechazos, un solo envío a la vez por cuenta, el tiempo de
 * espera de la AEAT y los registros atascados en «enviando».
 */
import { describe, expect, it, vi } from 'vitest';
import { estadoLocalDeLinea, parsearRespuestaAeat } from './respuestaAeat';
import { registroAltaXml, RECHAZO_PREVIO_TRAS_RECHAZO, type RegistroAlta, type SistemaInformatico } from './registroXml';

vi.mock('@/lib/plataforma/productor', () => ({ productorDePlataforma: vi.fn(async () => null) }));
vi.mock('@/lib/verifactu/certificateEncryption', () => ({ decryptCertificateBlob: vi.fn() }));
vi.mock('@/lib/verifactu/clienteAeat', () => ({ ENDPOINTS: {}, enviarSobreSoap: vi.fn() }));
import { enviarPendientes } from './enviarPendientes';

const DUPLICADO = `<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>
<tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="r" xmlns:tik="s">
 <tikR:TiempoEsperaEnvio>60</tikR:TiempoEsperaEnvio>
 <tikR:EstadoEnvio>Incorrecto</tikR:EstadoEnvio>
 <tikR:RespuestaLinea>
  <tikR:IDFactura><tik:IDEmisorFactura>B00000000</tik:IDEmisorFactura><tik:NumSerieFactura>F-2026-0001</tik:NumSerieFactura><tik:FechaExpedicionFactura>20-10-2026</tik:FechaExpedicionFactura></tikR:IDFactura>
  <tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion>
  <tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro>
  <tikR:CodigoErrorRegistro>3000</tikR:CodigoErrorRegistro>
  <tikR:DescripcionErrorRegistro>Registro de facturación duplicado.</tikR:DescripcionErrorRegistro>
  <tikR:RegistroDuplicado>
   <tik:IdPeticionRegistroDuplicado>202610201000001</tik:IdPeticionRegistroDuplicado>
   <tik:EstadoRegistroDuplicado>Correcta</tik:EstadoRegistroDuplicado>
  </tikR:RegistroDuplicado>
 </tikR:RespuestaLinea>
 <tikR:RespuestaLinea>
  <tikR:IDFactura><tik:IDEmisorFactura>B00000000</tik:IDEmisorFactura><tik:NumSerieFactura>F-2026-0002</tik:NumSerieFactura><tik:FechaExpedicionFactura>20-10-2026</tik:FechaExpedicionFactura></tikR:IDFactura>
  <tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion>
  <tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro>
  <tikR:CodigoErrorRegistro>1100</tikR:CodigoErrorRegistro>
  <tikR:DescripcionErrorRegistro>Valor o tipo incorrecto del campo.</tikR:DescripcionErrorRegistro>
 </tikR:RespuestaLinea>
</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`;

describe('duplicados (3000)', () => {
  const r = parsearRespuestaAeat(DUPLICADO);
  it('lee el bloque RegistroDuplicado del esquema', () => {
    expect(r.lineas[0].duplicado).toEqual({ idPeticion: '202610201000001', estado: 'Correcta' });
    expect(r.lineas[0].codigoError).toBe('3000');
    expect(r.tiempoEsperaEnvio).toBe(60);
  });
  it('un duplicado queda como «consta_en_aeat»: ni aceptado ni rechazado para reenviar', () => {
    expect(estadoLocalDeLinea(r.lineas[0])).toBe('consta_en_aeat');
  });
  it('un rechazo de verdad sigue siendo rechazo (no se confunde con el duplicado)', () => {
    expect(r.lineas[1].duplicado).toBeNull();
    expect(estadoLocalDeLinea(r.lineas[1])).toBe('rechazado');
  });
});

describe('subsanación de un alta rechazada', () => {
  const sistema = { nombreRazon: 'P', nif: 'B00000000', nombreSistemaInformatico: 'K', idSistemaInformatico: '01', version: '1', numeroInstalacion: '1', tipoUsoPosibleSoloVerifactu: 'S', tipoUsoPosibleMultiOT: 'S', indicadorMultiplesOT: 'S' } as SistemaInformatico;
  const alta: RegistroAlta = {
    idEmisorFactura: 'B00000000', numSerieFactura: 'F-2026-0001', fechaExpedicionFactura: '2026-10-20', nombreRazonEmisor: 'Empresa',
    tipoFactura: 'F1', descripcionOperacion: 'Venta', desglose: [], cuotaTotal: 7, importeTotal: 107,
    fechaHoraHusoGenRegistro: '2026-10-20T10:00:00+01:00', huella: 'A'.repeat(64),
  };
  it('sin subsanación no lleva los campos', () => {
    expect(registroAltaXml(alta, sistema)).not.toContain('Subsanacion');
  });
  it('con subsanación: Subsanacion=S y RechazoPrevio, en el orden del esquema', () => {
    const xml = registroAltaXml({ ...alta, subsanacion: true }, sistema);
    expect(xml).toContain(`<sf:NombreRazonEmisor>Empresa</sf:NombreRazonEmisor><sf:Subsanacion>S</sf:Subsanacion><sf:RechazoPrevio>${RECHAZO_PREVIO_TRAS_RECHAZO}</sf:RechazoPrevio><sf:TipoFactura>`);
  });
});

/** Una base de datos falsa que apunta qué se pidió. */
function dbFalsa(opts: { reservaLibre: boolean; siguiente?: string | null }) {
  const llamadas: Array<{ tabla: string; op: string; datos?: unknown; filtros: string[] }> = [];
  const tabla = (nombre: string) => {
    const c = { op: 'select', datos: undefined as unknown, filtros: [] as string[] };
    const q: Record<string, unknown> = {};
    const fin = () => {
      llamadas.push({ tabla: nombre, op: c.op, datos: c.datos, filtros: c.filtros });
      if (nombre === 'verifactu_config' && c.op === 'update' && c.filtros.some(f => f.startsWith('or:'))) {
        return { data: opts.reservaLibre ? [{ user_id: 'u1', siguiente_envio_en: opts.siguiente ?? null }] : [], error: null };
      }
      if (nombre === 'verifactu_config' && c.op === 'select') return { data: { activo: true, entorno: 'pruebas' }, error: null };
      return { data: null, error: null, count: 0 };
    };
    Object.assign(q, {
      select: (cols: string) => { if (c.op !== 'update') c.op = 'select'; c.filtros.push(`select:${cols}`); return q; },
      update: (d: unknown) => { c.op = 'update'; c.datos = d; return q; },
      eq: (k: string, v: unknown) => { c.filtros.push(`eq:${k}=${v}`); return q; },
      in: () => q, or: (f: string) => { c.filtros.push(`or:${f}`); return q; }, order: () => q, limit: () => q,
      maybeSingle: async () => fin(),
      then: (res: (v: unknown) => unknown) => res(fin()),
    });
    return q;
  };
  return { db: { from: tabla } as never, llamadas };
}

describe('un envío a la vez, tiempo de espera y atascos', () => {
  it('si otra petición ya tiene la reserva, no envía nada (409)', async () => {
    const { db, llamadas } = dbFalsa({ reservaLibre: false });
    const r = await enviarPendientes(db, 'u1');
    expect(r.estado).toBe(409);
    expect(llamadas.some(l => l.tabla === 'verifactu_registros' && l.op === 'update')).toBe(false);
  });

  it('respeta el TiempoEsperaEnvio de la AEAT (429) y suelta la reserva', async () => {
    const { db, llamadas } = dbFalsa({ reservaLibre: true, siguiente: new Date(Date.now() + 30_000).toISOString() });
    const r = await enviarPendientes(db, 'u1');
    expect(r.estado).toBe(429);
    expect(llamadas.some(l => l.tabla === 'verifactu_registros' && l.op === 'update')).toBe(false);
    const ultima = llamadas.filter(l => l.tabla === 'verifactu_config' && l.op === 'update').at(-1);
    expect(ultima?.datos).toEqual({ envio_bloqueado_hasta: null });
  });

  it('con la reserva, lo atascado en «enviando» vuelve a pendiente; y la reserva se suelta siempre', async () => {
    const { db, llamadas } = dbFalsa({ reservaLibre: true });
    await enviarPendientes(db, 'u1');
    const atascos = llamadas.find(l => l.tabla === 'verifactu_registros' && l.op === 'update');
    expect(atascos?.filtros).toContain('eq:estado=enviando');
    expect((atascos?.datos as { estado: string }).estado).toBe('pendiente');
    const ultima = llamadas.filter(l => l.tabla === 'verifactu_config' && l.op === 'update').at(-1);
    expect(ultima?.datos).toEqual({ envio_bloqueado_hasta: null });
  });
});
