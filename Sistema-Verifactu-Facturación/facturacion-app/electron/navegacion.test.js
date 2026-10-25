'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decidirNavegacion } = require('./navegacion');

const APP = 'https://klimafacturas.com';
test('la app se abre dentro', () => assert.equal(decidirNavegacion('https://klimafacturas.com/facturas', APP, 'app'), 'permitir'));
test('otra web, al navegador', () => assert.equal(decidirNavegacion('https://sede.agenciatributaria.gob.es/x', APP, 'app'), 'externo'));
test('file:, data: y javascript: se bloquean (antes pasaban por no tener host)', () => {
  for (const u of ['file:///C:/Windows/System32/', 'data:text/html,<script>alert(1)</script>', 'javascript:alert(1)']) {
    assert.equal(decidirNavegacion(u, APP, 'app'), 'bloquear', u);
  }
});
test('http a un dominio ajeno se bloquea (sin cifrar)', () => assert.equal(decidirNavegacion('http://klimafacturas.com/', APP, 'app'), 'bloquear'));
test('en modo TPV, el panel vuelve a /tpv', () => {
  assert.equal(decidirNavegacion('https://klimafacturas.com/dashboard', APP, 'tpv'), 'tpv');
  assert.equal(decidirNavegacion('https://klimafacturas.com/tpv', APP, 'tpv'), 'permitir');
});
