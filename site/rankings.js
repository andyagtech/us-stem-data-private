/* Where the non-resident share is highest, at both degree levels.
 *
 * Every table here is a ranking on a ratio, which is the easiest kind of chart
 * to mislead with: a programme conferring four degrees, all to non-residents,
 * reads 100% and means nothing. Every table therefore states its cohort floor
 * and how many units cleared it, and prints the denominator on every row.
 */
(function () {
  'use strict';

  var DATA = null, LEVEL = 'masters';

  function el(t, c, x) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (x !== undefined) n.textContent = x;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  function bar(pct, color) {
    var track = el('div', 'r-track'), fill = el('div', 'r-bar');
    fill.style.width = Math.max(0, Math.min(100, pct)) + '%';
    fill.style.background = color || '#f0a5ae';
    track.appendChild(fill);
    return track;
  }

  function table(hostId, rows, opts) {
    var host = document.getElementById(hostId);
    if (!host) return;
    clear(host);
    if (!rows || !rows.length) {
      host.appendChild(el('p', 'note', 'No rows clear the floor for this level.'));
      return;
    }
    rows.forEach(function (r, i) {
      var row = el('div', 'r-row');
      row.appendChild(el('span', 'r-rank', String(i + 1)));
      var nm = el('span', 'r-name', r.name);
      if (opts && opts.sub) nm.title = opts.sub(r);
      row.appendChild(nm);
      row.appendChild(bar(r.share, opts && opts.color));
      row.appendChild(el('span', 'r-pct', r.share.toFixed(1) + '%'));
      row.appendChild(el('span', 'r-n',
        r.nra.toLocaleString() + ' of ' + r.total.toLocaleString()));
      host.appendChild(row);
    });
  }

  function contrastList(hostId, rows) {
    var host = document.getElementById(hostId);
    if (!host) return;
    clear(host);
    rows.forEach(function (c) {
      var box = el('div', 'contrast');
      var h = el('div', 'c-head');
      h.appendChild(el('span', 'c-name', c.name));
      h.appendChild(el('span', 'c-gap', c.gap.toFixed(1) + ' points apart'));
      box.appendChild(h);
      [['high', c.high], ['low', c.low]].forEach(function (pair) {
        var side = el('div', 'c-side');
        side.appendChild(el('span', 'c-share ' + pair[0], pair[1].share.toFixed(1) + '%'));
        side.appendChild(el('span', 'c-prog', pair[1].name));
        side.appendChild(el('span', 'c-n', pair[1].nra.toLocaleString() +
          ' of ' + pair[1].total.toLocaleString()));
        box.appendChild(side);
      });
      host.appendChild(box);
    });
  }

  function render() {
    var L = DATA.levels[LEVEL], f = DATA.floors[LEVEL];
    var w = DATA.windows.late;

    document.getElementById('nat').textContent =
      L.national.share.toFixed(1) + '%';
    document.getElementById('nat-detail').textContent =
      L.national.nra.toLocaleString() + ' of ' + L.national.total.toLocaleString() +
      ' core-STEM ' + (LEVEL === 'masters' ? "master's" : 'doctoral') +
      ' degrees, ' + w[0] + '–' + w[1];

    document.getElementById('inst-floor').textContent =
      f.inst + '+ degrees over ' + w[0] + '–' + w[1] +
      '; ' + L.institutions_eligible.toLocaleString() + ' institutions qualify.';
    document.getElementById('prog-floor').textContent =
      f.prog + '+ degrees nationally; ' +
      L.programmes_eligible.toLocaleString() + ' programmes qualify.';
    document.getElementById('contrast-floor').textContent =
      L.contrast_floor + '+ graduates in each of the two programmes; ' +
      L.contrasts_total.toLocaleString() + ' institutions show a gap of 50 points or more.';

    table('inst-table', L.institutions);
    table('prog-table', L.programmes, { color: '#c4b5fd' });
    table('biggest-table', L.biggest, { color: '#94a3b8' });
    contrastList('contrast-list', L.contrasts);

    Array.prototype.forEach.call(
      document.querySelectorAll('#level-pick button'), function (b) {
        var on = b.dataset.level === LEVEL;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
  }

  fetch('/data/level_rankings.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      DATA = d;
      var pick = document.getElementById('level-pick');
      pick.addEventListener('click', function (ev) {
        var b = ev.target.closest('button');
        if (!b || !b.dataset.level) return;
        LEVEL = b.dataset.level;
        render();
      });
      render();
    })
    .catch(function () {
      var h = document.getElementById('inst-table');
      if (h) { clear(h); h.appendChild(el('p', 'note',
        'Could not load /data/level_rankings.json')); }
    });
}());
