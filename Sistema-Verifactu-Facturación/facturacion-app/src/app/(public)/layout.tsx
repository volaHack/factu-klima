'use client';

/**
 * Layout de las páginas públicas (/, /precios, /instalar, /login).
 *
 * Fuerza data-theme="light" en el wrapper contenedor para que
 * el tema oscuro del usuario no afecte al landing ni a las páginas
 * de marketing. Las variables CSS de :root[data-theme="dark"] NO
 * aplican aquí porque el selector apunta a :root, no a un div, pero
 * podemos controlar el body o anular la herencia de variables mediante
 * un div con style. La forma más fiable sin tocar :root es escribir
 * las variables de light directamente en el elemento que rodea el
 * contenido público mediante un className específico.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="public-layout-force-light">
      {children}
    </div>
  );
}
