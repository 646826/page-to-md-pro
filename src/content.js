(() => {
  'use strict';

  if (globalThis.__PAGE_TO_MD_PRO_INSTALLED__) return;
  globalThis.__PAGE_TO_MD_PRO_INSTALLED__ = true;

  const DEFAULT_OPTIONS = Object.freeze({
    actionMode: 'auto',
    includeFrontMatter: true,
    prependTitleHeadingIfMissing: true,
    includeSourceLink: true,
    includeImages: true,
    stripTrackingParams: true,
    tableMode: 'smart'
  });

  const CONTENT_ROOT_SELECTORS = [
    'article', 'main', '[role="main"]', '.article', '.article-body', '.article-content',
    '.entry-content', '.post-content', '.post-body', '.markdown-body', '.prose',
    '.docs-content', '.theme-doc-markdown', '.md-content', '.content', '.story',
    '.blog-post', '.notion-page-content', '.wiki-content'
  ];

  const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'CAPTION', 'CENTER', 'DD', 'DETAILS',
    'DIV', 'DL', 'DT', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PICTURE',
    'PRE', 'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
    'IMG', 'VIDEO', 'AUDIO'
  ]);

  const NOISE_SELECTORS = [
    'script', 'style', 'template', 'noscript', 'iframe', 'canvas', 'dialog', 'button', 'input:not([data-p2m-task])',
    'textarea', 'select', 'option', 'object', 'embed', 'form[action*="search" i]', 'nav', 'aside',
    'footer', '[role="navigation"]', '[role="complementary"]', '[aria-label*="breadcrumb" i]',
    '[class*="breadcrumb" i]', '[class*="share" i]', '[class*="social" i]',
    '[class*="newsletter" i]', '[class*="subscribe" i]', '[class*="sidebar" i]',
    '[class*="cookie" i]', '[class*="consent" i]', '[class*="advert" i]',
    '[class*="promo" i]', '[class*="related" i]', '[class*="recommend" i]',
    '[class*="table-of-contents" i]', '[class*="toc" i]', '[id*="cookie" i]',
    '[id*="consent" i]', '[id*="advert" i]', '.copy-button', '.code-copy-button',
    '.toolbar', '.sr-only'
  ];

  const MINIMAL_NOISE_SELECTORS = [
    'script', 'style', 'template', 'noscript', 'iframe', 'canvas', 'dialog', 'button',
    'input:not([data-p2m-task])', 'textarea', 'select', 'option', 'object', 'embed'
  ];

  const BLOCK_MATH_SELECTORS = [
    '.katex-display', 'script[type="math/tex; mode=display"]',
    'script[type="math/latex; mode=display"]', 'mjx-container[display="true"]', '.MathJax_Display'
  ];
  const INLINE_MATH_SELECTORS = [
    '.katex', 'script[type="math/tex"]', 'script[type="math/latex"]', 'mjx-container',
    '.MathJax', 'math', '[data-tex]', '[data-latex]'
  ];
  const ARTICLE_TYPES = new Set(['article', 'newsarticle', 'blogposting', 'techarticle', 'scholarlyarticle', 'report']);
  const TRACKING_PARAM_RE = /^(utm_[a-z0-9_]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|mkt_tok|vero_[a-z]+|oly_anon_id|oly_enc_id)$/i;
  const CALLOUT_HINT_RE = /(callout|admonition|markdown-alert|note|tip|warning|important|caution|danger|info|notice|success|hint|alert)/i;
  const SAFE_HTML_TAGS = new Set([
    'TABLE', 'CAPTION', 'COLGROUP', 'COL', 'THEAD', 'TBODY', 'TFOOT', 'TR', 'TH', 'TD',
    'P', 'DIV', 'SPAN', 'BR', 'HR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'STRIKE', 'CODE', 'PRE', 'KBD', 'SAMP',
    'SUP', 'SUB', 'Q', 'BLOCKQUOTE', 'UL', 'OL', 'LI', 'DL', 'DT', 'DD', 'A', 'IMG',
    'FIGURE', 'FIGCAPTION', 'DETAILS', 'SUMMARY', 'TIME', 'ABBR', 'CITE', 'VAR', 'SMALL', 'MARK'
  ]);
  const SAFE_GLOBAL_HTML_ATTRIBUTES = new Set(['title', 'lang', 'dir']);
  const SAFE_HTML_ATTRIBUTES_BY_TAG = Object.freeze({
    A: new Set(['href']),
    IMG: new Set(['src', 'srcset', 'alt', 'width', 'height']),
    TH: new Set(['colspan', 'rowspan', 'headers', 'scope', 'abbr']),
    TD: new Set(['colspan', 'rowspan', 'headers']),
    COL: new Set(['span']),
    COLGROUP: new Set(['span']),
    OL: new Set(['start', 'reversed', 'type']),
    LI: new Set(['value']),
    DETAILS: new Set(['open']),
    TIME: new Set(['datetime']),
    Q: new Set(['cite']),
    BLOCKQUOTE: new Set(['cite'])
  });
  const MAX_DOM_ELEMENTS = 120_000;
  const MAX_SHADOW_NODES = 20_000;
  const REQUEST_CACHE_TTL_MS = 30_000;
  const activeRequests = new Map();

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || message.type !== 'page-to-md-extract') return false;

    const requestId = typeof message.requestId === 'string' && message.requestId.length <= 200
      ? message.requestId
      : '';
    let operation = requestId ? activeRequests.get(requestId) : null;

    if (!operation) {
      operation = Promise.resolve()
        .then(() => extractPageToMarkdown(message.payload || {}))
        .then((result) => ({ ok: true, result }), (error) => {
        console.error('Page to Markdown Pro extraction error:', error);
        return {
          ok: false,
          error: {
            code: typeof error?.code === 'string' ? error.code : 'EXTRACTION_FAILED',
            message: typeof error?.message === 'string' ? error.message : 'Could not extract this page.'
          }
        };
      });

      if (requestId) {
        activeRequests.set(requestId, operation);
        const scheduleCleanup = () => {
          setTimeout(() => {
            if (activeRequests.get(requestId) === operation) activeRequests.delete(requestId);
          }, REQUEST_CACHE_TTL_MS);
        };
        operation.then(scheduleCleanup, scheduleCleanup);
      }
    }

    operation.then(sendResponse);

    return true;
  });

  async function extractPageToMarkdown(payload) {
    const options = normalizeOptions(payload.options);
    const requestedMode = normalizeMode(payload.mode || options.actionMode);

    await settleDom();

    const meta = collectMeta();
    const selectionRoot = requestedMode === 'selection' ? cloneSelectionFragment() : null;
    let chosen;
    if (requestedMode === 'selection' && hasMeaningfulContent(selectionRoot)) {
      chosen = { kind: 'selection', root: selectionRoot };
    } else {
      assertDomBudget(document);
      const snapshot = createDocumentSnapshot();
      chosen = chooseExtractionRoot(snapshot, requestedMode, selectionRoot);
    }

    if (!chosen?.root) {
      throw codedError('NO_CONTENT_ROOT', 'Could not determine a usable content root for this page.');
    }

    if (chosen.article) {
      meta.title = firstNonEmpty(chosen.article.title, meta.title);
      meta.author = firstNonEmpty(chosen.article.byline, meta.author);
      meta.description = firstNonEmpty(chosen.article.excerpt, meta.description);
      meta.siteName = firstNonEmpty(chosen.article.siteName, meta.siteName);
    }
    meta.extractor = chosen.kind;
    meta.requestedMode = requestedMode;
    meta.selectionUsed = chosen.kind === 'selection';

    assertDomBudget(chosen.root);
    prepareRoot(chosen.root, meta, options, chosen.kind);
    assertDomBudget(chosen.root);

    let body = renderBlocks(Array.from(chosen.root.childNodes), {
      options,
      listDepth: 0,
      baseUrl: getContentBaseUrl(meta.canonicalUrl)
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
        published: meta.published,
        extractor: meta.extractor,
        requestedMode: meta.requestedMode,
        selectionUsed: meta.selectionUsed
      }
    };
  }

  function normalizeOptions(input = {}) {
    const options = input && typeof input === 'object' ? input : {};
    return {
      actionMode: normalizeMode(options.actionMode),
      includeFrontMatter: options.includeFrontMatter !== false,
      prependTitleHeadingIfMissing: options.prependTitleHeadingIfMissing !== false,
      includeSourceLink: options.includeSourceLink !== false,
      includeImages: options.includeImages !== false,
      stripTrackingParams: options.stripTrackingParams !== false,
      tableMode: ['smart', 'markdown', 'html'].includes(options.tableMode) ? options.tableMode : DEFAULT_OPTIONS.tableMode
    };
  }

  function normalizeMode(value) {
    return ['auto', 'main', 'full', 'selection'].includes(value) ? value : 'auto';
  }

  async function settleDom({ quietMs = 120, maxMs = 900 } = {}) {
    if (document.readyState === 'loading') {
      await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    }

    const root = document.documentElement;
    if (!root || typeof MutationObserver === 'undefined') {
      await nextFrame();
      return;
    }

    await new Promise((resolve) => {
      let finished = false;
      let quietTimer;
      let maxTimer;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(quietTimer);
        clearTimeout(maxTimer);
        observer.disconnect();
        resolve();
      };
      const armQuietTimer = () => {
        clearTimeout(quietTimer);
        quietTimer = setTimeout(finish, quietMs);
      };
      const observer = new MutationObserver(armQuietTimer);
      observer.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });
      armQuietTimer();
      maxTimer = setTimeout(finish, maxMs);
    });

    await nextFrame();
  }

  function nextFrame() {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }

  function collectMeta() {
    const structured = collectStructuredArticle();
    const canonicalUrl = [
      document.querySelector('link[rel="canonical"]')?.href,
      structured.url,
      location.href
    ].map((value) => normalizeOutputUrl(value, document.baseURI || location.href, false, 'link'))
      .find(Boolean) || '';
    const title = firstNonEmpty(
      getMetaContent('meta[property="og:title"]'),
      getMetaContent('meta[name="twitter:title"]'),
      structured.title,
      document.title,
      document.querySelector('h1')?.textContent
    );
    const author = firstNonEmpty(
      getMetaContent('meta[name="author"]'),
      getMetaContent('meta[property="article:author"]'),
      getMetaContent('meta[name="parsely-author"]'),
      structured.author,
      document.querySelector('[rel="author"]')?.textContent
    );
    const description = firstNonEmpty(
      getMetaContent('meta[name="description"]'),
      getMetaContent('meta[property="og:description"]'),
      getMetaContent('meta[name="twitter:description"]'),
      structured.description
    );
    const siteName = firstNonEmpty(
      getMetaContent('meta[property="og:site_name"]'),
      getMetaContent('meta[name="application-name"]'),
      structured.siteName,
      location.hostname
    );
    const published = firstNonEmpty(
      getMetaContent('meta[property="article:published_time"]'),
      getMetaContent('meta[name="date"]'),
      structured.published,
      document.querySelector('time[datetime]')?.getAttribute('datetime')
    );
    const lang = firstNonEmpty(
      document.documentElement.lang,
      getMetaContent('meta[http-equiv="content-language"]'),
      structured.lang
    );

    return {
      title: cleanText(title) || 'Untitled page',
      url: location.href,
      canonicalUrl,
      siteName: cleanText(siteName) || location.hostname || 'Local page',
      author: cleanText(author),
      description: cleanText(description),
      published: cleanText(published),
      lang: cleanText(lang),
      capturedAt: new Date().toISOString()
    };
  }

  function collectStructuredArticle() {
    const candidates = [];
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      const raw = script.textContent || '';
      if (!raw.trim() || raw.length > 2_000_000) continue;
      try {
        collectJsonLdNodes(JSON.parse(raw), candidates);
      } catch {
        // Malformed structured metadata must not break extraction.
      }
    }

    const article = candidates.find((item) => isArticleJsonLd(item)) || {};
    return {
      title: cleanText(article.headline || article.name),
      author: cleanText(extractPersonNames(article.author)),
      description: cleanText(article.description),
      published: cleanText(article.datePublished || article.dateCreated),
      siteName: cleanText(extractName(article.publisher) || extractName(article.isPartOf)),
      url: cleanText(extractUrl(article.mainEntityOfPage) || article.url),
      lang: cleanText(article.inLanguage)
    };
  }

  function collectJsonLdNodes(value, output) {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) collectJsonLdNodes(item, output);
      return;
    }
    if (typeof value !== 'object') return;
    output.push(value);
    if (Array.isArray(value['@graph'])) collectJsonLdNodes(value['@graph'], output);
  }

  function isArticleJsonLd(value) {
    const types = Array.isArray(value?.['@type']) ? value['@type'] : [value?.['@type']];
    return types.some((type) => ARTICLE_TYPES.has(String(type || '').toLowerCase()));
  }

  function extractPersonNames(value) {
    const values = Array.isArray(value) ? value : [value];
    return values.map(extractName).filter(Boolean).join(', ');
  }

  function extractName(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value.name || value.headline || '';
    return '';
  }

  function extractUrl(value) {
    if (typeof value === 'string') return value;
    if (value && typeof value === 'object') return value['@id'] || value.url || '';
    return '';
  }

  function getMetaContent(selector) {
    return document.querySelector(selector)?.getAttribute('content') || '';
  }

  function createDocumentSnapshot() {
    const snapshot = document.cloneNode(true);
    const budget = { count: 0 };
    copyOpenShadowRoots(document.documentElement, snapshot.documentElement, snapshot, budget);
    return snapshot;
  }

  function copyOpenShadowRoots(source, target, targetDocument, budget) {
    if (!(source instanceof Element) || !(target instanceof Element)) return;

    if (source.shadowRoot?.mode === 'open') {
      target.replaceChildren();
      const wrapper = targetDocument.createElement('div');
      wrapper.setAttribute('data-p2m-shadow-root', 'open');
      for (const child of source.shadowRoot.childNodes) {
        const cloned = cloneComposedNode(child, targetDocument, budget);
        if (cloned) wrapper.appendChild(cloned);
      }
      if (cleanText(wrapper.textContent) || wrapper.querySelector('img, video, audio, table, pre, code, math')) {
        target.appendChild(wrapper);
      }
      return;
    }

    const sourceChildren = Array.from(source.children);
    const targetChildren = Array.from(target.children);
    const count = Math.min(sourceChildren.length, targetChildren.length);
    for (let index = 0; index < count; index += 1) {
      copyOpenShadowRoots(sourceChildren[index], targetChildren[index], targetDocument, budget);
    }
  }

  function cloneComposedNode(node, targetDocument, budget) {
    budget.count += 1;
    if (budget.count > MAX_SHADOW_NODES) {
      throw codedError('DOM_TOO_LARGE', 'This page contains too many component nodes to export safely.');
    }

    if (node.nodeType === Node.TEXT_NODE) return targetDocument.createTextNode(node.nodeValue || '');
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    if (node.tagName === 'SLOT') {
      const fragment = targetDocument.createDocumentFragment();
      const assigned = node.assignedNodes?.({ flatten: true }) || [];
      const nodes = assigned.length ? assigned : Array.from(node.childNodes);
      for (const child of nodes) {
        const cloned = cloneComposedNode(child, targetDocument, budget);
        if (cloned) fragment.appendChild(cloned);
      }
      return fragment;
    }

    const clone = targetDocument.importNode(node, false);
    if (node.shadowRoot?.mode === 'open') {
      const wrapper = targetDocument.createElement('div');
      wrapper.setAttribute('data-p2m-shadow-root', 'open');
      for (const child of node.shadowRoot.childNodes) {
        const cloned = cloneComposedNode(child, targetDocument, budget);
        if (cloned) wrapper.appendChild(cloned);
      }
      clone.appendChild(wrapper);
    } else {
      for (const child of node.childNodes) {
        const cloned = cloneComposedNode(child, targetDocument, budget);
        if (cloned) clone.appendChild(cloned);
      }
    }
    return clone;
  }


  function chooseExtractionRoot(snapshot, mode, selectionRoot) {
    if (mode === 'selection' && hasMeaningfulContent(selectionRoot)) {
      return { kind: 'selection', root: selectionRoot };
    }
    if (mode === 'full') return { kind: 'full', root: snapshot.body.cloneNode(true) };

    const readability = buildReadabilityCandidate(snapshot);
    const semantic = buildSemanticCandidate(snapshot);

    if (mode === 'main') {
      return readability || semantic || { kind: 'full-fallback', root: snapshot.body.cloneNode(true) };
    }
    if (mode === 'selection') {
      return readability || semantic || { kind: 'full-fallback', root: snapshot.body.cloneNode(true) };
    }
    if (readability && semantic) return chooseBetweenCandidates(readability, semantic);
    return readability || semantic || { kind: 'full-fallback', root: snapshot.body.cloneNode(true) };
  }

  function buildReadabilityCandidate(snapshot) {
    if (typeof Readability === 'undefined') return null;
    try {
      const clone = snapshot.cloneNode(true);
      prepareDocumentForReadability(clone);
      const article = new Readability(clone, {
        keepClasses: true,
        maxElemsToParse: MAX_DOM_ELEMENTS,
        charThreshold: 120
      }).parse();
      if (!article?.content || cleanText(article.textContent).length < 80) return null;
      const tempDocument = document.implementation.createHTMLDocument('page-to-md-readability');
      tempDocument.body.innerHTML = article.content;
      const root = tempDocument.body;
      const metrics = measureNode(root);
      return { kind: 'readability', root, article, metrics, score: scoreCandidate(root, metrics, 'readability') };
    } catch (error) {
      console.warn('Readability failed:', error);
      return null;
    }
  }

  function prepareDocumentForReadability(clone) {
    const baseUrl = getContentBaseUrl(document.querySelector('link[rel="canonical"]')?.href);
    clone.querySelector('base')?.remove();
    if (clone.head && baseUrl) {
      const base = clone.createElement('base');
      base.href = baseUrl;
      clone.head.prepend(base);
    }
    for (const anchor of clone.querySelectorAll('a[href]')) {
      const href = normalizeOutputUrl(anchor.getAttribute('href'), baseUrl, false, 'link');
      if (href) anchor.setAttribute('href', href);
      else anchor.removeAttribute('href');
    }
    for (const image of clone.querySelectorAll('img, source')) normalizeImageLikeElement(image, baseUrl);
  }

  function buildSemanticCandidate(snapshot) {
    const seen = new Set();
    const candidates = [];
    for (const selector of CONTENT_ROOT_SELECTORS) {
      for (const node of snapshot.querySelectorAll(selector)) {
        if (!seen.has(node)) {
          seen.add(node);
          candidates.push(node);
        }
      }
    }
    if (!candidates.length && snapshot.body) candidates.push(snapshot.body);

    let best = null;
    for (const node of candidates) {
      if (!(node instanceof Element) || isClearlyNoiseNode(node)) continue;
      const metrics = measureNode(node);
      if (metrics.textLength < 80) continue;
      const score = scoreCandidate(node, metrics, 'semantic');
      if (!best || score > best.score) {
        best = { kind: 'semantic', root: node.cloneNode(true), metrics, score };
      }
    }
    return best;
  }

  function chooseBetweenCandidates(readability, semantic) {
    if (semantic.metrics.textLength > readability.metrics.textLength * 1.45
      && semantic.metrics.codeBlockCount >= readability.metrics.codeBlockCount
      && semantic.metrics.headingCount >= Math.max(1, Math.floor(readability.metrics.headingCount * 0.7))) {
      return semantic;
    }
    if (semantic.metrics.codeBlockCount > readability.metrics.codeBlockCount + 2
      || semantic.metrics.tableCount > readability.metrics.tableCount + 1) {
      return semantic;
    }
    if (readability.metrics.textLength >= semantic.metrics.textLength * 0.75) return readability;
    return readability.score >= semantic.score ? readability : semantic;
  }

  function measureNode(node) {
    const query = (selector) => node.querySelectorAll(selector).length;
    return {
      textLength: cleanText(node.textContent || '').length,
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
    score += metrics.headingCount * 180 + metrics.paragraphCount * 30 + metrics.listCount * 40;
    score += metrics.codeBlockCount * 200 + metrics.tableCount * 130 + metrics.imageCount * 16;
    score -= metrics.linkCount * 4 + metrics.navCount * 260 + metrics.asideCount * 220;
    if (kind === 'readability') score += 320;
    if (node.matches?.('article, main, [role="main"]')) score += 420;
    const classifier = `${node.className || ''} ${node.id || ''}`;
    if (/(content|article|markdown|prose|post|entry|docs|story|wiki)/i.test(classifier)) score += 220;
    if (/(sidebar|menu|nav|footer|header|share|related|promo|advert|cookie|toc)/i.test(classifier)) score -= 520;
    return score;
  }

  function cloneSelectionFragment() {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
    const tempDocument = document.implementation.createHTMLDocument('page-to-md-selection');
    for (let index = 0; index < selection.rangeCount; index += 1) {
      tempDocument.body.appendChild(tempDocument.importNode(selection.getRangeAt(index).cloneContents(), true));
    }
    return hasMeaningfulContent(tempDocument.body) ? tempDocument.body : null;
  }

  function hasMeaningfulContent(node) {
    if (!node) return false;
    if (textLength(node) > 0) return true;
    return Boolean(node.querySelector?.('img, picture, video, audio, table, pre, code, math, [data-tex], [data-latex]'));
  }

  function prepareRoot(root, meta, options, kind) {
    const baseUrl = getContentBaseUrl(meta.canonicalUrl);
    replaceMathNodes(root);
    markTaskListInputs(root);
    hydrateImagesFromNoscript(root, baseUrl, options);
    normalizeLinksImagesAndMedia(root, baseUrl, options);
    replaceEmojiImages(root);
    removeNoise(root, kind);
    expandDetails(root);
    unwrapRedundantContainers(root);
  }

  function replaceMathNodes(root) {
    const selector = [...BLOCK_MATH_SELECTORS, ...INLINE_MATH_SELECTORS].join(', ');
    const nodes = Array.from(root.querySelectorAll(selector)).filter((node) => {
      if (!(node instanceof Element) || node.closest('pre, code')) return false;
      const ancestor = node.parentElement?.closest(selector);
      return !ancestor;
    });

    for (const node of nodes) {
      const tex = extractMathTeX(node);
      if (!tex) continue;
      const replacement = root.ownerDocument.createElement(isBlockMathNode(node) ? 'div' : 'span');
      replacement.setAttribute('data-p2m-math', tex);
      replacement.setAttribute('data-p2m-display', isBlockMathNode(node) ? 'block' : 'inline');
      node.replaceWith(replacement);
    }
  }

  function extractMathTeX(node) {
    const candidates = [
      node.querySelector?.('annotation[encoding="application/x-tex"], annotation[encoding="application/tex"], annotation[encoding="application/x-latex"]')?.textContent,
      node.matches?.('script[type^="math/"]') ? node.textContent : '',
      node.getAttribute?.('data-tex'), node.getAttribute?.('data-latex'), node.getAttribute?.('alt'),
      node.getAttribute?.('aria-label'), node.textContent
    ];
    const value = cleanText(firstNonEmpty(...candidates));
    if (!value) return '';
    if (!/[\\=^_{}]|\bfrac\b|\bsum\b|\bint\b/i.test(value) && value.length > 180) return '';
    return value;
  }

  function isBlockMathNode(node) {
    return node.matches?.(BLOCK_MATH_SELECTORS.join(', ')) || /(display|block)/i.test(String(node.className || ''));
  }

  function markTaskListInputs(root) {
    for (const input of root.querySelectorAll('li input[type="checkbox"]')) {
      const marker = root.ownerDocument.createElement('span');
      marker.setAttribute('data-p2m-task', input.checked || input.hasAttribute('checked') ? 'checked' : 'unchecked');
      input.replaceWith(marker);
    }
  }

  function hydrateImagesFromNoscript(root, baseUrl, options) {
    for (const noscript of root.querySelectorAll('noscript')) {
      const html = noscript.textContent || '';
      if (!/<img/i.test(html)) continue;
      try {
        const temp = document.implementation.createHTMLDocument('page-to-md-noscript');
        temp.body.innerHTML = html;
        const source = temp.querySelector('img');
        const target = noscript.previousElementSibling?.tagName === 'IMG' ? noscript.previousElementSibling : null;
        if (target && source && !pickImageSource(target)) {
          const url = normalizeOutputUrl(source.getAttribute('src'), baseUrl, options.stripTrackingParams, 'image');
          if (url) target.setAttribute('src', url);
        }
      } catch {
        // Broken noscript HTML is ignored.
      }
    }
  }

  function normalizeLinksImagesAndMedia(root, baseUrl, options) {
    for (const anchor of root.querySelectorAll('a[href]')) {
      const href = normalizeOutputUrl(anchor.getAttribute('href'), baseUrl, options.stripTrackingParams, 'link');
      if (href) anchor.setAttribute('href', href);
      else {
        anchor.removeAttribute('href');
        anchor.setAttribute('data-p2m-unsafe-link', '');
      }
    }

    for (const image of root.querySelectorAll('img')) {
      const raw = pickImageSource(image);
      const src = normalizeOutputUrl(raw, baseUrl, false, 'image');
      if (src) image.setAttribute('src', src);
      else image.removeAttribute('src');
      for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'data-url', 'data-srcset', 'srcset']) {
        image.removeAttribute(attr);
      }
      if (!image.getAttribute('alt') && image.getAttribute('title')) image.setAttribute('alt', image.getAttribute('title'));
      const width = Number(image.getAttribute('width') || 0);
      const height = Number(image.getAttribute('height') || 0);
      if ((width && width <= 2) || (height && height <= 2)) image.remove();
    }

    for (const media of root.querySelectorAll('video, audio')) {
      const raw = firstNonEmpty(media.getAttribute('src'), media.querySelector('source[src]')?.getAttribute('src'));
      const src = normalizeOutputUrl(raw, baseUrl, false, 'media');
      if (src) media.setAttribute('data-p2m-media-url', src);
    }

    for (const source of root.querySelectorAll('picture source, video source, audio source')) {
      const src = normalizeOutputUrl(source.getAttribute('src'), baseUrl, false, 'media');
      if (src) source.setAttribute('src', src);
      const srcset = normalizeSrcset(source.getAttribute('srcset'), baseUrl);
      if (srcset) source.setAttribute('srcset', srcset);
    }
  }

  function normalizeImageLikeElement(element, baseUrl) {
    for (const attr of ['src', 'data-src', 'data-original', 'data-lazy-src', 'data-url']) {
      const value = element.getAttribute(attr);
      if (!value) continue;
      const url = normalizeOutputUrl(value, baseUrl, false, 'image');
      if (url) element.setAttribute(attr, url);
    }
    for (const attr of ['srcset', 'data-srcset']) {
      const value = normalizeSrcset(element.getAttribute(attr), baseUrl);
      if (value) element.setAttribute(attr, value);
    }
  }

  function normalizeSrcset(value, baseUrl) {
    if (!value) return '';
    const candidates = parseSrcset(value);
    return candidates.map(({ url, descriptor }) => {
      const normalized = normalizeOutputUrl(url, baseUrl, false, 'image');
      return normalized ? `${normalized}${descriptor ? ` ${descriptor}` : ''}` : '';
    }).filter(Boolean).join(', ');
  }

  function parseSrcset(value) {
    const input = String(value || '').trim();
    if (!input) return [];
    const output = [];
    let index = 0;
    while (index < input.length) {
      while (/[\s,]/.test(input[index] || '')) index += 1;
      if (index >= input.length) break;
      const start = index;
      const dataUrl = input.slice(index, index + 5).toLowerCase() === 'data:';
      if (dataUrl) {
        while (index < input.length && !/\s/.test(input[index])) index += 1;
      } else {
        while (index < input.length && !/[\s,]/.test(input[index])) index = 1;
      }
      const url = input.slice(start, index);
      while (/\s/.test(input[index] || '')) index += 1;
      const descriptorStart = index;
      while (index < input.length && input[index] !== ',') index += 1;
      const descriptor = input.slice(descriptorStart, index).trim();
      if (input[index] === ',') index += 1;
      if (url) output.push({ url, descriptor });
    }
    return output;
  }

  function replaceEmojiImages(root) {
    for (const image of root.querySelectorAll('img')) {
      const alt = image.getAttribute('alt') || '';
      const hint = `${image.className || ''} ${image.getAttribute('src') || ''}`;
      if (alt && (/(emoji|emoticon|twemoji|gemoji)/i.test(hint) || /^:[a-z0-9_+]+:$/i.test(alt))) {
        image.replaceWith(root.ownerDocument.createTextNode(alt));
      }
    }
  }

  function removeNoise(root, kind) {
    const selectors = kind === 'full' || kind === 'selection' ? MINIMAL_NOISE_SELECTORS : NOISE_SELECTORS;
    for (const selector of selectors) {
      for (const node of root.querySelectorAll(selector)) {
        if (node.closest('pre, code')) continue;
        node.remove();
      }
    }
    for (const node of root.querySelectorAll('hidden], [aria-hidden="true"]')) {
      if (node.hasAttribute('data-p2m-math') || node.closest('[data-p2m-math], pre, code')) continue;
      node.remove();
    }
  }

  function expandDetails(root) {
    for (const details of root.querySelectorAll('details')) details.setAttribute('open', 'open');
  }

  function unwrapRedundantContainers(root) {
    for (const node of Array.from(root.querySelectorAll('div, section'))) {
      if (!(node instanceof Element) || node.hasAttribute('data-p2m-shadow-root')) continue;
      if (node.children.length !== 1 || node.attributes.length > 1) continue;
      const child = node.firstElementChild;
      if (!child || !BLOCK_TAGS.has(child.tagName) || !node.parentNode) continue;
      node.parentNode.replaceChild(child, node);
    }
  }

  function renderBlocks(nodes, context) {
    const blocks = [];
    let inline = [];
    const flush = () => {
      if (!inline.length) return;
      const text = renderInlineNodes(inline, context).trim();
      inline = [];
      if (text) blocks.push(text);
    };

    for (const node of nodes) {
      if (isIgnorableNode(node)) continue;
      if (isBlockNode(node)) {
        flush();
        const block = renderBlock(node, context).trim();
        if (block) blocks.push(block);
      } else {
        inline.push(node);
      }
    }
    flush();
    return blocks.join('\n\n');
  }

  function isIgnorableNode(node) {
    if (!node) return true;
    if (node.nodeType === Node.COMMENT_NODE) return true;
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) return true;
    return node.nodeType === Node.ELEMENT_NODE && node.hasAttribute('data-p2m-ignore');
  }

  function isBlockNode(node) {
    if (!(node instanceof Element)) return false;
    if (node.hasAttribute('data-p2m-math') && node.getAttribute('data-p2m-display') === 'block') return true;
    if (isCodeBlockContainer(node) || isCalloutNode(node)) return true;
    if (BLOCK_TAGS.has(node.tagName)) return true;
    return Boolean(node.querySelector?.(':scope > [data-p2m-shadow-root]'));
  }

  function renderBlock(node, context) {
    if (node.nodeType === Node.TEXT_NODE) return renderInlineNodes([node], context).trim();
    if (!(node instanceof Element)) return '';
    if (node.hasAttribute('data-p2m-math')) return renderMathNode(node);
    if (isCodeBlockContainer(node)) return renderCodeBlock(node);
    if (isCalloutNode(node)) return renderCallout(node, context);

    switch (node.tagName) {
      case 'P': return renderInlineNodes(Array.from(node.childNodes), context).trim();
      case 'H1': case 'H2': case 'H3': case 'H4': case 'H5': case 'H6': {
        const text = renderInlineNodes(Array.from(node.childNodes), context).trim();
        return text ? `${'#'.repeat(Number(node.tagName.slice(1)))} ${text}` : '';
      }
      case 'UL': case 'OL': return renderList(node, context);
      case 'BLOCKQUOTE': return renderBlockquote(node, context);
      case 'TABLE': return renderTable(node, context);
      case 'FIGURE': return renderFigure(node, context);
      case 'IMG': case 'PICTURE': return renderBlockImage(node, context);
      case 'VIDEO': case 'AUDIO': return renderMedia(node, context);
      case 'HR': return '---';
      case 'DETAILS': return renderDetails(node, context);
      case 'DL': return renderDefinitionList(node, context);
      case 'DT': {
        const text = renderInlineNodes(Array.from(node.childNodes), context).trim();
        return text ? `**${text}**` : '';
      }
      case 'DD': {
        const text = renderBlocks(Array.from(node.childNodes), context).trim();
        return text ? `: ${text.replace(/\n/g, '\n  ')}` : '';
      }
      case 'FIGCAPTION': {
        const text = renderInlineNodes(Array.from(node.childNodes), context).trim();
        return text ? `*${text}*` : '';
      }
      default: return renderBlocks(Array.from(node.childNodes), context);
    }
  }

  function renderInlineNodes(nodes, context) {
    return nodes.map((node) => renderInline(node, context)).join('');
  }

  function renderInline(node, context) {
    if (!node) return '';
    if (node.nodeType === Node.TEXT_NODE) return escapeMarkdownText(normalizeInlineWhitespace(node.nodeValue || ''));
    if (!(node instanceof Element)) return '';
    if (node.hasAttribute('data-p2m-task')) return '';
    if (node.hasAttribute('data-p2m-math')) return renderMathNode(node);
    if (isCodeBlockContainer(node)) return `\l\n${renderCodeBlock(node)}\n\n`;

    switch (node.tagName) {
      case 'BR': return '<br-\n';
      case 'A': return renderLink(node, context);
      case 'IMG': case 'PICTURE': return renderInlineImage(node, context);
      case 'VIDEO': case 'AUDIO': return renderMedia(node, context);
      case 'STRONG': case 'B': {
        const text = renderInlineNodes(Array.from(node.childNodes), context).trim();
        return text ? `**${text}**` : '';
      }
      case 'EM': case 'I': {
        const text = renderInlineNodes(Array.from(node.childNodes), context).trim();
        return text ? `*${text}*` : '';
      }
      case 'DEL': case 'S': case 'STRIKE': {
        const text = renderInlineNodes(Array.from(node.childNodes), context).trim();
        return text ? `~~${text}~~` : '';
      }
      case 'CODE': case 'KBD': case 'SAMP': return renderInlineCode(node.textContent || '');
      case 'SUP': case 'SUB': {
        const tag = node.tagName.toLowerCase();
        const text = renderInlineNodes(Array.from(node.childNodes), context).trim();
        return text ? `<${tag}>${text}</${tag}>` : '';
      }
      case 'Q': {
        const text = renderInlineNodes(Array.from(node.childNodes), context).trim();
        return text ? `“${text}”` : '';
      }
      case 'SPAN': case 'SMALL': case 'MARK': case 'ABBR': case 'TIME': case 'LABEL': case 'CITE': case 'VAR':
        return renderInlineNodes(Array.from(node.childNodes), context);
      default:
        if (BLOCK_TAGS.has(node.tagName) || node.querySelector?.(':scope > [data-p2m-shadow-root]')) {
          return flattenNodeToText(node, context);
        }
        return renderInlineNodes(Array.from(node.childNodes), context);
    }
  }

  function flattenNodeToText(node, context) {
    const rendered = renderBlocks(Array.from(node.childNodes), context).replace(/\n+/g, ' ').trim();
    return rendered ? ` ${rendered} ` : '';
  }

  function renderLink(anchor, context) {
    const href = anchor.getAttribute('href') || '';
    const text = renderInlineNodes(Array.from(anchor.childNodes), context).trim()
      || escapeMarkdownText(cleanText(anchor.textContent || href));
    if (!href || anchor.hasAttribute('data-p2m-unsafe-link')) return text;
    if (href.startsWith('#')) return text;
    if (text === href) return `<${href}>`;
    return `[${text}](${escapeLinkDestination(href)})`;
  }

  function renderInlineImage(node, context) {
    const image = node.tagName === 'PICTURE' ? node.querySelector('img') : node;
    if (!(image instanceof Element)) return '';
    const alt = escapeMarkdownText(image.getAttribute('alt') || '');
    if (context.options.includeImages === false) return alt;
    const src = image.getAttribute('src') || '';
    if (!src) return alt;
    const title = image.getAttribute('title') || '';
    const titlePart = title ? ` "${title.replace(/"/g, '\\"')}"` : '';
    return `![${alt}](${escapeLinkDestination(src)}${titlePart})`;
  }

  function renderBlockImage(node, context) {
    return renderInlineImage(node, context);
  }

  function renderMedia(node, context) {
    const url = node.getAttribute('data-p2m-media-url') || '';
    if (!url) return cleanText(node.textContent || '');
    const label = cleanText(firstNonEmpty(
      node.getAttribute('title'),
      node.getAttribute('aria-label'),
      node.textContent,
      node.tagName === 'VIDEO' ? 'Watch video' : 'Listen to audio'
    ));
    return `[${escapeMarkdownText(label)}](${escapeLinkDestination(url)})`;
  }

  function renderInlineCode(value) {
    const clean = String(value || '').replace(/\r\n?/g, ' ').replace(/\s+/g, ' ').trim();
    if (!clean) return '';
    const maxRun = Math.max(0, ...(clean.match(/`+/g) || []).map((part) => part.length));
    const fence = '`'.repeat(Math.max(1, maxRun + 1));
    const pad = clean.startsWith('`') || clean.endsWith('`');
    return `${fence}${pad ? ' ' : ''}${clean}${pad ? ' ' : ''}${fence}`;
  }

  function isCodeBlockContainer(node) {
    if (!(node instanceof Element)) return false;
    if (node.tagName === 'PRE') return true;
    if (node.tagName === 'TABLE' && /(highlight|code|rouge)/i.test(node.className || '') && node.querySelector('pre')) return true;
    return /\b(highlight|codehilite|rouge-code|highlighttable)\b/i.test(node.className || '') && Boolean(node.querySelector('pre, code'));
  }

  function renderCodeBlock(node) {
    const code = extractCodeText(node);
    if (!code) return '';
    const language = detectCodeLanguage(node);
    const fence = chooseCodeFence(code);
    return `${fence}${language}\n${code}\n${fence}`;
  }

  function extractCodeText(node) {
    const source = node.tagName === 'PRE' ? node : node.querySelector('pre') || node;
    return String(source.textContent || '').replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/^\n+|\n+$/g, '');
  }

  function detectCodeLanguage(node) {
    const hints = [
      node.getAttribute?.('data-language'), node.getAttribute?.('data-lang'), node.className,
      node.querySelector?.('pre')?.className, node.querySelector?.('code')?.className,
      node.parentElement?.className
    ].filter(Boolean).join(' ');
    const match = hints.match(/(?:lang(?:uage)?-|highlight-source-|brush:\s*)([a-z0-9_+#.-]+)/i);
    return match ? normalizeLanguageName(match[1]) : '';
  }

  function normalizeLanguageName(value) {
    const language = String(value || '').toLowerCase();
    const aliases = { js: 'javascript', ts: 'typescript', py: 'python', rb: 'ruby', sh: 'bash', zsh: 'bash', shell: 'bash', 'c#': 'csharp', yml: 'yaml', md: 'markdown' };
    return aliases[language] || language;
  }

  function chooseCodeFence(code) {
    const maxRun = Math.max(0, ...(code.match(/`+/g) || []).map((part) => part.length));
    return '`'.repeat(Math.max(3, maxRun + 1));
  }

  function renderList(list, context) {
    const ordered = list.tagName === 'OL';
    const start = Number.parseInt(list.getAttribute('start') || '1', 10) || 1;
    const itemContext = { ...context, listDepth: (context.listDepth || 0) + 1 };
    const items = Array.from(list.children).filter((child) => child.tagName === 'LI');
    return items.map((item, index) => renderListItem(item, itemContext, ordered ? `${start + index}.` : '-')).filter(Boolean).join('\n');
  }

  function renderListItem(item, context, defaultMarker) {
    const clone = item.cloneNode(true);
    const task = Array.from(clone.querySelectorAll('[data-p2m-task]'))
      .find((candidate) => candidate.closest('li') === clone);
    const marker = task ? `${defaultMarker} [${task.getAttribute('data-p2m-task') === 'checked' ? 'x' : ' '}]` : defaultMarker;
    task?.remove();

    const nested = [];
    const contentNodes = [];
    for (const child of Array.from(clone.childNodes)) {
      if (child instanceof Element && (child.tagName === 'UL' || child.tagName === 'OL')) nested.push(child);
      else contentNodes.push(child);
    }

    const indent = '  '.repeat(Math.max(0, (context.listDepth || 1) - 1));
    const content = renderBlocks(contentNodes, context).trim();
    const lines = content ? content.split('\n') : [''];
    const output = [`${indent}${marker}${lines[0] ? ` ${lines[0]}` : ''}`];
    for (let index = 1; index < lines.length; index += 1) output.push(`${indent}  ${lines[index]}`);
    for (const child of nested) {
      const value = renderList(child, context).trim();
      if (value) output.push(value);
    }
    return output.join('\n');
  }

  function renderBlockquote(node, context) {
    const text = renderBlocks(Array.from(node.childNodes), context).trim();
    return text ? prefixLines(text, '> ') : '';
  }

  function isCalloutNode(node) {
    if (!(node instanceof Element)) return false;
    if (node.tagName === 'BLOCKQUOTE' && node.textContent?.trim().startsWith('[!')) return false;
    const hint = `${node.className || ''} ${node.getAttribute('data-callout') || ''} ${node.getAttribute('data-admonition') || ''} ${node.getAttribute('role') || ''}`;
    return CALLOUT_HINT_RE.test(hint) && !node.closest('pre, code');
  }

  function renderCallout(node, context) {
    const clone = node.cloneNode(true);
    const type = detectCalloutType(clone);
    const titleNode = clone.querySelector('.admonition-title, .callout-title, .markdown-alert-title, summary, header');
    const title = titleNode ? cleanText(renderInlineNodes(Array.from(titleNode.childNodes), context)) : '';
    titleNode?.remove();
    const content = renderBlocks(Array.from(clone.childNodes), context).trim();
    const lines = [`> [!${type}]`];
    if (title && title.toUpperCase() !== type) lines.push(`> ${title}`);
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
    if (/important/.test(hint)) return 'IMPORTANT';
    return 'NOTE';
  }

  function renderDetails(node, context) {
    const clone = node.cloneNode(true);
    const summary = clone.querySelector(':scope > summary');
    const title = summary ? cleanText(renderInlineNodes(Array.from(summary.childNodes), context)) : 'Details';
    summary?.remove();
    const content = renderBlocks(Array.from(clone.childNodes), context).trim();
    const lines = [`> **${title || 'Details'}**`];
    if (content) {
      lines.push('>');
      lines.push(...content.split('\n').map((line) => `> ${line}`));
    }
    return lines.join('\n');
  }

  function renderFigure(node, context) {
    const clone = node.cloneNode(true);
    const caption = clone.querySelector('figcaption');
    const captionText = caption ? cleanText(renderInlineNodes(Array.from(caption.childNodes), context)) : '';
    caption?.remove();
    const parts = [];
    const image = clone.querySelector('img');
    if (image) {
      parts.push(renderBlockImage(image, context));
      image.remove();
    }
    const media = clone.querySelector('video, audio');
    if (media) {
      parts.push(renderMedia(media, context));
      media.remove();
    }
    const remainder = renderBlocks(Array.from(clone.childNodes), context).trim();
    if (remainder) parts.push(remainder);
    if (captionText) parts.push(`*${captionText}*`);
    return parts.filter(Boolean).join('\n\n');
  }

  function renderTable(table, context) {
    if (isCodeBlockContainer(table)) return renderCodeBlock(table);
    if (context.options.tableMode === 'html') return sanitizeHtml(table, context.baseUrl);
    if (isLikelyLayoutTable(table)) {
      const cells = [];
      for (const row of table.rows) {
        for (const cell of row.cells) {
          const text = renderBlocks(Array.from(cell.childNodes), context).trim();
          if (text) cells.push(text);
        }
      }
      return cells.join('\n\n');
    }
    if (isComplexTable(table) && context.options.tableMode !== 'markdown') return sanitizeHtml(table, context.baseUrl);

    const extractedRows = Array.from(table.rows).map((element) => ({
      element,
      values: Array.from(element.cells).map((cell) => renderTableCell(cell, context))
    })).filter(({ values }) => values.some(Boolean));
    if (!extractedRows.length) return '';
    const width = Math.max(...extractedRows.map(({ values }) => values.length));
    const normalized = extractedRows.map(({ values }) => [
      ...values,
      ...Array(Math.max(0, width - values.length)).fill('')
    ].slice(0, width));
    const headerIndex = findHeaderRowIndex(extractedRows.map(({ element }) => element));
    const header = normalized[headerIndex] || normalized[0];
    const body = normalized.filter((_, index) => index !== headerIndex);
    return [
      `| ${header.map(escapeTableCell).join(' | ')} |`,
      `| ${header.map(() => '---').join(' | ')} |`,
      ...body.map((row) => `| ${row.map(escapeTableCell).join(' | ')} |`)
    ].join('\n');
  }

  function isLikelyLayoutTable(table) {
    if (table.getAttribute('role') === 'presentation' || table.querySelector('table')) return true;
    const rows = table.rows.length;
    const columns = Math.max(0, ...Array.from(table.rows).map((row) => row.cells.length));
    const headings = table.querySelectorAll('th').length;
    const images = table.querySelectorAll('img').length;
    const textLength = cleanText(table.textContent).length;
    if (headings > 0) return false;
    if (columns <= 1 && rows > 2) return true;
    return columns <= 2 && images > 0 && textLength / Math.max(1, rows * Math.max(columns, 1)) < 40;
  }

  function isComplexTable(table) {
    if (table.querySelector('[rowspan]:not([rowspan="1"]), [colspan]:not([colspan="1"])')) return true;
    if (table.querySelector('pre, code, ul, ol, blockquote, table')) return true;
    const widths = Array.from(table.rows).map((row) => row.cells.length);
    return widths.length > 0 && widths.some((width) => width !== widths[0]);
  }

  function renderTableCell(cell, context) {
    return renderBlocks(Array.from(cell.childNodes), context).replace(/\n{2,}/g, '<br><br>').replace(/\n/g, '<br>').trim();
  }

  function findHeaderRowIndex(rows) {
    const headerGroupIndex = rows.findIndex((row) => row.parentElement?.tagName === 'THEAD');
    if (headerGroupIndex >= 0) return headerGroupIndex;
    const headingCellIndex = rows.findIndex((row) => Array.from(row.cells).some((cell) => cell.tagName === 'TH'));
    return headingCellIndex >= 0 ? headingCellIndex : 0;
  }

  function escapeTableCell(value) {
    return String(value || '').replace(/\|/g, '\\|').replace(/\r\n?/g, '\n');
  }

  function sanitizeHtml(node, baseUrl) {
    const clone = node.cloneNode(true);
    const activeSelector = [
      'script', 'style', 'iframe', 'object', 'embed', 'applet', 'form', 'input', 'button',
      'textarea', 'select', 'option', 'meta', 'link', 'base', 'template', 'noscript',
      'frame', 'frameset', 'canvas', 'svg', 'math', 'video', 'audio', 'source', 'track'
    ].join(', ');
    for (const active of clone.querySelectorAll(activeSelector)) active.remove();

    for (const element of Array.from(clone.querySelectorAll('*'))) {
      if (SAFE_HTML_TAGS.has(element.tagName)) continue;
      element.replaceWith(...Array.from(element.childNodes));
    }

    for (const element of [clone, ...clone.querySelectorAll('*')]) {
      for (const attr of Array.from(element.attributes || [])) {
        const name = attr.name.toLowerCase();
        const allowedForTag = SAFE_HTML_ATTRIBUTES_BY_TAG[element.tagName];
        if (!SAFE_GLOBAL_HTML_ATTRIBUTES.has(name) && !allowedForTag?.has(name)) {
          element.removeAttribute(attr.name);
          continue;
        }
        if (name === 'srcset') {
          const safe = normalizeSrcset(attr.value, baseUrl);
          if (safe) element.setAttribute(attr.name, safe);
          else element.removeAttribute(attr.name);
          continue;
        }
        if (name === 'href' || name === 'src' || name === 'cite') {
          const kind = name === 'src' ? 'media' : 'link';
          const safe = normalizeOutputUrl(attr.value, baseUrl, false, kind);
          if (safe) element.setAttribute(attr.name, safe);
          else element.removeAttribute(attr.name);
        }
      }
    }
    return clone.outerHTML;
  }

  function renderDefinitionList(node, context) {
    const parts = [];
    for (const child of node.children) {
      if (child.tagName === 'DT') {
        const term = renderInlineNodes(Array.from(child.childNodes), context).trim();
        if (term) parts.push(`**${term}**`);
      } else if (child.tagName === 'DD') {
        const definition = renderBlocks(Array.from(child.childNodes), context).trim();
        if (definition) parts.push(`: ${definition.replace(/\n/g, '\n  ')}`);
      }
    }
    return parts.join('\n');
  }

  function renderMathNode(node) {
    const tex = node.getAttribute('data-p2m-math') || '';
    if (!tex) return '';
    return node.getAttribute('data-p2m-display') === 'block' ? `$$\n${tex}\n$$` : `$${tex}$`;
  }

  function maybePrependTitleHeading(body, meta, options) {
    if (!options.prependTitleHeadingIfMissing) return body;
    const title = cleanText(meta.title);
    if (!title) return body;
    const firstLine = (body.split('\n').find((line) => line.trim()) || '').trim();
    if (/^#{1,6}\s+/.test(firstLine)) return body;
    if (cleanText(stripMarkdownFormatting(firstLine)).toLowerCase() === title.toLowerCase()) return body;
    return body ? `# ${escapeMarkdownText(title)}\n\n${body}` : `# ${escapeMarkdownText(title)}`;
  }

  function buildDocumentMarkdown(body, meta, options) {
    const pieces = [];
    if (options.includeFrontMatter) pieces.push(buildFrontMatter(meta));
    if (options.includeSourceLink && meta.canonicalUrl) {
      const label = escapeMarkdownText(meta.title || meta.canonicalUrl);
      pieces.push(`Source: [${label}](${escapeLinkDestination(meta.canonicalUrl)})`);
    }
    if (body) pieces.push(body);
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
      if (value !== '' && value !== null && value !== undefined) lines.push(`${key}: ${yamlQuote(value)}`);
    }
    lines.push('---');
    return lines.join('\n');
  }

  function yamlQuote(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}"`;
  }

  function normalizeMarkdownSafely(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const output = [];
    let blankRun = 0;
    let fenceChar = '';
    let fenceLength = 0;

    for (const line of lines) {
      const fenceMatch = line.match(/^\s*([`~]{3,})/);
      if (fenceMatch) {
        const char = fenceMatch[1][0];
        const length = fenceMatch[1].length;
        if (!fenceChar) {
          fenceChar = char;
          fenceLength = length;
        } else if (char === fenceChar && length >= fenceLength) {
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
      const trimmed = line.replace(/[ \t]+$/g, '');
      if (!trimmed) {
        blankRun += 1;
        if (blankRun <= 2) output.push('');
      } else {
        blankRun = 0;
        output.push(trimmed);
      }
    }
    return `${output.join('\n').trim()}\n`;
  }

  function getContentBaseUrl(canonicalUrl = '') {
    const documentBase = String(document.baseURI || location.href || '');
    if (/^https?:/i.test(documentBase)) return documentBase;
    return normalizeOutputUrl(canonicalUrl, documentBase || location.href, false, 'link')
      || documentBase
      || location.href;
  }

  function normalizeOutputUrl(rawValue, baseUrl, stripTracking, kind) {
    const raw = String(rawValue || '').trim();
    if (!raw) return '';
    if (raw.startsWith('#')) return kind === 'link' ? raw : '';
    if (/^(javascript|vbscript|data):/i.test(raw)) return '';

    try {
      const url = new URL(raw, baseUrl || document.baseURI || location.href);
      const allowed = kind === 'link'
        ? new Set(['http:', 'https:', 'mailto:', 'tel:'])
        : new Set(['http:', 'https:']);
      if (!allowed.has(url.protocol)) return '';
      if (stripTracking && (url.protocol === 'http:' || url.protocol === 'https:')) {
        for (const key of Array.from(url.searchParams.keys())) {
          if (TRACKING_PARAM_RE.test(key)) url.searchParams.delete(key);
        }
      }
      return url.href;
    } catch {
      return '';
    }
  }

  function pickImageSource(image) {
    for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'data-url']) {
      const value = image.getAttribute(attr);
      if (isUsableImageCandidate(value)) return value;
    }
    for (const attr of ['data-srcset', 'srcset']) {
      const candidates = parseSrcset(image.getAttribute(attr));
      const ranked = candidates.map(({ url, descriptor }) => ({
        url,
        score: descriptor.endsWith('w') ? Number.parseInt(descriptor, 10)
          : descriptor.endsWith('x') ? Number.parseFloat(descriptor) * 1000 : 0
      })).sort((left, right) => right.score - left.score);
      const candidate = ranked.find(({ url }) => isUsableImageCandidate(url));
      if (candidate?.url) return candidate.url;
    }
    const src = image.getAttribute('src');
    if (isUsableImageCandidate(src)) return src;
    return '';
  }

  function isUsableImageCandidate(value) {
    const candidate = String(value || '').trim();
    return Boolean(candidate)
      && !candidate.startsWith('#')
      && !/^(?:about:blank|blob:|data:|javascript:|vbscript:)/i.test(candidate);
  }

  function assertDomBudget(root) {
    const count = root.querySelectorAll?.('*').length || 0;
    if (count > MAX_DOM_ELEMENTS) {
      throw codedError('DOM_TOO_LARGE', `This page contains ${count.toLocaleString()} elements, which exceeds the safe extraction limit.`);
    }
  }

  function cleanText(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/[\t\r\n ]+/g, ' ').trim();
  }

  function normalizeInlineWhitespace(value) {
    return String(value || '').replace(/\u00a0/g, ' ').replace(/[\t\r\n ]+/g, ' ');
  }

  function escapeMarkdownText(value) {
    return String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/~/g, '\\~')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/([*_\[\]])/g, '\\$1')
      .replace(/(^|\n)([>#])/g, '$1\\$2')
      .replace(/(^|\n)([-+*])(\s)/g, '$1\\$2$3')
      .replace(/(^|\n)(\d+)\.(\s)/g, '$1$2\\.$3');
  }

  function escapeLinkDestination(value) {
    return String(value  || '').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  }

  function prefixLines(text, prefix) {
    return String(text || '').split('\n').map((line) => `${prefix}${line}`).join('\n');
  }

  function stripMarkdownFormatting(value) {
    return String(value || '').replace(/^#{1,6}\s+/, '').replace(/[*_`~\[\]()>-]/g, '').trim();
  }

  function firstNonEmpty(...values) {
    for (const value of values) if (cleanText(value)) return value;
    return '';
  }

  function textLength(node) {
    return cleanText(node?.textContent || '').length;
  }

  function isClearlyNoiseNode(node) {
    return /(sidebar|toc|nav|menu|footer|header|share|related|promo|advert|cookie|consent)/i.test(`${node.className || ''} ${node.id || ''}`);
  }

  function codedError(code, message) {
    const error = new Error(message || code);
    error.code = code;
    return error;
  }
})();
