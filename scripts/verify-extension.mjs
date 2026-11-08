import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { REPLACEMENT } from '../src/fixtures.js';

const profile = await mkdtemp(join(tmpdir(), 'pasteguard-chrome-'));
const directory = resolve('dist-extension');
const browser = await chromium.launchPersistentContext(profile, {
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chromium' }),
  headless: true,
  args: [`--disable-extensions-except=${directory}`, `--load-extension=${directory}`],
});
try {
  const worker = browser.serviceWorkers()[0] ?? await browser.waitForEvent('serviceworker');
  const extensionURL = new URL(worker.url()).origin === 'null'
    ? worker.url().replace(/\/background\.js$/, '')
    : new URL(worker.url()).origin;
  const page = await browser.newPage();
  await page.goto(`${extensionURL}/index.html`);
  assert.equal(await page.locator('#finding-count').textContent(), '03');
  const capturedPage = browser.waitForEvent('page');
  const snippet = `quote.depositAddress = '${REPLACEMENT}';`;
  await worker.evaluate((source) => openCapture(source), snippet);
  const captured = await capturedPage;
  await captured.waitForFunction(() => document.querySelector('#file-name')?.textContent === 'selected-script.user.js');
  assert.equal(await captured.locator('#observed').inputValue(), REPLACEMENT);
  assert.equal(new URL(captured.url()).search, '');
  assert.deepEqual(await worker.evaluate(() => chrome.storage.session.get(null)), {});
  console.log('Passed: unpacked MV3 extension starts, selection handoff loads the scanner, and transient storage is cleared.');
} finally {
  await browser.close();
  await rm(profile, { recursive: true, force: true });
}
