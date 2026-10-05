/**
 * FIRMAS DE ATAQUE EN LA DIRECCIÓN DE UNA PETICIÓN
 *
 * Lo que mira el proxy en cada petición, sin tocar la base de datos. Dos
 * familias:
 *
 *  - ESCANEO: rutas que en este programa no existen y que sólo pide un
 *    robot buscando agujeros conocidos (/.env, /.git/config, /wp-admin,
 *    phpMyAdmin, ficheros .php…). Se contestan con un 404 y se apuntan.
 *  - INYECCIÓN: la dirección trae algo que sólo se escribe para atacar:
 *    subir de carpeta (../), SQL (UNION SELECT, ' OR 1=1), scripts
 *    (<script>, javascript:), órdenes del sistema, Log4Shell (${jndi:),
 *    la IP de metadatos de la nube. Se apuntan; la petición sigue y la
 *    ruta hace su propia validación, porque un falso positivo no puede
 *    dejar a un cliente sin entrar.
 *
 * La dirección se decodifica (hasta dos veces, que es como se esconden
 * los ataques) antes de buscar, y en minúsculas.
 */

export type FamiliaAtaque = 'escaneo' | 'inyeccion';

export interface Deteccion {
  familia: FamiliaAtaque;
  tipo: string;
  gravedad: 'media' | 'alta';
  motivo: string;
}

const ESCANEO: [RegExp, string][] = [
  [/(^|\/)\.(env|git|svn|hg|aws|ssh|htpasswd|htaccess|ds_store|npmrc|docker)(\/|$|\.|_)/, 'busca ficheros de configuración o secretos'],
  [/(^|\/)(wp-admin|wp-login|wp-content|wp-includes|wordpress|xmlrpc\.php)/, 'busca WordPress'],
  [/(^|\/)(phpmyadmin|pma|myadmin|adminer|mysql|sqlite|dbadmin)(\/|$|\.php)/, 'busca un gestor de base de datos'],
  [/\.(php|asp|aspx|jsp|cgi|pl|sh|bak|old|sql|swp)(\/|$)/, 'pide ficheros de otras tecnologías o copias de seguridad'],
  [/(^|\/)(cgi-bin|server-status|server-info|actuator|jmx-console|manager\/html|console|solr|telescope|_ignition|vendor\/phpunit|boaform|hnap1)(\/|$)/, 'busca paneles o fallos conocidos de servidores'],
  [/(^|\/)(config|credentials|secrets|backup|dump|database)\.(json|ya?ml|xml|txt|ini|zip|tar|gz)$/, 'busca copias o credenciales'],
];

const INYECCION: [RegExp, string, string, 'media' | 'alta'][] = [
  [/(\.\.[/\\])|([/\\]\.\.($|[/\\]))/, 'traversal', 'intenta salir de la carpeta (../)', 'alta'],
  [/\$\{\s*(jndi|env|sys|java):/, 'log4shell', 'intento de Log4Shell (${jndi:)', 'alta'],
  [/169\.254\.169\.254|metadata\.google\.internal|file:\/\/|gopher:\/\//, 'ssrf', 'apunta a metadatos de la nube o a ficheros del servidor', 'alta'],
  [/\bunion\b[\s/*+]+(all[\s/*+]+)?select\b|\bselect\b.+\bfrom\b.+\binformation_schema\b|'\s*or\s*'?\d+'?\s*=\s*'?\d+|\bor\s+1\s*=\s*1\b|;\s*(drop|delete|truncate|insert|update)\s+|\b(sleep|pg_sleep|benchmark|waitfor\s+delay)\s*\(/, 'sqli', 'intento de inyección SQL', 'alta'],
  [/<\s*script|javascript:|vbscript:|\bon(error|load|mouseover|focus)\s*=|<\s*(img|svg|iframe)[^>]*\bsrc\s*=|document\.cookie/, 'xss', 'intento de inyectar un script (XSS)', 'alta'],
  [/(;|\||&&|`|\$\()\s*(cat|ls|id|whoami|uname|wget|curl|nc|bash|sh|powershell)\b|\/etc\/(passwd|shadow|hosts)|c:\\windows\\/, 'comando', 'intento de ejecutar órdenes del sistema', 'alta'],
  [/\{\{.*\}\}|<%.*%>|\$\{\{/, 'plantilla', 'intento de inyección de plantillas', 'media'],
  [/%00|\x00/, 'byte_nulo', 'byte nulo en la dirección', 'media'],
];

/** Decodifica hasta dos veces: `%252e%252e` → `%2e%2e` → `..`. */
function decodificar(t: string): string {
  let s = t;
  for (let i = 0; i < 2; i++) {
    try {
      const d = decodeURIComponent(s.replace(/\+/g, ' '));
      if (d === s) break;
      s = d;
    } catch { break; }
  }
  return s;
}

/** ¿La petición es un sondeo o un intento de inyección? `null` si parece normal. */
export function detectarAtaque(pathname: string, search = ''): Deteccion | null {
  const ruta = decodificar(pathname).toLowerCase();
  for (const [re, motivo] of ESCANEO) {
    if (re.test(ruta)) return { familia: 'escaneo', tipo: 'escaneo', gravedad: 'media', motivo };
  }
  const todo = `${ruta} ${decodificar(search).toLowerCase()}`;
  for (const [re, tipo, motivo, gravedad] of INYECCION) {
    if (re.test(todo)) return { familia: 'inyeccion', tipo, gravedad, motivo };
  }
  return null;
}

/** IPs que no se bloquean nunca: la propia máquina y redes privadas (pruebas, Vercel interno). */
export function esIpPrivada(ip: string): boolean {
  return /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80:|localhost$|unknown$)/i.test(ip.trim());
}

/** Una IPv4 o IPv6 escrita a mano en el panel (sin máscara: se bloquea una dirección, no una red). */
export function ipValida(ip: string): boolean {
  const t = ip.trim();
  const v4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const v6 = /^(?=.*:)[0-9a-f:]{2,39}$/i;
  return v4.test(t) || (v6.test(t) && !t.includes(':::') && (t.match(/::/g) ?? []).length <= 1);
}
