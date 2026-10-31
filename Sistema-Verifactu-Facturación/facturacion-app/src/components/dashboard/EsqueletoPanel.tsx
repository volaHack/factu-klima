/**
 * EL PANEL MIENTRAS CARGA
 *
 * El esqueleto genérico de «dashboard» (dos franjas, cinco cajas y dos
 * gráficas) no se parecía a este panel: al llegar los datos saltaba todo,
 * la columna de atajos aparecía de la nada y la tira de cifras cambiaba
 * de alto. Éste usa las mismas piezas de maqueta que el panel de verdad
 * (cabecera, barra de secciones, tira de cifras con la principal más
 * ancha, «Para hoy» con sus filas y la columna de la derecha), así que
 * el contenido sólo rellena huecos que ya estaban en su sitio.
 */

/** Una barra gris del ancho y alto que ocupará el texto. */
function L({ w, h = 10, r }: { w: number | string; h?: number; r?: string }) {
  return <span className="skeleton esq-linea" style={{ width: w, height: h, borderRadius: r }} />;
}

export default function EsqueletoPanel() {
  return (
    <div className="panel esq-panel" role="status" aria-live="polite" aria-busy="true" aria-label="Cargando el panel">
      <div className="panel-cabeza">
        <div className="panel-cabeza-texto esq-pila">
          <L w={150} h={12} />
          <L w={220} h={26} r="var(--radius-sm)" />
          <L w={360} h={12} />
        </div>
        <L w={150} h={40} r="var(--radius-md)" />
      </div>

      <div className="esq-secciones">
        {[44, 92, 72, 64].map((w, i) => <L key={i} w={w} h={12} />)}
      </div>

      <div className="panel-cuerpo">
        <div className="cuentas esq-cuentas">
          {[0, 1, 2].map(i => (
            <div key={i} className={`cuentas-cifra${i === 0 ? ' es-principal' : ''}`}>
              <L w={i === 0 ? 150 : 90} h={12} />
              <L w={i === 0 ? 210 : 140} h={i === 0 ? 38 : 26} r="var(--radius-sm)" />
              {i === 0 && <L w="70%" h={34} r="var(--radius-sm)" />}
              <L w={i === 0 ? 220 : 70} h={10} />
            </div>
          ))}
        </div>

        <div className="para-hoy">
          <div className="para-hoy-cabecera"><L w={84} h={14} /></div>
          {[0, 1, 2].map(i => (
            <div key={i} className="esq-fila">
              <L w={30} h={30} r="var(--radius-md)" />
              <span className="esq-pila esq-crece"><L w="55%" h={12} /><L w="35%" h={10} /></span>
              <L w={72} h={12} />
            </div>
          ))}
        </div>

        <aside className="accesos" aria-hidden="true">
          <div className="accesos-hoja esq-hoja"><L w={120} h={12} /><L w="90%" /><L w="70%" /></div>
          <div className="accesos-hoja">
            <div className="accesos-titulo"><L w={48} h={10} /></div>
            <div className="accesos-crear">
              {[0, 1, 2, 3, 4, 5].map(i => <span key={i} className="esq-celda"><L w={84} h={12} /></span>)}
            </div>
          </div>
        </aside>

        <div className="asesor-pareja">
          {[0, 1].map(i => (
            <div key={i} className="asesor-hoja esq-pila">
              <L w={150} h={14} />
              <L w={210} h={10} />
              <L w="100%" h={10} />
              <L w="80%" h={10} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * Mientras llega el código de las gráficas de análisis: la cabecera de la
 * sección, las cuatro cifras y dos tarjetas, del alto de las de verdad.
 */
export function EsqueletoAnalisis() {
  return (
    <div className="analisis esq-analisis" aria-busy="true" aria-label="Cargando el análisis del negocio">
      <div className="panel-seccion-cabeza">
        <span className="esq-pila"><L w={190} h={16} /><L w={280} h={10} /></span>
        <L w={300} h={34} r="var(--radius-full)" />
      </div>
      <div className="analisis-cifras">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="analisis-cifra esq-pila"><L w={90} h={10} /><L w={110} h={22} r="var(--radius-sm)" /><L w={130} h={10} /></div>
        ))}
      </div>
      <div className="esq-analisis-tarjetas">
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
    </div>
  );
}
