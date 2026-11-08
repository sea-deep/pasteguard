import { cp, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const project = fileURLToPath(new URL('..', import.meta.url));
const output = join(project, 'dist-extension');
const archive = join(project, 'artifacts', 'pasteguard-chrome.zip');

await rm(output, { recursive: true, force: true });
await mkdir(join(project, 'artifacts'), { recursive: true });
await cp(join(project, 'dist'), output, {
  recursive: true,
  filter: (source) => !source.endsWith('/demo') && !source.endsWith('/downloads'),
});
await cp(join(project, 'extension'), output, { recursive: true });
await rm(archive, { force: true });
execFileSync('zip', ['-qr', archive, '.'], { cwd: output });
console.log(`Unpacked extension: ${output}`);
console.log(`Chrome extension ZIP: ${archive}`);
