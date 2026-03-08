# Manual QA checklist

## Install and permissions

- [ ] Load unpacked extension successfully.
- [ ] Toolbar icon click downloads a `.md` file.
- [ ] Context menu items appear on page and selection.
- [ ] Keyboard shortcuts work.
- [ ] No broad host permission warning appears beyond the declared extension permissions.

## Content quality

### Articles
- [ ] Main article body exported without header/footer/sidebar noise.
- [ ] H1/H2/H3 preserved.
- [ ] Links are absolute and readable.
- [ ] Front matter contains title/source/site metadata.

### Code-heavy docs
- [ ] Code indentation is preserved.
- [ ] Language fences appear when detectable.
- [ ] Docs sidebars / table of contents are not included in main mode.

### Images
- [ ] Lazy-loaded images are exported with usable URLs.
- [ ] Tiny tracker images are not exported.
- [ ] Images disabled option works.

### Tables
- [ ] Simple data tables become Markdown tables.
- [ ] Layout tables are flattened into readable content.
- [ ] Complex tables remain readable through HTML fallback.

### Callouts / details / math
- [ ] Callouts become Markdown alert blocks.
- [ ] Details blocks remain understandable.
- [ ] Inline and block math stay readable.

## UX

- [ ] Toolbar click feels immediate.
- [ ] Large pages still download.
- [ ] Filename is sanitized and readable.
- [ ] Save As option works when enabled.

## Cross-site spot checks

- [ ] Standard news article
- [ ] Documentation portal
- [ ] GitHub README or docs page
- [ ] Blog post with images
- [ ] Page with at least one table
- [ ] Page with at least one code block
