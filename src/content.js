(() => {
  if (globalThis.__PAGE_TO_MD_PRO_INSTALLED__) {
    return;
  }
  globalThis.__PAGE_TO_MD_PRO_INSTALLED__ = true;

  const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'CENTER', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
    'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN',
    'NAV', 'OL', 'P', 'PICTURE', 'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
    'IMG'
  ]);

  const CONTENT_ROOT_SELECTORS = [
    'article',
    'main',
    '[role="main"]',
    '.article',
    '.article-body',
    '.article-content',
    '.entry-content',
    '.post-content',
    '.post-body',
    '.markdown-body',
    '.prose',
    '.docs-content',
    '.theme-doc-markdown',
    '.md-content',
    '.content',
    '.story',
    '.blog-post',
    '.notion-page-content',
    '.wiki-content'
  ];

  const NOISE_SELECTORS = [
    'script',
    'style',
    'template',
    'iframe',
    'canvas',
    'dialog',
    'button',
    'input',
    'textarea',
    'select',
    'option',
    'form[action*="search"]',
    'nav',
    'aside',
    'footer',
    '[role="navigation"]',
    '[role="complementary"]',
    '[aria-label*="breadcrumb" i]',
    '[class*="breadcrumb" i]',
    '[class*="share" i]',
    '[class*="social" i]',
    '[class*="newsletter" i]',
    '[class*="subscribe" i]',
    '[class*="sidebar" i]',
    '[class*="cookie" i]',
    '[class*="consent" i]',
    '[class*="advert" i]',
    '[class*="promo" i]',
    '[class*="related" i]',
    '[class*="recommend" i]',
    '[class*="table-of-contents" i]',
    '[class*="toc" i]',
    '[id*="cookie" i]',
    '[id*="consent" i]',
    '[id*="advert" i]',
    '.copy-button',
    '.code-copy-button',
    '.toolbar',
    '.sr-only'
  ];

  const TRACKING_PARAM_RE = /^(utm_[a-z_]+|fbclid|gclid|mc_cid|mc_eid|mkt_tok|vero_[a-z]+|oly_anon_id|oly_enc_id)$/i;
  const CALLOUT_HINT_RE = /(callout|admonition|markdown-alert|note|tip|warning|important|caution|danger|info|notice|success|hint|alert)/i;
  const BLOCK_MATH_SELECTORS = [
    '.katex-display',
    'script[type="math/tex; mode=display"]',
    'script[type="math/latex; mode=display"]',
    'mjx-container[display="true"]',
    '.MathJax_Display'
  ];
  const INLINE_MATH_SELECTORS = [
    '.katex',
    'script[type="math/tex"]',
    'script[type="math/latex"]',
    'mjx-container',
    '.MathJax',
    'math',
    '[data-tex]',
    '[data-latex]'
  ];

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'page-to-md-extract') {
      return false;
    }

    Promise.resolve()
      .then(() => extractPageToMarkdown(message.payload || {}))
      .then((result) => sendResponse({ ok: true, result }))
      .catch((error) => {
        console.error('Page to Markdown Pro extraction error:', error);
        sendResponse({ ok: false, error: error.message, stack: error.stack });
      });

    return true;
  });

  async function extractPageToMarkdown(payload) {
    const options = normalizeOptions(payload.options || {});
    const requestedMode = payload.mode || options.actionMode || 'auto';

    await settleDom();

    const baseMeta = collectMeta();
    const selectionRoot = requestedMode === 'selection' ? cloneSelectionFragment() : null;
    const chosen = chooseExtractionRoot(requestedMode, selectionRoot);

    if (!chosen || !chosen.root) {
      throw new Error('Could not determine a usable content root for this page.');
    }

    const meta = {
      ...baseMeta,
      title: chosen.article?.title || baseMeta.title,
      author: chosen.article?.byline || baseMeta.author,
      description: chosen.article?.excerpt || baseMeta.description,
      siteName: chosen.article?.siteName || baseMeta.siteName,
      extractor: chosen.kind,
      requestedMode,
      selectionUsed: chosen.kind === 'selection'
    };

    prepareRoot(chosen.root, meta, options, chosen.kind);

    let body = renderBlocks(Array.from(chosen.root.childNodes), {
      options,
      listDepth: 0
    }).trim();

    body = maybePrependTitleHeading(body, meta, options);
    const markdown = buildDocumentMarkdown(body, meta, options);

    return {
      markdown,
      meta: {
        title: meta.title,
        siteName: meta.siteName,
        author: meta.author,
        canonicalUrl: meta.canonicalUrl,
        url: meta.url,
        extractor: meta.extractor,
        requestedMode: meta.requestedMode,
        selectionUsed: meta.selectionUsed
      }
    };
  }

  function normalizeOptions(options) {
    return {
      actionMode: options.actionMode || 'auto',
      includeFrontMatter: options.includeFrontMatter !== false,
      prependTitleHeadingIfMissing: options.prependTitleHeadingIfMissing !== false,
      includeSourceLink: options.includeSourceLink !== false,
      includeImages: options.includeImages !== false,
      stripTrackingParams: options.stripTrackingParams !== false,
      tableMode: options.tableMode || 'smart'
    };
  }

  async function settleDom() {
    if (document.readyState === 'loading') {
      await new Promise((resolve) => {
        document.addEventListener('DOMContentLoaded', resolve, { once: true });
      });
    }
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function collectMeta() {
    const title = firstNonEmpty(
      getMetaContent('meta[property="og:title"]'),
      getMetaContent('meta[name="twitter:title"]'),
      document.title,
      document.querySelector('h1')?.textContent
    );

    const canonicalUrl = firstNonEmpty(
      document.querySelector('link[rel="canonical"]')?.href,
      location.href
    );

    const siteName = firstNonEmpty(
      getMetaContent('meta[property="og:site_name"]'),
      getMetaContent('meta[name="application-name"]'),
      location.hostname
    );

    const author = firstNonEmpty(
      getMetaContent('meta[name="author"]'),
      getMetaContent('meta[property="article:author"]'),
      getMetaContent('meta[name="parsely-author"]'),
      document.querySelector('[rel="author"]')?.textContent
    );

    const description = firstNonEmpty(
      getMetaContent('meta[name="description"]'),
      getMetaContent('meta[property="og:description"]'),
      getMetaContent('meta[name="twitter:description"]')
    );

    const published = firstNonEmpty(
      getMetaContent('meta[property="article:published_time"]'),
      getMetaContent('meta[name="date"]'),
      document.querySelector('time[datetime]')?.getAttribute('datetime')
    );

    const lang = firstNonEmpty(document.documentElement.lang, getMetaContent('meta[http-equiv="content-language"]'));

    return {
      title: cleanText(title) || 'Untitled page',
      url: location.href,
      canonicalUrl,
      siteName: cleanText(siteName) || location.hostname,
      author: cleanText(author),
      description: cleanText(description),
      published: cleanText(published),
      lang: cleanText(lang),
      capturedAt: new Date().toISOString()
    };
  }

  function getMetaContent(selector) {
    const element = document.querySelector(selector);
    return element?.getAttribute('content') || '';
  }

  function chooseExtractionRoot(mode, selectionRoot) {
    if (mode === 'selection' && selectionRoot && textLength(selectionRoot) > 0) {
      return {
        kind: 'selection',
        root: selectionRoot
      };
    }

    if (mode === 'full') {
      return {
        kind: 'full',
        root: document.body.cloneNode(true)
      };
    }

    const readabilityCandidate = buildReadabilityCandidate();
    const semanticCandidate = buildSemanticCandidate();

    if (mode === 'main') {
      return readabilityCandidate || semanticCandidate || {
        kind: 'full-fallback',
        root: document.body.cloneNode(true)
      };
    }

    if (mode === 'selection' && !selectionRoot) {
      return readabilityCandidate || semanticCandidate || {
        kind: 'full-fallback',
        root: document.body.cloneNode(true)
      };
    }

    if (readabilityCandidate && semanticCandidate) {
      return chooseBetweenCandidates(readabilityCandidate, semanticCandidate);
    }

    return readabilityCandidate || semanticCandidate || {
      kind: 'full-fallback',
      root: document.body.cloneNode(true)
    };
  }

  function buildReadabilityCandidate() {
    if (typeof Readability === 'undefined') {
      return null;
    }

    try {
      const clonedDocument = document.cloneNode(true);
      prepareDocumentForReadability(clonedDocument);

      const article = new Readability(clonedDocument, {
        keepClasses: true
      }).parse();

      if (!article || !article.content || cleanText(article.textContent).length < 120) {
        return null;
      }

      const tempDoc = document.implementation.createHTMLDocument('page-to-md-readability');
      tempDoc.body.innerHTML = article.content;
      const root = tempDoc.body;
      const metrics = measureNode(root);

      return {
        kind: 'readability',
        root,
        article,
        metrics,
        score: scoreCandidate(root, metrics, 'readability')
      };
    } catch (error) {
      console.warn('Readability failed:', error);
      return null;
    }
  }

  function buildSemanticCandidate() {
    const seen = new Set();
    const candidates = [];

    for (const selector of CONTENT_ROOT_SELECTORS) {
      for (const node of document.querySelectorAll(selector)) {
        if (!node || seen.has(node)) continue;
        seen.add(node);
        candidates.push(node);
      }
    }

    if (candidates.length === 0 && document.body) {
      candidates.push(document.body);
    }

    let best = null;
    for (const node of candidates) {
      if (!(node instanceof Element)) continue;
      if (isClearlyNoiseNode(node)) continue;

      const metrics = measureNode(node);
      if (metrics.textLength < 120) continue;

      const score = scoreCandidate(node, metrics, 'semantic');
      if (!best || score > best.score) {
        best = {
          kind: 'semantic',
          root: node.cloneNode(true),
          metrics,
          score
        };
      }
    }

    return best;
  }

  function chooseBetweenCandidates(readabilityCandidate, semanticCandidate) {
    const r = readabilityCandidate;
    const s = semanticCandidate;

    if (s.metrics.textLength > r.metrics.textLength * 1.45 &&
        s.metrics.codeBlockCount >= r.metrics.codeBlockCount &&
        s.metrics.headingCount >= Math.max(1, Math.floor(r.metrics.headingCount * 0.7))) {
      return s;
    }

    if (s.metrics.codeBlockCount > r.metrics.codeBlockCount + 2 || s.metrics.tableCount > r.metrics.tableCount + 1) {
      return s;
    }

    if (r.metrics.textLength >= s.metrics.textLength * 0.75) {
      return r;
    }

    return r.score >= s.score ? r : s;
  }

  function prepareDocumentForReadability(clonedDocument) {
    const preferredBaseUrl = getReadabilityBaseUrl();
    const existingBase = clonedDocument.querySelector?.('base');

    if (existingBase) {
      existingBase.remove();
    }
    if (clonedDocument.head && preferredBaseUrl) {
      const base = clonedDocument.createElement('base');
      base.setAttribute('href', preferredBaseUrl);
      clonedDocument.head.prepend(base);
    }

    if (!preferredBaseUrl) {
      return;
    }

    for (const anchor of Array.from(clonedDocument.querySelectorAll('a[href]'))) {
      const rawHref = anchor.getAttribute('href') || '';
      if (!rawHref || rawHref.startsWith('#') || /^javascript:/i.test(rawHref)) {
        continue;
      }

      const normalized = normalizeUrl(rawHref, preferredBaseUrl, false);
      if (normalized) {
        anchor.setAttribute('href', normalized);
      }
    }

    for (const element of Array.from(clonedDocument.querySelectorAll('img, source'))) {
      normalizeImageLikeElement(element, preferredBaseUrl);
    }
  }

  function getReadabilityBaseUrl() {
    if (location.protocol !== 'file:') {
      return document.baseURI || location.href;
    }

    const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
    if (/^https?:/i.test(canonical)) {
      return canonical;
    }

    return document.baseURI || location.href;
  }

  function normalizeImageLikeElement(element, baseUrl) {
    if (!(element instanceof Element)) return;

    const urlAttrs = ['src', 'data-src', 'data-original', 'data-lazy-src', 'data-url'];
    for (const attr of urlAttrs) {
      const value = element.getAttribute(attr) || '';
      if (!value) continue;
      const normalized = normalizeUrl(value, baseUrl, false);
      if (normalized) {
        element.setAttribute(attr, normalized);
      }
    }

    const srcsetAttrs = ['srcset', 'data-srcset'];
    for (const attr of srcsetAttrs) {
      const value = element.getAttribute(attr) || '';
      if (!value) continue;
      const normalized = normalizeSrcset(value, baseUrl);
      if (normalized) {
        element.setAttribute(attr, normalized);
      }
    }
  }

  function normalizeSrcset(value, baseUrl) {
    const parts = String(value || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length === 0) {
      return '';
    }

    return parts.map((part) => {
      const [rawUrl, ...descriptorParts] = part.split(/\s+/);
      const normalizedUrl = normalizeUrl(rawUrl || '', baseUrl, false);
      return [normalizedUrl || rawUrl, ...descriptorParts].filter(Boolean).join(' ');
    }).join(', ');
  }

  function measureNode(node) {
    const text = cleanText(node.innerText || node.textContent || '');
    const query = (selector) => node.querySelectorAll(selector).length;

    return {
      textLength: text.length,
      headingCount: query('h1, h2, h3, h4'),
      paragraphCount: query('p'),
      listCount: query('ul, ol'),
      codeBlockCount: query('pre, .highlight, .codehilite, table.highlight, table.highlighttable, .rouge-code'),
      tableCount: query('table'),
      linkCount: query('a[href]'),
      imageCount: query('img'),
      navCount: query('nav, [role="navigation"]'),
      asideCount: query('aside, [role="complementary"]')
    };
  }

  function scoreCandidate(node, metrics, kind) {
    let score = metrics.textLength;
    score += metrics.headingCount * 180;
    score += metrics.paragraphCount * 30;
    score += metrics.listCount * 40;
    score += metrics.codeBlockCount * 200;
    score += metrics.tableCount * 130;
    score += metrics.imageCount * 16;
    score -= metrics.linkCount * 4;
    score -= metrics.navCount * 260;
    score -= metrics.asideCount * 220;

    if (kind === 'readability') {
      score += 320;
    }

    if (node.matches?.('article, main, [role="main"]')) {
      score += 420;
    }

    const classifier = `${node.className || ''} ${node.id || ''}`;
    if (/(content|article|markdown|prose|post|entry|docs|story|wiki)/i.test(classifier)) {
      score += 220;
    }
    if (/(sidebar|menu|nav|footer|header|share|related|promo|advert|cookie|toc)/i.test(classifier)) {
      score -= 520;
    }

    return score;
  }

  function cloneSelectionFragment() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return null;
    }

    const tempDoc = document.implementation.createHTMLDocument('page-to-md-selection');
    const wrapper = tempDoc.body;

    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      const fragment = range.cloneContents();
      wrapper.appendChild(tempDoc.importNode(fragment, true));
    }

    return textLength(wrapper) > 0 ? wrapper : null;
  }

  function prepareRoot(root, meta, options, kind) {
    replaceMathNodes(root);
    hydrateImagesFromNoscript(root, meta.canonicalUrl || meta.url, options);
    normalizeLinksAndImages(root, meta.canonicalUrl || meta.url, options);
    replaceEmojiImages(root);
    removeNoise(root, kind);
    expandDetails(root);
    unwrapRedundantContainers(root);
  }

  function replaceMathNodes(root) {
    const selectors = [...BLOCK_MATH_SELECTORS, ...INLINE_MATH_SELECTORS].join(', ');
    const nodes = Array.from(root.querySelectorAll(selectors)).filter((node) => {
      if (!(node instanceof Element)) return false;
      if (node.closest('pre, code')) return false;
      const ancestor = node.parentElement?.closest(selectors);
      return !ancestor;
    });

    for (const node of nodes) {
      const tex = extractMathTeX(node);
      if (!tex) continue;
      const isBlock = isBlockMathNode(node);
      const replacement = root.ownerDocument.createElement(isBlock ? 'div' : 'span');
      replacement.setAttribute('data-p2m-math', tex);
      replacement.setAttribute('data-p2m-display', isBlock ? 'block' : 'inline');
      node.replaceWith(replacement);
    }
  }

  function extractMathTeX(node) {
    const candidates = [
      node.getAttribute?.('data-tex'),
      node.getAttribute?.('data-latex'),
      node.getAttribute?.('alt'),
      node.getAttribute?.('aria-label'),
      node.textContent
    ];

    const annotation = node.querySelector?.('annotation[encoding="application/x-tex"], annotation[encoding="application/tex"], annotation[encoding="application/x-latex"]');
    if (annotation?.textContent) {
      candidates.unshift(annotation.textContent);
    }

    if (node.matches?.('script[type^="math/"]')) {
      candidates.unshift(node.textContent);
    }

    const value = cleanText(firstNonEmpty(...candidates));
    if (!value) return '';

    if (!/[\\=^_{}]|\bfrac\b|\bsum\b|\bint\b/i.test(value) && value.length > 180) {
      return '';
    }

    return value;
  }

  function isBlockMathNode(node) {
    if (node.getAttribute?.('data-p2m-display') === 'block') return true;
    if (node.matches?.(BLOCK_MATH_SELECTORS.join(', '))) return true;
    const cls = `${node.className || ''}`;
    return /(display|block)/i.test(cls);
  }

  function hydrateImagesFromNoscript(root, baseUrl, options) {
    for (const noscript of Array.from(root.querySelectorAll('noscript'))) {
      const html = noscript.textContent || '';
      if (!/<img/i.test(html)) continue;

      try {
        const tempDoc = document.implementation.createHTMLDocument('page-to-md-noscript');
        tempDoc.body.innerHTML = html;
        const noscriptImg = tempDoc.querySelector('img');
        const previousImg = noscript.previousElementSibling?.tagName === 'IMG' ? noscript.previousElementSibling : null;

        if (previousImg && noscriptImg && !pickImageSource(previousImg)) {
          const src = normalizeUrl(noscriptImg.getAttribute('src') || '', baseUrl, options.stripTrackingParams);
          if (src) {
            previousImg.setAttribute('src', src);
          }
        }
      } catch (_) {
        // Ignore broken noscript HTML.
      }
    }
  }

  function normalizeLinksAndImages(root, baseUrl, options) {
    for (const anchor of Array.from(root.querySelectorAll('a[href]'))) {
      const normalized = normalizeUrl(anchor.getAttribute('href') || '', baseUrl, options.stripTrackingParams);
      if (normalized) {
        anchor.setAttribute('href', normalized);
      }
    }

    for (const img of Array.from(root.querySelectorAll('img'))) {
      const src = pickImageSource(img);
      if (!src) {
        continue;
      }
      const normalized = normalizeUrl(src, baseUrl, false);
      if (normalized) {
        img.setAttribute('src', normalized);
      }

      if (!img.getAttribute('alt') && img.getAttribute('title')) {
        img.setAttribute('alt', img.getAttribute('title'));
      }

      const width = Number(img.getAttribute('width') || 0);
      const height = Number(img.getAttribute('height') || 0);
      if ((width && width <= 2) || (height && height <= 2)) {
        img.remove();
      }
    }
  }

  function replaceEmojiImages(root) {
    for (const img of Array.from(root.querySelectorAll('img'))) {
      const alt = img.getAttribute('alt') || '';
      const hint = `${img.className || ''} ${img.getAttribute('src') || ''}`;
      if (!alt) continue;
      if (/(emoji|emoticon|twemoji|gemoji)/i.test(hint) || /^:[a-z0-9_+-]+:$/i.test(alt)) {
        img.replaceWith(root.ownerDocument.createTextNode(alt));
      }
    }
  }

  function removeNoise(root, kind) {
    const selectors = kind === 'full'
      ? ['script', 'style', 'template', 'iframe', 'canvas', 'dialog', 'button', 'input', 'textarea', 'select', 'option']
      : NOISE_SELECTORS;

    for (const selector of selectors) {
      for (const node of Array.from(root.querySelectorAll(selector))) {
        if (node.closest('pre, code, table')) continue;
        node.remove();
      }
    }

    for (const node of Array.from(root.querySelectorAll('[hidden], [aria-hidden="true"]'))) {
      if (node.hasAttribute('data-p2m-math')) continue;
      if (node.closest('[data-p2m-math], pre, code')) continue;
      node.remove();
    }
  }

  function expandDetails(root) {
    for (const details of Array.from(root.querySelectorAll('details'))) {
      details.setAttribute('open', 'open');
    }
  }

  function unwrapRedundantContainers(root) {
    const candidates = Array.from(root.querySelectorAll('div, section'));
    for (const node of candidates) {
      if (!(node instanceof Element)) continue;
      if (node.children.length !== 1) continue;
      if (node.attributes.length > 1) continue;
      const onlyChild = node.firstElementChild;
      if (!onlyChild) continue;
      if (!BLOCK_TAGS.has(onlyChild.tagName)) continue;
      const parent = node.parentNode;
      if (!parent) continue;
      parent.replaceChild(onlyChild, node);
    }
  }

  function renderBlocks(nodes, ctx) {
    const blocks = [];
    let inlineBuffer = [];

    const flushInlineBuffer = () => {
      if (inlineBuffer.length === 0) return;
      const text = renderInlineNodes(inlineBuffer, ctx).trim();
      inlineBuffer = [];
      if (text) {
        blocks.push(text);
      }
    };

    for (const node of nodes) {
      if (isIgnorableNode(node)) {
        continue;
      }
      if (isBlockNode(node, ctx)) {
        flushInlineBuffer();
        const block = renderBlock(node, ctx).trim();
        if (block) {
          blocks.push(block);
        }
      } else {
        inlineBuffer.push(node);
      }
    }

    flushInlineBuffer();
    return blocks.join('\n\n');
  }

  function isIgnorableNode(node) {
    if (!node) return true;
    if (node.nodeType === Node.COMMENT_NODE) return true;
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return true;
    if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-p2m-ignore')) return true;
    return false;
  }

  function isBlockNode(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) return false;
    if (!(node instanceof Element)) return false;
    if (node.hasAttribute('data-p2m-math') && node.getAttribute('data-p2m-display') === 'block') return true;
    if (isCodeBlockContainer(node)) return true;
    if (isCalloutNode(node)) return true;
    return BLOCK_TAGS.has(node.tagName);
  }

  function renderBlock(node, ctx) {
    if (node.nodeType === Node.TEXT_NODE) {
      return renderInlineNodes([node], ctx).trim();
    }
    if (!(node instanceof Element)) {
      return '';
    }

    if (node.hasAttribute('data-p2m-math')) {
      return renderMathNode(node);
    }

    if (isCodeBlockContainer(node)) {
      return renderCodeBlock(node);
    }

    if (isCalloutNode(node)) {
      return renderCallout(node, ctx);
    }

    switch (node.tagName) {
      case 'P':
        return renderInlineNodes(Array.from(node.childNodes), ctx).trim();
      case 'H1':
      case 'H2':
      case 'H3':
      case 'H4':
      case 'H5':
      case 'H6': {
        const level = Number(node.tagName.slice(1));
        const text = renderInlineNodes(Array.from(node.childNodes), ctx).trim();
        return text ? `${'#'.repeat(level)} ${text}` : '';
      }
      case 'UL':
      case 'OL':
        return renderList(node, ctx);
      case 'BLOCKQUOTE':
        return renderBlockquote(node, ctx);
      case 'TABLE':
        return renderTable(node, ctx);
      case 'FIGURE':
        return renderFigure(node, ctx);
      case 'IMG':
      case 'PICTURE':
        return renderBlockImage(node, ctx);
      case 'HR':
        return '---';
      case 'DETAILS':
        return renderDetails(node, ctx);
      case 'DL':
        return renderDefinitionList(node, ctx);
      case 'DT': {
        const text = renderInlineNodes(Array.from(node.childNodes), ctx).trim();
        return text ? `**${text}**` : '';
      }
      case 'DD': {
        const text = renderBlocks(Array.from(node.childNodes), ctx).trim();
        return text ? `: ${text.replace(/\n/g, '\n  ')}` : '';
      }
      case 'FIGCAPTION': {
        const text = renderInlineNodes(Array.from(node.childNodes), ctx).trim();
        return text ? `*${text}*` : '';
      }
      default:
        return renderBlocks(Array.from(node.childNodes), ctx);
    }
  }

  function renderInlineNodes(nodes, ctx) {
    return nodes.map((node) => renderInline(node, ctx)).join('');
  }

  function renderInline(node, ctx) {
    if (!node) return '';

    if (node.nodeType === Node.TEXT_NODE) {
      return escapeMarkdownText(normalizeInlineWhitespace(node.nodeValue || ''));
    }

    if (!(node instanceof Element)) {
      return '';
    }

    if (node.hasAttribute('data-p2m-math')) {
      return renderMathNode(node);
    }

    if (isCodeBlockContainer(node)) {
      return `\n\n${renderCodeBlock(node)}\n\n`;
    }

    switch (node.tagName) {
      case 'BR':
        return '<br>\n';
      case 'A':
        return renderLink(node, ctx);
      case 'IMG':
      case 'PICTURE':
        return renderInlineImage(node, ctx);
      case 'STRONG':
      case 'B': {
        const text = renderInlineNodes(Array.from(node.childNodes), ctx).trim();
        return text ? `**${text}**` : '';
      }
      case 'EM':
      case 'I': {
        const text = renderInlineNodes(Array.from(node.childNodes), ctx).trim();
        return text ? `*${text}*` : '';
      }
      case 'DEL':
      case 'S':
      case 'STRIKE': {
        const text = renderInlineNodes(Array.from(node.childNodes), ctx).trim();
        return text ? `~~${text}~~` : '';
      }
      case 'CODE':
      case 'KBD':
      case 'SAMP':
        return renderInlineCode(node.textContent || '');
      case 'SUP':
      case 'SUB': {
        const tag = node.tagName.toLowerCase();
        const text = renderInlineNodes(Array.from(node.childNodes), ctx).trim();
        return text ? `<${tag}>${text}</${tag}>` : '';
      }
      case 'Q': {
        const text = renderInlineNodes(Array.from(node.childNodes), ctx).trim();
        return text ? `“${text}”` : '';
      }
      case 'SPAN':
      case 'SMALL':
      case 'MARK':
      case 'ABBR':
      case 'TIME':
      case 'LABEL':
      case 'CITE':
      case 'VAR':
        return renderInlineNodes(Array.from(node.childNodes), ctx);
      default:
        if (BLOCK_TAGS.has(node.tagName)) {
          return flattenNodeToText(node, ctx);
        }
        return renderInlineNodes(Array.from(node.childNodes), ctx);
    }
  }

  function flattenNodeToText(node, ctx) {
    return cleanText(renderBlocks(Array.from(node.childNodes), ctx))
      ? ` ${renderBlocks(Array.from(node.childNodes), ctx).replace(/\n+/g, ' ').trim()} `
      : '';
  }

  function renderLink(anchor, ctx) {
    const href = anchor.getAttribute('href') || '';
    const text = renderInlineNodes(Array.from(anchor.childNodes), ctx).trim() || escapeMarkdownText(cleanText(anchor.textContent || href));

    if (!href || /^javascript:/i.test(href)) {
      return text;
    }

    if (href.startsWith('#')) {
      return text;
    }

    if (text === href) {
      return `<${href}>`;
    }

    return `[${text}](${escapeLinkDestination(href)})`;
  }

  function renderInlineImage(node, ctx) {
    if (ctx.options && ctx.options.includeImages === false) {
      const imgNode = node.tagName === 'PICTURE' ? node.querySelector('img') : node;
      return imgNode?.getAttribute?.('alt') ? escapeMarkdownText(imgNode.getAttribute('alt')) : '';
    }

    const img = node.tagName === 'PICTURE' ? node.querySelector('img') : node;
    if (!(img instanceof Element)) return '';
    const src = img.getAttribute('src') || '';
    const alt = escapeMarkdownText(img.getAttribute('alt') || '');
    const title = img.getAttribute('title') || '';

    if (!src) {
      return alt || '';
    }

    if (/^data:/i.test(src)) {
      return alt || '';
    }

    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';
    return `![${alt}](${escapeLinkDestination(src)}${titlePart})`;
  }

  function renderBlockImage(node, ctx) {
    const markdown = renderInlineImage(node, ctx);
    if (!markdown) return '';
    return markdown;
  }

  function renderInlineCode(codeText) {
    const clean = (codeText || '').replace(/\r\n?/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const maxBacktickRun = Math.max(0, ...(clean.match(/`+/g) || []).map((part) => part.length));
    const fence = '`'.repeat(Math.max(1, maxBacktickRun + 1));
    const needsPadding = clean.startsWith('`') || clean.endsWith('`');
    return `${fence}${needsPadding ? ' ' : ''}${clean}${needsPadding ? ' ' : ''}${fence}`;
  }

  function renderCodeBlock(node) {
    const code = extractCodeText(node);
    if (!code) return '';
    const language = detectCodeLanguage(node);
    const fence = chooseCodeFence(code);
    return `${fence}${language}\n${code}\n${fence}`;
  }

  function isCodeBlockContainer(node) {
    if (!(node instanceof Element)) return false;
    if (node.tagName === 'PRE') return true;
    if (node.tagName === 'TABLE' && /(highlight|code|rouge)/i.test(node.className || '') && node.querySelector('pre')) return true;
    if (/\b(highlight|codehilite|rouge-code|highlighttable)\b/i.test(node.className || '') && node.querySelector('pre, code')) return true;
    return false;
  }

  function extractCodeText(node) {
    let text = '';

    if (node.tagName === 'PRE') {
      text = node.textContent || '';
    } else {
      const pre = node.querySelector('pre');
      text = pre?.textContent || node.textContent || '';
    }

    return String(text)
      .replace(/\r\n?/g, '\n')
      .replace(/\u00a0/g, ' ')
      .replace(/^\n+/, '')
      .replace(/\n+$/, '');
  }

  function detectCodeLanguage(node) {
    const hints = [
      node.getAttribute?.('data-language'),
      node.getAttribute?.('data-lang'),
      node.className,
      node.querySelector?.('pre')?.className,
      node.querySelector?.('code')?.className,
      node.parentElement?.className
    ].filter(Boolean).join(' ');

    const match = hints.match(/(?:lang(?:uage)?-|language-|highlight-source-|brush:\s*)([a-z0-9_+#.-]+)/i);
    return match ? normalizeLanguageName(match[1]) : '';
  }

  function normalizeLanguageName(language) {
    const value = String(language || '').toLowerCase();
    const aliases = {
      js: 'javascript',
      ts: 'typescript',
      py: 'python',
      rb: 'ruby',
      sh: 'bash',
      zsh: 'bash',
      shell: 'bash',
      csharp: 'csharp',
      'c#': 'csharp',
      yml: 'yaml',
      md: 'markdown'
    };
    return aliases[value] || value;
  }

  function chooseCodeFence(code) {
    const backtickRuns = code.match(/`+/g) || [];
    const maxBacktickRun = Math.max(0, ...backtickRuns.map((part) => part.length));
    return '`'.repeat(Math.max(3, maxBacktickRun + 1));
  }

  function renderList(listNode, ctx) {
    const ordered = listNode.tagName === 'OL';
    const start = Number.parseInt(listNode.getAttribute('start') || '1', 10) || 1;
    const itemCtx = {
      ...ctx,
      listDepth: (ctx.listDepth || 0) + 1
    };

    const items = Array.from(listNode.children).filter((child) => child.tagName === 'LI');
    return items.map((item, index) => renderListItem(item, itemCtx, ordered ? `${start + index}.` : '-')).filter(Boolean).join('\n');
  }

  function renderListItem(item, ctx, marker) {
    const indent = '  '.repeat(Math.max(0, (ctx.listDepth || 1) - 1));
    const nestedLists = [];
    const contentNodes = [];

    for (const child of Array.from(item.childNodes)) {
      if (child instanceof Element && (child.tagName === 'UL' || child.tagName === 'OL')) {
        nestedLists.push(child);
      } else {
        contentNodes.push(child);
      }
    }

    const content = renderBlocks(contentNodes, ctx).trim();
    const output = [];

    if (content) {
      const lines = content.split('\n');
      output.push(`${indent}${marker} ${lines[0]}`);
      for (let i = 1; i < lines.length; i += 1) {
        output.push(`${indent}  ${lines[i]}`);
      }
    } else {
      output.push(`${indent}${marker}`);
    }

    for (const nested of nestedLists) {
      const nestedMarkdown = renderList(nested, ctx).trim();
      if (nestedMarkdown) {
        output.push(nestedMarkdown);
      }
    }

    return output.join('\n');
  }

  function renderBlockquote(node, ctx) {
    const text = renderBlocks(Array.from(node.childNodes), ctx).trim();
    if (!text) return '';
    return prefixLines(text, '> ');
  }

  function isCalloutNode(node) {
    if (!(node instanceof Element)) return false;
    if (node.tagName === 'BLOCKQUOTE' && node.textContent?.trim()?.startsWith('[!')) return false;

    const hint = `${node.className || ''} ${node.getAttribute('data-callout') || ''} ${node.getAttribute('data-admonition') || ''} ${node.getAttribute('role') || ''}`;
    if (!CALLOUT_HINT_RE.test(hint)) return false;
    if (node.closest('pre, code')) return false;
    return true;
  }

  function renderCallout(node, ctx) {
    const clone = node.cloneNode(true);
    const type = detectCalloutType(clone);
    const titleNode = clone.querySelector('.admonition-title, .callout-title, .markdown-alert-title, summary, header');
    const title = titleNode ? cleanText(renderInlineNodes(Array.from(titleNode.childNodes), ctx)) : '';
    if (titleNode) titleNode.remove();
    const content = renderBlocks(Array.from(clone.childNodes), ctx).trim();

    const lines = [`> [!${type}]`];
    if (title && title.toUpperCase() !== type) {
      lines.push(`> ${title}`);
    }
    if (content) {
      if (title) lines.push('>');
      lines.push(...content.split('\n').map((line) => `> ${line}`));
    }
    return lines.join('\n');
  }

  function detectCalloutType(node) {
    const hint = `${node.className || ''} ${node.getAttribute('data-callout') || ''} ${node.getAttribute('data-admonition') || ''}`.toLowerCase();
    if (/(warning|warn)/.test(hint)) return 'WARNING';
    if (/(caution|danger|error|critical)/.test(hint)) return 'CAUTION';
    if (/(tip|hint|success)/.test(hint)) return 'TIP';
    if (/(important)/.test(hint)) return 'IMPORTANT';
    return 'NOTE';
  }

  function renderDetails(node, ctx) {
    const clone = node.cloneNode(true);
    const summary = clone.querySelector(':scope > summary');
    const title = summary ? cleanText(renderInlineNodes(Array.from(summary.childNodes), ctx)) : 'Details';
    if (summary) summary.remove();
    const content = renderBlocks(Array.from(clone.childNodes), ctx).trim();

    const lines = [`> **${title || 'Details'}**`];
    if (content) {
      lines.push('>');
      lines.push(...content.split('\n').map((line) => `> ${line}`));
    }
    return lines.join('\n');
  }

  function renderFigure(node, ctx) {
    const clone = node.cloneNode(true);
    const caption = clone.querySelector('figcaption');
    const captionText = caption ? cleanText(renderInlineNodes(Array.from(caption.childNodes), ctx)) : '';
    if (caption) caption.remove();

    const parts = [];
    const image = clone.querySelector('img');
    if (image) {
      parts.push(renderBlockImage(image, ctx));
      image.remove();
    }

    const remainder = renderBlocks(Array.from(clone.childNodes), ctx).trim();
    if (remainder) parts.push(remainder);
    if (captionText) parts.push(`*${captionText}*`);

    return parts.filter(Boolean).join('\n\n');
  }

  function renderTable(node, ctx) {
    if (isCodeBlockContainer(node)) {
      return renderCodeBlock(node);
    }

    if (ctx.options.tableMode === 'html') {
      return sanitizeHtml(node);
    }

    if (isLikelyLayoutTable(node)) {
      const cellBlocks = [];
      for (const row of Array.from(node.rows)) {
        for (const cell of Array.from(row.cells)) {
          const text = renderBlocks(Array.from(cell.childNodes), ctx).trim();
          if (text) cellBlocks.push(text);
        }
      }
      return cellBlocks.join('\n\n');
    }

    if (isComplexTable(node) && ctx.options.tableMode !== 'markdown') {
      return sanitizeHtml(node);
    }

    const rows = extractTableRows(node, ctx);
    if (rows.length === 0) return '';

    const width = Math.max(...rows.map((row) => row.length), 0);
    if (width === 0) return '';

    const normalizedRows = rows.map((row) => {
      const padded = row.slice(0, width);
      while (padded.length < width) padded.push('');
      return padded;
    });

    const headerIndex = findHeaderRowIndex(node, normalizedRows);
    const header = normalizedRows[headerIndex] || normalizedRows[0];
    const bodyRows = normalizedRows.filter((_, index) => index !== headerIndex);

    const lines = [];
    lines.push(`| ${header.map(escapeTableCell).join(' | ')} |`);
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const row of bodyRows) {
      lines.push(`| ${row.map(escapeTableCell).join(' | ')} |`);
    }
    return lines.join('\n');
  }

  function isLikelyLayoutTable(table) {
    if (!(table instanceof HTMLTableElement || table.tagName === 'TABLE')) return false;
    if (table.getAttribute('role') === 'presentation') return true;
    if (table.querySelector('table')) return true;

    const rowCount = table.rows.length;
    const colCount = Math.max(0, ...Array.from(table.rows).map((row) => row.cells.length));
    const headingCells = table.querySelectorAll('th').length;
    const imageCount = table.querySelectorAll('img').length;
    const textLen = cleanText(table.textContent || '').length;

    if (headingCells > 0) return false;
    if (colCount <= 1 && rowCount > 2) return true;
    if (colCount <= 2 && imageCount > 0 && textLen / Math.max(1, rowCount * Math.max(colCount, 1)) < 40) return true;
    return false;
  }

  function isComplexTable(table) {
    if (table.querySelector('[rowspan]:not([rowspan="1"]), [colspan]:not([colspan="1"])')) return true;
    if (table.querySelector('pre, code, ul, ol, blockquote, table')) return true;
    const rows = Array.from(table.rows);
    if (rows.length === 0) return false;
    const widths = rows.map((row) => row.cells.length);
    return widths.some((width) => width !== widths[0]);
  }

  function extractTableRows(table, ctx) {
    const rows = [];
    for (const row of Array.from(table.rows)) {
      const values = Array.from(row.cells).map((cell) => renderTableCell(cell, ctx));
      if (values.some((value) => value !== '')) {
        rows.push(values);
      }
    }
    return rows;
  }

  function renderTableCell(cell, ctx) {
    const content = renderBlocks(Array.from(cell.childNodes), ctx)
      .replace(/\n{2,}/g, '<br><br>')
      .replace(/\n/g, '<br>')
      .trim();
    return content;
  }

  function findHeaderRowIndex(table, rows) {
    const theadRows = table.tHead?.rows || [];
    if (theadRows.length > 0) {
      return 0;
    }

    const rowElements = Array.from(table.rows);
    const thIndex = rowElements.findIndex((row) => Array.from(row.cells).some((cell) => cell.tagName === 'TH'));
    return thIndex >= 0 ? thIndex : 0;
  }

  function escapeTableCell(value) {
    return String(value || '')
      .replace(/\|/g, '\\|')
      .replace(/\r\n?/g, '\n');
  }

  function sanitizeHtml(node) {
    const clone = node.cloneNode(true);
    for (const element of Array.from(clone.querySelectorAll('*'))) {
      for (const attr of Array.from(element.attributes)) {
        if (/^on/i.test(attr.name)) {
          element.removeAttribute(attr.name);
          continue;
        }
        if (/^(class|style|id|data-.*|aria-.*)$/i.test(attr.name)) {
          element.removeAttribute(attr.name);
        }
      }
    }
    return clone.outerHTML;
  }

  function renderDefinitionList(node, ctx) {
    const parts = [];
    for (const child of Array.from(node.children)) {
      if (child.tagName === 'DT') {
        const term = renderInlineNodes(Array.from(child.childNodes), ctx).trim();
        if (term) parts.push(`**${term}**`);
      } else if (child.tagName === 'DD') {
        const def = renderBlocks(Array.from(child.childNodes), ctx).trim();
        if (def) parts.push(`: ${def.replace(/\n/g, '\n  ')}`);
      }
    }
    return parts.join('\n');
  }

  function renderMathNode(node) {
    const tex = node.getAttribute('data-p2m-math') || '';
    if (!tex) return '';
    if (node.getAttribute('data-p2m-display') === 'block') {
      return `$$\n${tex}\n$$`;
    }
    return `$${tex}$`;
  }

  function maybePrependTitleHeading(body, meta, options) {
    if (!options.prependTitleHeadingIfMissing) {
      return body;
    }

    const title = cleanText(meta.title);
    if (!title) return body;

    const firstNonEmptyLine = (body.split('\n').find((line) => line.trim()) || '').trim();
    if (/^#{1,6}\s+/.test(firstNonEmptyLine)) {
      return body;
    }
    if (cleanText(stripMarkdownFormatting(firstNonEmptyLine)).toLowerCase() === title.toLowerCase()) {
      return body;
    }

    return body ? `# ${escapeMarkdownText(title)}\n\n${body}` : `# ${escapeMarkdownText(title)}`;
  }

  function buildDocumentMarkdown(body, meta, options) {
    const pieces = [];

    if (options.includeFrontMatter) {
      pieces.push(buildFrontMatter(meta));
    }

    if (options.includeSourceLink && meta.canonicalUrl) {
      const label = escapeMarkdownText(meta.title || meta.canonicalUrl);
      pieces.push(`Source: [${label}](${escapeLinkDestination(meta.canonicalUrl)})`);
    }

    if (body) {
      pieces.push(body);
    }

    return normalizeMarkdownSafely(pieces.filter(Boolean).join('\n\n'));
  }

  function buildFrontMatter(meta) {
    const fields = {
      title: meta.title,
      source: meta.url,
      canonical: meta.canonicalUrl,
      site: meta.siteName,
      author: meta.author,
      description: meta.description,
      published: meta.published,
      captured: meta.capturedAt,
      lang: meta.lang,
      extractor: meta.extractor,
      clip_mode: meta.requestedMode,
      selection_used: meta.selectionUsed ? 'true' : 'false'
    };

    const lines = ['---'];
    for (const [key, value] of Object.entries(fields)) {
      if (!value) continue;
      lines.push(`${key}: ${yamlQuote(value)}`);
    }
    lines.push('---');
    return lines.join('\n');
  }

  function yamlQuote(value) {
    return `"${String(value)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')}"`;
  }

  function normalizeMarkdownSafely(markdown) {
    const text = String(markdown || '').replace(/\r\n?/g, '\n');
    const lines = text.split('\n');
    const output = [];
    let blankRun = 0;
    let fenceChar = '';
    let fenceLength = 0;

    for (const line of lines) {
      const fenceMatch = line.match(/^\s*([`~]{3,})/);
      if (fenceMatch) {
        const currentChar = fenceMatch[1][0];
        const currentLen = fenceMatch[1].length;
        if (!fenceChar) {
          fenceChar = currentChar;
          fenceLength = currentLen;
        } else if (currentChar === fenceChar && currentLen >= fenceLength) {
          fenceChar = '';
          fenceLength = 0;
        }
        output.push(line.replace(/[ \t]+$/g, ''));
        blankRun = 0;
        continue;
      }

      if (fenceChar) {
        output.push(line);
        continue;
      }

      const trimmedRight = line.replace(/[ \t]+$/g, '');
      if (trimmedRight === '') {
        blankRun += 1;
        if (blankRun <= 2) {
          output.push('');
        }
      } else {
        blankRun = 0;
        output.push(trimmedRight);
      }
    }

    return `${output.join('\n').trim()}\n`;
  }

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\t\r\n ]+/g, ' ')
      .trim();
  }

  function normalizeInlineWhitespace(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[\t\r\n ]+/g, ' ');
  }

  function escapeMarkdownText(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/([*_\[\]])/g, '\\$1')
      .replace(/(^|\n)([>#])/g, '$1\\$2')
      .replace(/(^|\n)([-+*])(\s)/g, '$1\\$2$3')
      .replace(/(^|\n)(\d+)\.(\s)/g, '$1$2\\.$3');
  }

  function escapeLinkDestination(value) {
    return String(value || '')
      .replace(/ /g, '%20')
      .replace(/\(/g, '%28')
      .replace(/\)/g, '%29');
  }

  function prefixLines(text, prefix) {
    return String(text || '')
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
  }

  function normalizeUrl(rawUrl, baseUrl, stripTrackingParams) {
    if (!rawUrl) return '';
    if (/^(data|javascript):/i.test(rawUrl)) return rawUrl;

    try {
      const url = new URL(rawUrl, baseUrl || location.href);
      if (stripTrackingParams) {
        for (const key of Array.from(url.searchParams.keys())) {
          if (TRACKING_PARAM_RE.test(key)) {
            url.searchParams.delete(key);
          }
        }
      }
      return url.href;
    } catch (_) {
      return rawUrl;
    }
  }

  function pickImageSource(img) {
    const attrs = [
      'src',
      'data-src',
      'data-original',
      'data-lazy-src',
      'data-url',
      'data-srcset',
      'srcset'
    ];

    for (const attr of attrs) {
      const value = img.getAttribute(attr) || '';
      if (!value) continue;
      if (attr.endsWith('srcset')) {
        const picked = pickFromSrcset(value);
        if (picked) return picked;
      } else if (!/^data:image\/gif;base64/i.test(value)) {
        return value;
      }
    }

    return '';
  }

  function pickFromSrcset(value) {
    const candidates = String(value || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [url, descriptor] = part.split(/\s+/);
        const score = descriptor?.endsWith('w')
          ? Number.parseInt(descriptor, 10)
          : descriptor?.endsWith('x')
            ? Number.parseFloat(descriptor) * 1000
            : 0;
        return { url, score };
      })
      .sort((a, b) => b.score - a.score);

    return candidates[0]?.url || '';
  }

  function stripMarkdownFormatting(value) {
    return String(value || '')
      .replace(/^#{1,6}\s+/, '')
      .replace(/[*_`~\[\]()>-]/g, '')
      .trim();
  }

  function firstNonEmpty(...values) {
    for (const value of values) {
      if (cleanText(value)) return value;
    }
    return '';
  }

  function textLength(node) {
    return cleanText(node?.textContent || '').length;
  }

  function isClearlyNoiseNode(node) {
    const classifier = `${node.className || ''} ${node.id || ''}`;
    return /(sidebar|toc|nav|menu|footer|header|share|related|promo|advert|cookie|consent)/i.test(classifier);
  }
})();
