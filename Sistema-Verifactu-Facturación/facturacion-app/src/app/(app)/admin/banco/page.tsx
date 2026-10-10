import { headers } from 'next/headers';
import { exigirAdminCon2fa } from '@/lib/admin/dal';
import { comprobarConfiguracion } from '@/lib/banco/configuracion';
import { supabaseServicio } from '@/lib/supabase/servicio';
import { CheckCircle2, Landmark, XCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

async function cifras() {
  try {
    const db = supabaseServicio();
    const [con, mov] = await Promise.all([
      db.from('bancos_conectados').select('user_id, estado, valido_hasta'),
      db.from('banco_movimientos').select('id', { count: 'exact', head: true }),
    ]);
    const filas = (con.data ?? []) as { user_id: string; estado?: string | null; valido_hasta: string | null }[];
    const ahora = Date.now();
    const activas = filas.filter(f => f.estado !== 'caducada' && (!f.valido_hasta || new Date(f.valido_hasta).getTime() > ahora));
    return {
      conexiones: filas.length,
      activas: activas.length,
      empresas: new Set(filas.map(f => f.user_id)).size,
      movimientos: mov.count ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * CONEXIÓN CON LOS BANCOS
 *
 * Lo que hay que configurar una vez para que todas las empresas puedan
 * conectar su banco, comprobado contra Enable Banking de verdad.
 */
export default async function AdminBanco() {
  await exigirAdminCon2fa();
  const h = await headers();
  const host = h.get('x-forwarded-host') || h.get('host') || 'localhost:3000';
  const proto = h.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https');
  const origen = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '') || `${proto}://${host}`;
  const [estado, datos] = await Promise.all([comprobarConfiguracion(origen), cifras()]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>
          <Landmark size={14} />
          <span>Open banking (PSD2)</span>
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.03em', margin: 0 }}>Conexión con los bancos</h1>
        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-secondary)', fontSize: '0.9375rem', maxWidth: 720 }}>
          Se configura una vez para toda la plataforma. Cuando todo esté en verde, cada empresa podrá conectar sus
          bancos desde «Banco» y sus movimientos llegarán solos cada día.
        </p>
      </div>

      <div className={`apple-card admin-banco-estado ${estado.listo ? 'is-listo' : 'is-pendiente'}`}>
        {estado.listo ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
        <div>
          <strong>{estado.listo ? 'Listo: las empresas ya pueden conectar sus bancos' : 'Falta configurar la conexión con los bancos'}</strong>
          <p>{estado.listo
            ? (estado.entorno && /sandbox/i.test(estado.entorno) ? 'En modo de pruebas: sólo salen bancos de mentira.' : 'En producción, con bancos reales.')
            : 'Mientras tanto, las empresas no ven el botón de conectar el banco (pueden seguir subiendo el extracto a mano).'}</p>
        </div>
      </div>

      <div className="apple-card" style={{ padding: 0 }}>
        <div style={{ padding: '0.875rem 1rem', fontWeight: 600 }}>Comprobaciones</div>
        <ul className="admin-banco-lista">
          {estado.comprobaciones.map(c => (
            <li key={c.id} className={c.ok ? 'is-ok' : 'is-mal'}>
              {c.ok ? <CheckCircle2 size={16} aria-label="Bien" /> : <XCircle size={16} aria-label="Falta" />}
              <div>
                <strong>{c.titulo}</strong>
                <p>{c.detalle}</p>
                {c.arreglo && <p className="admin-banco-arreglo">{c.arreglo}</p>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="apple-card">
        <h2 style={{ fontSize: '1.0625rem', margin: '0 0 0.5rem' }}>Cómo se configura (una sola vez)</h2>
        <ol className="admin-banco-pasos">
          <li>Crea una cuenta en <strong>enablebanking.com</strong> y entra en el panel de control.</li>
          <li>
            Crea una aplicación. Empieza en <strong>Sandbox</strong> para probar con bancos de mentira; cuando funcione,
            crea otra de <strong>Production</strong> (Enable Banking pide firmar su contrato para bancos reales).
          </li>
          <li>Al crearla, descarga la <strong>clave privada</strong> (.pem). Guárdala: no se vuelve a mostrar.</li>
          <li>
            En «Allowed redirect URLs» de la aplicación, añade exactamente:
            <code className="admin-banco-codigo">{estado.urlVuelta}</code>
          </li>
          <li>
            En las variables de entorno de producción (el <code className="admin-banco-codigo">.env</code> de la app en el
            servidor), añade <code className="admin-banco-codigo">ENABLE_BANKING_APP_ID</code> con el «Application ID» y
            <code className="admin-banco-codigo">ENABLE_BANKING_PRIVATE_KEY</code> con el contenido entero del .pem
            (vale en una sola línea).
          </li>
          <li>
            Programa la lectura diaria en el crontab del servidor (en Vercel la hace solo <code className="admin-banco-codigo">vercel.json</code>):
            <code className="admin-banco-codigo">{`40 6 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" ${estado.urlVuelta.replace(/\/api\/banco\/vuelta$/, '')}/api/cron/banco`}</code>
          </li>
          <li>Reinicia la aplicación y recarga esta página: todo debería salir en verde.</li>
        </ol>
      </div>

      {datos && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '1rem' }}>
          {[
            ['Empresas con banco', datos.empresas],
            ['Conexiones activas', datos.activas],
            ['Conexiones en total', datos.conexiones],
            ['Movimientos guardados', datos.movimientos],
          ].map(([t, v]) => (
            <div key={t as string} className="apple-card">
              <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>{t}</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{(v as number).toLocaleString('es-ES')}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
