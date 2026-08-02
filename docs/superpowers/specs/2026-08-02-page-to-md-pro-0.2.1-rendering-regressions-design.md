# Page to Markdown Pro 0.2.1 Rendering Regressions Design

## Context

The 0.2.0 renderer contains two malformed string literals in `src/content.js`:

- `<br>` elements are emitted as `<br-` followed by a newline.
- Code-block containers encountered in inline flow are prefixed with the literal letter `l` instead of two newlines.

Both defects were introduced during the 0.2.0 renderer refactor. They are syntactically valid JavaScript, so syntax checks do not detect them, and the existing fixtures do not exercise these paths closely enough.

## Goal

Release version 0.2.1 with correct Markdown output for HTML line breaks and code-block containers encountered inside inline/custom-element flow, with browser-level regression coverage that fails on the 0.2.0 implementation.

## Scope

### Included

- Add one focused Playwright fixture that executes the real content script in Chromium.
- Assert that `<br>` becomes `<br>\n` and never `<br-`.
- Assert that a nested highlighted code block has no stray `l` prefix.
- Correct only the two malformed renderer literals.
- Add the fixture as an explicit CI step and to the aggregate fixture suite.
- Bump manifest, package, lockfile, and package-test expectations to 0.2.1.
- Add changelog and release notes for 0.2.1.

### Excluded

- Extraction-root scoring changes.
- Markdown renderer restructuring.
- New permissions or dependencies.
- Chrome Web Store automatic publication; the existing safe `UPLOAD_ONLY` release mode remains unchanged.

## Design

The new fixture contains:

1. A paragraph with `First line<br>Second line`.
2. A custom inline element with class `highlight` containing a JavaScript `<code>` element. This forces the renderer's inline code-block-container branch without relying on invalid paragraph nesting.

The fixture runner checks the required correct fragments and rejects the two malformed fragments. Because it loads `lib/Readability.js` and `src/content.js` in headless Chromium, it validates observable output rather than source text.

The production fix restores the intended literals:

```js
if (isCodeBlockContainer(node)) return `\n\n${renderCodeBlock(node)}\n\n`;
case 'BR': return '<br>\n';
```

No new runtime abstraction is introduced; the smallest correction is preferable for this patch release.

## Error Handling and Compatibility

The change does not alter message handling, permissions, storage, URLs, or download behavior. It remains compatible with the declared minimum Chrome version 109 and Node.js 24 development environment.

## Verification

The change is accepted only after all of the following evidence exists:

1. The new fixture fails against the unmodified 0.2.0 renderer for the expected malformed output.
2. The focused fixture passes after the two-line fix.
3. `npm test` passes.
4. `npm run build:zip` succeeds and `npm run validate:package` validates the resulting ZIP.
5. Pull-request CI is green.
6. After merge to `main`, the existing release workflow completes and creates the v0.2.1 GitHub Release only after successful Chrome Web Store `UPLOAD_ONLY` delivery evidence.
