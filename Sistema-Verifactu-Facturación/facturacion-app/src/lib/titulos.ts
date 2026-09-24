/**
 * EL TÍTULO DE CADA PANTALLA EN LA CABECERA
 *
 * La cabecera sólo conocía siete rutas: en Tesorería, Albaranes, Gastos o
 * cualquiera de las otras cuarenta se quedaba en blanco. En el ordenador
 * se nota poco, porque el menú lateral marca dónde estás; en el móvil el
 * menú va escondido y ese título es la única pista de en qué pantalla se
 * está.
 *
 * Cortos a propósito: en un móvil de 320 px quedan unos 80 px entre el
 * botón del menú y los iconos, y «Clientes y proveedores» salía como
 * «Clientes y pr…». El nombre largo sigue en el menú lateral.
 *
 * Primero se busca la ruta exacta; si no está, la sección a la que
 * pertenece (/facturas/abc/editar → «Editar factura», /clientes/abc →
 * «Ficha de cliente»), y si tampoco, la sección raíz.
 */

const EXACTAS: Record<string, string> = {
  '/dashboard': 'Panel',
  '/asistencia': 'Asistente',
  '/facturas': 'Facturas',
  '/facturas/nueva': 'Nueva factura',
  '/documentos': 'Documentos',
  '/documentos/nuevo': 'Nuevo documento',
  '/tesoreria': 'Tesorería',
  '/clientes': 'Clientes',
  '/productos': 'Productos',
  '/almacenes': 'Almacenes',
  '/albaranes': 'Albaranes',
  '/albaranes/nueva': 'Nuevo albarán',
  '/devoluciones': 'Devoluciones',
  '/gastos': 'Gastos',
  '/comisiones': 'Comisiones',
  '/obras': 'Obras',
  '/ordenes-trabajo': 'Órdenes',
  '/lotes': 'Lotes',
  '/ofertas': 'Ofertas',
  '/rappels': 'Rappels',
  '/grupos-clientes': 'Grupos',
  '/rutas-reparto': 'Rutas de reparto',
  '/numeros-serie': 'Números de serie',
  '/retenciones': 'Retenciones',
  '/fabricacion': 'Fabricación',
  '/sii': 'SII',
  '/intracomunitarias': 'Intracomunitarias',
  '/informes': 'Informes',
  '/contabilidad': 'Contabilidad',
  '/listados-fiscales': 'Modelos fiscales',
  '/listados': 'Listados',
  '/plantillas': 'Plantillas',
  '/integridad': 'Integridad',
  '/verifactu': 'Verifactu',
  '/ajustes': 'Ajustes',
  '/importar': 'Importar',
  '/gestoria': 'Gestoría',
  '/tpv': 'TPV',
  '/admin': 'Administración',
  '/admin/2fa': 'Doble factor',
  '/admin/configuracion': 'Configuración',
  '/admin/cuentas': 'Cuentas',
  '/admin/hacienda': 'Hacienda',
  '/admin/registro': 'Registro',
};

/** Subrutas con id: [prefijo, sufijo, título]. La primera que encaja manda. */
const CON_ID: [string, string, string][] = [
  ['/facturas/', '/editar', 'Editar factura'],
  ['/facturas/', '', 'Factura'],
  ['/documentos/', '/editar', 'Editar documento'],
  ['/documentos/', '', 'Documento'],
  ['/albaranes/', '', 'Albarán'],
  ['/clientes/', '', 'Cliente'],
  ['/gestoria/', '', 'Empresa'],
  ['/admin/cuentas/', '', 'Cuenta'],
];

export function tituloDePagina(pathname: string): string {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  if (EXACTAS[ruta]) return EXACTAS[ruta];

  const modelo = /^\/listados-fiscales\/(\d{3})$/.exec(ruta);
  if (modelo) return `Modelo ${modelo[1]}`;

  for (const [prefijo, sufijo, titulo] of CON_ID) {
    if (ruta.startsWith(prefijo) && ruta.endsWith(sufijo) && ruta.length > prefijo.length + sufijo.length) return titulo;
  }

  // La sección raíz, si la hay: /informes/loquesea → «Informes y fiscal».
  const seccion = '/' + (ruta.split('/')[1] ?? '');
  return EXACTAS[seccion] ?? '';
}
