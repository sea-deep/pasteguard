import '@fontsource-variable/outfit/wght.css';
import { ArrowDown, ArrowUpRight, BadgePercent, ClipboardCopy, createIcons, Download, ExternalLink, KeyRound, ShieldCheck, Terminal } from 'lucide';
import '@fontsource-variable/dm-sans/wght.css';
import '@fontsource-variable/jetbrains-mono/wght.css';
import './style.css';
import { analyze, lineBreaks, MAX_SOURCE_LINES } from './analyze.js';
import { EXPECTED, SAMPLES } from './fixtures.js';
import { isRecipient, simulatePair } from './solana.js';
import { moveMascot } from './mascot.js';

createIcons({ icons: { ArrowDown, ArrowUpRight, BadgePercent, ClipboardCopy, Download, ExternalLink, KeyRound, ShieldCheck, Terminal } });

const $ = (id) => document.getElementById(id);
const source = $('source');
const codeList = $('code-list');
const findingsList = $('findings');
const expected = $('expected');
const observed = $('observed');
const simulate = $('simulate');
const simulateLabel = $('simulate-label');
const wrapButton = $('wrap-source');
const narrowCode = matchMedia('(max-width: 690px)');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let sample = 'scam';
let editing = false;
let findings = [];
let candidates = [];
let simulationController;
let scanResult;
let customDraft = { source: '', expected: '' };
let wrapOverride;

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function chooseSource(name) {
  if (sample === 'custom') customDraft = { source: source.value, expected: expected.value };
  sample = name;
  document.querySelectorAll('[data-sample]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.sample === name));
  });
  $('paste-source').setAttribute('aria-pressed', String(name === 'custom'));
  $('file-name').textContent = SAMPLES[name]?.name ?? 'pasted-script.user.js';
  source.value = SAMPLES[name]?.source ?? customDraft.source;
  expected.value = name === 'custom' ? customDraft.expected : ['scam', 'clipboard'].includes(name) ? EXPECTED : '';
  $('expected-tag').textContent = name !== 'custom' && expected.value ? 'Demo baseline' : 'Your baseline';
  if (name === 'custom') {
    scanResult = undefined;
    $('export-report').disabled = true;
    findings = [];
    candidates = [];
    updateFindings(source.value.trim() ? 'Draft restored. Scan it to see the findings.' : 'Paste a script to get started.');
    updateCandidates();
    setEditing(true, true);
  } else {
    scan();
  }
}

function setEditing(active, focus = false) {
  editing = active;
  source.hidden = !active;
  codeList.hidden = active;
  $('edit-source').hidden = active;
  wrapButton.hidden = active;
  $('source-hint').textContent = active ? 'Ctrl / ⌘ + Enter to scan' : 'Pasted code stays here.';
  if (focus) source.focus();
}

function updateFindings(status) {
  $('scan-status').textContent = status;
  $('finding-count').textContent = scanResult ? String(findings.length).padStart(2, '0') : '—';
  $('compare-recipient').hidden = !findings.some((finding) => finding.network === 'Solana' && finding.address);
  const rows = findings.map((finding, index) => {
    const row = node('li');
    const button = node('button', `finding ${finding.severity}`);
    button.type = 'button';
    button.dataset.finding = String(index);
    button.setAttribute('aria-pressed', 'false');
    const meta = node('span', 'finding-meta', `Line ${finding.line}`);
    const heading = node('strong', 'finding-title', finding.title);
    const detail = node('span', 'finding-detail', finding.detail);
    button.append(meta, heading, detail);
    button.addEventListener('click', () => selectFinding(index, true));
    row.append(button);
    return row;
  });
  findingsList.replaceChildren(...rows);
}

function renderCode() {
  const highlights = new Set(findings.map((finding) => finding.line));
  const fragment = document.createDocumentFragment();
  for (const [index, text] of source.value.split(lineBreaks, MAX_SOURCE_LINES).entries()) {
    const line = index + 1;
    const row = node('div', `code-line${highlights.has(line) ? ' flagged' : ''}`);
    row.dataset.line = String(line);
    const label = node('span', 'line-no', String(line));
    label.setAttribute('aria-hidden', 'true');
    const content = node('code', text.trim().startsWith('//') ? 'comment' : '', text || ' ');
    row.append(label, content);
    fragment.append(row);
  }
  codeList.replaceChildren(fragment);
  codeList.scrollTop = 0;
  codeList.scrollLeft = 0;
}

function selectFinding(index, scroll) {
  const line = findings[index]?.line;
  if (!line || editing) return;
  findingsList.querySelectorAll('[data-finding]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.finding) === index));
  });
  codeList.querySelector('.selected-line')?.classList.remove('selected-line');
  const active = codeList.querySelector(`[data-line="${line}"]`);
  if (!active) return;
  active.classList.add('selected-line');
  if (scroll) {
    codeList.scrollTo({
      top: Math.max(0, active.offsetTop - codeList.clientHeight / 2),
      left: 0,
      behavior: reducedMotion.matches ? 'instant' : 'smooth',
    });
    const bounds = codeList.getBoundingClientRect();
    if (narrowCode.matches && (bounds.bottom < 100 || bounds.top > innerHeight - 100)) {
      codeList.focus({ preventScroll: true });
      codeList.scrollIntoView({ block: 'center', behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    }
    if (findings[index].address && observed.value !== findings[index].address) {
      observed.value = findings[index].address;
      updateTransfer();
    }
  }
}

function scan() {
  if (!source.value.trim()) {
    scanResult = undefined;
    $('export-report').disabled = true;
    findings = [];
    candidates = [];
    updateFindings('Paste a userscript or choose a sample.');
    updateCandidates();
    setEditing(true, true);
    return;
  }
  const focusWasEditor = document.activeElement === source;
  const result = analyze(source.value);
  scanResult = result.rejected ? undefined : result;
  $('export-report').disabled = !scanResult;
  findings = result.findings;
  candidates = [...new Map(findings.filter((item) => item.address).map((item) => [item.address, item])).values()];
  const status = result.error || (findings.length
    ? 'Select a finding to see the matching line.'
    : 'No configured rules matched this source.');
  updateFindings(status);
  if (result.rejected) {
    updateCandidates();
    setEditing(true, true);
    return;
  }
  renderCode();
  setEditing(false);
  if (focusWasEditor) codeList.focus();
  updateCandidates();
  selectFinding(Math.max(0, findings.findIndex((finding) => finding.address)), false);
}

function updateCandidates() {
  if (candidates.length) {
    observed.replaceChildren(...candidates.map((candidate) => new Option(candidate.address, candidate.address)));
  } else {
    observed.replaceChildren(new Option('No recipient found', ''));
  }
  observed.hidden = candidates.length < 2;
  observed.disabled = observed.hidden;
  const fixedAddress = $('observed-address');
  fixedAddress.hidden = !observed.hidden;
  fixedAddress.textContent = candidates[0]?.address ?? 'No recipient found';
  $('observed-label').htmlFor = observed.hidden ? 'observed-address' : 'observed';
  updateTransfer();
}

function updateTransfer() {
  simulationController?.abort();
  simulationController = undefined;
  $('expected-result').hidden = true;
  $('observed-result').hidden = true;
  const base = expected.value.trim();
  const target = observed.value;
  const evidence = candidates.find((item) => item.address === target);
  $('observed-help').textContent = evidence
    ? `Line ${evidence.line} · ${evidence.network} · ${evidence.title}`
    : 'The scan found no hard-coded Solana recipient.';
  const status = $('transfer-status');
  const ready = isRecipient(base) && evidence?.network === 'Solana' && isRecipient(target);
  simulate.disabled = !ready;
  simulateLabel.textContent = 'Simulate both transfers';
  status.className = '';
  if (evidence?.network && evidence.network !== 'Solana') {
    status.textContent = `${evidence.network} address detected. The live comparison supports Solana transfers.`;
  } else if (base && !isRecipient(base)) {
    status.textContent = 'Enter a valid Solana recipient.';
    status.className = 'warn';
  } else if (ready && base !== target) {
    status.textContent = 'Recipient mismatch';
    status.className = 'warn';
  } else if (ready) {
    status.textContent = 'Addresses match';
  } else {
    status.textContent = 'A valid address is needed on both sides.';
  }
}

function showResult(id, result) {
  const output = $(id);
  const amount = result.received === null
    ? 'Balance delta unavailable'
    : `+${(result.received / 1e9).toFixed(2)} SOL`;
  output.replaceChildren(node('strong', '', amount), node('span', '', `Simulated at slot ${result.slot.toLocaleString('en-US')}`));
  output.hidden = false;
}

async function runSimulation() {
  const base = expected.value.trim();
  const target = observed.value;
  if (simulate.disabled || !isRecipient(base) || !isRecipient(target)) return;
  moveMascot('transfer');
  const controller = new AbortController();
  simulationController = controller;
  const status = $('transfer-status');
  const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
  simulate.disabled = true;
  $('expected-result').hidden = true;
  $('observed-result').hidden = true;
  status.className = '';
  simulateLabel.textContent = 'Simulating…';
  status.textContent = 'Waiting for Solana devnet…';
  try {
    const [before, after] = await simulatePair(base, target, signal);
    if (simulationController !== controller) return;
    showResult('expected-result', before);
    showResult('observed-result', after);
    status.className = base === target ? '' : 'warn';
    status.textContent = before.received === null || after.received === null
      ? 'Simulated · Devnet omitted one or both balance changes'
      : base === target
        ? 'Simulated · Both transfers credit the same wallet'
        : 'Simulated · Same amount, different wallets';
  } catch (error) {
    if (simulationController !== controller) return;
    status.className = 'warn';
    const message = error.name === 'TimeoutError' ? 'Devnet timed out.' : error.message;
    status.textContent = `Simulation unavailable. ${message} You can still compare the addresses or retry.`;
  } finally {
    if (simulationController === controller) {
      simulate.disabled = false;
      simulateLabel.textContent = 'Simulate both transfers';
      simulationController = undefined;
    }
  }
}

async function exportReport() {
  if (!scanResult) return;
  const result = scanResult;
  const bytes = new TextEncoder().encode(source.value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const report = { tool: 'PasteGuard', sourceSha256: sha256, ...result };
  const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  const link = node('a');
  link.href = url;
  link.download = 'pasteguard-findings.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

$('export-report').addEventListener('click', () => {
  void exportReport().catch(() => {
    $('scan-status').textContent = 'The browser could not export the report. Try again over HTTPS.';
  });
});

$('scan').addEventListener('click', () => {
  scan();
  moveMascot('workbench');
});
function syncWrap() {
  const wrapped = wrapOverride ?? narrowCode.matches;
  codeList.dataset.wrap = String(wrapped);
  wrapButton.setAttribute('aria-pressed', String(wrapped));
}

wrapButton.addEventListener('click', () => {
  wrapOverride = codeList.dataset.wrap !== 'true';
  syncWrap();
  const active = codeList.querySelector('.selected-line');
  if (active) codeList.scrollTop = Math.max(0, active.offsetTop - codeList.clientHeight / 2);
});

narrowCode.addEventListener('change', syncWrap);
syncWrap();

$('edit-source').addEventListener('click', () => setEditing(true, true));
$('paste-source').addEventListener('click', () => chooseSource('custom'));
document.querySelectorAll('[data-sample]').forEach((button) => {
  button.addEventListener('click', () => chooseSource(button.dataset.sample));
});
source.addEventListener('input', () => {
  if (sample !== 'custom') {
    sample = 'custom';
    $('file-name').textContent = 'pasted-script.user.js';
    document.querySelectorAll('[data-sample]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
    $('paste-source').setAttribute('aria-pressed', 'true');
    if (expected.value === EXPECTED) expected.value = '';
    $('expected-tag').textContent = 'Your baseline';
  }
  if (findings.length || candidates.length || $('scan-status').textContent !== 'Source changed. Scan to refresh the findings.') {
    scanResult = undefined;
    $('export-report').disabled = true;
    findings = [];
    candidates = [];
    updateFindings('Source changed. Scan to refresh the findings.');
    updateCandidates();
  }
});
source.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    scan();
  }
});
expected.addEventListener('input', () => {
  $('expected-tag').textContent = expected.value === EXPECTED && ['scam', 'clipboard'].includes(sample)
    ? 'Demo baseline'
    : 'Your baseline';
  updateTransfer();
});
observed.addEventListener('change', updateTransfer);
simulate.addEventListener('click', runSimulation);

document.querySelectorAll('[data-case]').forEach((button) => {
  button.addEventListener('click', () => {
    chooseSource(button.dataset.case);
    $('workbench').scrollIntoView({ block: 'start', behavior: 'instant' });
    $('bench-title').setAttribute('tabindex', '-1');
    $('bench-title').focus({ preventScroll: true });
    moveMascot('workbench');
  });
});

chooseSource('scam');

async function loadExtensionCapture() {
  const session = globalThis.chrome?.storage?.session;
  const capture = new URLSearchParams(location.search).get('capture');
  if (!session || !/^capture-[a-f0-9-]{36}$/.test(capture ?? '')) return;
  try {
    const result = await session.get(capture);
    await session.remove(capture);
    const selection = result[capture];
    chooseSource('custom');
    if (!selection?.source) return;
    source.value = selection.source;
    $('file-name').textContent = 'selected-script.user.js';
    scan();
    if (selection.truncated) {
      const warning = 'The browser selection exceeded 60,000 characters. Results cover only the captured excerpt.';
      $('scan-status').textContent = warning;
      if (scanResult) scanResult = { ...scanResult, error: [scanResult.error, warning].filter(Boolean).join(' ') };
    }
  } catch {
    chooseSource('custom');
    $('scan-status').textContent = 'The browser selection could not be loaded. Paste the source here.';
  } finally {
    history.replaceState(null, '', location.pathname);
  }
}

void loadExtensionCapture();
