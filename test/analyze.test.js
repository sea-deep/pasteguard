import assert from 'node:assert/strict';
import test from 'node:test';
import { analyze, MAX_SOURCE_LENGTH, MAX_SOURCE_LINES } from '../src/analyze.js';
import { EXPECTED, REPLACEMENT, SAMPLES } from '../src/fixtures.js';
import { createTransfer, DEMO_PAYER, isRecipient, simulatePair } from '../src/solana.js';
import { getBase64Encoder, getTransactionDecoder, getCompiledTransactionMessageDecoder } from '@solana/kit';

test('finds the actual line of each scam signal and extracts the replacement', () => {
  const result = analyze(SAMPLES.scam.source);
  assert.equal(result.error, null);
  assert.deepEqual(result.findings.map(({ rule, line }) => [rule, line]), [
    ['remote', 4], ['recipient', 11], ['hook', 19],
  ]);
  assert.equal(result.findings[1].address, REPLACEMENT);
  assert.deepEqual(analyze(SAMPLES.benign.source).findings, []);
});

test('treats comments, templates and strings as data', () => {
  const source = `const text = "window.fetch = eval";
    // quote.depositAddress = '${REPLACEMENT}';
    const fake = \`
    // ==UserScript==
    // @require https://example.invalid/remote.js
    // ==/UserScript==
    \`;
  `;
  assert.deepEqual(analyze(source), { findings: [], error: null });
});

test('reports an incomplete scan when JavaScript is invalid', () => {
  const result = analyze(SAMPLES.scam.source + '\nconst =');
  assert.match(result.error, /could not be parsed at line 21/);
  assert.deepEqual(result.findings.map((item) => item.rule), ['remote']);
});

test('handles valid module syntax, static property access and clipboard calls', () => {
  const source = `export const compare = (quote) => {
    quote['depositAddress'] = '${REPLACEMENT}';
    navigator.clipboard.writeText('${EXPECTED}');
  };`;
  assert.deepEqual(analyze(source).findings.map((item) => item.address), [REPLACEMENT, EXPECTED]);
});

test('flags broad privileges without treating unverified literals as payment evidence', () => {
  const result = analyze(`// ==UserScript==
    // @match *://*/*
    // @grant GM_xmlhttpRequest
    // @connect *
    // ==/UserScript==
    quote.depositAddress = 'invalid';
    GM_xmlhttpRequest({url: 'https://example.invalid'});
    new Function('return 1');
  `);
  assert.deepEqual(result.findings.map((item) => item.rule), ['scope', 'grant', 'connect', 'request', 'dynamic']);
  assert.ok(result.findings.every((item) => item.address === null));
});

test('caps input size and line count', () => {
  assert.match(analyze('a'.repeat(MAX_SOURCE_LENGTH + 1)).error, /60,000/);
  assert.match(analyze('a\n'.repeat(MAX_SOURCE_LINES)).error, /2,500/);
});

test('compiled transfers have the same payer and amount but different recipients', () => {
  const lifetime = { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 1n };
  function decode(destination) {
    const wire = getBase64Encoder().encode(createTransfer(destination, lifetime));
    const transaction = getTransactionDecoder().decode(wire);
    assert.deepEqual(Object.values(transaction.signatures), [null]);
    return getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
  }
  const expected = decode(EXPECTED);
  const observed = decode(REPLACEMENT);
  assert.deepEqual(expected.staticAccounts.slice(0, 2), [DEMO_PAYER, EXPECTED]);
  assert.deepEqual(observed.staticAccounts.slice(0, 2), [DEMO_PAYER, REPLACEMENT]);
  assert.deepEqual(expected.instructions, observed.instructions);
  assert.equal(isRecipient(DEMO_PAYER), false);
  assert.throws(() => createTransfer('invalid', lifetime), /valid Solana recipient/);
});

test('devnet simulation rejects invalid input before making a request', async () => {
  await assert.rejects(simulatePair(EXPECTED, 'invalid'), /Both recipients/);
});
