/* An on-page tour for /stem and /non_stem.
 *
 * WHY A SECOND TOUR. The site tour in tour.js walks across pages and narrates
 * through the chat panel. This page is one long dashboard and the reader is
 * already here; sending them elsewhere would be the wrong move. So this tour
 * stays put: it rings one chart at a time, explains it in a small panel, and
 * scrolls. No navigation, no chat, no dependency on the assistant being up.
 *
 * WHY IT IS NOT IN tour.js. That file's stops are pages. These are elements
 * on a single page, and the two have nothing in common but the word "tour".
 * Folding them together would mean one file that does two unrelated jobs.
 *
 * A STOP THAT CANNOT BE FOUND IS SKIPPED, NOT SHOWN EMPTY. The charts on
 * this page are built from data at load time and a future change could rename
 * one. A tour that stopped on nothing and said something about it would be
 * worse than one that quietly moved on; the count shown to the reader is the
 * number of stops that actually resolved.
 */
(function () {
  'use strict';

  var STOPS = [
    { el: '#nat-phd-chart',
      title: 'American PhD production barely moved',
      say: 'Total STEM doctorates rose about 50% since 2010. Almost none of ' +
           'that growth went to Americans: the citizen and permanent-resident ' +
           'line is close to flat while the non-resident line climbs.' },
    { el: '#nat-funding-chart',
      title: 'The money nearly doubled; the Americans did not',
      say: 'University R&D spending nearly doubled over the same period. ' +
           'American doctorate production grew about 11%. This is the ' +
           'clearest picture on the page of what the public money bought.' },
    { el: '#nat-field-chart',
      title: 'It is concentrated, not general',
      say: 'Computer science, engineering and mathematics separated from ' +
           'everything else. Biology barely moved. This is a story about ' +
           'particular fields, and the national average hides it.' },
    { el: '#nat-opt-chart',
      title: 'The degree becomes work authorization',
      say: 'OPT authorizations grew elevenfold since 2007. The 2016 STEM OPT ' +
           'rule extended the window to three years, and the step is visible ' +
           'in the line.' },
    { el: '#nat-total-pipeline-chart',
      title: 'What the pipeline delivers each year',
      say: 'OPT, STEM OPT, CPT and university H-1B together. This is the ' +
           'number of foreign work authorizations the education route issues ' +
           'annually.' },
    { el: '#nat-visa-chart',
      title: 'The visas behind it',
      say: 'F-1 student, H-1B worker, J-1 exchange and O-1. Issuances are ' +
           'counts of visas, not of people: one person re-stamping for travel ' +
           'is counted again.' },
    { el: '#uni-table',
      title: 'And every name is checkable',
      say: 'Below this point is the institution-by-institution record. Each ' +
           'name links to that university’s own repository, so any single ' +
           'line can be verified at the source rather than taken on trust.' }
  ];

  var i = -1, live = [], panel, ring;

  function byId(sel) {
    try { return document.querySelector(sel); } catch (e) { return null; }
  }

  function build() {
    panel = document.createElement('div');
    panel.className = 'st-tour';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-live', 'polite');
    panel.innerHTML =
      '<p class="st-count"></p><p class="st-title"></p><p class="st-say"></p>' +
      '<div class="st-row"><button type="button" class="st-back">Back</button>' +
      '<button type="button" class="st-next">Next</button>' +
      '<button type="button" class="st-end">End tour</button></div>' +
      '<p class="st-keys">Arrow keys move the tour \u00b7 Esc ends it</p>';
    document.body.appendChild(panel);
    panel.querySelector('.st-next').addEventListener('click', next);
    panel.querySelector('.st-back').addEventListener('click', back);
    panel.querySelector('.st-end').addEventListener('click', end);
    ring = document.createElement('div');
    ring.className = 'st-ring';
    document.body.appendChild(ring);
  }

  function place(el) {
    var r = el.getBoundingClientRect();
    ring.style.top = (r.top + window.scrollY - 8) + 'px';
    ring.style.left = (r.left + window.scrollX - 8) + 'px';
    ring.style.width = (r.width + 16) + 'px';
    ring.style.height = (r.height + 16) + 'px';
    ring.style.display = 'block';
  }

  function show() {
    var s = live[i], el = byId(s.el);
    if (!el) { next(); return; }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    panel.querySelector('.st-count').textContent =
      'Tour · ' + (i + 1) + ' of ' + live.length;
    panel.querySelector('.st-title').textContent = s.title;
    panel.querySelector('.st-say').textContent = s.say;
    panel.querySelector('.st-next').textContent =
      i === live.length - 1 ? 'Finish' : 'Next';
    panel.querySelector('.st-back').disabled = (i === 0);
    panel.classList.add('open');
    setTimeout(function () { place(el); }, 380);
  }

  function next() { i += 1; if (i >= live.length) { end(); return; } show(); }

  function back() {
    // At the first stop, going back does nothing rather than closing: the
    // reader asked to re-read, not to leave.
    if (i <= 0) return;
    i -= 1;
    show();
  }

  function end() {
    i = -1;
    if (panel) panel.classList.remove('open');
    if (ring) ring.style.display = 'none';
  }

  function start() {
    // Only the stops whose element is actually on this page.
    live = STOPS.filter(function (s) { return byId(s.el); });
    if (!live.length) return;
    if (!panel) build();
    i = -1;
    next();
  }

  window.addEventListener('resize', function () {
    if (i >= 0 && live[i]) { var el = byId(live[i].el); if (el) place(el); }
  });
  /* Right and Up go forward, Left and Down go back, matching the site
     tour. Ignored while typing, and while a modifier is held so browser
     shortcuts still work. */
  document.addEventListener('keydown', function (e) {
    if (i < 0) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
              t.isContentEditable)) return;
    if (e.key === 'Escape') { end(); return; }
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); back(); }
  });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-stem-tour]');
    if (!t) return;
    e.preventDefault();
    start();
  });

  window.StemTour = { start: start, end: end, next: next, back: back,
                      stops: STOPS.length };
}());
