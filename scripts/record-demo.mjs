import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const output = resolve('artifacts');
const temp = await mkdtemp(join(tmpdir(), 'pasteguard-recording-'));
await mkdir(output, { recursive: true });

const scenes = [
  [
    'This is PasteGuard for the MLH Solana Hackathon.',
    'A Pastebin post promised a twenty-five percent swap bonus.',
    'The script changed where victims sent their money.',
  ],
  [
    'PasteGuard scans the source on your device.',
    'It points to the remote dependency, the network hook, and the line that overwrites the deposit wallet.',
    'You can inspect each line before giving a script access.',
  ],
  [
    'Here is where the money would go. The transfers use the same amount.',
    'Solana devnet simulates both and shows a point zero one SOL credit to two different wallets.',
    'Neither transfer is signed or broadcast.',
  ],
  [
    'The case files include the original Pastebin lure, a fake Solana sniper, an AI arbitrage compiler, and a fake wallet recovery prompt.',
    'The screenshots are real. The scripts in the workbench are harmless reconstructions.',
  ],
  [
    'In Chrome, select suspicious code on a paste site and choose Inspect selected source with PasteGuard.',
    'You can also paste it into the web app and download the findings.',
  ],
];

const audio = scenes.map((lines, index) => {
  const path = join(temp, `narration-${index}.aiff`);
  execFileSync('say', ['-v', 'Daniel', '-r', '174', '-o', path, lines.join(' ')]);
  const duration = Number(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path,
  ]).toString().trim()) * 1000;
  return { path, duration, lines };
});

const viewport = { width: 1440, height: 1000 };
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  headless: true,
});
const context = await browser.newContext({ viewport, recordVideo: { dir: temp, size: viewport } });
const zero = performance.now();
const page = await context.newPage();
const recordings = [];

async function hold(milliseconds) {
  if (milliseconds > 0) await page.waitForTimeout(milliseconds);
}

async function scene(index, steps = []) {
  const clip = audio[index];
  const start = performance.now();
  recordings.push({ ...clip, offset: Math.round(start - zero) });
  for (const [after, action] of steps) {
    await hold(after - (performance.now() - start));
    await action();
  }
  await hold(clip.duration + 400 - (performance.now() - start));
}

async function show(section) {
  await page.locator(section).evaluate((element) => element.scrollIntoView({ behavior: 'instant', block: 'start' }));
  await hold(280);
}

try {
  await page.goto(process.env.APP_URL || 'http://127.0.0.1:4174/');
  await page.evaluate(() => document.fonts.ready);
  await scene(0);
  await show('#workbench');
  await scene(1, [
    [2500, () => page.getByRole('button', { name: /External code dependency/ }).click()],
    [5100, () => page.getByRole('button', { name: /Network request hook/ }).click()],
    [7900, () => page.getByRole('button', { name: /Payment field overwritten/ }).click()],
  ]);
  await show('#transfer');
  await scene(2, [
    [2800, () => page.getByRole('button', { name: 'Simulate both transfers' }).click()],
    [5000, () => page.waitForFunction(() => document.querySelector('#transfer-status').textContent.startsWith('Simulated'), null, { timeout: 14_000 })],
  ]);
  await show('#case-notes');
  await scene(3, [[2500, () => page.getByText('See the Pastebin lure', { exact: true }).click()]]);
  await page.getByText('See the Pastebin lure', { exact: true }).click();
  await show('#extension');
  await scene(4);
  const video = page.video();
  await context.close();
  const webm = await video.path();

  const input = recordings.flatMap(({ path }) => ['-i', path]);
  const filters = recordings.map(({ offset }, index) => `[${index + 1}:a]adelay=${offset}:all=1[a${index}]`);
  filters.push(`${recordings.map((_, index) => `[a${index}]`).join('')}amix=inputs=${recordings.length}:normalize=0,apad[audio]`);
  const mp4 = join(output, 'pasteguard-demo.mp4');
  execFileSync('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-i', webm, ...input,
    '-filter_complex', filters.join(';'), '-map', '0:v:0', '-map', '[audio]',
    '-c:v', 'libx264', '-crf', '21', '-preset', 'fast', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart', '-shortest', mp4,
  ], { stdio: 'inherit' });

  const timestamp = (ms) => new Date(Math.round(ms)).toISOString().slice(11, 23);
  const captions = recordings.flatMap(({ offset, duration, lines }) => {
    let start = offset;
    const characters = lines.join('').length;
    return lines.map((line) => {
      const end = start + duration * line.length / characters;
      const caption = `${timestamp(start)} --> ${timestamp(end)}\n${line}`;
      start = end;
      return caption;
    });
  });
  await writeFile(join(output, 'pasteguard-demo.vtt'), `WEBVTT\n\n${captions.join('\n\n')}\n`);
  console.log(mp4);
} finally {
  await browser.close();
  await rm(temp, { recursive: true, force: true });
}
