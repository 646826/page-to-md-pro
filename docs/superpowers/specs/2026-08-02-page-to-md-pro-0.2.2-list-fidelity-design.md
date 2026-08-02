# Page to Markdown Pro 0.2.2 List Fidelity Design

## Context

The current Markdown list renderer preserves a simple `<ol start>` value, but it does not fully preserve HTML ordered-list semantics:

- `<ol start="0">` is converted to `1.` because the renderer uses `|| 1`.
- `<ol reversed>` is rendered in ascending order.
- `<li value="…">` does not reset the counter.
- Nested lists and continuation lines always use two spaces, which is insufficient after multi-digit markers such as `10.` under CommonMark-compatible indentation rules.

These are observable content-loss defects. They can be corrected inside the existing renderer without new dependencies, permissions, or architectural changes.

## Goal

Release version 0.2.2 with faithful ordered-list numbering and structurally valid nested-list Markdown for zero, negative, reversed, explicitly reset, and multi-digit list markers.

## Chosen approach

Keep the custom renderer and replace the depth-based fixed indentation with marker-aware indentation.

Alternative approaches were rejected:

1. **Counter-only patch:** smaller, but leaves nested and multiline content invalid after multi-digit markers.
2. **Marker-aware internal renderer:** chosen; fixes the whole list boundary with a small, local change.
3. **Third-party Markdown converter:** unnecessary runtime and maintenance cost, and would disturb the extension's existing sanitization and extraction behavior.

## Rendering rules

### Ordered counters

For an ordered list:

- Default start is `1`.
- Default start for `<ol reversed>` is the number of direct `<li>` children.
- A valid `start` attribute overrides the default, including `0` and negative values.
- A valid direct-child `<li value>` resets the current marker.
- The next item increments by `1`, or decrements by `1` for reversed lists.
- Invalid numeric attributes fall back to normal HTML-like defaults rather than partially parsing trailing junk.

### Indentation

Each rendered item has:

- an inherited list indentation prefix;
- a marker (`-`, `0.`, `10.`, and so on);
- a continuation indentation equal to the inherited prefix plus `marker.length + 1` spaces.

Continuation lines and nested lists use that continuation indentation. This keeps nested content parseable after markers of any width while preserving the existing two-space indentation for `-` and `1.` where appropriate.

### Scope boundaries

The patch will not attempt to preserve alphabetic or Roman `<ol type>` markers because standard Markdown ordered-list syntax is numeric. It will preserve the numeric sequence represented by the browser DOM.

## Test design

Add one real Chromium fixture covering:

- `start="0"`;
- a negative start;
- a reversed list without an explicit start;
- a reversed list with `<li value>` reset;
- a multi-digit ordered item containing multiline block content and a nested unordered list.

The fixture must fail against 0.2.1 for the expected numbering and indentation mismatches, then pass after the renderer correction. Existing fixtures must remain unchanged and green.

## Release and compatibility

- Bump `manifest.json`, `package.json`, `package-lock.json`, and enforced test expectations to `0.2.2`.
- Add changelog and release notes.
- Update README test counts only where stale.
- Keep Manifest V3, minimum Chrome 109, the existing six permissions, no host permissions, no runtime dependencies, and Chrome Web Store `UPLOAD_ONLY` delivery.

## Acceptance criteria

1. The new browser fixture demonstrates the 0.2.1 failures before production changes.
2. All expected ordered markers and marker-aware indentation are present after the fix.
3. All Node tests and all Chromium fixtures pass.
4. `npm test`, deterministic ZIP construction, and exact package allowlist validation pass.
5. The verified branch is merged to `main`.
6. GitHub Release `v0.2.2` is created only after successful Chrome Web Store `UPLOAD_ONLY` delivery evidence.