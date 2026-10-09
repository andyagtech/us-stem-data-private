/* glossary.js — the definitions a reader keeps having to ask for, in place.
 *
 * "Non-resident" is the most load-bearing word on this site and the easiest to
 * misread. Readers reasonably assume it means foreign-born, or that it
 * includes green card holders. It means neither. Rather than repeat the
 * definition in every caption, the term carries it: hover, tap or tab to the
 * word and IPEDS's own wording appears.
 *
 * MARKS THE FIRST OCCURRENCE PER PAGE, and only inside running prose. Marking
 * every occurrence turns a page into a field of dotted underlines, and marking
 * headings or link text breaks them. Anything the page has already marked with
 * data-term is left alone and used as-is, so a builder can place the term
 * deliberately.
 */
(function () {
  'use strict';

  var TERMS = {
    nra: {
      label: 'Non-resident',
      body: 'IPEDS defines a non-resident (until 2022 "non-resident alien") as '
          + 'a person “who is not a citizen or national of the United States '
          + 'and who is in this country on a visa or temporary basis and does '
          + 'not have the right to remain indefinitely.”\n\n'
          + 'So it means here on a temporary visa — for students, '
          + 'overwhelmingly F-1 or J-1.\n\n'
          + 'A green card holder is never counted in it. Nor is a refugee or an '
          + 'asylee. Those students are reported in the race and ethnicity '
          + 'categories alongside citizens.\n\n'
          + 'It is not ethnicity and not country of origin. A US-born citizen of '
          + 'any background is never non-resident.',
      source: 'IPEDS glossary, NCES',
      url: 'https://nces.ed.gov/ipeds/report-your-data/race-ethnicity-definitions'
    }
  };

  // Phrases that resolve to a term. Longest first, so "non-resident alien"
  // wins over "non-resident".
  var PATTERNS = [
    { re: /\bnon-?resident aliens?\b/i, term: 'nra' },
    { re: /\bnon-?residents?\b/i, term: 'nra' },
    { re: /\bNRAs?\b/, term: 'nra' }
  ];

  var SCOPE = 'p, li, td, dd, figcaption, .lede, .note, .stat .l, .stat .s';
  var SKIP = 'a, button, h1, h2, h3, h4, h5, h6, code, pre, .term, .sb-item, script, style';

  function tooltipFor(key) {
    var t = TERMS[key];
    var box = document.createElement('span');
    box.className = 'term-pop';
    box.setAttribute('role', 'tooltip');
    t.body.split('\n\n').forEach(function (para) {
      var p = document.createElement('span');
      p.className = 'term-pop-p';
      p.textContent = para;
      box.appendChild(p);
    });
    var src = document.createElement('a');
    src.className = 'term-pop-src';
    src.href = t.url;
    src.target = '_blank';
    src.rel = 'noopener noreferrer';
    src.textContent = t.source;
    box.appendChild(src);
    return box;
  }

  var openPop = null;
  function close() {
    if (openPop) { openPop.classList.remove('open'); openPop = null; }
  }

  function decorate(el, key) {
    el.className = 'term';
    // Stamp the key so a later pass recognises this as already done. Without
    // it, an auto-marked span carried no data-term, every re-run started from
    // an empty `done`, and a page collected one extra marked word per pass.
    el.setAttribute('data-term', key);
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', TERMS[key].label + ' — show the definition');
    el.appendChild(tooltipFor(key));
    function open(ev) {
      if (ev) ev.stopPropagation();
      if (openPop === el) { close(); return; }
      close();
      el.classList.add('open');
      openPop = el;
      // Keep the bubble on screen on a narrow viewport.
      var pop = el.querySelector('.term-pop');
      if (pop) {
        pop.style.left = '';
        var r = pop.getBoundingClientRect();
        if (r.left < 8) pop.style.left = (8 - r.left) + 'px';
        else if (r.right > window.innerWidth - 8) {
          pop.style.left = (window.innerWidth - 8 - r.right) + 'px';
        }
      }
    }
    el.addEventListener('click', open);
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); }
      if (ev.key === 'Escape') close();
    });
  }

  function markFirst() {
    var done = {};
    Array.prototype.forEach.call(document.querySelectorAll('.term'),
      function (el) {
        var k = el.getAttribute('data-term');
        if (k) done[k] = true;
      });
    // Honour anything the page marked deliberately.
    Array.prototype.forEach.call(document.querySelectorAll('[data-term]'),
      function (el) {
        var key = el.getAttribute('data-term');
        // Already decorated by an earlier pass. Running decorate() twice on
        // one element appends a second tooltip to it, which is how this page
        // ended up with three bubbles behind one word.
        if (el.classList.contains('term')) { done[key] = true; return; }
        if (TERMS[key]) { decorate(el, key); done[key] = true; }
      });

    var hosts = document.querySelectorAll(SCOPE);
    for (var h = 0; h < hosts.length; h++) {
      if (hosts[h].closest(SKIP)) continue;
      var walker = document.createTreeWalker(hosts[h], NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.parentElement && node.parentElement.closest(SKIP)) continue;
        for (var i = 0; i < PATTERNS.length; i++) {
          var key = PATTERNS[i].term;
          if (done[key]) continue;
          var m = PATTERNS[i].re.exec(node.nodeValue);
          if (!m) continue;
          var after = node.splitText(m.index);
          after.nodeValue = after.nodeValue.slice(m[0].length);
          var span = document.createElement('span');
          span.textContent = m[0];
          node.parentNode.insertBefore(span, after);
          decorate(span, key);
          done[key] = true;
          break;
        }
        if (Object.keys(done).length === Object.keys(TERMS).length) return;
      }
    }
  }

  function style() {
    var css = document.createElement('style');
    css.id = 'glossary-css';
    css.textContent = [
      '.term{border-bottom:1px dotted currentColor;cursor:help;position:relative;',
      'text-underline-offset:2px;}',
      '.term:focus-visible{outline:2px solid var(--accent,#38bdf8);outline-offset:2px;}',
      '.term-pop{display:none;position:absolute;z-index:60;left:0;top:calc(100% + 8px);',
      'width:min(22rem,88vw);padding:.8rem .9rem;border-radius:10px;',
      'border:1px solid var(--border,#334155);background:var(--surface,#1e293b);',
      'color:var(--text,#e2e8f0);font-size:.82rem;line-height:1.5;font-weight:400;',
      'text-align:left;box-shadow:0 8px 28px rgba(0,0,0,.28);white-space:normal;',
      'cursor:auto;}',
      '.term.open .term-pop{display:block;}',
      '@media (hover:hover){.term:hover .term-pop{display:block;}}',
      '.term-pop-p{display:block;margin:0 0 .55rem;}',
      '.term-pop-src{display:block;font-size:.72rem;opacity:.75;}'
    ].join('');
    document.head.appendChild(css);
  }

  function init() {
    if (!document.getElementById('glossary-css')) {
      style();
      document.addEventListener('click', close);
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') close();
      });
    }
    markFirst();
  }

  // Run again once everything else has landed. sidebar.js injects this file
  // and then the chat widget, and anchors.js rewrites headings, so the first
  // pass can run against a page that is still assembling. markFirst only ever
  // marks a term that is not marked yet, so running it twice is free.
  function initTwice() {
    init();
    window.addEventListener('load', init);
    setTimeout(init, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTwice);
  } else {
    initTwice();
  }
})();
