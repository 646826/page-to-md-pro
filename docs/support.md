# Support

Use the GitHub issue tracker for bugs, extraction regressions, and feature requests:

- Issues: <https://github.com/646826/page-to-md-pro/issues>
- Project homepage: <https://646826.github.io/page-to-md-pro/>
- Source: <https://github.com/646826/page-to-md-pro>

Include these details in a report:

- public page URL or a minimal HTML fixture;
- browser name and version;
- extension version;
- automatic, main, full-page, or selection mode;
- expected Markdown and the relevant actual excerpt;
- service-worker or page console error code, when available;
- whether the page uses Shadow DOM, virtualized content, frames, or content loaded after interaction;
- whether the page was reloaded after the extension was updated.

Remove private information before attaching generated Markdown. A small, self-contained fixture is the fastest way to make extraction regressions reproducible.

Known generic limits include closed shadow roots, cross-origin frames, canvas-only content, virtualized rows not currently rendered, and content the page never exposes in the active DOM.
