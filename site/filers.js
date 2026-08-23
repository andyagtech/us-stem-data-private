/* Who files the visas — searchable directory of LCA filers, plus the map.
 *
 * All data is DOL public disclosure. Contact details are part of that record
 * and are shown, because the point of the page is that the programme can be
 * examined.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var D = null, STATES = null, kind = 'firms';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function sv(name, attrs) {
    var n = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function fmt(v) { return (v == null) ? '—' : Number(v).toLocaleString('en-US'); }
  function phone(p) {
    // Digits only in the source; show them the way a person would read them.
    var s = String(p);
    if (s.length === 11 && s[0] === '1') s = s.slice(1);
    return s.length === 10 ? '(' + s.slice(0, 3) + ') ' + s.slice(3, 6) + '-' + s.slice(6) : s;
  }

  /* --------------------------------------------------------------- search */

  function haystack(r) {
    var parts = [r.name, r.firm, r.city, r.state, r.address];
    (r.emails || []).forEach(function (e) { parts.push(e); });
    (r.universities || []).forEach(function (u) { parts.push(u[0]); });
    (r.attorneys || []).forEach(function (a) { parts.push(a[0]); });
    (r.offices || []).forEach(function (o) { parts.push(o); });
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function firmCard(f) {
    var c = el('div', 'card');
    c.appendChild(el('h3', null, f.name));
    var sub = el('p', 'sub');
    sub.textContent = fmt(f.filings) + ' filings · ' +
      (f.universities || []).length + ' universit' +
      ((f.universities || []).length === 1 ? 'y' : 'ies');
    c.appendChild(sub);
    var dl = el('dl');
    function row(k, v) {
      if (!v) return;
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', null, v));
    }
    row('Offices', (f.offices || []).join(' · '));
    row('FEIN', (f.feins || [])[0]);
    row('Universities', (f.universities || [])
      .map(function (u) { return u[0] + ' (' + fmt(u[1]) + ')'; }).join(', '));
    row('Attorneys', (f.attorneys || [])
      .map(function (a) { return a[0] + ' (' + fmt(a[1]) + ')'; }).join(', '));
    c.appendChild(dl);
    return c;
  }

  function attyCard(a) {
    var c = el('div', 'card');
    c.appendChild(el('h3', null, a.name));
    var sub = el('p', 'sub');
    sub.textContent = fmt(a.filings) + ' filings' +
      (a.firm ? ' · ' + a.firm : '') +
      (a.first_year ? ' · active ' + a.first_year + '–' + a.last_year : '');
    c.appendChild(sub);
    var dl = el('dl');
    function row(k, v) {
      if (!v) return;
      dl.appendChild(el('dt', null, k));
      dl.appendChild(el('dd', null, v));
    }
    row('Email', (a.emails || []).join(' · '));
    row('Phone', (a.phones || []).map(phone).join(' · '));
    row('Address', a.address);
    row('Universities', (a.universities || [])
      .map(function (u) { return u[0] + ' (' + fmt(u[1]) + ')'; }).join(', '));
    c.appendChild(dl);
    if (a.located_by === 'city') {
      var p = el('span', 'pill', 'located to city only');
      c.appendChild(p);
    }
    return c;
  }

  function render() {
    var host = document.getElementById('results');
    var hits = document.getElementById('hits');
    var q = (document.getElementById('q').value || '').trim().toLowerCase();
    var rows = (kind === 'firms' ? D.firms : D.attorneys);
    var shown = q ? rows.filter(function (r) { return haystack(r).indexOf(q) !== -1; }) : rows;
    clear(host);
    hits.textContent = q
      ? shown.length + ' of ' + rows.length + ' ' + kind + ' match “' + q + '”'
      : rows.length + ' ' + kind + ', busiest first';
    if (!shown.length) {
      host.appendChild(el('p', 'loading', 'Nothing matches that.'));
      return;
    }
    // Cap the DOM at a readable number; searching narrows it further.
    shown.slice(0, 60).forEach(function (r) {
      host.appendChild(kind === 'firms' ? firmCard(r) : attyCard(r));
    });
    if (shown.length > 60) {
      host.appendChild(el('p', 'note',
        'Showing the 60 busiest of ' + shown.length + '. Narrow the search to see the rest.'));
    }
  }

  /* ------------------------------------------------------------------ map */

  function drawMap() {
    var host = document.getElementById('map-host');
    if (!host || !STATES) return;
    clear(host);
    var pts = D.attorneys.filter(function (a) { return a.lat != null; });
    if (!pts.length) return;

    // Albers equal-area, the standard projection for a US map.
    function albers(lon, lat) {
      var lo = lon * Math.PI / 180, la = lat * Math.PI / 180;
      var lo0 = -96 * Math.PI / 180, la0 = 37.5 * Math.PI / 180;
      var p1 = 29.5 * Math.PI / 180, p2 = 45.5 * Math.PI / 180;
      var n = 0.5 * (Math.sin(p1) + Math.sin(p2));
      var c = Math.cos(p1) * Math.cos(p1) + 2 * n * Math.sin(p1);
      var r0 = Math.sqrt(c - 2 * n * Math.sin(la0)) / n;
      var r = Math.sqrt(c - 2 * n * Math.sin(la)) / n;
      var th = n * (lo - lo0);
      return [r * Math.sin(th), r0 - r * Math.cos(th)];
    }

    // No filer is in Alaska or Hawaii, so their insets would be empty land
    // taking a quarter of the canvas.
    var skip = { AK: 1, HI: 1 };
    var drawn = Object.keys(STATES).filter(function (a) { return !skip[a]; });
    var xs = [], ys = [];
    drawn.forEach(function (a) {
      STATES[a].forEach(function (ring) {
        ring.forEach(function (p) { xs.push(p[0]); ys.push(p[1]); });
      });
    });
    var b = { x0: Math.min.apply(null, xs), x1: Math.max.apply(null, xs),
              y0: Math.min.apply(null, ys), y1: Math.max.apply(null, ys) };

    var W = host.clientWidth || 900, H = Math.round(W * 0.6), pad = 12;
    var k = Math.min((W - 2 * pad) / (b.x1 - b.x0), (H - 2 * pad) / (b.y1 - b.y0));
    var ox = (W - (b.x1 - b.x0) * k) / 2 - b.x0 * k;
    var oy = (H - (b.y1 - b.y0) * k) / 2 - b.y0 * k;
    function X(x) { return x * k + ox; }
    // Albers y grows NORTHWARD; SVG y grows downward. Without this flip the
    // whole country renders upside down.
    function Y(y) { return (b.y0 + b.y1 - y) * k + oy; }

    var svg = sv('svg', { class: 'map', viewBox: '0 0 ' + W + ' ' + H,
                          role: 'img', 'aria-label':
                          'Map of the United States showing where the filing attorneys are based' });
    drawn.forEach(function (a) {
      var d = STATES[a].map(function (ring) {
        return 'M' + ring.map(function (p) {
          return X(p[0]).toFixed(1) + ',' + Y(p[1]).toFixed(1);
        }).join('L') + 'Z';
      }).join('');
      svg.appendChild(sv('path', { d: d, fill: 'rgba(148,163,184,.12)',
        stroke: 'rgba(148,163,184,.35)', 'stroke-width': 0.8,
        'stroke-linejoin': 'round' }));
    });

    var peak = Math.max.apply(null, pts.map(function (p) { return p.filings; }));
    pts.slice().sort(function (a, c) { return c.filings - a.filings; })
      .forEach(function (p) {
        var xy = albers(p.lon, p.lat);
        var r = Math.max(2.4, Math.sqrt(p.filings / peak) * (W / 34));
        var c = sv('circle', { cx: X(xy[0]).toFixed(1), cy: Y(xy[1]).toFixed(1),
          r: r.toFixed(1), fill: '#38bdf8', 'fill-opacity': .38,
          stroke: '#38bdf8', 'stroke-width': 1 });
        var t = sv('title', {});
        t.textContent = p.name + ' — ' + fmt(p.filings) + ' filings, ' +
          (p.city || '?') + ', ' + (p.state || '?');
        c.appendChild(t);
        svg.appendChild(c);
      });
    host.appendChild(svg);
  }

  /* -------------------------------------------------------------- wiring */

  function totals() {
    var c = D.counts, host = document.getElementById('totals');
    [['Firms', fmt(c.firms)], ['Attorneys', fmt(c.attorneys)],
     ['Filings naming a firm', fmt(c.filings_with_a_named_firm)],
     ['Located', fmt(c.attorneys_located)]]
      .forEach(function (p) {
        var d = el('div');
        d.appendChild(el('span', 'v', p[1]));
        d.appendChild(el('span', 'k', p[0]));
        host.appendChild(d);
      });
    document.getElementById('coverage').textContent = D.note;
  }

  document.getElementById('kind').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b) return;
    kind = b.getAttribute('data-kind');
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) {
      var on = x === b;
      x.classList.toggle('on', on);
      x.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    render();
  });
  document.getElementById('q').addEventListener('input', render);

  fetch('/data/legal_directory.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      D = d;
      document.querySelector('#kind button').classList.add('on');
      totals(); render();
      return fetch('/data/us_states.json', { credentials: 'omit' });
    })
    .then(function (r) { return r.json(); })
    .then(function (s) { STATES = s; drawMap(); })
    .catch(function () {
      var h = document.getElementById('results');
      if (h) { clear(h); h.appendChild(el('p', 'loading', 'Could not load the directory.')); }
    });
})();
