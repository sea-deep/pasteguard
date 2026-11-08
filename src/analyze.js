import { parse } from 'acorn';
import { simple } from 'acorn-walk';
import { isAddress } from '@solana/kit';
import { bech32, bech32m } from '@scure/base';

export const MAX_SOURCE_LENGTH = 60_000;
export const MAX_SOURCE_LINES = 2_500;
export const lineBreaks = /\r\n|[\n\r\u2028\u2029]/;
const recipientFields = /^(?:depositAddress|destinationAddress|recipient(?:Address)?|walletAddress|toAddress)$/i;
const browserObjects = /^(?:window|globalThis|unsafeWindow|self)$/;
const walletMethods = /^(?:eth_sendTransaction|eth_sign|personal_sign|eth_signTypedData(?:_v[134])?|signTransaction|signAllTransactions|signAndSendTransaction|signMessage)$/;
const secretFields = /(?:seed[-_ ]?phrase|secret[-_ ]?recovery[-_ ]?phrase|mnemonic|private[-_ ]?key)/i;

function propertyName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

function memberName(node) {
  if (node?.type !== 'MemberExpression') return null;
  return node.computed ? literalString(node.property) : propertyName(node.property);
}

function literalString(node, depth = 0) {
  if (!node || depth > 12) return null;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  if (node.type !== 'BinaryExpression' || node.operator !== '+') return null;
  const left = literalString(node.left, depth + 1);
  const right = literalString(node.right, depth + 1);
  return left === null || right === null ? null : left + right;
}

function field(object, key) {
  if (object?.type !== 'ObjectExpression') return null;
  return object.properties.find((prop) => prop.type === 'Property' && !prop.computed && propertyName(prop.key) === key)?.value;
}

function literalAddress(node) {
  const value = literalString(node);
  if (!value) return null;
  if (/^0x[0-9a-f]{40}$/i.test(value)) return { address: value, network: 'EVM' };
  if (/^(?:bc1|tb1)/i.test(value)) {
    for (const codec of [bech32, bech32m]) {
      const decoded = codec.decodeUnsafe(value);
      if (!decoded || !['bc', 'tb'].includes(decoded.prefix)) continue;
      const version = decoded.words[0];
      const bytes = codec.fromWordsUnsafe(decoded.words.slice(1));
      const valid = codec === bech32
        ? version === 0 && [20, 32].includes(bytes?.length)
        : version >= 1 && version <= 16 && bytes?.length >= 2 && bytes?.length <= 40;
      if (valid) return { address: value, network: 'Bitcoin' };
    }
  }
  return isAddress(value) ? { address: value, network: 'Solana' } : null;
}

export function analyze(source) {
  if (!source.trim()) return { findings: [], error: 'Paste a userscript or choose a sample.' };
  if (source.length > MAX_SOURCE_LENGTH) {
    return { findings: [], error: 'Source is over 60,000 characters. Scan a smaller excerpt.', rejected: true };
  }

  const lines = source.split(lineBreaks, MAX_SOURCE_LINES + 1);
  if (lines.length > MAX_SOURCE_LINES) {
    return { findings: [], error: 'Source is over 2,500 lines. Scan a smaller excerpt.', rejected: true };
  }

  const findings = [];
  const seen = new Set();
  function add(rule, line, title, detail, severity = 'review', destination = null) {
    const address = destination?.address ?? null;
    const network = destination?.network ?? null;
    const key = `${rule}:${line}:${address ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ rule, line, title, detail, severity, address, network });
  }

  const comments = [];
  let ast;
  let error = null;
  try {
    ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', locations: true, onComment: comments });
  } catch (firstError) {
    comments.length = 0;
    try {
      ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', locations: true, onComment: comments });
    } catch (parseError) {
      const line = parseError.loc?.line ?? firstError.loc?.line;
      error = line ? `JavaScript could not be parsed at line ${line}. Source analysis is incomplete.`
        : 'JavaScript could not be parsed. Source analysis is incomplete.';
    }
  }

  // Walk real JavaScript comment tokens where possible. For an incomplete source,
  // only read a conventional metadata header at the beginning of the pasted text.
  const firstLine = lines.findIndex((line) => line.trim());
  const lastLine = lines.findIndex((line, index) => index > firstLine && /^\s*\/\/\s*==\/UserScript==\s*$/.test(line));
  if (firstLine >= 0 && lastLine > firstLine && /^\s*\/\/\s*==UserScript==\s*$/.test(lines[firstLine])) {
    const commentLines = new Set(comments.filter((entry) => entry.type === 'Line').map((entry) => entry.loc.start.line));
    for (let index = firstLine + 1; index < lastLine; index++) {
      const match = lines[index].match(/^\s*\/\/\s*@(\S+)\s+(.*)$/);
      const line = index + 1;
      if (!match || (ast && !commentLines.has(line))) continue;
      const [, directive, value] = match;
      if (directive === 'require') {
        add('remote', line, 'External code dependency',
          'Tampermonkey can load this dependency before the script runs. Its contents were not inspected.', 'high');
      }
      if ((directive === 'match' || directive === 'include') &&
        /^(?:\*|<all_urls>|(?:\*|https?):\/\/\*\/\*)$/i.test(value.trim())) {
        add('scope', line, 'Broad website access', 'This pattern lets the userscript run on many unrelated websites.');
      }
      if (directive === 'connect' && value.trim() === '*') {
        add('connect', line, 'Unrestricted request destinations', 'The script declares permission to request arbitrary hosts.');
      }
      if (directive === 'grant' && /^(?:GM[_\.](?:xmlhttpRequest|xmlHttpRequest|setClipboard)|unsafeWindow)$/.test(value.trim())) {
        add('grant', line, 'Privileged browser access', `The script requests ${value.trim()}, which deserves a closer look.`);
      }
    }
  }

  if (ast) {
    try {
      simple(ast, {
        AssignmentExpression(node) {
          const { left, right, loc } = node;
          const name = memberName(left);
          const line = loc.start.line;
          const fetchHook = name === 'fetch' && browserObjects.test(propertyName(left.object) ?? '');
          const xhrHook = ['open', 'send'].includes(name) && memberName(left.object) === 'prototype' &&
            propertyName(left.object.object) === 'XMLHttpRequest';
          if (fetchHook || xhrHook) {
            add('hook', line, 'Network request hook', 'This assignment replaces a browser network function and can alter what a page sees.');
          }
          const address = literalAddress(right);
          if (name && recipientFields.test(name) && address && node.operator === '=') {
            add('recipient', line, 'Payment field overwritten',
              `This assignment sets ${name} to a hard-coded ${address.network} address.`, 'high', address);
          }
        },
        CallExpression(node) {
          const { callee, arguments: args, loc } = node;
          const name = propertyName(callee) ?? memberName(callee);
          const line = loc.start.line;
          if (name === 'eval' || name === 'Function') {
            add('dynamic', line, 'Dynamic code execution', 'The code passed to this call may be determined at runtime.');
          }
          if (name === 'GM_setClipboard' || name === 'setClipboard' ||
            (name === 'writeText' && memberName(callee.object) === 'clipboard')) {
            const address = literalAddress(args[0]);
            add('clipboard', line, address ? 'Wallet address written to clipboard' : 'Clipboard write',
              address ? `This call copies a hard-coded ${address.network} address.` : 'The script can replace text on the clipboard.',
              address ? 'high' : 'review', address);
          }
          const walletMethod = name === 'request'
            ? literalString(field(args[0], 'method'))
            : name;
          if (walletMethods.test(walletMethod ?? '')) {
            const params = field(args[0], 'params');
            const recipient = params?.type === 'ArrayExpression'
              ? literalAddress(field(params.elements[0], 'to'))
              : null;
            add('wallet', line, recipient ? 'Wallet request with a fixed recipient' : 'Wallet signature or payment request',
              recipient ? `${walletMethod} includes a hard-coded ${recipient.network} destination.`
                : `${walletMethod} can ask a wallet for a signature or transaction.`, 'high', recipient);
          }
          if (['querySelector', 'getElementById', 'querySelectorAll'].includes(name) &&
            secretFields.test(literalString(args[0]) ?? '')) {
            add('secret', line, 'Wallet recovery field access',
              'The selector targets a field named like a recovery phrase or private key.', 'high');
          }
          if (name === 'fetch' && /^https?:\/\//i.test(literalString(args[0]) ?? '') &&
            literalString(field(args[1], 'method'))?.toUpperCase() === 'POST') {
            add('post', line, 'Data posted to a fixed endpoint', 'Review the destination and the data this request sends.');
          }
          if (name === 'GM_xmlhttpRequest' || (name === 'xmlHttpRequest' && propertyName(callee.object) === 'GM')) {
            add('request', line, 'Privileged network request', 'This call can make a cross-origin request using userscript permissions.');
          }
        },
        NewExpression(node) {
          if (propertyName(node.callee) === 'Function') {
            add('dynamic', node.loc.start.line, 'Dynamic code execution', 'The code passed to this constructor may be determined at runtime.');
          }
        },
      });
    } catch {
      error = 'This source exceeds the scanner’s syntax complexity limit. Findings are incomplete.';
    }
  }

  findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule));
  return { findings, error };
}
