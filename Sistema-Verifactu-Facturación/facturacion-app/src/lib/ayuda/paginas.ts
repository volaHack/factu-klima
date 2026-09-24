/**
 * QUÉ HACE CADA PANTALLA Y CÓMO SE USA
 *
 * Un programa de facturación con cuarenta y siete pantallas tiene un problema
 * que no se arregla con más botones: quien lo abre por primera vez no sabe
 * por dónde empezar, y quien lleva un mes sigue sin saber para qué sirve la
 * mitad del menú. La respuesta habitual —un manual en PDF— no la lee nadie,
 * porque la duda aparece delante de la pantalla, no delante del PDF.
 *
 * Esto es el manual puesto DENTRO de cada pantalla. Un botón en la cabecera,
 * siempre en el mismo sitio, que contesta tres cosas:
 *
 *   1. Para qué sirve esto (una frase, sin jerga).
 *   2. Cómo se usa (los pasos, en orden, con el nombre de los botones).
 *   3. Lo que conviene saber antes de meter la pata.
 *
 * CÓMO ESTÁ ESCRITO
 * -----------------
 * En castellano llano y de tú, como se lo explicarías a alguien de pie a tu
 * lado. Nada de «el sistema permite gestionar»: «aquí das de alta a quien te
 * compra». Los pasos nombran los botones EXACTAMENTE como están en pantalla,
 * porque un paso que dice «pulsa en guardar» cuando el botón pone «Emitir
 * factura» es peor que no decir nada.
 *
 * Y no se inventa nada. Si una pantalla no hace algo, aquí no aparece, y si
 * algo del programa está a medias, se dice. La confianza en la ayuda se
 * pierde entera con una sola cosa que no cuadre.
 */

export interface AyudaPagina {
  /** Ruta exacta, sin barra final. */
  ruta: string;
  titulo: string;
  /** Una o dos frases: para qué existe esta pantalla. */
  paraQue: string;
  /** Los pasos, en el orden en que se hacen. */
  pasos: string[];
  /** Las trampas, los avisos y lo que no es evidente. */
  saber?: string[];
  /** A dónde ir después, o de dónde viene esto. */
  relacionadas?: { ruta: string; texto: string }[];
}

export const AYUDA_PAGINAS: AyudaPagina[] = [
  {
    ruta: '/importar',
    titulo: 'Importar de otro programa',
    paraQue: 'Traer tus clientes y tus productos desde Holded, Contasimple, Factusol, Quipu, Sage, Anfix o una hoja de cálculo, sin teclearlos otra vez.',
    pasos: [
      'En tu programa anterior, exporta el listado de clientes o de productos a Excel (.xlsx) o CSV.',
      'Arrastra el archivo aquí: se reconoce solo si son clientes o productos y qué columna es cada dato.',
      'Revisa lo propuesto y la lista de filas: verás cuáles se crean, cuáles ya tenías y cuáles tienen algún problema.',
      'Pulsa «Crear» y listo: los que ya existían no se tocan ni se duplican.',
    ],
    saber: [
      'El archivo se lee en tu navegador: no se sube a ningún sitio.',
      'Los precios se guardan sin impuesto; si el archivo sólo trae el PVP con IVA o IGIC, se calcula la base.',
      'Las facturas antiguas no se importan: las emitió y registró tu programa anterior, y ahí se conservan.',
      'Los .xls antiguos no se leen: ábrelo en Excel y guárdalo como .xlsx o CSV.',
    ],
    relacionadas: [
      { ruta: '/clientes', texto: 'Ver los clientes' },
      { ruta: '/productos', texto: 'Ver los productos' },
    ],
  },
  // ============================================================
  // EL DÍA A DÍA
  // ============================================================
  {
    ruta: '/dashboard',
    titulo: 'Inicio',
    paraQue: 'El resumen de cómo va el negocio: lo facturado, lo que está sin cobrar y lo que hay que mirar hoy.',
    pasos: [
      'Mira primero las fichas de arriba: son las cifras del mes en curso.',
      'Lo que aparezca en rojo o en ámbar es lo que pide atención — casi siempre facturas vencidas sin cobrar.',
      'Pulsa cualquier ficha para ir al listado completo de lo que resume.',
    ],
    saber: [
      'Las fichas del panel se eligen en Ajustes: si hay alguna que no miras nunca, quítala y deja las tuyas.',
      'Las cifras salen de lo que hay guardado en este dispositivo y se refrescan al sincronizar, así que sin conexión pueden ir un poco por detrás.',
    ],
    relacionadas: [
      { ruta: '/facturas', texto: 'Ver todas las facturas' },
      { ruta: '/ajustes', texto: 'Elegir las fichas del panel' },
    ],
  },
  {
    ruta: '/facturas',
    titulo: 'Facturas',
    paraQue: 'Todo lo que has facturado, con su estado de cobro. Es el corazón del programa.',
    pasos: [
      'Pulsa «Nueva factura» para crear una.',
      'Elige el cliente, añade las líneas y comprueba el total.',
      'Al emitirla se sella con su huella Veri*Factu y su número definitivo. A partir de ahí ya no se puede modificar.',
      'Desde la ficha de cada factura puedes descargar el PDF con tu diseño, marcarla como cobrada o rectificarla.',
    ],
    saber: [
      'Una factura emitida NO se puede editar ni borrar: es lo que exige la ley antifraude. Para corregirla se hace una rectificativa o un abono.',
      'Los borradores sí se pueden cambiar todo lo que quieras: no llevan número definitivo ni huella hasta que las emites.',
      'La numeración no puede retroceder ni saltarse: el programa lo impide a propósito.',
    ],
    relacionadas: [
      { ruta: '/facturas/nueva', texto: 'Hacer una factura' },
      { ruta: '/devoluciones', texto: 'Corregir con abono o devolución' },
      { ruta: '/plantillas', texto: 'Cambiar el diseño del PDF' },
    ],
  },
  {
    ruta: '/facturas/nueva',
    titulo: 'Hacer una factura',
    paraQue: 'Crear una factura nueva, línea a línea.',
    pasos: [
      'Elige el cliente. Si es alguien que no vuelve, usa el cliente ocasional y escribe sus datos a mano.',
      'Añade las líneas: busca el producto por nombre o referencia, o escribe un concepto libre.',
      'Repasa el desglose de IVA y el total.',
      'Guarda como borrador si aún falta algo, o pulsa emitir para cerrarla.',
    ],
    saber: [
      'Las casillas que te pide cada línea dependen de tu sector y de tu plantilla: si vendes por cajas te pedirá las unidades por caja.',
      'Las ofertas que tengas activas se aplican solas al total.',
      'Mientras sea borrador puedes cambiarlo todo. Al emitir se cierra.',
    ],
    relacionadas: [
      { ruta: '/clientes', texto: 'Dar de alta un cliente' },
      { ruta: '/productos', texto: 'Dar de alta un producto' },
      { ruta: '/ofertas', texto: 'Ver las ofertas activas' },
    ],
  },
  {
    ruta: '/clientes',
    titulo: 'Clientes',
    paraQue: 'La ficha de quien te compra: sus datos fiscales, su dirección y su historial.',
    pasos: [
      'Pulsa «Nuevo cliente» y rellena al menos el nombre y el NIF.',
      'Entra en cualquier cliente para ver todo lo que le has facturado y lo que te debe.',
      'Desde su ficha puedes hacerle una factura directamente.',
    ],
    saber: [
      'El NIF se comprueba al escribirlo: si la letra no cuadra, te avisa antes de guardar.',
      'Un cliente con facturas no se puede borrar, porque esas facturas dejarían de tener a quién apuntar.',
      'Si trabajas con cadenas o centrales de compra, agrúpalos en Grupos y cadenas.',
    ],
    relacionadas: [
      { ruta: '/grupos-clientes', texto: 'Agrupar clientes de una cadena' },
      { ruta: '/tesoreria', texto: 'Ver lo que te deben' },
    ],
  },
  {
    ruta: '/productos',
    titulo: 'Productos',
    paraQue: 'Tu catálogo: lo que vendes, a qué precio y cuánto te queda.',
    pasos: [
      'Pulsa «Nuevo producto» y pon al menos nombre, precio e IVA.',
      'La referencia y el código de barras son opcionales, pero el código de barras es lo que permite escanear en el TPV.',
      'Las existencias se mueven solas al facturar y al hacer albaranes.',
    ],
    saber: [
      'Si vendes por cajas, rellena las unidades por bulto: así el almacén cuenta unidades sueltas y la factura cobra cajas.',
      'Un producto que ya se ha vendido no se borra, se marca como inactivo: así el historial sigue cuadrando.',
      'El precio de coste es lo que permite que los informes te digan el margen real.',
    ],
    relacionadas: [
      { ruta: '/almacenes', texto: 'Existencias por almacén' },
      { ruta: '/lotes', texto: 'Controlar por lotes' },
      { ruta: '/ofertas', texto: 'Poner una oferta a un producto' },
    ],
  },
  {
    ruta: '/tpv',
    titulo: 'Punto de venta',
    paraQue: 'La caja del mostrador: cobrar rápido, imprimir el ticket y cuadrar el turno.',
    pasos: [
      'Abre la caja al empezar el turno y cuenta el efectivo con el que arrancas.',
      'Busca el producto o escanea su código de barras. Se va sumando al ticket.',
      'Pulsa F2 o Espacio para cobrar; elige efectivo, tarjeta o Bizum con 1, 2 o 3.',
      'Al terminar el turno, cierra la caja y cuenta lo que hay: te dice el descuadre y te resume cómo ha ido.',
    ],
    saber: [
      'F1 busca, F3 aparca la venta, F4 cobra algo que no está en el catálogo, F5 da de alta un producto.',
      'Funciona sin conexión: la venta se guarda y se sella cuando vuelve internet.',
      'Si algo no sabes hacerlo, el botón «Ayuda» de la barra responde sabiendo cómo tienes el mostrador ahora mismo.',
      'Un ticket cobrado no se puede modificar. Se corrige con una devolución o un abono.',
    ],
    relacionadas: [
      { ruta: '/ofertas', texto: 'Las ofertas se aplican solas aquí' },
      { ruta: '/devoluciones', texto: 'Devolver algo ya cobrado' },
    ],
  },

  // ============================================================
  // DOCUMENTOS
  // ============================================================
  {
    ruta: '/documentos',
    titulo: 'Presupuestos y pedidos',
    paraQue: 'Lo que va antes de la factura: la oferta que el cliente acepta y el pedido que se compromete a comprar.',
    pasos: [
      'Haz un presupuesto y mándaselo al cliente.',
      'Cuando lo acepte, conviértelo en pedido o directamente en albarán sin volver a teclear nada.',
      'Del albarán sale la factura.',
    ],
    saber: [
      'Ni el presupuesto ni el pedido mueven existencias: sólo lo hace el albarán, que es cuando el género sale de verdad.',
      'Ninguno de los dos lleva huella Veri*Factu, porque no son facturas.',
    ],
    relacionadas: [
      { ruta: '/albaranes', texto: 'Albaranes de entrega' },
      { ruta: '/facturas', texto: 'Facturas' },
    ],
  },
  {
    ruta: '/albaranes',
    titulo: 'Albaranes',
    paraQue: 'La entrega. Es el documento que mueve el almacén, y varios albaranes se agrupan luego en una sola factura.',
    pasos: [
      'Crea el albarán con lo que sale de verdad hacia el cliente.',
      'Al expedirlo se descuentan las existencias.',
      'A fin de mes, agrupa los albaranes de un cliente en una factura.',
    ],
    saber: [
      'El albarán no es una factura: no lleva huella Veri*Factu ni sirve para deducir IVA.',
      'Si controlas por lotes, aquí es donde se elige de qué lote sale cada línea.',
    ],
    relacionadas: [
      { ruta: '/rutas-reparto', texto: 'Organizar el reparto del día' },
      { ruta: '/lotes', texto: 'Lotes y trazabilidad' },
    ],
  },
  {
    ruta: '/devoluciones',
    titulo: 'Abonos y devoluciones',
    paraQue: 'La única manera legal de corregir una factura ya emitida.',
    pasos: [
      'Busca la factura que hay que corregir.',
      'Elige si es una devolución de género —que vuelve al almacén— o un abono de importe.',
      'Emite el documento: queda encadenado con la factura original.',
    ],
    saber: [
      'Nunca se borra ni se modifica la factura original: se emite otro documento que la corrige. Eso es lo que exige la ley antifraude.',
      'Una devolución devuelve las existencias; un abono sólo devuelve dinero.',
    ],
    relacionadas: [{ ruta: '/facturas', texto: 'Facturas' }],
  },

  // ============================================================
  // ALMACÉN
  // ============================================================
  {
    ruta: '/almacenes',
    titulo: 'Almacenes y existencias',
    paraQue: 'Tener las existencias separadas por local, furgoneta u obra, y moverlas entre ellos.',
    pasos: [
      'Da de alta cada almacén: la tienda, el trastero, cada furgoneta de reparto.',
      'Al facturar o hacer un albarán, elige de qué almacén sale.',
      'Usa los traspasos para mover género de uno a otro sin que parezca una venta.',
    ],
    saber: ['Un traspaso no es una venta: no factura ni cambia el valor del inventario, sólo lo cambia de sitio.'],
    relacionadas: [{ ruta: '/productos', texto: 'Catálogo' }],
  },
  {
    ruta: '/lotes',
    titulo: 'Lotes y trazabilidad',
    paraQue: 'Saber qué lote se vendió a quién, y poder FRENARLO si llega una alerta sanitaria. Obligatorio por ley en alimentación.',
    pasos: [
      'Da de alta el lote al recibir la mercancía, con su código y su caducidad.',
      'Al vender, cada línea sale de un lote — se propone el que caduca antes.',
      'Si llega una alerta: pulsa el botón de inmovilizar en ese lote y escribe el motivo. Deja de poder venderse al instante.',
      'Ve a la pestaña «Trazabilidad», busca el código del lote y tendrás la lista de clientes a los que llamar.',
    ],
    saber: [
      'INMOVILIZADO es «para todo mientras compruebo» y se puede deshacer. RETIRADO es definitivo y no se puede volver a poner a la venta.',
      'Un lote parado no se puede vender ni desde el TPV ni desde una factura: lo impide también la base de datos, así que no hay manera de que se cuele.',
      'El motivo del bloqueo es obligatorio: dentro de seis meses, o delante de un inspector, hay que poder decir por qué se paró y cuándo.',
      'La lista de la alerta agrupa por cliente, con cuánto se le sirvió y con qué albaranes: es la lista con la que se llama por teléfono.',
    ],
    relacionadas: [{ ruta: '/productos', texto: 'Catálogo' }],
  },
  {
    ruta: '/numeros-serie',
    titulo: 'Números de serie',
    paraQue: 'Seguir una unidad concreta desde que entra hasta que se acaba su garantía. Para aparatos, maquinaria y electrónica.',
    pasos: [
      'Registra el número de serie al recibir la unidad.',
      'Al venderla, se asocia al cliente y a la factura.',
      'Si vuelve por garantía, busca el número y sabrás cuándo se vendió y a quién.',
    ],
    relacionadas: [{ ruta: '/productos', texto: 'Catálogo' }],
  },
  {
    ruta: '/fabricacion',
    titulo: 'Fabricación',
    paraQue: 'Los escandallos: qué componentes lleva cada artículo que fabricas y cuánto te cuesta producirlo.',
    pasos: [
      'Crea el escandallo del artículo fabricado y añade sus componentes con sus cantidades.',
      'El coste se calcula solo a partir del coste de cada componente.',
      'Al fabricar, se consumen los componentes y entra el producto acabado.',
    ],
    saber: ['Si cambia el precio de un componente, el coste del artículo fabricado cambia con él.'],
    relacionadas: [{ ruta: '/productos', texto: 'Catálogo' }],
  },

  // ============================================================
  // COMERCIAL
  // ============================================================
  {
    ruta: '/ofertas',
    titulo: 'Ofertas y promociones',
    paraQue: 'Lo que pones en el cartel: el 3x2, «diez cajas y una gratis», la segunda unidad al 50 % o el precio de los martes.',
    pasos: [
      'Pulsa «Nueva oferta» y elige la clase: llévate N paga M, segunda unidad rebajada, porcentaje, precio de promoción, por tramos o regalo.',
      'Pon los números y MIRA LA PRUEBA de debajo: te dice exactamente lo que le cobrarás al cliente.',
      'Elige a qué se aplica: a un producto, a una familia entera o a todo.',
      'Si sólo vale unos días o unas horas, ponlo abajo. Guarda y ya se aplica sola en el TPV y en las facturas.',
    ],
    saber: [
      'Si dos ofertas caen sobre la misma línea, se aplica LA QUE MÁS LE AHORRE AL CLIENTE, no la más nueva ni la de más prioridad.',
      'La oferta no pisa el descuento que hayas negociado a mano: se suman, y la factura los enseña por separado.',
      'La franja horaria admite cruzar la medianoche: de 22:00 a 02:00 es una franja válida.',
      'Una oferta desactivada o fuera de fecha aparece apagada en la lista y te dice por qué no está entrando.',
    ],
    relacionadas: [
      { ruta: '/productos', texto: 'Catálogo' },
      { ruta: '/rappels', texto: 'Rappels por volumen' },
    ],
  },
  {
    ruta: '/rappels',
    titulo: 'Rappels por volumen',
    paraQue: 'El premio por comprar mucho a lo largo de un periodo. No es un descuento de cada factura.',
    pasos: [
      'Crea la regla con sus tramos: a partir de tanto facturado, tanto por ciento.',
      'Al cerrar el periodo, el programa te dice lo que le corresponde a cada cliente.',
      'Se le liquida normalmente con un abono.',
    ],
    saber: ['La diferencia con una oferta: el rappel se calcula al final del periodo, la oferta se aplica en el momento de la venta.'],
    relacionadas: [{ ruta: '/ofertas', texto: 'Ofertas de mostrador' }],
  },
  {
    ruta: '/comisiones',
    titulo: 'Comisiones',
    paraQue: 'Lo que se lleva cada comercial, sobre lo facturado o sobre lo cobrado.',
    pasos: [
      'Asigna a cada vendedor su porcentaje.',
      'Elige en Ajustes si la comisión se gana al facturar o al cobrar.',
      'Consulta aquí lo que le corresponde a cada uno en el periodo.',
    ],
    saber: ['Pagar comisión sobre lo facturado y que luego resulte impagado es el disgusto clásico: si te pasa, cambia la base a «cobrado» en Ajustes.'],
    relacionadas: [{ ruta: '/ajustes', texto: 'Cambiar la base de la comisión' }],
  },
  {
    ruta: '/grupos-clientes',
    titulo: 'Grupos y cadenas',
    paraQue: 'Clientes que pertenecen a una misma cadena o central de compras, para verlos y facturarlos en conjunto.',
    pasos: [
      'Crea el grupo y mete dentro los clientes que le pertenecen.',
      'Podrás analizar y facturar al grupo entero, no sólo tienda por tienda.',
    ],
    relacionadas: [{ ruta: '/clientes', texto: 'Clientes' }],
  },
  {
    ruta: '/rutas-reparto',
    titulo: 'Rutas de reparto',
    paraQue: 'Agrupar clientes por zona o por día y sacar la hoja de reparto de la jornada.',
    pasos: [
      'Crea la ruta y asígnale los clientes que van en ella.',
      'Elige el día de la semana en que se reparte.',
      'Saca la hoja del día con los albaranes que hay que entregar.',
    ],
    relacionadas: [{ ruta: '/albaranes', texto: 'Albaranes' }],
  },

  // ============================================================
  // PROYECTO
  // ============================================================
  {
    ruta: '/obras',
    titulo: 'Obras y expedientes',
    paraQue: 'Agrupar todo lo de un proyecto —horas, materiales, gastos— y saber lo que deja cada uno por separado.',
    pasos: [
      'Crea la obra con su cliente y su presupuesto.',
      'Imputa a ella las facturas, los albaranes y los gastos según vayan saliendo.',
      'Consulta la rentabilidad: lo presupuestado contra lo gastado de verdad.',
    ],
    relacionadas: [{ ruta: '/ordenes-trabajo', texto: 'Partes de trabajo' }],
  },
  {
    ruta: '/ordenes-trabajo',
    titulo: 'Órdenes de trabajo',
    paraQue: 'El parte de un servicio: qué se hizo, quién, cuántas horas y qué materiales se gastaron.',
    pasos: [
      'Crea la orden con el cliente y lo que hay que hacer.',
      'Al terminar, apunta las horas y los materiales.',
      'Conviértela en factura sin volver a teclearlo.',
    ],
    relacionadas: [{ ruta: '/obras', texto: 'Obras y expedientes' }],
  },

  // ============================================================
  // DINERO
  // ============================================================
  {
    ruta: '/tesoreria',
    titulo: 'Tesorería',
    paraQue: 'Lo que está por cobrar y por pagar, con sus vencimientos.',
    pasos: [
      'Mira los vencimientos por fecha: lo vencido sale destacado.',
      'Marca los cobros y los pagos según entren.',
      'Filtra por cliente para ver toda su deuda de un vistazo.',
    ],
    saber: ['Marcar una factura como cobrada aquí es lo que hace que deje de contar como pendiente en el panel de inicio.'],
    relacionadas: [{ ruta: '/facturas', texto: 'Facturas' }],
  },
  {
    ruta: '/gastos',
    titulo: 'Gastos',
    paraQue: 'Lo que pagas y no es mercancía: alquiler, suministros, dietas, gasolina.',
    pasos: [
      'Registra el gasto con su proveedor, su importe y su IVA.',
      'Asígnale una categoría para que los informes lo agrupen.',
      'Si es de un vehículo o de una obra, imputáselo.',
    ],
    saber: ['El IVA de los gastos entra como soportado en el modelo 303: registrarlos bien es lo que te ahorra dinero en la declaración.'],
    relacionadas: [{ ruta: '/listados-fiscales/303', texto: 'Modelo 303' }],
  },
  {
    ruta: '/informes',
    titulo: 'Informes',
    paraQue: 'Ver cómo va el negocio: ventas por periodo, por cliente, por producto y el margen que dejan.',
    pasos: [
      'Elige el periodo que quieras mirar.',
      'Cambia entre las vistas: por cliente, por producto, por vendedor.',
      'Exporta si necesitas llevártelo a otro sitio.',
    ],
    saber: ['El margen sólo sale bien si los productos tienen el precio de coste puesto.'],
    relacionadas: [{ ruta: '/productos', texto: 'Poner el coste a los productos' }],
  },

  // ============================================================
  // FISCAL
  // ============================================================
  {
    ruta: '/verifactu',
    titulo: 'Veri*Factu',
    paraQue: 'Desde aquí se mandan tus facturas a la Agencia Tributaria y se ve qué ha dicho de cada una.',
    pasos: [
      'Sube tu certificado digital en formato .p12 o .pfx, con su contraseña. Se comprueba al momento.',
      'Rellena quién produce el software (nombre y NIF): la AEAT lo exige en cada registro y no es un dato que se pueda deducir.',
      'Empieza en el entorno de PRUEBAS. Lo que se manda ahí no cuenta, y sirve para ver que todo encaja.',
      'Pulsa «Comprobar conexión»: eso hace el mismo saludo seguro que hace un envío de verdad.',
      'Activa el envío y pulsa «Enviar». Cada factura aparecerá como aceptada, aceptada con avisos o rechazada.',
    ],
    saber: [
      'Cada factura que emites genera su registro y su huella oficial sin que tengas que hacer nada. Lo que se envía aquí es eso, no la factura en PDF.',
      '«Aceptado con avisos» significa que la Agencia ya la tiene registrada y avisa de algo. NO se reenvía: volver a mandarla crearía un duplicado, y el duplicado sí es un problema.',
      'Anular una factura ya enviada no la borra de la AEAT: genera otro registro que dice que aquélla queda sin efecto, y también se manda.',
      'Si la conexión se corta a mitad, la factura se queda en «pendiente» y se reintenta. Nunca se da por enviada algo que no se sabe si llegó.',
      'Antes de pasar a producción, habla con tu asesor: el alta en el sistema y el certificado con el que se firma son cosa tuya, no del programa.',
      'El NIF de tu empresa no se puede cambiar una vez has emitido facturas: entra en la huella de todas ellas.',
      'El contador de facturas no puede retroceder.',
    ],
    relacionadas: [
      { ruta: '/integridad', texto: 'Comprobar la cadena' },
      { ruta: '/ajustes', texto: 'Datos fiscales de la empresa' },
    ],
  },
  {
    ruta: '/gestoria',
    titulo: 'Gestoría',
    paraQue: 'Consultar los libros de las empresas que te han invitado, sin que nadie tenga que pasarte sus claves.',
    pasos: [
      'Tu cliente te invita desde sus Ajustes, con este mismo correo.',
      'Aceptas la invitación aquí y su empresa aparece en tu lista.',
      'Entras en una empresa y ves sus facturas selladas y el reparto por trimestres.',
    ],
    saber: [
      'Es SOLO LECTURA: no puedes emitir, modificar ni borrar nada en nombre de tu cliente. Lo impide la base de datos, no esta pantalla.',
      'Tu cliente te retira el acceso cuando quiera, y deja de verse al instante.',
      'No ves sus certificados digitales ni sus datos de pago: para llevar los libros no hacen falta.',
    ],
    relacionadas: [{ ruta: '/listados-fiscales', texto: 'Modelos fiscales' }],
  },
  {
    ruta: '/integridad',
    titulo: 'Integridad',
    paraQue: 'Comprobar que ninguna factura se ha alterado: se recalcula la cadena de huellas entera.',
    pasos: [
      'Pulsa comprobar y espera.',
      'Si todo está bien, la cadena sale intacta.',
      'Si algo no cuadra, te dice exactamente en qué factura se rompe.',
    ],
    saber: ['Es la prueba que enseñarías en una inspección para demostrar que tus facturas no se han tocado.'],
    relacionadas: [{ ruta: '/verifactu', texto: 'Veri*Factu' }],
  },
  {
    ruta: '/listados-fiscales',
    titulo: 'Listados fiscales',
    paraQue: 'Los modelos de la Agencia Tributaria calculados con tus datos: 303, 347, 130, 131, 415, 420 y 425.',
    pasos: [
      'Elige el modelo y el periodo.',
      'Repasa las casillas: salen calculadas de tus facturas y gastos.',
      'Descarga el fichero para presentarlo o pásaselo a tu asesor.',
    ],
    saber: [
      'Esto CALCULA los modelos, no los presenta: la presentación se hace en la sede de la AEAT o la hace tu asesor.',
      'Si una casilla no cuadra, casi siempre es porque falta registrar un gasto o hay una factura en borrador que debería estar emitida.',
    ],
    relacionadas: [
      { ruta: '/gastos', texto: 'Registrar gastos' },
      { ruta: '/listados', texto: 'Otros listados' },
    ],
  },
  {
    ruta: '/listados',
    titulo: 'Listados',
    paraQue: 'Los libros de registro y los listados que pide una inspección o tu asesor.',
    pasos: ['Elige el listado y el periodo.', 'Repásalo en pantalla.', 'Expórtalo si hace falta.'],
    relacionadas: [{ ruta: '/listados-fiscales', texto: 'Modelos de la AEAT' }],
  },
  {
    ruta: '/retenciones',
    titulo: 'Retenciones',
    paraQue: 'La retención de IRPF de profesionales y de obra, con su resumen para el modelo 111.',
    pasos: [
      'Marca el porcentaje de retención al dar de alta la factura del profesional.',
      'Consulta aquí el acumulado del periodo.',
      'Con eso se rellena el modelo 111.',
    ],
    relacionadas: [{ ruta: '/listados-fiscales', texto: 'Modelos' }],
  },
  {
    ruta: '/sii',
    titulo: 'SII',
    paraQue: 'El envío inmediato de los libros de IVA a la Agencia Tributaria. Obligatorio por encima de seis millones de facturación.',
    pasos: ['Configura tus datos de acceso.', 'Revisa los registros pendientes de enviar.', 'Envíalos dentro del plazo de cuatro días.'],
    saber: ['Si facturas por debajo del umbral, esto no te aplica y puedes desactivar el módulo en Ajustes.'],
    relacionadas: [{ ruta: '/ajustes', texto: 'Activar o desactivar módulos' }],
  },
  {
    ruta: '/intracomunitarias',
    titulo: 'Operaciones intracomunitarias',
    paraQue: 'Ventas y compras a otros países de la Unión Europea, con su modelo 349.',
    pasos: [
      'Marca las facturas que son intracomunitarias.',
      'Comprueba que el NIF-IVA del cliente está dado de alta en el VIES.',
      'Saca el resumen para el 349.',
    ],
    saber: ['Una operación intracomunitaria va sin IVA sólo si el cliente está dado de alta en el VIES. Si no lo está, lleva IVA español.'],
    relacionadas: [{ ruta: '/clientes', texto: 'Clientes' }],
  },

  // ============================================================
  // CONFIGURACIÓN
  // ============================================================
  {
    ruta: '/ajustes',
    titulo: 'Ajustes',
    paraQue: 'Los datos de tu empresa, tu logotipo, las series de numeración y qué partes del programa quieres ver.',
    pasos: [
      'Empieza por los datos fiscales: razón social, NIF y dirección. Salen en todas tus facturas.',
      'Sube tu logotipo: aparece en el menú lateral y en las facturas.',
      'Elige tu sector: eso decide qué módulos se encienden y cómo es tu factura.',
      'Ajusta las series de numeración y la forma de pago por defecto.',
    ],
    saber: [
      'El NIF NO se puede cambiar una vez has emitido facturas: entra en la huella Veri*Factu de todas ellas. El campo aparece bloqueado con el motivo.',
      'Si desactivas un módulo, sus pantallas desaparecen del menú pero los datos no se borran: volver a activarlo lo deja como estaba.',
      'Todo se guarda solo al escribir; si algo no se puede guardar, te lo dice en el momento y te explica por qué.',
    ],
    relacionadas: [
      { ruta: '/plantillas', texto: 'Diseño de las facturas' },
      { ruta: '/verifactu', texto: 'Veri*Factu' },
    ],
  },
  {
    ruta: '/asistencia',
    titulo: 'Asistente',
    paraQue: 'Preguntar dudas del programa —escribiendo o dictando— y que la respuesta venga con tus propios números: cuántas facturas tienes sin cobrar, qué te falta por configurar.',
    pasos: [
      'Escribe la pregunta con tus palabras, o pulsa «Dictar» y háblale.',
      'Pulsa Enviar. Con Mayúsculas+Intro haces párrafo en vez de enviar.',
      'Puedes repreguntar: se acuerda de lo que os habéis dicho en esta conversación.',
    ],
    saber: [
      'No se envían tus facturas: sólo viaja un resumen de cuántas hay y en qué estado, y lo que escribes.',
      'El audio se transcribe en tu propio navegador y no sale de tu ordenador. El micrófono necesita Chrome, Edge o Safari; en Firefox sólo se puede escribir.',
      'No da consejos fiscales: para eso, tu gestoría.',
      'Si el servicio de IA no está configurado en el servidor, lo dice en vez de inventarse la respuesta.',
    ],
    relacionadas: [{ ruta: '/dashboard', texto: 'Panel' }, { ruta: '/ajustes', texto: 'Ajustes' }],
  },
  {
    ruta: '/plantillas',
    titulo: 'Diseño de documentos',
    paraQue: 'Cómo son por fuera tus documentos en PDF —facturas, albaranes, presupuestos, pedidos y rectificativas—: tu membrete, tus columnas y tu pie.',
    pasos: [
      'Sube el PDF de un documento tuyo y el programa lo calca, o empieza uno desde cero eligiendo tu oficio.',
      'Comprueba en «¿Para qué documentos?» que el tipo es el correcto: se lee del titular del PDF, pero puedes cambiarlo.',
      'En el editor, mueve los campos donde quieras y di qué dato va en cada recuadro.',
      'Pulsa «Ver cómo queda» para sacar un PDF de prueba con datos de verdad.',
      'Guárdala y márcala como predeterminada.',
    ],
    saber: [
      'El QR tributario sólo sale en facturas y rectificativas: son los únicos documentos que se declaran. Un albarán o un presupuesto con QR estaría diciéndole al cliente que está declarado cuando no lo está.',
      'El recuadro del QR nace donde manda la AEAT —arriba y centrado, o arriba a la izquierda si la hoja es apaisada— pero lo puedes arrastrar como cualquier otro campo. La propia norma lo permite: si esa posición tiene obstáculos, vale otra, siempre que el código se vea claramente.',
      'Lo que no se puede es quitarlo ni hacerlo más pequeño de 30 mm: eso sí lo fija la ley, y el PDF se niega a salir antes que imprimir una factura que no cumple.',
      'Cada tipo sale con su propia advertencia impresa: el albarán dice que no tiene valor fiscal, el presupuesto que vale 30 días.',
      'Una misma plantilla puede valer para varios tipos. Si uno de ellos es factura, se previsualiza con el QR puesto, para que veas si le falta sitio.',
      'Puedes tener varias plantillas y cambiar de una a otra.',
      'Cambiar de sector cambia la plantilla predeterminada, pero no borra la anterior.',
    ],
    relacionadas: [{ ruta: '/facturas', texto: 'Facturas' }, { ruta: '/albaranes', texto: 'Albaranes' }],
  },
  // ============================================================
  // ADMINISTRACIÓN DEL SISTEMA
  // ============================================================
  {
    ruta: '/admin',
    titulo: 'Panel de administración',
    paraQue: 'Resumen global del servicio: ingresos recurrentes, cuentas activas por plan, cortesías y eventos pendientes.',
    pasos: [
      'Revisa las tarjetas de métricas para ver el estado de las suscripciones.',
      'Si hay eventos de Stripe por revisar o cobros fallidos, entra en Cuentas para ver el detalle.',
    ],
    saber: [
      'Solo pueden acceder las cuentas autorizadas en la tabla de administradores con verificación de segundo factor.',
    ],
    relacionadas: [
      { ruta: '/admin/cuentas', texto: 'Cuentas' },
      { ruta: '/admin/hacienda', texto: 'Hacienda' },
    ],
  },
  {
    ruta: '/admin/2fa',
    titulo: 'Verificación en dos pasos',
    paraQue: 'Confirmar tu identidad con un código TOTP temporal antes de entrar al panel de administración.',
    pasos: [
      'Abre tu aplicación de autenticación (Google Authenticator, 1Password, etc.).',
      'Introduce el código de 6 dígitos que aparece en tu dispositivo.',
      'Pulsa en Verificar para acceder al panel.',
    ],
    saber: [
      'La sesión de administración exige verificación AAL2 para proteger los datos de suscripción y facturación.',
    ],
  },
  {
    ruta: '/admin/cuentas',
    titulo: 'Gestión de cuentas',
    paraQue: 'Listado y administración de todas las cuentas registradas, sus planes, cortesías y estados de suscripción.',
    pasos: [
      'Busca una cuenta por correo electrónico, nombre o NIF.',
      'Pulsa en una cuenta para ver su ficha y gestionar su plan o conceder cortesías.',
    ],
    saber: [
      'Todas las acciones administrativas sobre una cuenta quedan registradas de forma inalterable con su motivo.',
    ],
    relacionadas: [
      { ruta: '/admin', texto: 'Resumen' },
      { ruta: '/admin/registro', texto: 'Registro de auditoría' },
    ],
  },
  {
    ruta: '/admin/hacienda',
    titulo: 'Hacienda y modelos tributarios',
    paraQue: 'Control de la facturación de la plataforma, el cálculo del IGIC y los plazos de los modelos 420 y 130.',
    pasos: [
      'Comprueba el próximo plazo de liquidación y los días restantes.',
      'Revisa las bases imponibles y el IGIC devengado por las suscripciones y propinas.',
      'Accede a los listados fiscales para preparar la presentación oficial.',
    ],
    saber: [
      'El modelo 420 se presenta en la Agencia Tributaria Canaria y el modelo 130 en la AEAT.',
    ],
    relacionadas: [
      { ruta: '/listados-fiscales', texto: 'Listados fiscales' },
      { ruta: '/verifactu', texto: 'Veri*Factu' },
    ],
  },
  {
    ruta: '/admin/registro',
    titulo: 'Registro de acciones de administración',
    paraQue: 'Historial inalterable de todas las operaciones realizadas por los administradores sobre las cuentas.',
    pasos: [
      'Consulta la cronología de cambios de plan, cortesías y cancelaciones.',
      'Verifica el autor, la fecha y el motivo obligatorio de cada acción.',
    ],
    saber: [
      'El registro es de solo lectura y no permite modificación ni borrado de eventos pasados.',
    ],
    relacionadas: [{ ruta: '/admin', texto: 'Resumen' }],
  },
  {
    ruta: '/admin/configuracion',
    titulo: 'Configuración fiscal y facturación de la plataforma',
    paraQue: 'Ajustar las series legales de suscripciones y propinas, el régimen canario de IGIC y la pasarela de impuestos.',
    pasos: [
      'Define el prefijo de serie para las facturas emitidas por suscripciones o donaciones.',
      'Selecciona si la plataforma tributa en régimen de pequeño empresario (REPE exento) o régimen general.',
      'Indica un motivo justificado para guardar los cambios en el registro de auditoría.',
    ],
    saber: [
      'Cualquier cambio de serie o régimen fiscal queda firmado en el registro inalterable para cumplimiento tributario.',
    ],
    relacionadas: [
      { ruta: '/admin', texto: 'Resumen' },
      { ruta: '/admin/hacienda', texto: 'Hacienda' },
    ],
  },
];

/**
 * La ayuda que le toca a una ruta.
 *
 * Se busca primero la coincidencia exacta y luego el prefijo más largo, para
 * que `/facturas/abc123/editar` herede la ayuda de `/facturas` sin tener que
 * escribir una entrada por cada ficha. Devuelve null cuando no hay nada, y
 * entonces el botón de ayuda de esa pantalla simplemente no aparece: es mejor
 * que no haya ayuda a que la haya y no diga nada.
 */
export function ayudaDe(pathname: string): AyudaPagina | null {
  const ruta = pathname.replace(/\/+$/, '') || '/';

  const exacta = AYUDA_PAGINAS.find(a => a.ruta === ruta);
  if (exacta) return exacta;

  const prefijos = AYUDA_PAGINAS
    .filter(a => ruta.startsWith(`${a.ruta}/`))
    .sort((a, b) => b.ruta.length - a.ruta.length);

  return prefijos[0] ?? null;
}
