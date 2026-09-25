'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Building2, Check, Loader2 } from 'lucide-react';
import {
  avisoNombreProductor, erroresDelProductor, type ErroresProductor, type ProductorFormulario,
} from '@/lib/plataforma/validarProductor';

/** Cuánto se espera tras la última tecla para guardar. */
const ESPERA_MS = 900;

type Estado = { tipo: 'quieto' } | { tipo: 'guardando' } | { tipo: 'guardado'; en: string } | { tipo: 'error'; mensaje: string };

/**
 * PRODUCTOR DEL SOFTWARE — SE GUARDA SOLO
 *
 * Lo que se escribe aquí va en el bloque SistemaInformatico de cada
 * registro Veri*Factu de TODAS las cuentas y en la declaración responsable
 * pública. Los clientes lo ven en su pantalla de Veri*Factu ya puesto.
 */
export default function TarjetaProductor({ inicial }: { inicial: ProductorFormulario }) {
  const [productor, setProductor] = useState(inicial);
  const [estado, setEstado] = useState<Estado>({ tipo: 'quieto' });
  const [errores, setErrores] = useState<ErroresProductor>({});
  const cambiado = useRef(false);
  const ultimoEnviado = useRef(JSON.stringify(inicial));

  useEffect(() => {
    if (!cambiado.current) return;
    const locales = erroresDelProductor(productor);
    // Lo que está mal no se manda: se avisa en el campo y se espera a que se corrija.
    if (Object.keys(locales).length) { queueMicrotask(() => { setErrores(locales); setEstado({ tipo: 'quieto' }); }); return; }
    const json = JSON.stringify(productor);
    if (json === ultimoEnviado.current) return;
    const t = setTimeout(async () => {
      setErrores({});
      setEstado({ tipo: 'guardando' });
      try {
        const r = await fetch('/api/admin/productor', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productor }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          if (d.errores) setErrores(d.errores);
          setEstado({ tipo: 'error', mensaje: d.error || 'No se ha podido guardar.' });
          return;
        }
        ultimoEnviado.current = json;
        setEstado({ tipo: 'guardado', en: new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) });
      } catch {
        setEstado({ tipo: 'error', mensaje: 'Sin conexión: no se ha guardado. Se reintentará al volver a escribir.' });
      }
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [productor]);

  const cambiar = (k: keyof ProductorFormulario, v: string) => {
    cambiado.current = true;
    setProductor(p => ({ ...p, [k]: k === 'nif' || k === 'sistema_id' ? v.toUpperCase() : v }));
  };

  const avisoNombre = avisoNombreProductor(productor);

  const campo = (k: keyof ProductorFormulario, etiqueta: string, ayuda?: string, tipo = 'text', extra?: React.ReactNode) => (
    <div>
      <label className="form-label" htmlFor={`prod-${k}`} style={{ fontWeight: 600 }}>{etiqueta}</label>
      <input
        id={`prod-${k}`} type={tipo} className="form-input" value={productor[k]}
        aria-invalid={errores[k] ? true : undefined}
        onChange={e => cambiar(k, e.target.value)}
      />
      {errores[k] && <p role="alert" style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--color-danger)', fontWeight: 600 }}>{errores[k]}</p>}
      {extra}
      {ayuda && <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{ayuda}</p>}
    </div>
  );

  return (
    <div className="apple-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--accent-glow)', color: 'var(--accent-500)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Building2 size={18} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 650 }}>Productor del software y declaración responsable</h3>
          <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Tú, como fabricante. Van en cada registro Veri*Factu de todas las cuentas (a tus clientes les sale ya puesto)
            y en la <a href="/legal/declaracion-responsable" target="_blank" rel="noreferrer">declaración responsable</a> pública.
            Se guarda solo al escribir.
          </p>
        </div>
        <span role="status" aria-live="polite" style={{ fontSize: '0.8rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6,
          color: estado.tipo === 'error' ? 'var(--color-danger)' : estado.tipo === 'guardado' ? 'var(--color-success)' : 'var(--text-muted)' }}>
          {estado.tipo === 'guardando' && <><Loader2 size={14} className="spin" /> Guardando…</>}
          {estado.tipo === 'guardado' && <><Check size={14} /> Guardado a las {estado.en}</>}
          {estado.tipo === 'error' && <><AlertTriangle size={14} /> {estado.mensaje}</>}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: '1rem' }}>
        {campo('nombre', 'Nombre o razón social', 'Exactamente como figura en Hacienda. Si eres autónomo: APELLIDO1 APELLIDO2 NOMBRE.', 'text',
          avisoNombre && <p style={{ margin: '0.3rem 0 0', fontSize: '0.78rem', color: 'var(--color-warning)', fontWeight: 600 }}>{avisoNombre}</p>)}
        {campo('nif', 'NIF')}
        {campo('domicilio', 'Domicilio de contacto', 'Dirección postal completa: la pide la declaración.')}
        {campo('email', 'Correo de contacto', undefined, 'email')}
        {campo('sistema_nombre', 'Nombre del programa', 'Hasta 30 caracteres; es el que ve la AEAT.')}
        {campo('sistema_id', 'Código del programa', 'Dos letras o cifras que lo identifican (p. ej. FK).')}
        {campo('sistema_version', 'Versión')}
        {campo('lugar', 'Lugar de firma de la declaración')}
        {campo('fecha', 'Fecha de firma', 'Vacía mientras no la hayas firmado: la página pública sale como borrador.', 'date')}
        {campo('soporte_email', 'Correo para avisos de soporte', 'Aquí llega un aviso cuando alguien escribe al chat (con el correo de Resend configurado).', 'email')}
      </div>
    </div>
  );
}
