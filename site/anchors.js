/* anchors.js — site-wide deep linking.
 *
 * One scheme, documented for readers at data_sources.html#linking and, for the
 * generated university pages, at the top of the anchor block in
 * scripts/generate_name_lists_html.py:
 *
 *   page.html#<section-slug>            a named block on a static page
 *   page.html#<entity>                  a university / table / tab, by its key
 *   page.html#<entity>--<child>         one level down (field, panel, tab)
 *   page.html#<entity>--<child>--<year> two levels down
 *
 * Slugs are lower-case kebab-case derived from the visible heading text, so a
 * reader can construct one by hand. Resolution is forgiving: case, and the
 * difference between '-' and '_', never matter.
 *
 * This file:
 *   1. gives every major heading a stable descriptive id (if the HTML has not
 *      already baked one in),
 *   2. puts a copy-link control next to each of them,
 *   3. resolves the fragment on cold load and on hashchange — including
 *      targets inside hidden tab panels and collapsed blocks, which the
 *      browser's native fragment scrolling cannot reach.
 *
 * Pages with their own state (a selected university, a loaded table) can
 * register window.ANCHOR_HOOKS = [fn(id) -> true if handled].
 */
(function () {
  'use strict';

  var SCROLL_OFFSET = 12;

  // ---------------------------------------------------------------- slugging
  // Kept in step with slugify() in scripts/add_section_anchors.py, which bakes
  // the same ids into the HTML ahead of time.
  function slugify(text) {
    var s = (text || '').replace(/\s+/g, ' ').trim();
    // drop a leading enumerator: "1. ", "6.", "A. ", "B) "
    s = s.replace(/^(?:[0-9]{1,2}|[A-Za-z])[.)]\s+/, '');
    s = s.toLowerCase();
    if (s.normalize) s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (s.length > 48) {
      var cut = s.slice(0, 48);
      var lastDash = cut.lastIndexOf('-');
      s = lastDash > 20 ? cut.slice(0, lastDash) : cut;
    }
    return s;
  }

  // Normalised form used for forgiving lookups.
  function norm(id) {
    return (id || '').toLowerCase().replace(/_/g, '-');
  }

  // ------------------------------------------------------------------- style
  function injectStyle() {
    if (document.getElementById('anchors-css')) return;
    var css = [
      '[id]{scroll-margin-top:' + SCROLL_OFFSET + 'px;}',
      '.anchor-link{font-size:0.72rem;font-weight:700;line-height:1;text-decoration:none;',
      'color:var(--accent,#38bdf8);opacity:0.3;padding:0 4px;cursor:pointer;',
      'transition:opacity 0.15s;user-select:none;vertical-align:middle;}',
      'h1:hover>.anchor-link,h2:hover>.anchor-link,h3:hover>.anchor-link,',
      'h4:hover>.anchor-link,.anchor-link:hover,.anchor-link:focus-visible{opacity:1;}',
      '.anchor-link.copied{opacity:1;color:#4ade80;}',
      '.anchor-flash{outline:2px solid var(--accent,#38bdf8);outline-offset:3px;',
      'border-radius:6px;animation:anchorFade 2.4s ease-out forwards;}',
      '@keyframes anchorFade{0%,55%{outline-color:var(--accent,#38bdf8);}',
      '100%{outline-color:transparent;}}',
      ':target{scroll-margin-top:' + SCROLL_OFFSET + 'px;}'
    ].join('');
    var el = document.createElement('style');
    el.id = 'anchors-css';
    el.textContent = css;
    document.head.appendChild(el);
  }

  // --------------------------------------------------------- id assignment
  // Blocks that should carry the id rather than the heading itself, so that
  // :target highlighting frames the whole card.
  var BLOCK_SELECTOR = '.chart-box, .card, .panel, .table-wrap, .info-box,' +
    ' .section, .step-section, .tab-content, .uni-card, .link-card, .charts-block';

  function ownerBlock(heading) {
    var p = heading.parentElement;
    while (p && p !== document.body) {
      if (p.matches && p.matches(BLOCK_SELECTOR)) {
        // Only claim the block if this heading is its first heading.
        var first = p.querySelector('h1,h2,h3,h4');
        if (first === heading) return p;
        return null;
      }
      p = p.parentElement;
    }
    return null;
  }

  function headingText(h) {
    var clone = h.cloneNode(true);
    Array.prototype.forEach.call(
      clone.querySelectorAll('.anchor-link, .share-btn, .share-anchor'),
      function (n) { n.remove(); }
    );
    return clone.textContent || '';
  }

  function assignIds(root) {
    var headings = (root || document).querySelectorAll('h1, h2, h3, h4');
    Array.prototype.forEach.call(headings, function (h) {
      if (h.closest('.sidebar, #sidebar, .sb-group, nav, footer')) return;
      var block = ownerBlock(h);
      var holder = block || h;
      if (holder.id) return;
      var base = slugify(headingText(h));
      if (!base) return;
      var id = base, n = 2;
      while (document.getElementById(id)) {
        id = base + '-' + n++;
        if (n > 50) return;
      }
      holder.id = id;
    });
  }

  // ------------------------------------------------------- copy-link buttons
  function anchorTargetFor(h) {
    var block = ownerBlock(h);
    if (block && block.id) return block.id;
    if (h.id) return h.id;
    return null;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    return Promise.reject(new Error('no clipboard'));
  }

  function linkFor(id) {
    return location.origin + location.pathname + location.search + '#' + id;
  }

  function addCopyButtons(root) {
    var headings = (root || document).querySelectorAll('h1, h2, h3, h4');
    Array.prototype.forEach.call(headings, function (h) {
      if (h.closest('.sidebar, #sidebar, .sb-group, nav, footer')) return;
      if (h.querySelector('.anchor-link')) return;
      var id = anchorTargetFor(h);
      if (!id) return;
      // Retire the older hand-written share buttons in favour of one control.
      Array.prototype.forEach.call(h.querySelectorAll('.share-btn'), function (n) { n.remove(); });
      var a = document.createElement('a');
      a.className = 'anchor-link';
      a.href = '#' + id;
      a.textContent = '#';
      a.title = 'Copy link to this section';
      a.setAttribute('aria-label', 'Copy link to this section');
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        var url = linkFor(id);
        history.replaceState(null, '', '#' + id);
        goTo(id, false);
        copyToClipboard(url).then(function () {
          a.classList.add('copied');
          a.textContent = 'copied';
          setTimeout(function () { a.classList.remove('copied'); a.textContent = '#'; }, 1400);
        }).catch(function () {
          window.prompt('Copy this link:', url);
        });
        if (typeof window.send === 'function') {
          try { window.send({ type: 'share', target: id, url: url }); } catch (e) {}
        }
      });
      h.appendChild(a);
    });
  }

  // -------------------------------------------------------------- resolution
  function findElement(id) {
    if (!id) return null;
    var el = document.getElementById(id);
    if (el) return el;
    // Forgiving: case, and '-' vs '_'.
    var want = norm(id);
    var all = document.querySelectorAll('[id]');
    for (var i = 0; i < all.length; i++) {
      if (norm(all[i].id) === want) return all[i];
    }
    // A heading whose slug matches, even though the id was never baked in.
    var headings = document.querySelectorAll('h1,h2,h3,h4');
    for (var j = 0; j < headings.length; j++) {
      if (norm(slugify(headingText(headings[j]))) === want) return headings[j];
    }
    return null;
  }

  // Open whatever is hiding the target: tab panels, collapsed sections,
  // <details>. Returns true if anything was opened.
  function reveal(el) {
    var opened = false;
    var node = el;
    while (node && node !== document.body) {
      if (node.tagName === 'DETAILS' && !node.open) { node.open = true; opened = true; }
      if (node.classList) {
        if (node.classList.contains('collapsed')) { node.classList.remove('collapsed'); opened = true; }
        if (node.classList.contains('yr-collapsed')) { node.classList.remove('yr-collapsed'); opened = true; }
        // Tab panels: activate by clicking the tab that points at this panel.
        var isPanel = node.classList.contains('panel') || node.classList.contains('tab-content');
        if (isPanel && !node.classList.contains('active') && node.id) {
          var key = node.id.replace(/^(panel|tab)-/, '');
          var tab = document.querySelector('.tab[data-panel="' + key + '"], .tab[data-tab="' + key + '"]');
          if (tab) { tab.click(); opened = true; }
          else { node.classList.add('active'); opened = true; }
        }
      }
      node = node.parentElement;
    }
    return opened;
  }

  var flashed = null;
  function flash(el) {
    if (flashed) flashed.classList.remove('anchor-flash');
    el.classList.add('anchor-flash');
    flashed = el;
    setTimeout(function () { el.classList.remove('anchor-flash'); }, 2600);
  }

  function goTo(id, smooth) {
    var el = findElement(id);
    if (!el) return false;
    reveal(el);
    var doScroll = function () {
      el.scrollIntoView({ behavior: smooth === false ? 'auto' : 'smooth', block: 'start' });
      flash(el);
    };
    doScroll();
    // Charts and tab switches resize after the fact; land again once settled.
    setTimeout(doScroll, 220);
    return true;
  }

  function runHooks(id) {
    var hooks = window.ANCHOR_HOOKS || [];
    for (var i = 0; i < hooks.length; i++) {
      try { if (hooks[i](id)) return true; } catch (e) {}
    }
    return false;
  }

  function resolveHash(smooth) {
    var raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
    if (!raw) return;
    var id = raw.split('?')[0];
    if (!id) return;
    var handled = runHooks(id);
    // Hooks may have rendered the target; try again on the next frame either way.
    if (!goTo(id, smooth) && handled) {
      setTimeout(function () { goTo(id, smooth); }, 400);
    }
  }

  // Expose for page-specific code and for late-rendered content.
  window.Anchors = {
    slugify: slugify,
    goTo: goTo,
    resolveHash: resolveHash,
    linkFor: linkFor,
    // Call after injecting new headings so they get ids + copy controls.
    refresh: function (root) {
      assignIds(root);
      addCopyButtons(root);
    }
  };

  function init() {
    injectStyle();
    assignIds(document);
    addCopyButtons(document);
    resolveHash(false);
    // Content on several pages renders asynchronously; retry once it lands.
    setTimeout(function () { resolveHash(false); }, 600);
    window.addEventListener('hashchange', function () { resolveHash(true); });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
