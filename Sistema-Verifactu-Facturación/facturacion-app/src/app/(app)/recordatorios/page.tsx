'use client';

/**
 * RECORDATORIOS DE COBRO
 *
 * Los clientes con facturas vencidas, con el recordatorio ya escrito (uno
 * por cliente, con todas sus facturas) y la forma de mandarlo: correo desde
 * el programa, el correo propio o WhatsApp. Si el servidor tiene el correo
 * configurado, además se pueden enviar solos cada mañana.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BellRing, Mail, MessageCircle, Copy, ChevronDown, ChevronUp, CheckCircle2, Clock, Send, Settings2,
} from 'lucide-react';
import PageSkeleton from '@/components/ui/PageSkeleton';
import { useToast } from '@/hooks/useToast';
import { getClients, getCompanySettings, getInvoices } from '@/lib/storage';
import type { Client } from '@/lib/types';
import { formatCurrency } from '@/lib/utils';
import {
  EMAIL_VALIDO, diasEntre, mensaje, porCliente, telefonoWhatsApp, tonoDe, vencidas, type Deudor, type Remitente,
} from '@/lib/recordatorios/textos';
import type { AjustesRecordatorios } from '@/lib/recordatorios/filas';
import {
  anotar, enviarPorCorreo, estadoServidor, guardarAjustes, leerAjustes, leerRegistro, type Envio,
} from '@/lib/recordatorios/registro';

const fecha = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/');
const TONO = {
  amable: { texto: 'Primer aviso', clase: 'badge-info' },
  recordatorio: { texto: 'Recordatorio', clase: 'badge-warning' },
  firme: { texto: 'Segundo aviso', clase: 'badge-danger' },
} as const;
const CANAL: Record<Envio['canal'], string> = { email: 'por correo', whatsapp: 'por WhatsApp', manual: 'a mano', automatico: 'automático' };

export default function RecordatoriosPage() {
  const { success, error: toastError } = useToast();
  const hoy = new Date().toISOString().slice(0, 10);

  const [deudores, setDeudores] = useState<Deudor[] | null>(null);
  const [clientes, setClientes] = useState<Map<string, Client>>(new Map());
  const [de, setDe] = useState<Remitente>({ nombre: '' });
  const [envios, setEnvios] = useState<Envio[]>([]);
  const [enTabla, setEnTabla] = useState(true);
  const [servidor, setServidor] = useState({ correo: false, automatico: false });
  const [ajustes, setAjustes] = useState<AjustesRecordatorios | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [textos, setTextos] = useState<Record<string, { asunto: string; texto: string }>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [facturas, lista, empresa, registro, srv, aj] = await Promise.all([
      getInvoices(), getClients(), getCompanySettings(),
      leerRegistro().catch(() => ({ envios: [] as Envio[], enTabla: false })),
      estadoServidor(), leerAjustes().catch(() => null),
    ]);
    setClientes(new Map(lista.map(c => [c.id, c])));
    setDe({ nombre: empresa.tradeName || empresa.businessName || '', email: empresa.email, telefono: empresa.phone, iban: empresa.iban });
    setEnvios(registro.envios);
    setEnTabla(registro.enTabla);
    setServidor(srv);
    setAjustes(aj);
    setDeudores(porCliente(vencidas(facturas, new Date().toISOString().slice(0, 10))));
  }, []);

  useEffect(() => {
    let vivo = true;
    (async () => { if (vivo) await cargar(); })();
    return () => { vivo = false; };
  }, [cargar]);

  const ultimoDe = useMemo(() => {
    const m = new Map<string, Envio>();
    for (const e of envios) {
      const k = e.clienteId || e.clienteNombre;
      if (!m.has(k)) m.set(k, e);
    }
    return m;
  }, [envios]);

  const textoDe = (d: Deudor) => textos[d.clienteId || d.cliente] ?? mensaje(d, de);
  const clave = (d: Deudor) => d.clienteId || d.cliente;

  const registrar = async (d: Deudor, canal: Envio['canal'], destinatario?: string) => {
    const t = textoDe(d);
    await anotar({
      clienteId: d.clienteId, clienteNombre: d.cliente, canal, asunto: t.asunto, importe: d.total,
      facturaIds: d.facturas.map(v => v.factura.id), destinatario,
    }, enTabla);
    const r = await leerRegistro().catch(() => null);
    if (r) setEnvios(r.envios);
  };

  const porCorreo = async (d: Deudor, email: string) => {
    const t = textoDe(d);
    setOcupado(clave(d));
    try {
      const r = await enviarPorCorreo({ clienteId: d.clienteId, para: email, asunto: t.asunto, texto: t.texto, facturaIds: d.facturas.map(v => v.factura.id), importe: d.total });
      if (!r.anotado) await registrar(d, 'email', email); // sin tabla: se anota en el navegador
      else setEnvios((await leerRegistro()).envios);
      success('Recordatorio enviado', `${d.cliente} · ${email}`);
    } catch (err) {
      toastError('No se ha podido enviar', err instanceof Error ? err.message : '');
    } finally {
      setOcupado(null);
    }
  };

  const conMiCorreo = async (d: Deudor, email: string) => {
    const t = textoDe(d);
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(t.asunto)}&body=${encodeURIComponent(t.texto)}`;
    await registrar(d, 'manual', email).catch(() => {});
  };

  const porWhatsApp = async (d: Deudor, tel: string) => {
    const t = textoDe(d);
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(t.texto)}`, '_blank', 'noopener');
    await registrar(d, 'whatsapp', tel).catch(() => {});
  };

  const copiar = async (d: Deudor) => {
    const t = textoDe(d);
    try {
      await navigator.clipboard.writeText(`${t.asunto}\n\n${t.texto}`);
      success('Texto copiado');
    } catch {
      toastError('No se ha podido copiar', 'Ábrelo con «Ver el texto» y cópialo a mano.');
    }
  };

  const cambiarAjustes = async (a: AjustesRecordatorios) => {
    setAjustes(a);
    try {
      await guardarAjustes(a);
      success(a.a ? 'Envío automático activado' : 'Ajustes guardados');
    } catch (err) {
      toastError('No se han podido guardar', err instanceof Error ? err.message : '');
    }
  };

  if (!deudores) return <PageSkeleton label="Buscando facturas vencidas" />;

  const total = deudores.reduce((t, d) => t + d.total, 0);
  const masAntigua = deudores.reduce((m, d) => Math.max(m, d.maxRetraso), 0);
  const estaSemana = envios.filter(e => diasEntre(e.enviadoEn.slice(0, 10), hoy) <= 7).length;

  return (
    <div className="page recor">
      <div className="page-header">
        <div className="page-header-left">
          <p className="page-eyebrow"><BellRing /> Tesorería</p>
          <h1 className="page-title">Recordatorios de cobro</h1>
          <p className="page-subtitle">
            Quién te debe facturas ya vencidas, con el recordatorio escrito: uno por cliente, con todas sus facturas,
            y más directo cuanto más retraso lleva.
          </p>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="card"><div className="card-subtitle">Vencido sin cobrar</div><div className="page-meta-value">{formatCurrency(total)}</div></div>
        <div className="card"><div className="card-subtitle">Clientes</div><div className="page-meta-value">{deudores.length}</div></div>
        <div className="card"><div className="card-subtitle">La más antigua</div><div className="page-meta-value">{masAntigua ? `${masAntigua} días` : '—'}</div></div>
        <div className="card"><div className="card-subtitle">Recordados esta semana</div><div className="page-meta-value">{estaSemana}</div></div>
      </div>

      <section className="card recor-auto">
        <div className="recor-auto-cabeza">
          <Settings2 size={18} />
          <div>
            <strong>Envío automático</strong>
            <p>
              {servidor.automatico && enTabla
                ? 'Cada mañana se manda el recordatorio a los clientes a los que les toca, por correo. Sólo a los que tienen correo en su ficha.'
                : 'Cada mañana, el recordatorio a quien le toque, sin hacer nada.'}
            </p>
          </div>
        </div>
        {servidor.automatico && enTabla && ajustes ? (
          <div className="recor-auto-campos">
            <label className="recor-interruptor">
              <input type="checkbox" checked={ajustes.a} onChange={e => cambiarAjustes({ ...ajustes, a: e.target.checked })} />
              {ajustes.a ? 'Activado' : 'Desactivado'}
            </label>
            <label className="lf-ejercicio">
              El primero, a los
              <select value={ajustes.p} onChange={e => cambiarAjustes({ ...ajustes, p: Number(e.target.value) })}>
                {[1, 3, 7, 15].map(n => <option key={n} value={n}>{n} {n === 1 ? 'día' : 'días'}</option>)}
              </select>
              de vencer
            </label>
            <label className="lf-ejercicio">
              Luego, cada
              <select value={ajustes.c} onChange={e => cambiarAjustes({ ...ajustes, c: Number(e.target.value) })}>
                {[7, 10, 15, 30].map(n => <option key={n} value={n}>{n} días</option>)}
              </select>
            </label>
          </div>
        ) : (
          <p className="recor-nota">
            {!servidor.correo
              ? <>Falta configurar el correo del servidor (<span className="mono">RESEND_API_KEY</span> y <span className="mono">RECORDATORIOS_REMITENTE</span> en Vercel). Mientras tanto, los recordatorios se mandan desde tu correo o por WhatsApp con un clic.</>
              : !servidor.automatico
                ? <>Para el envío diario falta <span className="mono">CRON_SECRET</span> o <span className="mono">SUPABASE_SERVICE_ROLE_KEY</span> en Vercel.</>
                : <>Falta aplicar la migración <span className="mono">051_recordatorios_cobro</span> en la base de datos: es donde se anota qué se ha enviado para no repetirlo.</>}
          </p>
        )}
      </section>

      {deudores.length === 0 ? (
        <div className="card banco-vacio">
          <CheckCircle2 size={22} />
          <p>Nadie te debe facturas vencidas. Cuando alguna pase su fecha de vencimiento sin cobrarse, saldrá aquí.</p>
        </div>
      ) : (
        <div className="recor-lista">
          {deudores.map(d => {
            const k = clave(d);
            const ficha = clientes.get(d.clienteId);
            const email = ficha?.email && EMAIL_VALIDO.test(ficha.email.trim()) ? ficha.email.trim() : null;
            const tel = telefonoWhatsApp(ficha?.phone);
            const ultimo = ultimoDe.get(k);
            const tono = TONO[tonoDe(d.maxRetraso)];
            const t = textoDe(d);
            return (
              <div key={k} className="card recor-deudor">
                <div className="recor-deudor-cabeza">
                  <div>
                    <strong>{d.cliente}</strong>
                    <span className={`badge ${tono.clase}`}>{tono.texto}</span>
                  </div>
                  <span className="mono recor-total">{formatCurrency(d.total)}</span>
                </div>
                <ul className="recor-facturas">
                  {d.facturas.map(v => (
                    <li key={v.factura.id}>
                      <Link href={`/facturas/${v.factura.id}`} className="mono">{v.factura.number}</Link>
                      <span>venció el {fecha(v.factura.dueDate)} · <strong>{v.diasRetraso} {v.diasRetraso === 1 ? 'día' : 'días'}</strong></span>
                      <span className="mono">{formatCurrency(v.pendiente)}</span>
                    </li>
                  ))}
                </ul>
                <p className="recor-ultimo">
                  <Clock size={13} />
                  {ultimo
                    ? `Último recordatorio el ${fecha(ultimo.enviadoEn)} (${CANAL[ultimo.canal]})`
                    : 'Todavía no se le ha recordado'}
                  {!email && !tel ? ' · sin correo ni teléfono en su ficha' : ''}
                </p>
                <div className="banco-acciones">
                  {email && servidor.correo && (
                    <button type="button" className="btn btn-primary btn-sm" disabled={ocupado === k} onClick={() => porCorreo(d, email)}>
                      <Send size={14} /> Enviar por correo
                    </button>
                  )}
                  {email && (
                    <button type="button" className={`btn btn-sm ${servidor.correo ? 'btn-ghost' : 'btn-primary'}`} onClick={() => conMiCorreo(d, email)}>
                      <Mail size={14} /> {servidor.correo ? 'Desde mi correo' : 'Abrir en el correo'}
                    </button>
                  )}
                  {tel && (
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => porWhatsApp(d, tel)}>
                      <MessageCircle size={14} /> WhatsApp
                    </button>
                  )}
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copiar(d)}><Copy size={14} /> Copiar</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbierto(abierto === k ? null : k)} aria-expanded={abierto === k}>
                    {abierto === k ? <ChevronUp size={14} /> : <ChevronDown size={14} />} {abierto === k ? 'Ocultar el texto' : 'Ver el texto'}
                  </button>
                  {!email && !tel && d.clienteId && (
                    <Link href={`/clientes/${d.clienteId}`} className="btn btn-ghost btn-sm">Completar la ficha</Link>
                  )}
                </div>
                {abierto === k && (
                  <div className="recor-texto">
                    <label className="form-label" htmlFor={`asunto-${k}`}>Asunto</label>
                    <input id={`asunto-${k}`} className="form-input" value={t.asunto}
                      onChange={e => setTextos({ ...textos, [k]: { ...t, asunto: e.target.value } })} />
                    <label className="form-label" htmlFor={`texto-${k}`}>Mensaje</label>
                    <textarea id={`texto-${k}`} className="form-input" rows={14} value={t.texto}
                      onChange={e => setTextos({ ...textos, [k]: { ...t, texto: e.target.value } })} />
                    <p className="form-hint">Los cambios valen para este envío. Para el automático se usa siempre el texto de base.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
