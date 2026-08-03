/**
 * Esqueletos de carga con la silueta de cada pantalla.
 *
 * Antes cada página resolvía su estado de carga con la misma línea:
 * una barra gris de 200x24px centrada a media altura de la ventana.
 * Eso no anticipa nada — el usuario ve un punto gris en el vacío y de
 * golpe aparece una tabla completa, así que el salto se percibe como
 * un parpadeo de toda la página en vez de como "esto se está llenando".
 *
 * Estos esqueletos replican la estructura real: mismo encabezado, mismo
 * número de columnas, mismas alturas de tarjeta. El contenido definitivo
 * cae encima sin desplazar nada.
 */

function Line({ w, cls = '' }: { w: string | number; cls?: string }) {
  return <div className={`skeleton skel-line ${cls}`} style={{ width: w }} />;
}

function Header({ withActions = true }: { withActions?: boolean }) {
  return (
    <div className="skel-header">
      <div className="skel-stack">
        <Line w={92} />
        <Line w={216} cls="lg" />
        <Line w={280} />
      </div>
      {withActions && <div className="skeleton" style={{ width: 148, height: 34, borderRadius: 'var(--radius-md)' }} />}
    </div>
  );
}

function TableRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="skel-table">
      <div className="skel-table-head">
        <Line w="55%" /><Line w="65%" /><Line w="50%" /><Line w="45%" /><Line w="40%" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div className="skel-table-row" key={i}>
          <Line w="70%" cls="md" />
          <Line w="88%" cls="md" />
          <Line w="60%" cls="md" />
          <div className="skeleton" style={{ width: 74, height: 18, borderRadius: 'var(--radius-full)' }} />
          <Line w="55%" cls="md" />
        </div>
      ))}
    </div>
  );
}

function Kpis({ count = 4 }: { count?: number }) {
  return (
    <div className="skel-kpis">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skel-kpi" key={i}>
          <div className="skeleton skel-kpi-icon" />
          <Line w="72%" cls="lg" />
          <Line w="88%" />
        </div>
      ))}
    </div>
  );
}

export type SkeletonVariant = 'list' | 'dashboard' | 'detail' | 'form' | 'report';

/**
 * `label` alimenta al lector de pantalla: sin él, un bloque de cajas
 * animadas no anuncia absolutamente nada mientras dura la espera.
 */
export default function PageSkeleton({
  variant = 'list',
  label = 'Cargando…',
}: {
  variant?: SkeletonVariant;
  label?: string;
}) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" aria-label={label}>
      {variant === 'list' && (
        <>
          <Header />
          <div className="cluster" style={{ marginBottom: 'var(--space-4)' }}>
            <div className="skeleton" style={{ width: 300, height: 32, borderRadius: 'var(--radius-full)' }} />
            <div className="skeleton" style={{ width: 88, height: 26, borderRadius: 'var(--radius-full)' }} />
            <div className="skeleton" style={{ width: 96, height: 26, borderRadius: 'var(--radius-full)' }} />
            <div className="skeleton" style={{ width: 80, height: 26, borderRadius: 'var(--radius-full)' }} />
          </div>
          <TableRows />
        </>
      )}

      {variant === 'dashboard' && (
        <>
          <div className="skeleton" style={{ height: 104, borderRadius: 'var(--radius-xl)', marginBottom: 'var(--space-5)' }} />
          <div className="skeleton" style={{ height: 84, borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-5)' }} />
          <Kpis count={5} />
          <div className="charts-grid">
            <div className="skel-panel">
              <Line w={188} cls="md" />
              <div className="skeleton" style={{ height: 240, borderRadius: 'var(--radius-md)' }} />
            </div>
            <div className="skel-panel">
              <Line w={148} cls="md" />
              <div className="skeleton" style={{ height: 200, borderRadius: 'var(--radius-md)' }} />
            </div>
          </div>
        </>
      )}

      {variant === 'report' && (
        <>
          <Header />
          <Kpis count={3} />
          <div className="charts-grid charts-grid--even" style={{ marginTop: 'var(--space-4)' }}>
            <div className="skel-panel">
              <Line w={196} cls="md" />
              <div className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-md)' }} />
            </div>
            <div className="skel-panel">
              <Line w={172} cls="md" />
              <div className="skeleton" style={{ height: 260, borderRadius: 'var(--radius-md)' }} />
            </div>
          </div>
        </>
      )}

      {variant === 'detail' && (
        <>
          <Header />
          <div className="detail-layout">
            <div className="detail-main">
              <div className="skeleton" style={{ height: 520, borderRadius: 'var(--radius-lg)' }} />
            </div>
            <div className="detail-sidebar">
              {[190, 150, 130].map((h, i) => (
                <div className="skel-panel" key={i} style={{ minHeight: h }}>
                  <Line w={128} cls="md" />
                  <Line w="90%" />
                  <Line w="76%" />
                  <Line w="82%" />
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {variant === 'form' && (
        <>
          <Header />
          {[0, 1, 2].map(i => (
            <div className="skel-panel" key={i} style={{ marginBottom: 'var(--space-6)', gap: 'var(--space-5)' }}>
              <div className="skel-stack">
                <Line w={186} cls="md" />
                <Line w={288} />
              </div>
              <div className="form-row">
                <div className="skeleton" style={{ height: 36, borderRadius: 'var(--radius-md)' }} />
                <div className="skeleton" style={{ height: 36, borderRadius: 'var(--radius-md)' }} />
              </div>
              <div className="form-row">
                <div className="skeleton" style={{ height: 36, borderRadius: 'var(--radius-md)' }} />
                <div className="skeleton" style={{ height: 36, borderRadius: 'var(--radius-md)' }} />
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
