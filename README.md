# PasteGuard

PasteGuard inspects Tampermonkey userscripts before installation. It highlights the lines that request browser privileges, load external code, or manipulate payments, then lets you compare where two Solana transfers would land. We built it in one day as a hackathon prototype.

- [Live workbench](https://sea-deep.github.io/pasteguard/)
- [Demo video](https://sea-deep.github.io/pasteguard/demo/)
- [Chrome extension ZIP](https://github.com/sea-deep/pasteguard/releases/latest/download/pasteguard-chrome.zip)
- [MLH submission copy](SUBMISSION.md)

## Try the demo

1. Open the workbench with **Scam example** selected. Click a finding to locate the matching source line.
2. Under **Follow the payment**, choose **Simulate both transfers**. Solana devnet simulates two independent 0.01 SOL payments. The amount is identical and the recipient differs.
3. Open **The scam files** to inspect the Pastebin lure and three other documented cases. Choose **Inspect example** to load its sanitized source.
4. Choose **Benign example** or **Paste your own** to try another script. Custom drafts stay in the tab while you switch examples.

## Chrome extension

Download and unzip the release ZIP. Open `chrome://extensions`, turn on **Developer mode**, select **Load unpacked**, and choose the folder containing `manifest.json`. On a supported paste or code-sharing page, select the script and choose **Inspect selected source with PasteGuard** from the right-click menu. The toolbar button opens the workbench directly.

The extension uses Chrome's context-menu and session-storage APIs to move only the selected text into the extension page. It requests the Solana devnet origin for the simulation. It uses no content scripts.

## Run locally

Requires Node.js 22.12+.

```sh
npm ci
npm run dev
npm test
npm run build
npm run extension
```

`npm run extension` writes `dist-extension/` and `artifacts/pasteguard-chrome.zip`.

Browser verification uses Playwright. Run `npx playwright install chromium`, then `npm run preview -- --port 4174` and `node scripts/verify-browser.mjs`. After packaging the extension, run `node scripts/verify-extension.mjs`.

## How it works

- **Source evidence.** Acorn parses pasted JavaScript as text. Rules inspect userscript metadata, network hooks, privileged requests, clipboard writes, wallet-signing methods, recovery-field selectors, and hard-coded recipient assignments. Each finding points to a line. The downloadable JSON report includes a SHA-256 fingerprint and findings without the original script. Static literals and simple split strings can be recognized as Solana, EVM-format, or Bech32/Bech32m Bitcoin addresses.
- **Payment evidence.** Solana Kit builds native SOL transfer messages. The app sends unsigned messages to the public devnet simulation endpoint only when requested. The simulation uses a public devnet account as a hypothetical payer with signature verification disabled. The app has no private key, and broadcasts nothing.
- **Limits.** This is a heuristic static scanner. Runtime-computed addresses, indirect data flow, and remote dependencies may require manual review. A clean scan provides no safety guarantee. Campaign screenshots document real attacks, while the example code is a sanitized reconstruction.

## Campaign evidence

- Cisco Talos, [ClickFix moves into the browser](https://blog.talosintelligence.com/clickfix-moves-into-the-browser/). Figures 4 and 12 supply the redacted Pastebin lure and the injected bonus screen.
- Check Point Research, [From Stars to Upvotes](https://research.checkpoint.com/2026/from-stars-to-upvotes-fake-reputation-fueling-a-crypto-clipboard-hijacker/). Figure 1 shows the fake Solana sniper landing page.
- TRM Labs, [Fake AI Trading Bots Are Getting Victims to Build Their Own Drainers](https://www.trmlabs.com/resources/blog/fake-ai-trading-bots-are-getting-victims-to-build-their-own-drainers). Figure 1 shows a tutorial with a fake compiler and a wallet prompt.

- Kaspersky Securelist, [FakeWallet crypto stealer](https://securelist.com/fakewallet-cryptostealer-ios-app-store/119474/). The recovery prompt shows how a fake wallet asked victims for their seed phrase.

The demo is narrated with ElevenLabs. Campaign screenshots are credited to their respective publishers and are excluded from the project code license. Geist Serif, Sans, Mono, and Pixel are bundled locally from Vercel’s Geist package. Interface icons use Lucide.
