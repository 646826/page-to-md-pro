import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
let browser;
before(async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
  browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });
async function extract(text, block = false) {
  const page = await browser.newPage();
  try {
    await page.setContent('<html><head><title>Code fidelity</title></head><body><main><p id="example">Before <code id="code"></code> After</p></main></body></html>');
    await page.evaluate(({ text, block }) => {
      const code = document.getElementById('code');
      code.textContent = text;
      if (block) {
        const pre = document.createElement('pre'); pre.append(code);
        document.getElementById('example').replaceWith(pre);
      }
      window.chrome = { runtime: { onMessage: { addListener(fn) { window.__listener = fn; } } } };
    }, { text, block });
    await page.addScriptTag({ path: fileURLToPath(new URL('../lib/Readability.js', import.meta.url)) });
    await page.addScriptTag({ path: fileURLToPath(new URL('../src/content.js', import.meta.url)) });
    const result = await page.evaluate(() => new Promise(resolve => window.__listener({
      type: 'page-to-md-extract', requestId: 'code-fixture', payload: { mode: 'full', options: {
        includeFrontMatter: false, includeSourceLink: false, prependTitleHeadingIfMissing: false,
      } },
    }, null, resolve)));
    assert.equal(result.ok, true, JSON.stringify(result.error));
    return result.result.markdown;
  } finally { await page.close(); }
}
for (const [name, input, expected] of [
  ['ordinary code', 'hello', '`hello`'],
  ['internal spaces', 'a   b', '`a   b`'],
  ['both boundary spaces', '  a  ', '`   a   `'],
  ['leading space', ' a', '` a`'],
  ['trailing space', 'a ', '`a `'],
  ['spaces only', '   ', '`   `'],
  ['tabs', 'a\tb', '`a\tb`'],
  ['literal backticks', '`a``b`', '``` `a``b` ```'],
  ['line endings', 'a\r\nb\nc', '`a b c`'],
  ['Unicode and literal HTML', 'привет  <b>x</b>', '`привет  <b>x</b>`'],
]) {
  test(`inline code preserves ${name}`, async () => {
    assert.ok((await extract(input)).includes(`Before ${expected} After`));
  });
}
for (const block of [false, true]) {
  test(`${block ? 'block' : 'inline'} code with many backtick runs does not exceed the argument limit`, async () => {
    const input = 'x`'.repeat(160000);
    const markdown = await extract(input, block);
    assert.ok(markdown.includes(input));
    assert.ok(markdown.includes(block ? '```\n' : 'Before `` '));
  });
}
