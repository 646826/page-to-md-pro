import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const excluded = new Set(['.git', 'node_modules']);
const files = [];
const disallowedControlCharacter = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute);
    else if (/\.(?:js|mjs)$/i.test(entry.name)) files.push(absolute);
  }
}

await walk(root);
files.sort();
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const match = disallowedControlCharacter.exec(source);
  if (match) {
    const line = source.slice(0, match.index).split('\n').length;
    const codePoint = match[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    console.error(`${path.relative(root, file)}:${line}: disallowed control character U+${codePoint}`);
    process.exit(1);
  }

  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    process.exit(result.status || 1);
  }
}
console.log(`Syntax and control-byte checks passed for ${files.length} JavaScript files.`);
