import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = [
  {
    file: 'fixture-article.html',
    checks: [
      '# Fixture Article',
      '[internal link](https://example.test/docs/link)',
      '> [!NOTE]',
      '```javascript',
      '![Example image](https://example.test/images/example.png)',
      '- First item'
    ]
  },
  {
    file: 'fixture-tables.html',
    checks: [
      '| Name | Value |',
      '| Alpha | 42 |',
      '![A](https://example.test/a.png)',
      '[Click here](https://example.test/cta)'
    ]
  },
  {
    file: 'fixture-math.html',
    checks: [
      '$a^2+b^2=c^2$',
      '$$',
      '\\int_0^1 x^2 dx',
      '> **Expanded idea**'
    ]
  }
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
let failures = 0;

for (const fixture of fixtures) {
  const url = 'file://' + path.join(__dirname, fixture.file);
  await page.goto(url);
  await page.waitForSelector('body[data-test-finished="true"]', { timeout: 5000 });
  const result = await page.evaluate(() => window.__pageToMdResult);

  if (!result?.ok || !result?.result?.markdown) {
    console.error(`✗ ${fixture.file}: no markdown result`, result);
    failures += 1;
    continue;
  }

  const markdown = result.result.markdown;
  const missing = fixture.checks.filter((needle) => !markdown.includes(needle));

  if (missing.length > 0) {
    console.error(`✗ ${fixture.file}: missing`, missing);
    console.error(markdown);
    failures += 1;
  } else {
    console.log(`✓ ${fixture.file}`);
  }
}

await browser.close();
if (failures > 0) {
  process.exit(1);
}
