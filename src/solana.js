import {
  address,
  appendTransactionMessageInstruction,
  compileTransaction,
  createNoopSigner,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  isAddress,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
} from '@solana/kit';
import { getTransferSolInstruction } from '@solana-program/system';

const RPC = 'https://api.devnet.solana.com';
export const AMOUNT = 10_000_000n;
// A publicly visible, funded devnet account used only as a hypothetical fee payer.
// The app has no key for this account. Simulations bypass signature verification.
export const DEMO_PAYER = 'AVm1wwtnLtsdJSpgz8S2SfC4JDepipEwBpLYuHgQ25Yb';

export function isRecipient(value) {
  return value !== DEMO_PAYER && isAddress(value);
}

export function createTransfer(destination, lifetime) {
  if (!isRecipient(destination)) throw new Error('Enter a valid Solana recipient other than the demo payer.');
  const source = createNoopSigner(address(DEMO_PAYER));
  const instruction = getTransferSolInstruction({
    source,
    destination: address(destination),
    amount: AMOUNT,
  });
  let message = createTransactionMessage({ version: 0 });
  message = setTransactionMessageFeePayer(source.address, message);
  message = setTransactionMessageLifetimeUsingBlockhash(lifetime, message);
  message = appendTransactionMessageInstruction(instruction, message);
  return getBase64EncodedWireTransaction(compileTransaction(message));
}

async function rpc(method, params, signal) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method, params }),
    signal,
  });
  if (!response.ok) throw new Error(`Devnet RPC returned HTTP ${response.status}.`);
  const data = await response.json();
  if (data.error) throw new Error(data.error.message ?? 'Devnet RPC returned an error.');
  if (!data.result) throw new Error('Devnet RPC returned an empty response.');
  return data.result;
}

export async function simulatePair(expected, observed, signal = AbortSignal.timeout(15_000)) {
  if (!isRecipient(expected) || !isRecipient(observed)) {
    throw new Error('Both recipients must be valid Solana addresses.');
  }
  const blockhash = await rpc('getLatestBlockhash', [{ commitment: 'confirmed' }], signal);

  async function simulate(destination) {
    const transaction = createTransfer(destination, blockhash.value);
    const { context, value } = await rpc('simulateTransaction', [
      transaction,
      {
        encoding: 'base64',
        commitment: 'confirmed',
        sigVerify: false,
        accounts: { encoding: 'base64', addresses: [destination] },
      },
    ], signal);
    if (value.err) throw new Error(`Transfer simulation failed (${JSON.stringify(value.err)}).`);
    // These native SOL messages have exactly two keys, payer then recipient.
    const before = value.preBalances?.[1];
    const after = value.postBalances?.[1];
    const received = Number.isSafeInteger(before) && Number.isSafeInteger(after)
      ? after - before
      : null;
    return { destination, slot: context.slot, received, units: value.unitsConsumed };
  }

  return Promise.all([simulate(expected), simulate(observed)]);
}
