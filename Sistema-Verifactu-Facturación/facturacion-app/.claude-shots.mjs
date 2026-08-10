import { chromium } from 'playwright';

const OUT = 'C:/Users/volit/AppData/Local/Temp/claude/c--Users-volit-Documents-Sistema-Verifactu-Facturaci-n/8f92e9d5-f30f-4ad2-8539-ffbfbf509d53/scratchpad/shots';
const BASE = 'http://localhost:3111';

async function scrollThrough(page) {
  // Sin `behavior: smooth` (html lo tiene puesto globalmente) y paso a
  // paso de verdad, para que el IntersectionObserver vea cada sección.
  const height = await page.evaluate(() => document.body.scrollHeight);
  const step = await page.evaluate(() => Math.round(window.innerHeight * 0.7));
  for (let y = 0; y < height; y += step) {
    await page.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await page.waitForTimeout(160);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(500);
}

const targets = [
  { path: '/', name: 'home', width: 1440, height: 900 },
  { path: '/', name: 'home-mobile', width: 390, height: 844 },
  { path: '/instalar', name: 'instalar', width: 1440, height: 900 },
  { path: '/instalar', name: 'instalar-mobile', width: 390, height: 844 },
  { path: '/precios', name: 'precios', width: 1440, height: 900 },
];

const browser = await chromium.launch();
const errors = [];

for (const t of targets) {
  const ctx = await browser.newContext({ viewport: { width: t.width, height: t.height } });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${t.name}] console: ${m.text()}`); });
  page.on('pageerror', (e) => errors.push(`[${t.name}] pageerror: ${e.message}`));

  await page.goto(BASE + t.path, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1800);
  await scrollThrough(page);

  await page.screenshot({ path: `${OUT}/${t.name}.png`, fullPage: true });

  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.reveal')]
      .filter((el) => getComputedStyle(el).opacity !== '1')
      .map((el) => el.className));
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(`${t.name}: overflow-x=${overflow}px  reveals-ocultos=${hidden.length}${hidden.length ? ' → ' + hidden.join(' | ') : ''}`);

  // Recorte del héroe a tamaño real
  if (t.name === 'home') {
    await page.screenshot({ path: `${OUT}/home-hero.png`, clip: { x: 0, y: 0, width: t.width, height: 900 } });
  }
  if (t.name === 'instalar') {
    await page.screenshot({ path: `${OUT}/instalar-hero.png`, clip: { x: 0, y: 0, width: t.width, height: 860 } });
  }
  await ctx.close();
}

// Estado de la cadena antes y después de alterar el importe
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('#cadena').scrollIntoViewIfNeeded();
  await page.waitForTimeout(900);
  const box = await page.locator('#cadena').boundingBox();
  await page.screenshot({ path: `${OUT}/cadena-intacta.png`, clip: box });
  await page.locator('.chain-btn').click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/cadena-rota.png`, clip: await page.locator('#cadena').boundingBox() });
  await ctx.close();
}

await browser.close();
console.log(errors.length ? '\nERRORES:\n' + errors.join('\n') : '\nSin errores de consola.');
