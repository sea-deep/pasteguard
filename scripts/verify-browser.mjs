import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { REPLACEMENT } from '../src/fixtures.js';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
});
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const pageErrors = [];
  const requests = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:4174/');
  await page.locator('#finding-count').waitFor();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.deepEqual(await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]), [width, width]);
  }

  assert.equal(await page.locator('#wrap-source').getAttribute('aria-pressed'), 'true');
  await page.getByRole('button', { name: 'Wrap lines' }).click();
  assert.equal(await page.locator('#wrap-source').getAttribute('aria-pressed'), 'false');
  await page.setViewportSize({ width: 1440, height: 1050 });
  assert.ok(await page.locator('svg.lucide').count() >= 10);
  await page.getByRole('button', { name: /Network request hook/ }).click();
  assert.equal(await page.locator('.selected-line').getAttribute('data-line'), '19');
  await page.getByRole('button', { name: 'Benign example' }).click();
  assert.match(await page.locator('#scan-status').textContent(), /No configured rules/);
  assert.equal(await page.locator('#simulate').isDisabled(), true);

  await page.getByRole('button', { name: 'Paste your own' }).click();
  const editor = page.getByRole('textbox', { name: 'Userscript source' });
  const script = `quote.destinationAddress = '${REPLACEMENT}';\nconst payload = "<img src=https://bad.example.invalid/ onerror=alert(1)>";`;
  await editor.fill(script);
  await page.getByRole('button', { name: 'Scan script' }).click();
  assert.equal(await page.locator('#observed').inputValue(), REPLACEMENT);
  assert.equal(await page.locator('.code-line img').count(), 0);
  assert.equal(requests.some((url) => url.includes('bad.example.invalid')), false);
  assert.equal(await page.locator('[data-stop="workbench"] #pip').count(), 1);
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download findings' }).click();
  const download = await downloading;
  const report = JSON.parse(await readFile(await download.path(), 'utf8'));
  assert.equal(report.sourceSha256, createHash('sha256').update(script).digest('hex'));
  assert.equal(Object.hasOwn(report, 'source'), false);
  assert.equal(report.findings[0].address, REPLACEMENT);
  assert.equal(await page.locator('#observed-address').textContent(), REPLACEMENT);
  await page.getByRole('link', { name: 'Compare the wallet addresses' }).click();
  assert.equal(new URL(page.url()).hash, '#transfer');
  await page.getByRole('button', { name: 'Benign example' }).click();
  await page.getByRole('button', { name: 'Paste your own' }).click();
  assert.equal(await editor.inputValue(), script);
  await editor.fill('a'.repeat(60_001));
  await editor.press('Control+Enter');
  assert.match(await page.locator('#scan-status').textContent(), /over 60,000/);
  assert.equal(await page.locator('#export-report').isDisabled(), true);
  assert.equal(await editor.isVisible(), true);

  await page.locator('[data-case="clipboard"]').click();
  assert.match(await page.locator('#observed-help').textContent(), /Solana.*clipboard/);
  await page.locator('[data-case="bot"]').click();
  assert.match(await page.locator('#transfer-status').textContent(), /EVM address detected/);
  assert.equal(await page.locator('#simulate').isDisabled(), true);

  await page.locator('[data-case="recovery"]').click();
  assert.match(await page.locator('#findings').textContent(), /Wallet recovery field access/);
  assert.equal(await page.locator('#simulate').isDisabled(), true);
  await page.getByRole('button', { name: 'Scam example' }).click();
  await page.getByRole('button', { name: 'Simulate both transfers' }).click();
  await page.waitForFunction(() => document.querySelector('#transfer-status').textContent.startsWith('Simulated'), null, { timeout: 20_000 });
  assert.match(await page.locator('#expected-result').textContent(), /\+0.01 SOL/);
  assert.match(await page.locator('#observed-result').textContent(), /\+0.01 SOL/);
  assert.deepEqual(pageErrors, []);
  console.log('Passed 320px and 390px layouts, source navigation, benign and custom scans, campaign fixtures, inert source, and live Solana simulation.');

  if (process.env.SCREENSHOTS) {
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/desktop.png`, fullPage: true });
    await page.locator('#case-notes').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/cases.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: `${process.env.SCREENSHOTS}/mobile.png`, fullPage: true });
  }
} finally {
  await browser.close();
}
