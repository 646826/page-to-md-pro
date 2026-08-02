import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const defaultOptions = {
  includeFrontMatter: true,
  prependTitleHeadingIfMissing: true,
  includeSourceLink: true,
  includeImages: true,
  stripTrackingParams: true,
  tableMode: 'smart'
};
const fixtures = [
  {
    file: 'fixture-article.html', mode: 'auto',
    checks: ['# Fixture Article', '[internal link](https://example.test/docs/link)', '> [!NOTE]', '```javascript', '![Example image](https://example.test/images/example.png)', '- First item'],
    rejects: ['utm_source='],
    duplicateRequest: true,
    replayRequest: true,
    expectedObserverCount: 2
  },
  {
    file: 'fixture-rendering-regressions.html', mode: 'full',
    options: { includeFrontMatter: false, includeSourceLink: false },
    checks: [
      'First line<br>\nSecond line',
      '```javascript\nconst nested = true;\n```'
    ],
    rejects: [
      '<br-',
      'l\n```javascript\nconst nested = true;'
    ]
  },
  {
    file: 'fixture-lists.html', mode: 'full',
    options: { includeFrontMatter: false, includeSourceLink: false },
    checks: [
      '0. Zero\n1. One',
      '-2. Negative two\n-1. Negative one',
      '3. Default three\n7. Reset seven\n6. Then six',
      '10. Ten first line\n\n    Ten continuation\n    - Nested bullet\n11. Eleven'
    ],
    rejects: [
      '1. Zero',
      '1. Default three\n2. Reset seven',
      '10. Ten first line\n\n  Ten continuation',
      '\n  - Nested bullet'
    ]
  },
  {
    file: 'fixture-tables.html', mode: 'main', options: { includeFrontMatter: false, includeSourceLink: false },
    checks: ['| Name | Value |', '| Alpha | 42 |', '| Metric | Reading |\n| --- | --- |\n| Gamma | 7 |', '![A](https://example.test/a.png)', '[Click here](https://example.test/cta)']
  },
  {
    file: 'fixture-math.html', mode: 'main', options: { includeFrontMatter: false, includeSourceLink: false },
    checks: ['$a^2+b^2=c^2$', '$$', '\\int_0^1 x^2 dx', '> **Expanded idea**']
  },
  {
    file: 'fixture-modern-web.html', mode: 'full',
    checks: ['title: "Structured Modern Fixture"', 'author: "json-ld-author"', '- [x] Completed task', '- [ ] Pending task', '- Parent item', '- [x] Nested completed', '## Shadow section', 'Shadow body content.', 'Slotted content', 'Default slotted content', 'Nested slotted content', '![Lazy modern image](https://example.test/assets/lazy-modern.png)', '![Noscript image](https://example.test/assets/noscript.png)', '[Watch video](https://example.test/media/demo.mp4)', 'Delayed content captured after DOM settling.'],
    counts: { 'Default slotted content': 1, 'Nested slotted content': 1, 'https://example.test/assets/noscript.png': 1 },
    rejects: ['Unassigned hidden light content']
  },
  {
    file: 'fixture-selection-media.html', mode: 'selection', options: { includeFrontMatter: false, includeSourceLink: false },
    checks: ['![Selected image](https://example.test/selected.png)'],
    rejects: ['Whole page content must not be exported', 'Outside selection text.']
  },
  {
    file: 'fixture-large-dom.html', mode: 'full', options: { includeFrontMatter: false, includeSourceLink: false },
    checks: ['Large DOM fixture remains extractable.']
  },
  {
    file: 'fixture-large-selection.html', mode: 'selection', options: { includeFrontMatter: false, includeSourceLink: false },
    checks: ['Only this selected text should be exported.'],
    rejects: ['DOM_TOO_LARGE', 'Whole document fallback']
  },
  {
    file: 'fixture-base-url.html', mode: 'full', options: { includeFrontMatter: false, includeSourceLink: false },
    checks: [
      '[Relative guide](https://content.example.test/docs/current/guide/intro.html)',
      '![Relative diagram](https://content.example.test/docs/current/images/diagram.png)'
    ],
    rejects: ['canonical.example.test/guide', 'utm_source=']
  },
  {
    file: 'fixture-security.html', mode: 'full', options: { includeFrontMatter: false, includeSourceLink: true },
    checks: ['[Safe link](https://safe.example/path)', 'Unsafe JavaScript link', 'Unsafe VBScript link', 'Unsafe data link', 'Literal HTML payload: &lt;img src=x onerror=alert(9)&gt;', 'Literal fence payload: \\~\\~\\~', 'Safe table value', 'CUSTOM_WIDGET_TEXT'],
    rejects: ['Source:', 'about:blank', 'file:', 'javascript:', 'vbscript:', 'data:text/html', 'onclick=', '<script', '<svg', '<animate', '<evil-widget', 'unsafe-upgrade', 'autofocus', 'SVG_FOREIGN_OBJECT', '<img src=x', 'TABLE_SCRIPT_PAYLOAD', 'TABLE_BUTTON_LABEL']
  }
];

const requestedFiles = new Set(process.argv.slice(2));
const knownFiles = new Set(fixtures.map((fixture) => fixture.file));
for (const requested of requestedFiles) {
  if (!knownFiles.has(requested)) {
    throw new Error(`Unknown fixture: ${requested}`);
  }
}
const selectedFixtures = requestedFiles.size > 0
  ? fixtures.filter((fixture) => requestedFiles.has(fixture.file))
  : fixtures;

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
  || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
let failures = 0;

for (const fixture of selectedFixtures) {
  console.log(`→ ${fixture.file}`);
  const page = await browser.newPage();
  const consoleErrors = [];
  const onConsole = (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); };
  page.on('console', onConsole);

  try {
    const html = await readFile(path.join(__dirname, fixture.file), 'utf8');
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => {
      window.chrome = { runtime: { onMessage: { addListener(fn) { window.__pageToMdListener = fn; } } } };
      const NativeMutationObserver = window.MutationObserver;
      window.__pageToMdObserverCount = 0;
      window.MutationObserver = class CountingMutationObserver extends NativeMutationObserver {
        constructor(callback) {
          super(callback);
          window.__pageToMdObserverCount += 1;
        }
      };
    });
    await page.addScriptTag({ path: path.join(rootDir, 'lib/Readability.js') });
    await page.addScriptTag({ path: path.join(rootDir, 'src/content.js') });
    const envelope = await page.evaluate(async ({ mode, options, duplicateRequest, replayRequest }) => {
      if (typeof window.__pageToMdListener !== 'function') {
        return { result: { ok: false, error: { code: 'NO_LISTENER', message: 'Content listener was not installed.' } }, observerCount: 0 };
      }
      const message = { type: 'page-to-md-extract', requestId: 'fixture-request', payload: { mode, options } };
      const invoke = () => new Promise((resolve) => window.__pageToMdListener(message, null, resolve));
      const responses = duplicateRequest ? await Promise.all([invoke(), invoke()]) : [await invoke()];
      if (replayRequest) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        responses.push(await invoke());
      }
      return {
        result: responses[0],
        duplicateResult: responses[1],
        replayResult: replayRequest ? responses.at(-1) : undefined,
        observerCount: window.__pageToMdObserverCount
      };
    }, {
      mode: fixture.mode,
      options: { ...defaultOptions, ...(fixture.options || {}) },
      duplicateRequest: fixture.duplicateRequest === true,
      replayRequest: fixture.replayRequest === true
    });
    const result = envelope.result;

    if (!result?.ok || !result?.result?.markdown) {
      console.error(`✗ ${fixture.file}: no markdown result`, result, consoleErrors);
      failures += 1;
      continue;
    }

    const markdown = result.result.markdown;
    const missing = (fixture.checks || []).filter((needle) => !markdown.includes(needle));
    const presentRejected = (fixture.rejects || []).filter((needle) => markdown.toLowerCase().includes(needle.toLowerCase()));
    const wrongCounts = Object.entries(fixture.counts || {}).filter(([needle, expected]) => {
      const actual = markdown.split(needle).length - 1;
      return actual !== expected;
    });
    const observerMismatch = Number.isInteger(fixture.expectedObserverCount)
      && envelope.observerCount !== fixture.expectedObserverCount;
    const duplicateMismatch = fixture.duplicateRequest === true
      && JSON.stringify(envelope.duplicateResult) !== JSON.stringify(result);
    const replayMismatch = fixture.replayRequest === true
      && JSON.stringify(envelope.replayResult) !== JSON.stringify(result);
    if (missing.length || presentRejected.length || wrongCounts.length || observerMismatch || duplicateMismatch || replayMismatch) {
      console.error(`✗ ${fixture.file}`);
      if (missing.length) console.error('  missing:', missing);
      if (presentRejected.length) console.error('  forbidden:', presentRejected);
      if (wrongCounts.length) console.error('  wrong counts:', wrongCounts.map(([needle, expected]) => ({ needle, expected, actual: markdown.split(needle).length - 1 })));
      if (observerMismatch) console.error('  observer count:', { expected: fixture.expectedObserverCount, actual: envelope.observerCount });
      if (duplicateMismatch) console.error('  duplicate response differs from the original response');
      if (replayMismatch) console.error('  replayed response differs from the cached original response');
      console.error(markdown);
      failures += 1;
    } else {
      console.log(`✓ ${fixture.file}`);
    }
  } catch (error) {
    console.error(`✗ ${fixture.file}: ${error.message}`, consoleErrors);
    failures += 1;
  } finally {
    page.off('console', onConsole);
    await page.close();
  }
}

await browser.close();
if (failures > 0) process.exit(1);
