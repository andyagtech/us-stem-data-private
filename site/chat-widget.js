/**
 * PhD Demographics Chat Widget — v2.0.0
 *
 * Floating assistant for every page on the site. One plain file, no build step,
 * no dependencies. Speaks the v2 block contract (see chat_contract.md): the
 * backend sends DATA plus a SEMANTIC ROLE, this file owns every pixel.
 *
 * Usage: <script src="/chat-widget.js"></script>
 *        (sidebar.js also appends it, so the file guards against double load.)
 *
 * SECURITY POSTURE — read before editing.
 *
 *   Model output is DATA, never markup. There is not one `innerHTML =` fed by
 *   anything that came off the wire, and not one model string interpolated into
 *   an HTML attribute. Every visible character arrives via `document.createTextNode`
 *   or `.textContent`; every handler is attached with `addEventListener`; every
 *   URL is checked as a parsed `URL` object, never as a string prefix.
 *
 *   That is strictly stronger than "escape then format": there is no format
 *   step that could un-escape. The v1 widget's three holes —
 *     (a) markdownToHtml() output written to div.innerHTML unescaped,
 *     (b) [label](href) accepting any href, javascript: included,
 *     (c) section_id interpolated into onclick="...'${sectionId}'...",
 *   are all closed by construction rather than by filtering.
 *
 *   Fragments are OPAQUE. This file never parses, pattern-matches or branches on
 *   a fragment's contents; it carries the string and hands it to the browser or
 *   to window.Anchors. The site's anchor scheme is being rationalised in a
 *   parallel workstream and nothing here may assume its grammar.
 */
(function () {
  'use strict';

  var WIDGET_VERSION = '2.0.0';
  var CHAT_ENDPOINT = 'https://lamsi2swef2o2ark2ylnupz5wy0vedcw.lambda-url.us-east-1.on.aws/';
  if (CHAT_ENDPOINT.indexOf('PLACEHOLDER') !== -1) return;

  // The widget is pulled in directly by 107 pages and appended by sidebar.js on
  // 21 more. A page that ever gains both must not sprout two bubbles.
  if (window.__phdChat) return;

  var SITE_ORIGIN = 'https://phd-demographics.andy-barr.com';
  var CHARTJS_URL = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js';
  var SITE_MAP_URL = '/data/chat/site_map.json';
  var UNI_INDEX_URL = '/data/universities_index.json';
  var REQUEST_TIMEOUT_MS = 45000;
  var HISTORY_KEY = 'phd-chat-history';
  var MAX_TURNS = 20;

  var reducedMotion = false;
  try {
    reducedMotion = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* ignore */ }

  /* ===================================================================== */
  /* Caps (contract §4.7). Both sides enforce; neither trusts the other.   */
  /* ===================================================================== */

  var CAP = {
    // §4.7 caps `blocks` at 8, but the §4.11 worked example the widget must
    // render carries 10 and the acceptance test requires all of them to appear.
    // The client therefore accepts 12; the server still trims to its own cap.
    // A client that is MORE permissive than the server can only fail to hide
    // something the server deliberately sent — it opens no hole.
    blocks: 12,
    md: 4000,
    chartDatasets: 4,
    chartPoints: 40,
    tableColumns: 8,
    tableRows: 25,
    cell: 120,
    statItems: 4,
    suggestItems: 4,
    url: 300,
    fragment: 128,
    query: 256
  };

  var FRAGMENT_OK = /^[A-Za-z0-9._~!$&'()*+,;=:@/?%-]+$/;

  /* ===================================================================== */
  /* Palette. The ONLY place a colour is chosen. No hex crosses the wire.  */
  /* ===================================================================== */

  var ROLE_COLORS = {
    nra:      { border: '#ef4444', fill: 'rgba(239,68,68,0.14)' },
    domestic: { border: '#38bdf8', fill: 'rgba(56,189,248,0.14)' },
    total:    { border: '#94a3b8', fill: 'rgba(148,163,184,0.10)' },
    alt1:     { border: '#a78bfa', fill: 'rgba(167,139,250,0.14)' },
    alt2:     { border: '#34d399', fill: 'rgba(52,211,153,0.14)' },
    alt3:     { border: '#fbbf24', fill: 'rgba(251,191,36,0.14)' },
    neutral:  { border: '#64748b', fill: 'rgba(100,116,139,0.10)' }
  };
  var ROLE_FALLBACK = ['domestic', 'nra', 'alt1', 'alt2', 'alt3', 'total', 'neutral'];

  /* Icon path data. Constants — never model-derived. No emoji anywhere. */
  var ICON = {
    chat:     'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
    close:    'M18 6 6 18M6 6l12 12',
    chart:    'M3 21h18M6 21V11M11 21V5M16 21v-7M21 21v-4',
    copy:     'M10 8h10v13H10zM6 16H4V3h13v2',
    check:    'M20 6 9 17l-5-5',
    external: 'M14 4h6v6M20 4 11 13M18 14v6H4V4h6',
    run:      'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
    send:     'M4 12h15M13 6l6 6-6 6',
    retry:    'M20 11a8 8 0 1 0-2.3 6.3M20 5v6h-6'
  };

  /* ===================================================================== */
  /* Tiny DOM helpers. Everything visible goes through these.              */
  /* ===================================================================== */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null && text !== '') n.textContent = text;
    return n;
  }

  function icon(d, size) {
    var s = size || 14;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', String(s));
    svg.setAttribute('height', String(s));
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
    return svg;
  }

  /**
   * Normalise a model-supplied PLAIN TEXT field: strip control characters,
   * flatten newlines, clamp length. The result is only ever used as
   * textContent, so this is presentation hygiene, not a security boundary —
   * the security boundary is that it never becomes markup.
   */
  function plain(s, max) {
    if (s === null || s === undefined) return '';
    var t = String(s);
    t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    t = t.replace(/[\r\n\t]+/g, ' ');
    if (max && t.length > max) t = t.slice(0, Math.max(1, max - 1)) + '…';
    return t;
  }

  /** Same, but keeps newlines (markdown bodies need them). */
  function multiline(s, max) {
    if (s === null || s === undefined) return '';
    var t = String(s).replace(/\r\n?/g, '\n');
    t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
    if (max && t.length > max) {
      var cut = t.slice(0, max);
      var sp = cut.lastIndexOf(' ');
      t = (sp > max * 0.6 ? cut.slice(0, sp) : cut) + '…';
    }
    return t;
  }

  function isFiniteNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  /* ===================================================================== */
  /* Number formatting (contract §4.5.2 `format` vocabulary).              */
  /* ===================================================================== */

  function fmtNum(v, f) {
    if (v === null || v === undefined || v === '') return '—';
    var n = Number(v);
    if (!isFinite(n)) return plain(v, CAP.cell);
    switch (f) {
      case 'int':     return Math.round(n).toLocaleString('en-US');
      case 'float1':  return n.toFixed(1);
      case 'pct':     return Math.round(n) + '%';
      case 'pct1':    return n.toFixed(1) + '%';
      case 'usd':     return '$' + Math.round(n).toLocaleString('en-US');
      case 'usd_k':   return '$' + Math.round(n / 1e3).toLocaleString('en-US') + 'K';
      case 'usd_m':   return '$' + (n / 1e6).toFixed(1) + 'M';
      case 'compact':
        var a = Math.abs(n);
        if (a >= 1e9) return (n / 1e9).toFixed(1) + 'B';
        if (a >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (a >= 1e4) return Math.round(n / 1e3) + 'K';
        return Math.round(n).toLocaleString('en-US');
      default:
        return n.toLocaleString('en-US');
    }
  }

  function isNumericFormat(f) {
    return f && f !== 'text';
  }

  /* ===================================================================== */
  /* SITE_MAP — the shared page registry (contract §4.10).                 */
  /* ===================================================================== */

  var siteMap = null;          // parsed JSON, or null if unavailable
  var pagesByPath = null;      // Map path -> page record
  var uniByKey = new Map();    // key -> {key, name, path}
  var siteMapPromise = null;

  function normPath(p) {
    // One key per page, whichever form it arrives in. The site serves
    // /industries/mining and /industries/mining.html as the same page, so the
    // extension is dropped here: the site map now carries clean paths, and a
    // link written with .html -- in an older cached answer, or typed by the
    // model from memory -- still resolves to the same entry.
    if (!p) return '';
    var s = String(p);
    if (s.charAt(0) !== '/') s = '/' + s;
    if (s === '/') return '/index';
    s = s.replace(/\.html$/, '');
    return s;
  }

  function indexSiteMap(json) {
    siteMap = json;
    pagesByPath = new Map();
    var pages = (json && json.pages) || [];
    for (var i = 0; i < pages.length; i++) {
      var pg = pages[i];
      if (pg && pg.path) pagesByPath.set(normPath(pg.path), pg);
    }
    var unis = (json && json.universities) || [];
    for (var j = 0; j < unis.length; j++) {
      var u = unis[j];
      if (!u || !u.key) continue;
      uniByKey.set(String(u.key), {
        key: String(u.key),
        name: plain(u.name || u.key, 60),
        path: normPath(u.path || ('/universities/' + u.key + '.html'))
      });
      if (!pagesByPath.has(normPath(u.path || ('/universities/' + u.key + '.html')))) {
        pagesByPath.set(normPath(u.path || ('/universities/' + u.key + '.html')), {
          path: normPath(u.path || ('/universities/' + u.key + '.html')),
          title: plain(u.name || u.key, 60),
          anchors: 'open',
          sections: []
        });
      }
    }
  }

  function loadUniFallback() {
    return fetch(UNI_INDEX_URL, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        var list = (j && j.universities) || [];
        for (var i = 0; i < list.length; i++) {
          var u = list[i];
          if (!u || !u.key) continue;
          uniByKey.set(String(u.key), {
            key: String(u.key),
            name: plain(u.name || u.key, 60),
            path: '/universities/' + u.key + '.html'
          });
        }
      })
      .catch(function () { /* inert */ });
  }

  function ensureSiteMap() {
    if (siteMapPromise) return siteMapPromise;
    siteMapPromise = fetch(SITE_MAP_URL, { credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) {
        if (j && Array.isArray(j.pages)) { indexSiteMap(j); return; }
        throw new Error('no site map');
      })
      .catch(function () {
        // Degrade, don't fail: without the map we keep the hard security gate
        // (same-origin, single leading slash) and relax only the "does this
        // page exist" check to a shape test. A missing map must not silence
        // every link the assistant offers.
        siteMap = null;
        pagesByPath = null;
        return loadUniFallback();
      });
    return siteMapPromise;
  }

  /**
   * Is this site-relative path one we are willing to link to?
   * With SITE_MAP: membership test. Without it: shape test only.
   */
  function pathAllowed(path) {
    if (pagesByPath) return pagesByPath.has(normPath(path));
    return /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.html$/.test(path) || path === '/';
  }

  function pageRecord(path) {
    return pagesByPath ? (pagesByPath.get(normPath(path)) || null) : null;
  }

  function labelForTarget(path, fragment) {
    var pg = pageRecord(path);
    if (!pg) return null;
    if (fragment && pg.anchors === 'enumerated' && Array.isArray(pg.sections)) {
      for (var i = 0; i < pg.sections.length; i++) {
        if (pg.sections[i] && pg.sections[i].id === fragment) {
          return plain(pg.sections[i].label || pg.title, 60);
        }
      }
    }
    return plain(pg.title || path, 60);
  }

  /* ===================================================================== */
  /* URL validation (contract §4.8 rule 3). The three rules that matter:   */
  /*   1. never test the raw string with startsWith,                       */
  /*   2. always inspect the parsed URL object,                            */
  /*   3. the fragment is carried, never interpreted.                      */
  /* ===================================================================== */

  /**
   * Resolve a site-relative URL. Returns null (⇒ block dropped / token inert)
   * for anything that is not unambiguously a same-origin path on this site.
   */
  function resolveSiteUrl(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.trim();
    if (!s || s.length > CAP.url) return null;
    // Control characters are how "\tj\na\tvascript:" style payloads survive a
    // naive prefix test. Reject them outright before anything else.
    if (/[\u0000-\u0020\u007F]/.test(s)) return null;
    // Exactly one leading slash. This is what stops "//evil.host/x" and
    // "/\evil.host/x" (which several browsers normalise to a host-relative URL).
    if (s.charAt(0) !== '/') return null;
    if (s.charAt(1) === '/' || s.charAt(1) === '\\') return null;
    if (s.indexOf('\\') !== -1) return null;

    var u;
    try { u = new URL(s, location.origin); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;
    if (u.protocol !== location.protocol) return null;

    var fragment = u.hash ? u.hash.slice(1) : '';
    var query = u.search ? u.search.slice(1) : '';
    if (fragment) {
      if (fragment.length > CAP.fragment) return null;
      if (!FRAGMENT_OK.test(fragment)) return null;
    }
    if (query && query.length > CAP.query) return null;

    if (!pathAllowed(u.pathname)) return null;

    return {
      href: u.pathname + u.search + u.hash,   // re-serialised, never the raw input
      path: u.pathname,
      query: query,
      fragment: fragment,                     // opaque string, never parsed
      samePage: normPath(u.pathname) === normPath(location.pathname)
    };
  }

  /** Resolve an off-site URL. https only, by parsed protocol. */
  function resolveExternalUrl(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.trim();
    if (!s || s.length > CAP.url) return null;
    if (/[\u0000-\u0020\u007F]/.test(s)) return null;
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:') return null;   // blocks javascript:, data:, blob:, http:, file:, vbscript:
    if (!u.hostname) return null;
    return { href: u.href, host: u.hostname };
  }

  /** Markdown inline links: http or https only (contract §4.5.1). */
  function resolveMarkdownUrl(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.trim();
    if (!s || s.length > CAP.url) return null;
    if (/[\u0000-\u0020\u007F]/.test(s)) return null;
    if (s.charAt(0) === '/') {
      var site = resolveSiteUrl(s);
      return site ? { href: site.href, site: site } : null;
    }
    var u;
    try { u = new URL(s); } catch (e) { return null; }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    return { href: u.href, external: true, host: u.hostname };
  }

  function absolute(href) {
    return SITE_ORIGIN + href;
  }

  /* ===================================================================== */
  /* Navigation (contract §4.5.6).                                         */
  /* ===================================================================== */

  function ringTarget(node) {
    if (!node || reducedMotion) return;
    node.classList.add('cb-target-ring');
    setTimeout(function () { node.classList.remove('cb-target-ring'); }, 2500);
  }

  /**
   * Find and scroll to an opaque fragment on the current page.
   * Delegates to window.Anchors (the site's own resolver — it handles hidden
   * tabs and forgiving id matching) when present, so this file never needs to
   * know the anchor grammar. Falls back to polling getElementById, because
   * several pages mint ids in JS after load.
   */
  function scrollToFragment(fragment, highlight) {
    if (!fragment) {
      window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
      return true;
    }
    var decoded = fragment;
    try { decoded = decodeURIComponent(fragment); } catch (e) { /* keep raw */ }

    if (window.Anchors && typeof window.Anchors.goTo === 'function') {
      try {
        if (window.Anchors.goTo(decoded, !reducedMotion)) {
          if (highlight) {
            var found = document.getElementById(decoded);
            if (found) ringTarget(found);
          }
          return true;
        }
      } catch (e) { /* fall through to polling */ }
    }

    var tries = 0;
    (function poll() {
      var node = document.getElementById(decoded);
      if (node) {
        node.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
        if (highlight) ringTarget(node);
        return;
      }
      if (++tries < 20) setTimeout(poll, 150);
      // Give up silently. The card stays clickable; landing at the top of the
      // right page is an acceptable outcome, a thrown error is not.
    })();
    return true;
  }

  function performNav(target, opts) {
    if (!target) return;
    opts = opts || {};
    var highlight = opts.highlight !== false && !!target.fragment;

    try {
      window.dispatchEvent(new CustomEvent('phdchat:navigate', {
        detail: {
          url: target.href,
          path: target.path,
          fragment: target.fragment,
          auto: !!opts.auto
        }
      }));
    } catch (e) { /* CustomEvent unsupported — inert */ }

    if (target.samePage) {
      scrollToFragment(target.fragment, highlight);
      try { window.history.pushState(null, '', target.href); } catch (e) { /* ignore */ }
      return;
    }
    // Cross-page: only ever on an explicit click. Never automatic — an
    // unrequested full-page load destroys the conversation.
    if (opts.auto) return;
    saveHistory();
    window.location.href = target.href;
  }

  /* ===================================================================== */
  /* Markdown -> DOM (port of the reference markdownParser, no HTML strings) */
  /* ===================================================================== */

  var TOKEN_SPLIT = /(\[\[[^\]\n]{0,320}\]\])/g;
  var INLINE_RE = /`([^`\n]+)`|\*\*([^*]+?)\*\*|\*([^*\n]+?)\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;

  function parseMdBlocks(md) {
    var lines = String(md).split('\n');
    var out = [], para = [], list = null;
    function flushPara() { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } }
    function flushList() { if (list) { out.push({ t: 'ul', items: list }); list = null; } }
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) { flushPara(); flushList(); continue; }
      var h = line.match(/^(#{1,3})\s+(.+)$/);
      if (h) { flushPara(); flushList(); out.push({ t: 'h', level: h[1].length, text: h[2] }); continue; }
      var li = line.match(/^(?:[-•])\s+(.+)$/);
      if (li) { flushPara(); if (!list) list = []; list.push(li[1]); continue; }
      flushList();
      para.push(line);
    }
    flushPara(); flushList();
    return out;
  }

  /**
   * [[nav:/url|Label]] and [[university_key]].
   * Unknown target => the token renders as LITERAL TEXT and no link is made.
   * A hallucinated page is inert, never a broken link.
   */
  function renderNavToken(token, parent) {
    var inner = token.slice(2, -2);
    var url = null, label = null;

    if (inner.slice(0, 4).toLowerCase() === 'nav:') {
      var rest = inner.slice(4);
      var bar = rest.indexOf('|');
      if (bar !== -1) { label = plain(rest.slice(bar + 1), 60); rest = rest.slice(0, bar); }
      url = rest.trim();
    } else if (/^[a-z0-9_]{1,48}$/.test(inner)) {
      var uni = uniByKey.get(inner);
      if (uni) { url = uni.path; label = uni.name; }
    }

    var target = url ? resolveSiteUrl(url) : null;
    if (!target) { parent.appendChild(document.createTextNode(token)); return; }

    if (!label) label = labelForTarget(target.path, target.fragment) || target.path;

    var a = el('a', 'cb-inline-nav');
    a.setAttribute('href', target.href);
    a.appendChild(icon(ICON.chart, 11));
    a.appendChild(document.createTextNode(label));
    a.addEventListener('click', function (ev) {
      if (target.samePage) ev.preventDefault();
      performNav(target, { auto: false });
    });
    parent.appendChild(a);
  }

  function renderInlineMarkup(text, parent) {
    INLINE_RE.lastIndex = 0;
    var last = 0, m;
    while ((m = INLINE_RE.exec(text)) !== null) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      last = INLINE_RE.lastIndex;
      if (m[1] !== undefined) {
        parent.appendChild(el('code', 'cb-code', m[1]));
      } else if (m[2] !== undefined) {
        parent.appendChild(el('strong', null, m[2]));
      } else if (m[3] !== undefined) {
        parent.appendChild(el('em', null, m[3]));
      } else {
        var link = resolveMarkdownUrl(m[5]);
        if (!link) {
          // Unusable href: keep the label as plain text, drop the link entirely.
          parent.appendChild(document.createTextNode(m[4]));
        } else if (link.site) {
          var a = el('a', null, m[4]);
          a.setAttribute('href', link.href);
          a.addEventListener('click', (function (t) {
            return function (ev) { if (t.samePage) ev.preventDefault(); performNav(t, { auto: false }); };
          })(link.site));
          parent.appendChild(a);
        } else {
          var b = el('a', null, m[4]);
          b.setAttribute('href', link.href);
          b.setAttribute('target', '_blank');
          b.setAttribute('rel', 'noopener noreferrer');
          parent.appendChild(b);
        }
      }
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  function renderInline(text, parent) {
    var parts = String(text).split(TOKEN_SPLIT);
    for (var i = 0; i < parts.length; i++) {
      if (!parts[i]) continue;
      if (i % 2 === 1) renderNavToken(parts[i], parent);
      else renderInlineMarkup(parts[i], parent);
    }
  }

  function mdToNodes(md) {
    var frag = document.createDocumentFragment();
    var blocks = parseMdBlocks(multiline(md, CAP.md));
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (b.t === 'h') {
        var h = el('div', 'cb-h cb-h' + b.level);
        renderInline(b.text, h);
        frag.appendChild(h);
      } else if (b.t === 'ul') {
        var ul = el('ul', 'cb-ul');
        for (var j = 0; j < b.items.length; j++) {
          var li = el('li');
          renderInline(b.items[j], li);
          ul.appendChild(li);
        }
        frag.appendChild(ul);
      } else {
        var p = el('p', 'cb-p');
        renderInline(b.text, p);
        frag.appendChild(p);
      }
    }
    return frag;
  }

  /* ===================================================================== */
  /* Chart.js loader + config synthesis                                     */
  /* ===================================================================== */

  var chartJsPromise = null;

  function ensureChartJs() {
    if (window.Chart) return Promise.resolve(window.Chart);
    if (chartJsPromise) return chartJsPromise;
    chartJsPromise = new Promise(function (resolve) {
      var done = false;
      function finish() { if (!done) { done = true; resolve(window.Chart || null); } }
      var s = document.createElement('script');
      s.src = CHARTJS_URL;
      s.async = true;
      s.addEventListener('load', finish);
      s.addEventListener('error', finish);
      document.head.appendChild(s);
      setTimeout(finish, 8000);
    });
    return chartJsPromise;
  }

  var CHART_KINDS = { line: 1, bar: 1, hbar: 1, stacked_bar: 1, area: 1, doughnut: 1, scatter: 1, histogram: 1 };

  /** Validate + normalise a chart block. Returns null to drop it. */
  function normaliseChart(b) {
    var kind = CHART_KINDS[b.chart] ? b.chart : null;
    if (!kind) return null;
    var title = plain(b.title, 90);
    if (!title) return null;

    var labels = Array.isArray(b.labels) ? b.labels.slice(0, CAP.chartPoints).map(function (l) {
      return plain(l, 24);
    }) : null;
    if (kind !== 'scatter' && (!labels || !labels.length)) return null;
    if (Array.isArray(b.labels) && b.labels.length > CAP.chartPoints) return null;

    var raw = Array.isArray(b.datasets) ? b.datasets.slice(0, CAP.chartDatasets) : [];
    if (!raw.length) return null;

    var datasets = [];
    for (var i = 0; i < raw.length; i++) {
      var d = raw[i];
      if (!d || !Array.isArray(d.data)) return null;
      if (d.data.length > CAP.chartPoints) return null;
      var values;
      if (kind === 'scatter') {
        values = [];
        for (var k = 0; k < d.data.length; k++) {
          var pt = d.data[k];
          if (!pt || typeof pt !== 'object') return null;
          var x = Number(pt.x), y = Number(pt.y);
          if (!isFinite(x) || !isFinite(y)) return null;
          values.push({ x: x, y: y });
        }
      } else {
        if (d.data.length !== labels.length) return null;   // a mismatched series is a lying chart
        values = [];
        for (var m = 0; m < d.data.length; m++) {
          var v = d.data[m];
          if (v === null || v === undefined) { values.push(null); continue; }
          var n = Number(v);
          if (!isFinite(n)) return null;
          values.push(n);
        }
      }
      datasets.push({
        label: plain(d.label, 40) || ('Series ' + (i + 1)),
        data: values,
        role: ROLE_COLORS[d.role] ? d.role : ROLE_FALLBACK[i % ROLE_FALLBACK.length],
        fill: d.fill === true,
        dashed: d.dashed === true,
        axis: d.axis === 'right' ? 'right' : 'left'
      });
    }

    function axis(o) {
      if (!o || typeof o !== 'object') return {};
      return {
        format: typeof o.format === 'string' ? o.format : 'int',
        label: plain(o.label, 60),
        beginAtZero: o.begin_at_zero !== false
      };
    }

    return {
      kind: kind,
      title: title,
      subtitle: plain(b.subtitle, 140),
      labels: labels || [],
      datasets: datasets,
      y: axis(b.y),
      y2: b.y2 ? axis(b.y2) : null,
      x: { label: plain(b.x && b.x.label, 60) },
      source: plain(b.source, 120),
      nav: b.nav
    };
  }

  /**
   * The ONLY place a Chart.js config is built. Model JSON is never spread into
   * an options object — Chart.js will happily invoke a function value if one is
   * smuggled in, so every field below is set explicitly from a validated value.
   */
  function chartConfigFor(c, light) {
    var grid = light ? 'rgba(100,116,139,0.20)' : 'rgba(51,65,85,0.55)';
    var tick = light ? '#475569' : '#94a3b8';
    var isDoughnut = c.kind === 'doughnut';
    var type = (c.kind === 'line' || c.kind === 'area') ? 'line'
      : (c.kind === 'doughnut') ? 'doughnut'
      : (c.kind === 'scatter') ? 'scatter' : 'bar';

    var ds = c.datasets.map(function (d, i) {
      var col = ROLE_COLORS[d.role];
      var out = {
        label: d.label,
        data: d.data,
        borderColor: col.border,
        backgroundColor: (d.fill || type === 'bar' || isDoughnut) ? col.fill : col.border,
        borderWidth: type === 'bar' ? 1 : 2,
        fill: (c.kind === 'area' || d.fill) ? 'origin' : false,
        tension: (type === 'line') ? 0.3 : 0,
        pointRadius: (type === 'line') ? 2 : 3,
        pointHoverRadius: 4,
        borderDash: d.dashed ? [5, 4] : [],
        yAxisID: d.axis === 'right' ? 'y2' : 'y'
      };
      if (isDoughnut) {
        out.backgroundColor = c.labels.map(function (_, k) {
          return ROLE_COLORS[ROLE_FALLBACK[k % ROLE_FALLBACK.length]].border;
        });
        out.borderColor = light ? '#ffffff' : '#0f172a';
        out.borderWidth = 2;
      } else if (type === 'bar' && d.fill !== true) {
        out.backgroundColor = col.border;
      }
      return out;
    });

    var scales = {};
    if (!isDoughnut) {
      var yfmt = c.y.format;
      // For `hbar` the value axis is x and the category axis is y, so the
      // numeric formatting has to follow the values, not the axis name.
      var horizontal = c.kind === 'hbar';
      var valueAxis = {
        beginAtZero: c.y.beginAtZero,
        stacked: c.kind === 'stacked_bar',
        grid: { color: grid, drawBorder: false },
        ticks: { color: tick, font: { size: 10 }, callback: function (v) { return fmtNum(v, yfmt); } },
        title: c.y.label ? { display: true, text: c.y.label, color: tick, font: { size: 10 } } : { display: false }
      };
      var categoryAxis = {
        stacked: c.kind === 'stacked_bar',
        grid: { color: grid, drawBorder: false, display: c.kind !== 'bar' && c.kind !== 'stacked_bar' && !horizontal },
        ticks: { color: tick, font: { size: 10 }, maxRotation: 0, autoSkip: true },
        title: c.x.label ? { display: true, text: c.x.label, color: tick, font: { size: 10 } } : { display: false }
      };
      scales.y = horizontal ? categoryAxis : valueAxis;
      scales.x = horizontal ? valueAxis : categoryAxis;
      if (c.y2) {
        var y2fmt = c.y2.format;
        scales.y2 = {
          position: 'right',
          beginAtZero: c.y2.beginAtZero,
          grid: { display: false },
          ticks: { color: tick, font: { size: 10 }, callback: function (v) { return fmtNum(v, y2fmt); } }
        };
      }
    }

    var yFormat = c.y.format;
    var horiz = c.kind === 'hbar';
    return {
      type: type,
      data: { labels: isDoughnut || c.kind !== 'scatter' ? c.labels : undefined, datasets: ds },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reducedMotion ? false : { duration: 400 },
        indexAxis: c.kind === 'hbar' ? 'y' : 'x',
        // A histogram's x axis is a continuous quantity cut into bands, not a
        // set of categories, so its bars sit flush against each other. Chart.js
        // has no histogram type; this is the difference between reading it as a
        // distribution and reading it as unrelated categories.
        datasets: c.kind === 'histogram'
          ? { bar: { barPercentage: 1, categoryPercentage: 1 } }
          : undefined,
        interaction: isDoughnut ? { mode: 'nearest' } : { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: c.datasets.length > 1 || isDoughnut,
            position: 'top',
            labels: { color: tick, boxWidth: 12, font: { size: 10 } }
          },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                var p = ctx.parsed;
                var v = (p && typeof p === 'object')
                  ? (horiz ? p.x : (p.y !== undefined ? p.y : p))
                  : p;
                return ' ' + ctx.dataset.label + ': ' + fmtNum(v, yFormat);
              }
            }
          }
        },
        scales: isDoughnut ? {} : scales
      }
    };
  }

  /* ===================================================================== */
  /* Theme                                                                  */
  /* ===================================================================== */

  function hostIsLight() {
    try {
      var probe = document.body || document.documentElement;
      var bg = getComputedStyle(probe).backgroundColor || '';
      var m = bg.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/);
      if (m) {
        var a = m[4] === undefined ? 1 : parseFloat(m[4]);
        if (a > 0.1) {
          var L = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
          return L > 0.5;
        }
      }
    } catch (e) { /* ignore */ }
    try {
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    } catch (e2) { return false; }
  }

  /* ===================================================================== */
  /* Styles — every selector scoped under #phd-chat-root                    */
  /* ===================================================================== */

  var CSS = [
    '#phd-chat-root{',
    '--cb-ground:#0f172a;--cb-panel:#1e293b;--cb-border:#334155;--cb-text:#e2e8f0;',
    '--cb-muted:#94a3b8;--cb-accent:#38bdf8;--cb-accent-ink:#0f172a;--cb-danger:#ef4444;',
    '--cb-ok:#34d399;--cb-warn:#fbbf24;--cb-zebra:rgba(148,163,184,0.05);--cb-chip:#0f172a;}',
    '#phd-chat-root.cb-light{',
    '--cb-ground:#f8fafc;--cb-panel:#ffffff;--cb-border:#cbd5e1;--cb-text:#0f172a;',
    '--cb-muted:#475569;--cb-accent:#0369a1;--cb-accent-ink:#ffffff;--cb-danger:#dc2626;',
    '--cb-ok:#047857;--cb-warn:#b45309;--cb-zebra:rgba(15,23,42,0.04);--cb-chip:#f1f5f9;}',

    '#chat-bubble{position:fixed;bottom:20px;right:20px;z-index:1000;width:52px;height:52px;border-radius:50%;background:var(--cb-accent);border:none;cursor:pointer;box-shadow:0 4px 16px rgba(56,189,248,0.4);display:flex;align-items:center;justify-content:center;transition:transform .2s;padding:0;color:var(--cb-accent-ink);}',
    '#chat-bubble:hover{transform:scale(1.08);}',
    '#chat-bubble:focus-visible{outline:2px solid var(--cb-text);outline-offset:3px;}',
    /* The tour button. Right of 90px puts its left edge under the left edge
     * of the theme pill above (121-124px wide at right:20px), so the two
     * circles are spread across that pill's footprint rather than crowded at
     * the corner. Deliberately quieter than the chat bubble -- outlined, not
     * filled -- because the chat is the primary action and this is the
     * secondary one. */
    '#phd-tour-btn{position:fixed;bottom:20px;right:90px;z-index:1000;width:52px;',
    'height:52px;border-radius:50%;background:var(--cb-panel);',
    'border:1px solid var(--cb-border);color:var(--cb-accent);cursor:pointer;',
    'box-shadow:0 4px 16px rgba(0,0,0,0.28);display:flex;align-items:center;',
    'justify-content:center;transition:transform .2s,border-color .2s;padding:0;',
    'font:700 21px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}',
    '#phd-tour-btn:hover{transform:scale(1.08);border-color:var(--cb-accent);}',
    '#phd-tour-btn:focus-visible{outline:2px solid var(--cb-accent);outline-offset:3px;}',
    /* First-visit hint. A label, not a modal: it names the thing the button
     * does and gets out of the way. It sits to the LEFT so it never covers
     * either circle. */
    '#phd-tour-hint{position:fixed;bottom:26px;right:150px;z-index:1000;',
    'max-width:min(15rem,calc(100vw - 172px));background:var(--cb-panel);',
    'color:var(--cb-text);border:1px solid var(--cb-border);border-radius:10px;',
    'padding:9px 12px;box-shadow:0 6px 22px rgba(0,0,0,0.3);',
    'font:400 12.5px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    'display:flex;gap:9px;align-items:flex-start;}',
    '#phd-tour-hint button{background:none;border:none;color:var(--cb-muted);',
    'cursor:pointer;font:inherit;font-size:15px;line-height:1;padding:0 1px;}',
    '#phd-tour-hint button:hover{color:var(--cb-text);}',
    /* SIZED BY INSETS, NOT BY 100vw. The rule above caps the toast with
       calc(100vw - 172px), and 100vw counts the overflow the toast itself
       causes: it grew the page, the page grew vw, and the cap grew with
       it. At 375px the toast measured 435px and took every page on the
       site sideways with it, because this widget is on all of them.
       Pinning left and right cannot feed back that way. */
    '@media (max-width:620px){#phd-tour-hint{left:12px;right:12px;',
    'max-width:none;bottom:84px;}}',
    '#phd-tour-btn.nudge{animation:phd-tour-pulse 2.6s ease-in-out 3;}',
    '@keyframes phd-tour-pulse{0%,100%{box-shadow:0 4px 16px rgba(0,0,0,0.28);}',
    '50%{box-shadow:0 4px 16px rgba(0,0,0,0.28),0 0 0 7px rgba(56,189,248,0.16);}}',
    '@media (prefers-reduced-motion:reduce){#phd-tour-btn.nudge{animation:none;}',
    '#phd-tour-btn,#chat-bubble{transition:none;}}',
    /* On a narrow screen the hint would have nowhere to go beside the
     * buttons, so it sits above them and spans the width instead. */
    /* 128px, not 84px: the theme pill also sits at bottom:84px and spans the
     * same right-hand area, so the hint covered it. This clears the pill's
     * full height. */
    '@media (max-width:520px){#phd-tour-hint{right:20px;left:20px;bottom:128px;',
    'max-width:none;}}',

    '#chat-panel{position:fixed;bottom:84px;right:20px;z-index:1000;width:420px;max-height:min(640px,80vh);background:var(--cb-panel);border:1px solid var(--cb-border);border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,0.45);display:none;flex-direction:column;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--cb-text);}',
    '#chat-panel.open{display:flex;}',
    '#chat-panel *{box-sizing:border-box;}',

    '#chat-panel .chat-header{padding:12px 16px;border-bottom:1px solid var(--cb-border);display:flex;justify-content:space-between;align-items:center;gap:8px;}',
    '#chat-panel .chat-header .cb-title{font-size:.85rem;font-weight:600;color:var(--cb-text);}',
    '#chat-panel .chat-header button{background:none;border:none;color:var(--cb-muted);cursor:pointer;padding:2px 4px;display:flex;border-radius:4px;}',
    '#chat-panel .chat-header button:hover{color:var(--cb-text);}',

    '#chat-panel .chat-messages{flex:1;overflow-y:auto;overflow-x:hidden;padding:12px;}',
    '#chat-panel .chat-msg{margin-bottom:10px;font-size:.82rem;line-height:1.5;}',
    '#chat-panel .chat-msg.user{text-align:right;}',
    '#chat-panel .chat-msg.user .chat-content{background:var(--cb-border);color:var(--cb-text);display:inline-block;padding:8px 12px;border-radius:12px 12px 2px 12px;max-width:85%;text-align:left;white-space:pre-wrap;word-break:break-word;}',
    '#chat-panel .chat-msg.assistant .chat-content{background:var(--cb-ground);color:var(--cb-text);display:block;padding:10px 12px;border-radius:12px 12px 12px 2px;max-width:100%;overflow:hidden;overflow-wrap:anywhere;word-break:break-word;}',
    '#chat-panel .chat-msg.assistant .chat-content a{color:var(--cb-accent);}',
    '#chat-panel .chat-msg.assistant .chat-content strong{color:var(--cb-accent);}',
    '#chat-panel .chat-typing{color:var(--cb-muted);font-size:.78rem;padding:4px 0;}',

    '#chat-panel .cb-p{margin:0 0 6px;overflow-wrap:anywhere;}',
    '#chat-panel .cb-ul li,#chat-panel .cb-h,#chat-panel .cb-blocktitle,#chat-panel .cb-caption{overflow-wrap:anywhere;}',
    '#chat-panel .cb-p:last-child{margin-bottom:0;}',
    '#chat-panel .cb-h{font-weight:700;color:var(--cb-text);margin:8px 0 4px;}',
    '#chat-panel .cb-h1{font-size:.95rem;}#chat-panel .cb-h2{font-size:.88rem;}#chat-panel .cb-h3{font-size:.83rem;}',
    '#chat-panel .cb-ul{margin:4px 0 6px;padding-left:18px;}',
    '#chat-panel .cb-ul li{margin-bottom:2px;}',
    '#chat-panel .cb-code{background:var(--cb-border);padding:1px 4px;border-radius:3px;font-size:.95em;}',
    '#chat-panel .cb-block{margin-top:8px;}',
    '#chat-panel .cb-block:first-child{margin-top:0;}',

    '#chat-panel .cb-inline-nav{display:inline-flex;align-items:center;gap:4px;color:var(--cb-accent);text-decoration:none;border-bottom:1px dotted var(--cb-accent);padding:0 1px;}',
    '#chat-panel .cb-inline-nav:hover{border-bottom-style:solid;}',

    '#chat-panel .cb-card{background:var(--cb-ground);border:1px solid var(--cb-border);border-radius:6px;padding:8px 10px;font-size:.78rem;}',
    '#chat-panel .cb-caption{color:var(--cb-muted);font-size:.7rem;margin-top:4px;}',
    '#chat-panel .cb-blocktitle{font-weight:600;font-size:.8rem;margin-bottom:2px;}',
    '#chat-panel .cb-subtitle{color:var(--cb-muted);font-size:.72rem;margin-bottom:4px;}',

    '#chat-panel .cb-chart-wrap{background:var(--cb-ground);border:1px solid var(--cb-border);border-radius:8px;padding:8px 10px 10px;}',
    '#chat-panel .cb-chart{position:relative;height:190px;}',
    '#chat-panel .cb-chart.cb-chart-tall{height:240px;}',

    '#chat-panel .cb-table-scroll{overflow-x:auto;border:1px solid var(--cb-border);border-radius:6px;}',
    '#chat-panel .cb-table{border-collapse:collapse;width:100%;font-size:.72rem;}',
    '#chat-panel .cb-table th{position:sticky;top:0;background:var(--cb-panel);color:var(--cb-muted);font-weight:600;text-align:left;padding:5px 8px;border-bottom:1px solid var(--cb-border);white-space:nowrap;}',
    '#chat-panel .cb-table td{padding:4px 8px;border-bottom:1px solid var(--cb-border);white-space:nowrap;}',
    '#chat-panel .cb-table tr:nth-child(even) td{background:var(--cb-zebra);}',
    '#chat-panel .cb-table td.cb-em{color:var(--cb-accent);font-weight:600;}',
    '#chat-panel .cb-table td.cb-r,#chat-panel .cb-table th.cb-r{text-align:right;}',
    '#chat-panel .cb-table td.cb-c,#chat-panel .cb-table th.cb-c{text-align:center;}',
    '#chat-panel .cb-table a{color:var(--cb-accent);text-decoration:none;}',
    '#chat-panel .cb-table a:hover{text-decoration:underline;}',

    '#chat-panel .cb-stat{display:flex;flex-wrap:wrap;gap:6px;}',
    '#chat-panel .cb-stat-item{flex:1 1 42%;min-width:120px;background:var(--cb-ground);border:1px solid var(--cb-border);border-radius:6px;padding:7px 9px;}',
    '#chat-panel .cb-stat-label{color:var(--cb-muted);font-size:.66rem;text-transform:uppercase;letter-spacing:.04em;}',
    '#chat-panel .cb-stat-value{font-size:1.05rem;font-weight:700;margin-top:2px;}',
    '#chat-panel .cb-stat-item.cb-em .cb-stat-value{color:var(--cb-accent);}',
    '#chat-panel .cb-stat-delta{font-size:.68rem;margin-left:5px;font-weight:600;}',
    '#chat-panel .cb-stat-note{color:var(--cb-muted);font-size:.66rem;margin-top:2px;}',
    '#chat-panel .cb-bar-track{height:5px;border-radius:3px;background:var(--cb-border);margin-top:5px;overflow:hidden;}',
    '#chat-panel .cb-bar-fill{height:100%;border-radius:3px;background:#64748b;}',

    '#chat-panel .cb-nav{display:flex;gap:8px;align-items:center;background:var(--cb-ground);border:1px solid var(--cb-border);border-radius:6px;padding:8px 10px;}',
    '#chat-panel .cb-nav a.cb-nav-main{color:var(--cb-accent);text-decoration:none;font-weight:600;flex:1;display:flex;align-items:center;gap:6px;font-size:.78rem;}',
    '#chat-panel .cb-nav a.cb-nav-main:hover{text-decoration:underline;}',
    '#chat-panel .cb-nav .cb-reason{color:var(--cb-muted);font-size:.7rem;font-weight:400;margin-top:2px;}',
    '#chat-panel .cb-iconbtn{background:none;border:none;color:var(--cb-muted);cursor:pointer;padding:3px;display:flex;border-radius:4px;}',
    '#chat-panel .cb-iconbtn:hover{color:var(--cb-accent);background:var(--cb-chip);}',
    '#chat-panel .cb-iconbtn.cb-done{color:var(--cb-ok);}',
    '#chat-panel .cb-host{color:var(--cb-muted);font-size:.68rem;}',

    '#chat-panel .cb-query pre{background:var(--cb-panel);padding:8px;border-radius:4px;overflow-x:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.7rem;color:var(--cb-text);white-space:pre;margin:0 0 6px;}',
    '#chat-panel .cb-runlink{color:var(--cb-accent);text-decoration:none;font-weight:600;font-size:.75rem;display:inline-flex;align-items:center;gap:5px;}',

    '#chat-panel .cb-suggest{display:flex;flex-wrap:wrap;gap:6px;}',
    '#chat-panel .cb-chip{background:var(--cb-chip);border:1px solid var(--cb-border);color:var(--cb-accent);border-radius:14px;padding:5px 11px;font-size:.73rem;cursor:pointer;font-family:inherit;text-align:left;}',
    '#chat-panel .cb-chip:hover{border-color:var(--cb-accent);}',

    '#chat-panel .cb-notice{border-left:3px solid var(--cb-muted);background:var(--cb-ground);border-radius:0 6px 6px 0;padding:8px 10px;}',
    '#chat-panel .cb-notice.cb-info{border-left-color:var(--cb-accent);}',
    '#chat-panel .cb-notice.cb-ok{border-left-color:var(--cb-ok);}',
    '#chat-panel .cb-notice.cb-warn{border-left-color:var(--cb-warn);}',
    '#chat-panel .cb-notice.cb-bad{border-left-color:var(--cb-danger);}',
    '#chat-panel .cb-notice .cb-notice-title{font-weight:700;font-size:.78rem;margin-bottom:2px;}',
    '#chat-panel .cb-notice.cb-info .cb-notice-title{color:var(--cb-accent);}',
    '#chat-panel .cb-notice.cb-ok .cb-notice-title{color:var(--cb-ok);}',
    '#chat-panel .cb-notice.cb-warn .cb-notice-title{color:var(--cb-warn);}',
    '#chat-panel .cb-notice.cb-bad .cb-notice-title{color:var(--cb-danger);}',
    '#chat-panel .cb-notice .cb-help{color:var(--cb-muted);font-size:.72rem;margin-top:3px;}',

    '#chat-panel .cb-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}',

    '#chat-panel .chat-input-row{display:flex;padding:8px 12px;border-top:1px solid var(--cb-border);gap:8px;}',
    '#chat-panel .chat-input-row input{flex:1;background:var(--cb-ground);border:1px solid var(--cb-border);color:var(--cb-text);padding:8px 12px;border-radius:8px;font-size:.82rem;outline:none;font-family:inherit;}',
    '#chat-panel .chat-input-row input:focus{border-color:var(--cb-accent);}',
    '#chat-panel .chat-input-row input::placeholder{color:var(--cb-muted);}',
    '#chat-panel .chat-input-row button{background:var(--cb-accent);color:var(--cb-accent-ink);border:none;padding:8px 14px;border-radius:8px;font-size:.82rem;font-weight:600;cursor:pointer;font-family:inherit;}',
    '#chat-panel .chat-input-row button:disabled{opacity:.5;cursor:not-allowed;}',

    '@media (max-width:500px){#chat-panel{right:8px;left:8px;width:auto;bottom:72px;}',
    '#chat-panel .cb-stat-item{flex:1 1 100%;}}',

    '.cb-target-ring{outline:2px solid #38bdf8 !important;outline-offset:2px;box-shadow:0 0 0 4px rgba(56,189,248,0.18) !important;transition:outline-color .3s,box-shadow .3s;}',
    '#chat-panel .cb-tour-badge{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#7d9aa8;margin-bottom:6px;font-weight:700;}',
    '#chat-panel .cb-tour-text{margin:0 0 10px;line-height:1.55;}',
    '#chat-panel .cb-tour-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;}',
    '#chat-panel .cb-tour-next,#chat-panel .cb-tour-end{font:inherit;font-size:12px;border-radius:999px;padding:6px 13px;cursor:pointer;border:1px solid transparent;}',
    '#chat-panel .cb-tour-next{background:#38bdf8;color:#04222c;font-weight:700;}',
    '#chat-panel .cb-tour-next:disabled{opacity:.45;cursor:default;}',
    '#chat-panel .cb-tour-end{background:transparent;color:#7d9aa8;border-color:currentColor;}',
    '#chat-panel .cb-tour-next:focus-visible,#chat-panel .cb-tour-end:focus-visible{outline:3px solid #38bdf8;outline-offset:2px;}'
  ].join('\n');

  /* ===================================================================== */
  /* Chrome                                                                 */
  /* ===================================================================== */

  var style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  var root = el('div', hostIsLight() ? 'cb-light' : null);
  root.id = 'phd-chat-root';

  var bubble = el('button');
  bubble.id = 'chat-bubble';
  bubble.setAttribute('type', 'button');
  bubble.setAttribute('aria-label', 'Open the data assistant');
  bubble.appendChild(icon(ICON.chat, 24));

  /* The tour used to be reachable only from inside the chat panel, and only
   * on a visit with no conversation yet -- so a reader who never opened the
   * chat never learned it existed, and anyone who had asked one question
   * could not find it again at all. This button is the standing entrance:
   * always present, and it restarts from the first stop however many times
   * it is pressed. */
  var tourBtn = el('button');
  tourBtn.id = 'phd-tour-btn';
  tourBtn.setAttribute('type', 'button');
  tourBtn.setAttribute('aria-label', 'Take the guided tour');
  tourBtn.title = 'Take the guided tour';
  tourBtn.textContent = '?';

  var panel = el('div');
  panel.id = 'chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Data assistant');

  var header = el('div', 'chat-header');
  header.appendChild(el('span', 'cb-title', 'Data assistant'));
  var closeBtn = el('button');
  closeBtn.setAttribute('type', 'button');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.appendChild(icon(ICON.close, 16));
  header.appendChild(closeBtn);

  var messagesEl = el('div', 'chat-messages');
  messagesEl.id = 'chat-messages';
  messagesEl.setAttribute('aria-live', 'polite');

  var inputRow = el('div', 'chat-input-row');
  var input = el('input');
  input.id = 'chat-input';
  input.setAttribute('type', 'text');
  input.setAttribute('maxlength', '2000');
  input.setAttribute('placeholder', 'Ask about the data…');
  input.setAttribute('aria-label', 'Ask about the data');
  var sendBtn = el('button', null, 'Send');
  sendBtn.id = 'chat-send';
  sendBtn.setAttribute('type', 'button');
  inputRow.appendChild(input);
  inputRow.appendChild(sendBtn);

  panel.appendChild(header);
  panel.appendChild(messagesEl);
  panel.appendChild(inputRow);
  root.appendChild(bubble);
  root.appendChild(tourBtn);
  root.appendChild(panel);

  function mount() {
    document.body.appendChild(root);
    restoreHistory();
  }
  // NB: mount() is invoked at the very bottom of this IIFE, after the
  // transcript state below has been initialised.

  /* ===================================================================== */
  /* Transcript state                                                       */
  /* ===================================================================== */

  var isOpen = false;
  var isLoading = false;
  var convo = [];              // prose only: [{role, content}]
  // Charts and tables render here and never go back to the server, so their
  // values would be lost by the next turn. The server returns a compact record
  // of what its tools established; we carry it so a follow-up about an earlier
  // figure can be answered from the record rather than from memory.
  var facts = null;            // {version, facts:[{q, v:[[name,value],...]}]}
  var sendSeq = 0;
  var pinged = false;
  var liveCharts = [];         // Chart instances, destroyed on clear
  var chartObserver = null;
  var lastUserMessage = '';
  var rateTimer = null;
  var tourOffered = false;

  function saveHistory() {
    try { sessionStorage.setItem(HISTORY_KEY + ':facts', JSON.stringify(facts)); } catch (e) { /* quota */ }
    try { sessionStorage.setItem(HISTORY_KEY, JSON.stringify(convo.slice(-MAX_TURNS * 2))); }
    catch (e) { /* quota / private mode — inert */ }
  }

  function restoreHistory() {
    var raw = null;
    try {
      var rawFacts = sessionStorage.getItem(HISTORY_KEY + ':facts');
      if (rawFacts) facts = JSON.parse(rawFacts);
    } catch (e) { facts = null; }
    try { raw = sessionStorage.getItem(HISTORY_KEY); } catch (e) { return; }
    if (!raw) { greet(); return; }
    var saved;
    try { saved = JSON.parse(raw); } catch (e) { greet(); return; }
    if (!Array.isArray(saved) || !saved.length) { greet(); return; }
    for (var i = 0; i < saved.length && i < MAX_TURNS * 2; i++) {
      var t = saved[i];
      if (!t || (t.role !== 'user' && t.role !== 'assistant')) continue;
      convo.push({ role: t.role, content: String(t.content).slice(0, 2000) });
      var msg = newMessage(t.role);
      if (t.role === 'user') msg.content.textContent = String(t.content).slice(0, 2000);
      else msg.content.appendChild(mdToNodes(t.content));
    }
    scrollToEnd();
  }

  function greet() {
    var msg = newMessage('assistant');
    msg.content.appendChild(mdToNodes(
      'Ask about international student data, visa trends, or any university on this site. ' +
      'I can pull the numbers, chart them, and take you to the right section.'
    ));
  }

  function newMessage(role) {
    var wrap = el('div', 'chat-msg ' + role);
    var content = el('div', 'chat-content');
    wrap.appendChild(content);
    messagesEl.appendChild(wrap);
    return { wrap: wrap, content: content };
  }

  function scrollToEnd() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function clearSuggestions() {
    var old = messagesEl.querySelectorAll('.cb-suggest');
    for (var i = 0; i < old.length; i++) {
      if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
    }
  }

  /* ===================================================================== */
  /* Block renderers                                                        */
  /* ===================================================================== */

  function blockShell(parent, cls) {
    var d = el('div', 'cb-block ' + (cls || ''));
    parent.appendChild(d);
    return d;
  }

  /* -- text ------------------------------------------------------------ */
  function renderText(b, parent) {
    if (!b.md) return;
    var host = blockShell(parent, 'cb-text');
    host.appendChild(mdToNodes(b.md));
  }

  /* -- notice ---------------------------------------------------------- */
  var NOTICE_KINDS = { info: 1, ok: 1, warn: 1, bad: 1 };
  function renderNotice(b, parent) {
    var kind = NOTICE_KINDS[b.kind] ? b.kind : 'info';
    var host = blockShell(parent, 'cb-notice cb-' + kind);
    // b.icon is deliberately ignored: the model may put an emoji there and this
    // UI carries none. The kind is expressed by the rule colour instead.
    var title = plain(b.title, 60);
    if (title) host.appendChild(el('div', 'cb-notice-title', title));
    if (b.md) host.appendChild(mdToNodes(b.md));
    if (b.help) host.appendChild(el('div', 'cb-help', plain(b.help, 160)));
  }

  /* -- stat ------------------------------------------------------------ */
  var DELTA_COLOR = { up: '#34d399', down: '#ef4444', flat: '#94a3b8' };
  var DELTA_MARK = { up: '▲', down: '▼', flat: '–' };
  function renderStat(b, parent) {
    var items = Array.isArray(b.items) ? b.items.slice(0, CAP.statItems) : [];
    if (!items.length) return;
    var host = blockShell(parent, 'cb-stat-host');
    var strip = el('div', 'cb-stat');
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var card = el('div', 'cb-stat-item' + (it.emphasis ? ' cb-em' : ''));
      card.appendChild(el('div', 'cb-stat-label', plain(it.label, 60)));
      var valRow = el('div', 'cb-stat-value', plain(it.value, 24));
      var dir = DELTA_COLOR[it.delta_dir] ? it.delta_dir : null;
      if (it.delta) {
        var d = el('span', 'cb-stat-delta',
          (dir ? DELTA_MARK[dir] + ' ' : '') + plain(it.delta, 16));
        d.style.color = dir ? DELTA_COLOR[dir] : '#94a3b8';
        valRow.appendChild(d);
      }
      card.appendChild(valRow);
      if (it.bar !== undefined && it.bar !== null) {
        // Sunfire's score-bar idiom. The clamp is the same; the width is set on
        // the element, never interpolated into a style attribute string.
        var v = Math.max(0, Math.min(100, Number(it.bar) || 0));
        var track = el('div', 'cb-bar-track');
        var fill = el('div', 'cb-bar-fill');
        fill.style.width = v + '%';
        if (it.emphasis) fill.style.background = '#38bdf8';
        track.appendChild(fill);
        card.appendChild(track);
      }
      if (it.note) card.appendChild(el('div', 'cb-stat-note', plain(it.note, 80)));
      strip.appendChild(card);
    }
    host.appendChild(strip);
    if (b.source) host.appendChild(el('div', 'cb-caption', plain(b.source, 120)));
  }

  /* -- table ----------------------------------------------------------- */
  function navChipInto(cell, navSpec, fallbackText) {
    var target = navSpec ? resolveSiteUrl(navSpec.url) : null;
    if (!target) { cell.textContent = fallbackText; return; }
    var a = el('a', null, plain(navSpec.label, 60) || fallbackText);
    a.setAttribute('href', target.href);
    a.addEventListener('click', function (ev) {
      if (target.samePage) ev.preventDefault();
      performNav(target, { auto: false });
    });
    cell.appendChild(a);
  }

  function renderTable(b, parent) {
    var cols = Array.isArray(b.columns) ? b.columns.slice(0, CAP.tableColumns) : [];
    var rows = Array.isArray(b.rows) ? b.rows.slice(0, CAP.tableRows) : [];
    if (!cols.length || !rows.length) return;

    var host = blockShell(parent, 'cb-table-host');
    var title = plain(b.title, 140);
    if (title) host.appendChild(el('div', 'cb-blocktitle', title));

    var scroll = el('div', 'cb-table-scroll');
    var table = el('table', 'cb-table');
    var thead = el('thead');
    var htr = el('tr');
    var alignCls = [];
    for (var c = 0; c < cols.length; c++) {
      var col = cols[c] || {};
      var al = col.align === 'right' ? 'cb-r' : col.align === 'center' ? 'cb-c'
        : col.align === 'left' ? '' : (isNumericFormat(col.format) ? 'cb-r' : '');
      alignCls.push(al);
      var th = el('th', al, plain(col.label || col.key, 40));
      htr.appendChild(th);
    }
    thead.appendChild(htr);
    table.appendChild(thead);

    var tbody = el('tbody');
    var firstLeft = -1;
    for (var q = 0; q < cols.length; q++) {
      if (!alignCls[q]) { firstLeft = q; break; }
    }
    for (var r = 0; r < rows.length; r++) {
      var row = rows[r] || {};
      var tr = el('tr');
      for (var k = 0; k < cols.length; k++) {
        var cdef = cols[k] || {};
        var raw = row[cdef.key];
        var cls = alignCls[k] + (cdef.emphasis ? ' cb-em' : '');
        var td = el('td', cls.trim());
        var text = isNumericFormat(cdef.format)
          ? fmtNum(raw, cdef.format)
          : plain(raw === null || raw === undefined ? '—' : raw, CAP.cell);
        if (k === firstLeft && row.nav) navChipInto(td, row.nav, text);
        else td.textContent = text;
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    scroll.appendChild(table);
    host.appendChild(scroll);

    if (Array.isArray(b.rows) && b.rows.length > CAP.tableRows) {
      host.appendChild(el('div', 'cb-caption',
        'Showing first ' + CAP.tableRows + ' of ' + b.rows.length + ' rows.'));
    }
    if (b.note) host.appendChild(el('div', 'cb-caption', plain(b.note, 160)));
    if (b.source) host.appendChild(el('div', 'cb-caption', plain(b.source, 120)));
    if (b.footer_nav) renderNav(
      { url: b.footer_nav.url, label: b.footer_nav.label, auto: false }, host);
  }

  /* -- chart ----------------------------------------------------------- */
  function chartToTableBlock(c) {
    var cols = [{ key: '_l', label: c.x.label || '', align: 'left', format: 'text' }];
    for (var i = 0; i < c.datasets.length; i++) {
      cols.push({ key: 'd' + i, label: c.datasets[i].label, align: 'right', format: c.y.format });
    }
    var rows = [];
    for (var r = 0; r < c.labels.length; r++) {
      var row = { _l: c.labels[r] };
      for (var d = 0; d < c.datasets.length; d++) row['d' + d] = c.datasets[d].data[r];
      rows.push(row);
    }
    return { type: 'table', title: c.title, columns: cols, rows: rows, source: c.source };
  }

  function srTableFor(c) {
    var t = el('table', 'cb-sr');
    var cap = el('caption', null, c.title);
    t.appendChild(cap);
    var htr = el('tr');
    htr.appendChild(el('th', null, c.x.label || 'Category'));
    for (var i = 0; i < c.datasets.length; i++) htr.appendChild(el('th', null, c.datasets[i].label));
    t.appendChild(htr);
    for (var r = 0; r < c.labels.length; r++) {
      var tr = el('tr');
      tr.appendChild(el('td', null, c.labels[r]));
      for (var d = 0; d < c.datasets.length; d++) {
        tr.appendChild(el('td', null, fmtNum(c.datasets[d].data[r], c.y.format)));
      }
      t.appendChild(tr);
    }
    return t;
  }

  function observeChart(box, build) {
    if (!('IntersectionObserver' in window)) { build(); return; }
    if (!chartObserver) {
      chartObserver = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          if (!entries[i].isIntersecting) continue;
          var t = entries[i].target;
          chartObserver.unobserve(t);
          if (t.__cbBuild) { var fn = t.__cbBuild; t.__cbBuild = null; fn(); }
        }
      }, { root: messagesEl, rootMargin: '120px' });
    }
    box.__cbBuild = build;
    chartObserver.observe(box);
  }

  function renderChart(b, parent) {
    var c = normaliseChart(b);
    if (!c) return;                       // caps violated => the block just does not appear

    var host = blockShell(parent, 'cb-chart-host');
    var wrap = el('div', 'cb-chart-wrap');
    wrap.appendChild(el('div', 'cb-blocktitle', c.title));
    if (c.subtitle) wrap.appendChild(el('div', 'cb-subtitle', c.subtitle));

    var tall = (c.kind === 'doughnut' || c.kind === 'hbar') && c.labels.length > 6;
    var box = el('div', 'cb-chart' + (tall ? ' cb-chart-tall' : ''));
    wrap.appendChild(box);
    wrap.appendChild(srTableFor(c));
    if (c.source) wrap.appendChild(el('div', 'cb-caption', c.source));
    host.appendChild(wrap);
    if (c.nav) renderNav({ url: c.nav.url, label: c.nav.label, auto: false }, host);

    var light = root.classList.contains('cb-light');
    observeChart(box, function () {
      ensureChartJs().then(function (ChartLib) {
        if (!ChartLib) {
          // Degrade, don't fail: same numbers, drawn as a table.
          box.parentNode.removeChild(box);
          renderTable(chartToTableBlock(c), host);
          return;
        }
        var canvas = el('canvas');
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', c.title);
        box.appendChild(canvas);
        try {
          liveCharts.push(new ChartLib(canvas.getContext('2d'), chartConfigFor(c, light)));
        } catch (e) {
          box.parentNode.removeChild(box);
          renderTable(chartToTableBlock(c), host);
        }
      });
    });
  }

  /* -- nav ------------------------------------------------------------- */
  function renderNav(b, parent) {
    var target = resolveSiteUrl(b.url);
    if (!target) return null;
    var label = plain(b.label, 60) || labelForTarget(target.path, target.fragment) || target.path;

    var host = blockShell(parent, 'cb-nav-host');
    var card = el('div', 'cb-nav');
    var main = el('a', 'cb-nav-main');
    main.setAttribute('href', target.href);
    var left = el('div');
    var lab = el('span');
    lab.appendChild(icon(ICON.chart, 13));
    lab.appendChild(document.createTextNode(' ' + label));
    lab.style.display = 'inline-flex';
    lab.style.alignItems = 'center';
    lab.style.gap = '5px';
    left.appendChild(lab);
    if (b.reason) left.appendChild(el('div', 'cb-reason', plain(b.reason, 140)));
    main.appendChild(left);
    main.addEventListener('click', function (ev) {
      if (target.samePage) ev.preventDefault();
      performNav(target, { auto: false, highlight: b.highlight !== false });
    });
    card.appendChild(main);

    if (!target.samePage) {
      var tab = el('a', 'cb-iconbtn');
      tab.setAttribute('href', target.href);
      tab.setAttribute('target', '_blank');
      tab.setAttribute('rel', 'noopener noreferrer');
      tab.setAttribute('title', 'Open in a new tab');
      tab.setAttribute('aria-label', 'Open in a new tab');
      tab.appendChild(icon(ICON.external, 13));
      card.appendChild(tab);
    }
    host.appendChild(card);
    return target;
  }

  /* -- link ------------------------------------------------------------ */
  function copyButton(absHref) {
    var btn = el('button', 'cb-iconbtn');
    btn.setAttribute('type', 'button');
    btn.setAttribute('title', 'Copy link');
    btn.setAttribute('aria-label', 'Copy link');
    btn.appendChild(icon(ICON.copy, 13));
    btn.addEventListener('click', function () {
      navigator.clipboard.writeText(absHref).then(function () {
        while (btn.firstChild) btn.removeChild(btn.firstChild);
        btn.appendChild(icon(ICON.check, 13));
        btn.classList.add('cb-done');
        setTimeout(function () {
          while (btn.firstChild) btn.removeChild(btn.firstChild);
          btn.appendChild(icon(ICON.copy, 13));
          btn.classList.remove('cb-done');
        }, 1200);
      }).catch(function () { /* inert */ });
    });
    return btn;
  }

  function renderLink(b, parent) {
    var kind = b.kind === 'external' ? 'external' : b.kind === 'site' ? 'site' : null;
    if (!kind) return;                    // never infer the kind from the string
    var label = plain(b.label, 70);
    if (!label) return;

    var host = blockShell(parent, 'cb-link-host');
    var card = el('div', 'cb-nav');
    var left = el('div');
    left.style.flex = '1';

    if (kind === 'site') {
      var target = resolveSiteUrl(b.url);
      if (!target) return;
      var a = el('a', 'cb-nav-main');
      a.setAttribute('href', target.href);
      a.appendChild(document.createTextNode(label));
      a.addEventListener('click', function (ev) {
        if (target.samePage) ev.preventDefault();
        performNav(target, { auto: false });
      });
      left.appendChild(a);
      if (b.note) left.appendChild(el('div', 'cb-reason', plain(b.note, 160)));
      card.appendChild(left);
      if (b.copyable !== false && navigator.clipboard) card.appendChild(copyButton(absolute(target.href)));
    } else {
      var ext = resolveExternalUrl(b.url);
      if (!ext) return;
      var ea = el('a', 'cb-nav-main');
      ea.setAttribute('href', ext.href);
      ea.setAttribute('target', '_blank');
      ea.setAttribute('rel', 'noopener noreferrer');
      ea.appendChild(icon(ICON.external, 12));
      ea.appendChild(document.createTextNode(label));
      left.appendChild(ea);
      left.appendChild(el('div', 'cb-host', ext.host));
      if (b.note) left.appendChild(el('div', 'cb-reason', plain(b.note, 160)));
      card.appendChild(left);
      if (b.copyable === true && navigator.clipboard) card.appendChild(copyButton(ext.href));
    }
    host.appendChild(card);
  }

  /* -- query ----------------------------------------------------------- */
  function renderQuery(b, parent) {
    var sql = multiline(b.sql, 4000);
    if (!sql.trim()) return;
    var host = blockShell(parent, 'cb-query cb-card');
    if (b.explanation) {
      var ex = el('div', 'cb-caption', plain(b.explanation, 200));
      ex.style.marginTop = '0';
      ex.style.marginBottom = '6px';
      host.appendChild(ex);
    }
    var pre = el('pre');
    pre.textContent = sql;               // textContent, never innerHTML
    host.appendChild(pre);
    var run = el('a', 'cb-runlink');
    run.setAttribute('href', '/query.html');
    run.appendChild(icon(ICON.run, 12));
    run.appendChild(document.createTextNode('Run on the query page'));
    run.addEventListener('click', function () { saveHistory(); });
    host.appendChild(run);
  }

  /* -- suggest --------------------------------------------------------- */
  function renderSuggest(b, parent) {
    var items = Array.isArray(b.items) ? b.items.slice(0, CAP.suggestItems) : [];
    if (!items.length) return;
    var host = blockShell(parent, 'cb-suggest');
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {};
      var label = plain(it.label, 40);
      var prompt = plain(it.prompt, 160) || label;
      if (!label) continue;
      var chip = el('button', 'cb-chip', label);
      chip.setAttribute('type', 'button');
      chip.setAttribute('title', prompt);
      (function (p) {
        chip.addEventListener('click', function () { send(p); });
      })(prompt);
      host.appendChild(chip);
    }
  }

  /* -- dispatcher ------------------------------------------------------ */
  var RENDERERS = {
    text: renderText,
    chart: renderChart,
    table: renderTable,
    stat: renderStat,
    nav: renderNav,
    link: renderLink,
    query: renderQuery,
    suggest: renderSuggest,
    notice: renderNotice
  };

  function renderBlocks(blocks, contentEl) {
    // Lift `suggest` out BEFORE the length cap, so follow-up chips are never
    // the thing that falls off the end (§4.5.9: suggest always renders last).
    var main = [], chips = [];
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i];
      if (!b || typeof b !== 'object' || typeof b.type !== 'string') continue;
      (b.type === 'suggest' ? chips : main).push(b);
    }
    var ordered = main.slice(0, CAP.blocks).concat(chips.slice(0, 1));

    var autoUsed = false;
    var autoTarget = null;
    for (var j = 0; j < ordered.length; j++) {
      var blk = ordered[j];
      var fn = RENDERERS[blk.type];
      if (!fn) continue;                  // unknown type: skipped silently (forward compat)
      try {
        var result = fn(blk, contentEl);
        if (blk.type === 'nav' && blk.auto === true && !autoUsed && result) {
          autoUsed = true;
          autoTarget = { target: result, highlight: blk.highlight !== false };
        }
      } catch (e) {
        if (window.console && console.warn) console.warn('[chat] block render failed', blk.type, e);
      }
    }
    return autoTarget;
  }

  /* ===================================================================== */
  /* Errors — a mapping, never a raw exception                              */
  /* ===================================================================== */

  var ERROR_COPY = {
    bad_request:          { title: 'I could not read that', help: 'Rephrase the question and send it again.' },
    too_long:             { title: 'That question is too long', help: 'Trim it to about 2,000 characters and send again.' },
    forbidden_origin:     { title: 'The assistant is not available here', help: 'Open the site at phd-demographics.andy-barr.com.' },
    rate_limited:         { title: 'Too many questions at once', help: 'Wait a moment and ask again.' },
    // The server's daily ceilings. These had no copy, so a reader who hit one
    // was told "Something broke on our side" -- which is untrue, and invites
    // retrying a request that will be refused until midnight UTC.
    daily_budget:         { title: 'Daily limit reached', help: 'Questions it has answered before still work. New ones resume at midnight UTC.' },
    daily_cap_soft:       { title: 'Daily limit reached', help: 'Common questions still work. New ones resume tomorrow.' },
    daily_cap:            { title: 'Daily limit reached', help: 'The assistant will be back tomorrow.' },
    upstream_unavailable: { title: 'The model is unreachable', help: 'This usually clears in a few seconds. Retry below.' },
    upstream_timeout:     { title: 'That took too long', help: 'Retry, or ask a narrower question.' },
    internal:             { title: 'Something broke on our side', help: 'Retry. If it keeps happening the assistant is down.' },
    network:              { title: 'No connection to the assistant', help: 'Check your network, then retry.' }
  };
  var RETRYABLE = { upstream_unavailable: 1, upstream_timeout: 1, internal: 1, network: 1 };

  /**
   * A backend failure renders as a valid notice block, never as a broken turn.
   */
  function renderError(code, message, retryAfter) {
    var copy = ERROR_COPY[code] || ERROR_COPY.internal;
    var msg = newMessage('assistant');
    var kind = (code === 'rate_limited' || code.indexOf('daily_') === 0) ? 'warn' : 'bad';
    renderNotice({
      kind: kind,
      title: copy.title,
      md: plain(message, 400) || copy.help,
      help: copy.help
    }, msg.content);

    if (code === 'rate_limited' && retryAfter > 0) {
      var line = el('div', 'cb-caption');
      msg.content.appendChild(line);
      var left = Math.min(600, Math.max(1, Math.round(retryAfter)));
      sendBtn.disabled = true;
      if (rateTimer) clearInterval(rateTimer);
      line.textContent = 'You can ask again in ' + left + 's.';
      rateTimer = setInterval(function () {
        left -= 1;
        if (left <= 0) {
          clearInterval(rateTimer); rateTimer = null;
          line.textContent = 'You can ask again now.';
          if (!isLoading) sendBtn.disabled = false;
          return;
        }
        line.textContent = 'You can ask again in ' + left + 's.';
      }, 1000);
    }

    if (RETRYABLE[code] && lastUserMessage) {
      var host = blockShell(msg.content, 'cb-suggest');
      var chip = el('button', 'cb-chip');
      chip.setAttribute('type', 'button');
      chip.appendChild(icon(ICON.retry, 12));
      chip.appendChild(document.createTextNode(' Retry'));
      chip.style.display = 'inline-flex';
      chip.style.alignItems = 'center';
      chip.style.gap = '5px';
      chip.addEventListener('click', function () {
        if (chip.parentNode) chip.parentNode.removeChild(chip);
        send(lastUserMessage, true);
      });
      host.appendChild(chip);
    }
    scrollToEnd();
  }

  /* ===================================================================== */
  /* Transport                                                              */
  /* ===================================================================== */

  function pageContext() {
    var ctx = { path: location.pathname };
    var m = location.pathname.match(/\/universities\/([A-Za-z0-9_-]{1,48})\.html$/);
    if (m) ctx.university_key = m[1];
    var h = (location.hash || '').replace(/^#/, '');
    if (h) ctx.section = h.slice(0, CAP.fragment);
    return ctx;
  }

  function warmUp() {
    if (pinged) return;
    pinged = true;
    try {
      fetch(CHAT_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: 2, ping: true })
      }).catch(function () {});
    } catch (e) { /* inert */ }
  }

  function postTurn(message, signal) {
    return fetch(CHAT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: signal,
      body: JSON.stringify({
        v: 2,
        message: message,
        conversationHistory: convo.slice(-MAX_TURNS * 2),
        facts: facts,
        page: pageContext(),
        client: { widget: WIDGET_VERSION }
      })
    });
  }

  function send(text, isRetry) {
    var msg = plain(text, 2000).trim();
    if (!msg || isLoading) return;

    ensureSiteMap();
    clearSuggestions();

    if (!isRetry) {
      var um = newMessage('user');
      um.content.textContent = msg;      // textContent: the user's own input is data too
    }
    lastUserMessage = msg;
    input.value = '';
    isLoading = true;
    sendBtn.disabled = true;

    var typing = newMessage('assistant');
    typing.content.className = 'chat-content chat-typing';
    typing.content.textContent = 'Thinking…';
    scrollToEnd();

    var seq = ++sendSeq;
    var started = Date.now();

    function attempt(n) {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, REQUEST_TIMEOUT_MS) : null;
      return postTurn(msg, ctrl ? ctrl.signal : undefined)
        .then(function (resp) { if (timer) clearTimeout(timer); return resp; })
        .catch(function (e) {
          if (timer) clearTimeout(timer);
          // One cold-start retry, network-level failures only, and only if the
          // first attempt died quickly.
          if (n === 0 && (Date.now() - started) < 5000) {
            return new Promise(function (r) { setTimeout(r, 900); }).then(function () { return attempt(1); });
          }
          throw e;
        });
    }

    attempt(0).then(function (resp) {
      if (seq !== sendSeq) return;       // stale — a newer turn is in flight
      typing.wrap.remove();
      return resp.json().catch(function () { return null; }).then(function (data) {
        if (seq !== sendSeq) return;
        handleResponse(resp, data, msg);
      });
    }).catch(function (e) {
      if (seq !== sendSeq) return;
      typing.wrap.remove();
      var code = (e && e.name === 'AbortError') ? 'upstream_timeout' : 'network';
      renderError(code, '', 0);
    }).then(function () {
      if (seq !== sendSeq) return;
      isLoading = false;
      if (!rateTimer) sendBtn.disabled = false;
      scrollToEnd();
    });
  }

  function handleResponse(resp, data, userMsg) {
    if (!resp.ok || (data && data.error)) {
      var code = (data && typeof data.error_code === 'string') ? data.error_code
        : resp.status === 429 ? 'rate_limited'
        : resp.status === 502 ? 'upstream_unavailable'
        : resp.status === 504 ? 'upstream_timeout'
        : resp.status === 400 ? 'bad_request'
        : resp.status === 403 ? 'forbidden_origin' : 'internal';
      var wait = 0;
      if (data && isFiniteNum(Number(data.retry_after_s))) wait = Number(data.retry_after_s);
      var hdr = resp.headers && resp.headers.get && resp.headers.get('Retry-After');
      if (!wait && hdr && isFinite(Number(hdr))) wait = Number(hdr);
      renderError(code, data && data.error, wait);
      if (code === 'too_long') input.value = userMsg;
      return;
    }
    if (!data) { renderError('internal', '', 0); return; }

    var msg = newMessage('assistant');
    var reply = typeof data.reply === 'string' ? data.reply : '';
    var autoTarget = null;

    if (Array.isArray(data.blocks)) {
      autoTarget = renderBlocks(data.blocks, msg.content);
      if (!msg.content.firstChild && reply) msg.content.appendChild(mdToNodes(reply));
    } else {
      renderLegacy(data, reply, msg.content);
    }
    if (!msg.content.firstChild) msg.content.appendChild(mdToNodes(reply || 'No response.'));

    convo.push({ role: 'user', content: userMsg });
    convo.push({ role: 'assistant', content: reply });
    // Keep the server's record of what its tools established. It is opaque to
    // us -- we store and return it, the server validates it on the way back in.
    if (data && data.meta && data.meta.facts &&
        Array.isArray(data.meta.facts.facts)) {
      facts = data.meta.facts;
    }
    if (convo.length > MAX_TURNS * 2) convo = convo.slice(-MAX_TURNS * 2);
    saveHistory();
    scrollToEnd();

    if (autoTarget && autoTarget.target.samePage) {
      setTimeout(function () {
        performNav(autoTarget.target, { auto: true, highlight: autoTarget.highlight });
      }, 600);
    }
  }

  /** v1 fallback: {reply, actions:[{type:'navigate'|'query', ...}]} */
  function renderLegacy(data, reply, contentEl) {
    if (reply) contentEl.appendChild(mdToNodes(reply));
    var actions = Array.isArray(data.actions) ? data.actions.slice(0, CAP.blocks) : [];
    for (var i = 0; i < actions.length; i++) {
      var a = actions[i] || {};
      if (a.type === 'navigate') {
        var page = plain(a.page, 200);
        var frag = plain(a.section_id, CAP.fragment);
        if (!page) continue;
        var url = '/' + page.replace(/^\/+/, '') + (frag ? '#' + frag : '');
        renderNav({ url: url, label: a.label, auto: false }, contentEl);
      } else if (a.type === 'query') {
        renderQuery({ sql: a.sql, explanation: a.explanation }, contentEl);
      }
    }
  }

  /* ===================================================================== */
  /* Guided tour                                                           */
  /*                                                                       */
  /* Stops span pages, so a stop elsewhere is a real navigation and every   */
  /* variable dies. Position lives in sessionStorage and the tour resumes   */
  /* on the far side. tour.js holds the stops; this drives them through the */
  /* same nav and ring helpers the assistant already uses, so there is no   */
  /* second navigation system to keep in step.                             */
  /* ===================================================================== */

  function maybeOfferTour() {
    if (!tourOn() || tourOffered) return;
    tourOffered = true;
    if (window.PhdTour.state()) return;     // mid-tour; tourResume handles it
    if (convo.length) return;               // they are already talking to us
    var m = newMessage('assistant');
    var p_ = document.createElement('p');
    p_.className = 'cb-tour-text';
    p_.textContent = 'I can walk you through this in ' + window.PhdTour.length
      + ' stops \u2014 the cost, the departments, and the part most people get '
      + 'wrong. Or just ask me something.';
    m.content.appendChild(p_);
    var row = document.createElement('div');
    row.className = 'cb-tour-actions';
    var go = document.createElement('button');
    go.type = 'button';
    go.className = 'cb-tour-next';
    go.textContent = 'Take the tour';
    go.addEventListener('click', function () { go.disabled = true; tourStart(); });
    row.appendChild(go);
    m.content.appendChild(row);
    scrollToEnd();
  }

  function tourOn() { return typeof window.PhdTour !== 'undefined'; }

  function ringSelector(sel) {
    if (!sel) return;
    var node;
    try { node = document.querySelector(sel); } catch (e) { return; }
    if (!node) return;
    node.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    ringTarget(node);
  }

  function tourSay(stop, index, total) {
    var m = newMessage('assistant');
    var badge = document.createElement('div');
    badge.className = 'cb-tour-badge';
    badge.textContent = 'Tour \u00b7 ' + (index + 1) + ' of ' + total;
    m.content.appendChild(badge);

    var body = document.createElement('p');
    body.className = 'cb-tour-text';
    body.textContent = stop.say;
    m.content.appendChild(body);

    var row = document.createElement('div');
    row.className = 'cb-tour-actions';
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'cb-tour-next';
    next.textContent = (index + 1 >= total) ? 'Finish' : 'Next';
    next.addEventListener('click', function () { next.disabled = true; tourNext(); });
    row.appendChild(next);
    var end = document.createElement('button');
    end.type = 'button';
    end.className = 'cb-tour-end';
    end.textContent = 'End tour';
    end.addEventListener('click', function () {
      window.PhdTour.clear();
      var e = newMessage('assistant');
      e.content.textContent = 'Tour ended. Ask me anything.';
      scrollToEnd();
    });
    row.appendChild(end);
    m.content.appendChild(row);

    convo.push({ role: 'assistant', content: stop.say });
    saveHistory();
    scrollToEnd();
  }

  function showStop(stop, index) {
    if (!stop) return;
    tourSay(stop, index, window.PhdTour.length);
    if (stop.anchor) {
      setTimeout(function () {
        scrollToFragment(stop.anchor, true);
        if (stop.selector) setTimeout(function () { ringSelector(stop.selector); }, 420);
      }, 260);
    } else if (stop.selector) {
      setTimeout(function () { ringSelector(stop.selector); }, 260);
    }
  }

  function tourNext() {
    if (!tourOn()) return;
    var stop = window.PhdTour.advance();
    if (!stop) {
      var m = newMessage('assistant');
      m.content.textContent = 'That is the tour. Ask me anything about what you '
        + 'just saw \u2014 I still have the figures from it.';
      scrollToEnd();
      return;
    }
    var st = window.PhdTour.state() || { i: 0 };
    if (window.PhdTour.samePage(stop)) showStop(stop, st.i);
    else location.href = stop.page + (stop.anchor ? '#' + stop.anchor : '');
  }

  function tourBack() {
    if (!tourOn() || !window.PhdTour.retreat) return;
    var stop = window.PhdTour.retreat();
    if (!stop) return;                      // already at the first stop
    var st = window.PhdTour.state() || { i: 0 };
    if (window.PhdTour.samePage(stop)) showStop(stop, st.i);
    else location.href = stop.page + (stop.anchor ? '#' + stop.anchor : '');
  }

  /* ARROWS MOVE THE TOUR. Right and Up go forward, Left and Down go back,
   * so either hand works and either mental model does: "next/previous" and
   * "down the page/up the page" both land on something sensible.
   *
   * Ignored while the reader is typing, or the question box would lose its
   * arrow keys mid-sentence. */
  document.addEventListener('keydown', function (e) {
    if (!tourOn() || !window.PhdTour.state || !window.PhdTour.state()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // The panel autofocuses the question box, so arrows would otherwise
    // always land in it and never reach the tour. An EMPTY box is not being
    // edited: the reader is watching, and the arrows are theirs. Once there
    // is text, the caret keys go back to belonging to the box.
    var t = e.target;
    if (t && t.isContentEditable) return;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')
        && (t.value || '').length > 0) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault(); tourNext();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault(); tourBack();
    } else if (e.key === 'Escape') {
      window.PhdTour.clear();
    }
  });

  /* The "?" path. Distinct from tourStart in two ways that matter: it clears
   * any half-finished tour first, so pressing "?" always means "from the
   * beginning" rather than "resume"; and it opens the panel itself, because
   * the reader may have pressed it with the chat shut. */
  var TOUR_SEEN = 'phd-tour-seen';
  var tourLoading = null;

  /* sidebar.js injects tour.js, but the widget also loads on pages that have
   * their own navigation and never run sidebar.js -- stem.html among them,
   * which is the busiest page on the site. The widget therefore loads its own
   * dependency rather than depending on another script having done it, so the
   * "?" is never a button that does nothing.
   */
  /* ANY PAGE CAN START THE TOUR.
   *
   * The "?" button is in the corner and a reader has to know what it does.
   * A link in the body of a page, at the point where someone has just read
   * something and wants the guided version, converts far better -- so an
   * element carrying data-start-tour starts it, wherever it sits.
   *
   * Delegated from the document, because the pages that carry such a link
   * are generated and the widget has no way to know about them. It is also
   * exposed as window.PhdChat.startTour for anything that needs to call it
   * directly. The link stays a real anchor to /overview#the-clearest-cases,
   * so with no JavaScript it still goes somewhere sensible rather than
   * nowhere.
   */
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-start-tour]');
    if (!t) return;
    e.preventDefault();
    // The attribute's value picks a track: empty is the whole argument,
    // "step2" is just the master's. The track has to be set before the
    // tour starts, and tour.js may not be loaded yet, so it is set inside
    // ensureTour's callback rather than here.
    var track = t.getAttribute('data-start-tour') || 'full';
    ensureTour(function (ok) {
      if (ok && window.PhdTour.setTrack) window.PhdTour.setTrack(track);
      tourRestart();
    });
  });
  // A ?tour= parameter starts that tour on arrival. Checked once, on load,
  // after the tour file is available.
  ensureTour(function (ok) {
    if (!ok || !window.PhdTourAutostart) return;
    var want = window.PhdTourAutostart();
    if (!want) return;
    window.PhdTour.setTrack(want);
    tourRestart();
  });

  window.PhdChat = window.PhdChat || {};
  window.PhdChat.startTour = function (track) {
    ensureTour(function (ok) {
      if (ok && window.PhdTour.setTrack) window.PhdTour.setTrack(track || 'full');
      tourRestart();
    });
  };

  function ensureTour(cb) {
    if (tourOn()) { cb(true); return; }
    if (tourLoading) { tourLoading.push(cb); return; }
    tourLoading = [cb];
    var s = document.createElement('script');
    s.src = '/tour.js';
    function done() {
      var waiting = tourLoading;
      tourLoading = null;
      for (var i = 0; i < waiting.length; i++) {
        try { waiting[i](tourOn()); } catch (e) { /* inert */ }
      }
    }
    s.addEventListener('load', done);
    s.addEventListener('error', done);
    document.body.appendChild(s);
  }

  function tourRestart() {
    dismissHint();
    // Before setOpen, not after: opening the panel runs maybeOfferTour, and
    // someone who just pressed "?" does not need to be asked whether they
    // want the tour they are already starting.
    tourOffered = true;
    setOpen(true);
    ensureTour(function (ok) {
      if (!ok) {
        var m = newMessage('assistant');
        m.content.textContent = 'I could not load the tour just now, but ask me '
          + 'anything and I will take you to the figures.';
        scrollToEnd();
        return;
      }
      window.PhdTour.clear();         // "?" always means from the beginning
      tourStart();
    });
  }

  function dismissHint() {
    var h = document.getElementById('phd-tour-hint');
    if (h) h.remove();
    tourBtn.classList.remove('nudge');
    try { localStorage.setItem(TOUR_SEEN, '1'); } catch (e) { /* private mode */ }
  }

  /* Shown once, on a reader's first visit, and never again. localStorage can
   * throw or be wiped, so a lost flag costs one extra hint -- not a broken
   * page. */
  function maybeHintTour() {
    if (!tourOn()) return;
    var seen = true;
    try { seen = !!localStorage.getItem(TOUR_SEEN); } catch (e) { seen = false; }
    if (seen || window.PhdTour.state() || convo.length) return;
    var hint = el('div');
    hint.id = 'phd-tour-hint';
    var text = el('span');
    text.textContent = 'First time here? I can walk you through the finding in '
      + window.PhdTour.length + ' stops.';
    var close = el('button');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    close.addEventListener('click', function () { dismissHint(); });
    text.style.cursor = 'pointer';
    text.addEventListener('click', tourRestart);
    hint.appendChild(text);
    hint.appendChild(close);
    document.body.appendChild(hint);
    tourBtn.classList.add('nudge');
    // It is a hint, not a demand: it goes away on its own. The flag is NOT
    // set here -- a reader who never looked at the corner should get one more
    // chance on their next visit.
    setTimeout(function () {
      var h = document.getElementById('phd-tour-hint');
      if (h) { h.remove(); tourBtn.classList.remove('nudge'); }
    }, 14000);
  }

  function tourStart() {
    if (!tourOn()) return;
    window.PhdTour.start();
    var stop = window.PhdTour.get(0);
    if (window.PhdTour.samePage(stop)) showStop(stop, 0);
    else location.href = stop.page + (stop.anchor ? '#' + stop.anchor : '');
  }

  function tourResume() {
    if (!tourOn()) return;
    var st = window.PhdTour.state();
    if (!st || typeof st.i !== 'number') return;
    var stop = window.PhdTour.get(st.i);
    if (!stop || !window.PhdTour.samePage(stop)) return;
    setOpen(true);
    setTimeout(function () { showStop(stop, st.i); }, 550);
  }

  /* ===================================================================== */
  /* Wiring                                                                 */
  /* ===================================================================== */

  function setOpen(next) {
    isOpen = next;
    panel.classList.toggle('open', isOpen);
    bubble.setAttribute('aria-label', isOpen ? 'Close the data assistant' : 'Open the data assistant');
    if (isOpen) {
      ensureSiteMap();
      warmUp();
      input.focus();
      scrollToEnd();
      maybeOfferTour();
    }
  }

  bubble.addEventListener('click', function () { setOpen(!isOpen); });
  tourBtn.addEventListener('click', tourRestart);
  closeBtn.addEventListener('click', function () { setOpen(false); });
  sendBtn.addEventListener('click', function () { send(input.value); });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && isOpen) { setOpen(false); bubble.focus(); }
  });
  window.addEventListener('pagehide', function () {
    saveHistory();
    for (var i = 0; i < liveCharts.length; i++) {
      try { liveCharts[i].destroy(); } catch (e) { /* ignore */ }
    }
    liveCharts = [];
  });

  /* Public surface — small on purpose. `render` exists so the block renderer
     can be exercised against hand-written responses without a backend. */
  window.__phdChat = {
    version: WIDGET_VERSION,
    open: function () { setOpen(true); },
    startTour: tourRestart,
    close: function () { setOpen(false); },
    send: send,
    /** Render a hand-written v2 envelope. Test hook. */
    render: function (envelope) {
      setOpen(true);
      var m = newMessage('assistant');
      if (Array.isArray(envelope.blocks)) {
        var auto = renderBlocks(envelope.blocks, m.content);
        if (auto && auto.target.samePage) {
          setTimeout(function () { performNav(auto.target, { auto: true, highlight: auto.highlight }); }, 600);
        }
      } else {
        renderLegacy(envelope, envelope.reply || '', m.content);
      }
      if (!m.content.firstChild) m.content.appendChild(mdToNodes(envelope.reply || ''));
      scrollToEnd();
      return m.content;
    },
    /** Resolves once the page registry is in memory (or has failed over). */
    ready: ensureSiteMap,
    /** Expose the URL gate so it can be attacked directly from a console. */
    _resolveSiteUrl: resolveSiteUrl,
    _resolveExternalUrl: resolveExternalUrl,
    _mdToNodes: mdToNodes,
    _clear: function () {
      if (rateTimer) { clearInterval(rateTimer); rateTimer = null; }
      sendBtn.disabled = isLoading;
      while (messagesEl.firstChild) messagesEl.removeChild(messagesEl.firstChild);
      for (var i = 0; i < liveCharts.length; i++) {
        try { liveCharts[i].destroy(); } catch (e) { /* ignore */ }
      }
      liveCharts = [];
      convo = [];
      try { sessionStorage.removeItem(HISTORY_KEY); } catch (e) {}
    }
  };

  // Fetch the page registry eagerly. Nav targets are validated against it, and
  // until it lands the widget can only fall back to a shape test — so the
  // sooner it is in memory the more precise the link fail-safe is.
  ensureSiteMap();

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // A tour stop on another page is a real navigation; pick it up on arrival.
  window.addEventListener('load', function () {
    setTimeout(function () {
      ensureTour(function () {
        try { tourResume(); } catch (e) { /* inert */ }
        try { maybeHintTour(); } catch (e) { /* inert */ }
      });
    }, 400);
  });
})();
