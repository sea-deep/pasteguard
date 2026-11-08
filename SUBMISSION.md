# PasteGuard · MLH Solana Hackathon

**Tagline**  
Spot the wallet swap hiding in a “free crypto” userscript before you install it.

**About the project**  
A real campaign advertised a 25% exchange bonus in Pastebin comments. The Tampermonkey script replaced a swap deposit address and showed a fake bonus. PasteGuard lets you inspect a script locally before granting it browser access. It highlights source lines that load external dependencies, hook network requests, rewrite payment addresses, read recovery fields, or ask a wallet to sign.

The Solana demo turns the suspicious address into something you can verify. The app constructs two unsigned native SOL transactions with the same amount and different recipients, simulates both against devnet, and displays which wallet would receive the funds. The app also includes a four-campaign case library with attributed screenshots and downloadable findings and an unpacked Chrome extension that scans selected code from paste sites.

**Built with**  
JavaScript, Vite, Acorn, Solana Kit, Solana Devnet RPC, Chrome Manifest V3, Lucide

**Links**

- [Live app](https://sea-deep.github.io/pasteguard/)
- [Public source](https://github.com/sea-deep/pasteguard)
- [Public demo video](https://sea-deep.github.io/pasteguard/demo/)
- [Chrome extension](https://github.com/sea-deep/pasteguard/releases/latest/download/pasteguard-chrome.zip)

**Categories**  
DeFi and Top 3 Overall. Add Best Beginner only if your team meets MLH's eligibility rules.

**Generative AI disclosure**  
OpenAI Codex assisted with research, software implementation, testing, and demo preparation. The video uses synthesized narration. PasteGuard's runtime uses deterministic static analysis and Solana devnet RPC.
