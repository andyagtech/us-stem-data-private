/* Charts for /distributions.html.
 *
 * Plain DOM, no chart library. Three views of the same underlying claim: the
 * national average hides a distribution that has been moving.
 *
 * Everything the page renders comes from three JSON files built by scripts in
 * this repo, so a figure here can always be traced to a builder and from there
 * to the federal file. Nothing is computed in the browser except percentages
 * of things already in the payload.
 *
 * All text reaches the DOM via textContent. The data is ours, but the habit is
 * worth keeping: a CIP title is a string from a federal file, and federal files
 * have contained stranger things than markup.
 */
(function () {
  'use strict';

  var C_2010 = '#64748b';
  var C_2025 = '#f0a5ae';
  var C_BAR  = '#38bdf8';

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function pct(x) { return (Math.round(x * 10) / 10) + '%'; }


  /* ------------------------------------------------ 0. raw counts over time */

  function drawCounts(rows, ids, labels) {
    var host = document.getElementById(ids.chart);
    var legend = document.getElementById(ids.legend);
    var stats = document.getElementById(ids.stats);
    if (!host) return;
    clear(host); clear(legend); clear(stats);
    if (!rows.length) return;

    var NS = 'http://www.w3.org/2000/svg';
    function sv(name, attrs) {
      var n = document.createElementNS(NS, name);
      Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, String(attrs[k])); });
      return n;
    }

    var W = host.clientWidth || 760, H = 300;
    var m = { t: 14, r: 62, b: 28, l: 56 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var svg = sv('svg', { class: 'line-chart', viewBox: '0 0 ' + W + ' ' + H });

    // Round the axis top up to a 1/2/5-style step so the four gridline labels
    // land on whole numbers rather than 11k/23k/34k.
    var peak = 0;
    rows.forEach(function (r) { if (r.total > peak) peak = r.total; });
    var mag = Math.pow(10, Math.floor(Math.log(peak / 4) / Math.LN10));
    var step = mag * 10;
    [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].some(function (f) {
      if (mag * f >= peak / 4) { step = mag * f; return true; }
      return false;
    });
    var maxV = step * 4;

    var lo = rows[0].year, hi = rows[rows.length - 1].year;
    function x(y) { return m.l + ((y - lo) / (hi - lo)) * iw; }
    function yv(v) { return m.t + ih - (v / maxV) * ih; }

    for (var g = 0; g <= 4; g++) {
      var val = (maxV / 4) * g, gy = yv(val);
      svg.appendChild(sv('line', { class: 'grid', x1: m.l, x2: m.l + iw, y1: gy, y2: gy }));
      var lab = sv('text', { x: m.l - 8, y: gy + 4, 'text-anchor': 'end' });
      lab.textContent = val >= 1000 ? (val / 1000) + 'k' : String(val);
      svg.appendChild(lab);
    }
    rows.forEach(function (r, i) {
      if (r.year % 5 && i !== rows.length - 1) return;
      var t = sv('text', { x: x(r.year), y: H - 8, 'text-anchor': 'middle' });
      t.textContent = String(r.year);
      svg.appendChild(t);
    });

    var series = [
      { key: 'total', color: '#94a3b8', label: labels.total },
      { key: 'dom',   color: '#38bdf8', label: 'Domestic (citizens and permanent residents)' },
      { key: 'nra',   color: '#f0a5ae', label: 'Non-resident (temporary visas)' }
    ];
    series.forEach(function (s2) {
      // IPEDS never published 1999, so the line is BROKEN across any missing
      // year and a faint dashed stub bridges it. Drawing straight through
      // would put a fabricated 1999 value on the page.
      var dpath = '', bridges = [];
      rows.forEach(function (r, i) {
        var prev = i ? rows[i - 1] : null;
        var gap = prev && r.year !== prev.year + 1;
        if (gap) {
          bridges.push('M' + x(prev.year).toFixed(1) + ' ' + yv(prev[s2.key]).toFixed(1) +
                       'L' + x(r.year).toFixed(1) + ' ' + yv(r[s2.key]).toFixed(1));
        }
        dpath += (i && !gap ? 'L' : 'M') + x(r.year).toFixed(1) + ' ' + yv(r[s2.key]).toFixed(1);
      });
      if (bridges.length) {
        svg.appendChild(sv('path', { class: 'ser gap', d: bridges.join(' '),
          stroke: s2.color, 'stroke-dasharray': '3 4', 'stroke-opacity': '0.45',
          'stroke-width': '1.6' }));
      }
      var path = sv('path', { class: 'ser', d: dpath, stroke: s2.color });
      svg.appendChild(path);
      try {
        var len = path.getTotalLength();
        if (len && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          path.style.strokeDasharray = len;
          path.style.strokeDashoffset = len;
          path.style.transition = 'stroke-dashoffset .7s ease-out';
          requestAnimationFrame(function () { path.style.strokeDashoffset = '0'; });
        }
      } catch (e) { /* fine without the animation */ }
      var last = rows[rows.length - 1];
      svg.appendChild(sv('circle', { class: 'dot', cx: x(last.year),
        cy: yv(last[s2.key]), r: 4, fill: s2.color }));
      var v = sv('text', { x: x(last.year) + 8, y: yv(last[s2.key]) + 4, fill: s2.color });
      v.textContent = Number(last[s2.key]).toLocaleString();
      svg.appendChild(v);

      var li = el('span');
      var sw = el('i');
      sw.style.background = s2.color;
      li.appendChild(sw);
      li.appendChild(document.createTextNode(s2.label));
      legend.appendChild(li);
    });
    host.appendChild(svg);

    var first = rows[0], last2 = rows[rows.length - 1];
    function chg(a, b) { return (b > a ? '+' : '') + Math.round(100 * (b - a) / a) + '%'; }
    [['Domestic', first.dom.toLocaleString() + ' → ' + last2.dom.toLocaleString()
        + '  (' + chg(first.dom, last2.dom) + ')'],
     ['Non-resident', first.nra.toLocaleString() + ' → ' + last2.nra.toLocaleString()
        + '  (' + chg(first.nra, last2.nra) + ')'],
     ['Total', first.total.toLocaleString() + ' → ' + last2.total.toLocaleString()
        + '  (' + chg(first.total, last2.total) + ')']
    ].forEach(function (p) {
      var sp = el('span');
      sp.appendChild(document.createTextNode(p[0] + ' '));
      sp.appendChild(el('b', null, p[1]));
      stats.appendChild(sp);
    });
  }

  /* ------------------------------------------------ 1. national histogram */

  function drawHistogram(d) {
    var host = document.getElementById('hist');
    var legend = document.getElementById('hist-legend');
    var stats = document.getElementById('hist-stats');
    clear(host); clear(legend); clear(stats);

    var hs = d.histograms || [];
    var early = hs[0], late = hs[hs.length - 1];
    if (!early || !late) return;

    [[early.year, C_2010], [late.year, C_2025]].forEach(function (p) {
      var s = el('span');
      var i = el('i');
      i.style.background = p[1];
      s.appendChild(i);
      s.appendChild(document.createTextNode(String(p[0])));
      legend.appendChild(s);
    });

    var peak = 0;
    [early, late].forEach(function (h) {
      h.pct.forEach(function (v) { if (v > peak) peak = v; });
    });

    d.bins.forEach(function (bin, i) {
      [early, late].forEach(function (h, k) {
        var row = el('div', 'hist-row');
        row.appendChild(el('div', 'hist-label', k === 0 ? bin.label : ''));
        var track = el('div', 'hist-track');
        var bar = el('div', 'hist-bar');
        bar.style.background = k === 0 ? C_2010 : C_2025;
        bar.style.width = '0%';
        track.appendChild(bar);
        row.appendChild(track);
        row.appendChild(el('div', 'hist-n',
          h.counts[i] + (k === 0 ? '' : '  · ' + h.year)));
        host.appendChild(row);
        requestAnimationFrame(function () {
          bar.style.width = (peak ? (100 * h.pct[i] / peak) : 0) + '%';
        });
      });
    });

    [['Departments', early.departments + ' → ' + late.departments],
     ['Median share', pct(early.median) + ' → ' + pct(late.median)],
     ['Above 50%', early.at_or_above_50 + ' → ' + late.at_or_above_50],
     ['Above 70%', early.at_or_above_70 + ' → ' + late.at_or_above_70]
    ].forEach(function (p) {
      var s = el('span');
      s.appendChild(document.createTextNode(p[0] + ' '));
      s.appendChild(el('b', null, p[1]));
      stats.appendChild(s);
    });
  }

  /* ------------------------------------------------------- 2. programmes */

  var progData = null;

  function drawProgrammes(mode) {
    var host = document.getElementById('programmes-list');
    if (!progData) return;
    clear(host);
    var rows = progData.programmes.slice();
    if (mode === 'bottom') rows.sort(function (a, b) { return a.share - b.share; });
    else if (mode === 'size') rows.sort(function (a, b) { return b.doctorates - a.doctorates; });
    else rows.sort(function (a, b) { return b.share - a.share; });
    rows = rows.slice(0, 24);

    rows.forEach(function (r) {
      var row = el('div', 'prog-row');
      row.appendChild(el('div', 'prog-name', r.title || r.cip));
      row.appendChild(el('div', 'num', r.institutions + ' sch'));
      row.appendChild(el('div', 'num', Number(r.doctorates).toLocaleString()));
      var v = el('div', 'share-v', pct(r.share));
      v.style.color = r.share >= 50 ? C_2025 : 'inherit';
      row.appendChild(v);
      var wrap = el('div', 'prog-bar-wrap');
      var bar = el('div', 'prog-bar');
      bar.style.background = r.share >= 50 ? C_2025 : C_BAR;
      bar.style.width = '0%';
      wrap.appendChild(bar);
      row.appendChild(wrap);
      host.appendChild(row);
      requestAnimationFrame(function () { bar.style.width = r.share + '%'; });
    });
  }

  /* ------------------------------------------------------ 3. per-university */

  var uniData = null;

  function drawUniversity(key) {
    var host = document.getElementById('uni-list');
    var stats = document.getElementById('uni-stats');
    clear(host); clear(stats);
    var d = uniData && uniData[key];
    if (!d) return;

    [['Departments', String(d.departments)],
     ['Majority non-resident', d.majority_non_resident + ' of ' + d.departments],
     ['Range', pct(d.min_share) + ' – ' + pct(d.max_share)],
     ['Pooled', pct(d.pooled_share)]
    ].forEach(function (p) {
      var s = el('span');
      s.appendChild(document.createTextNode(p[0] + ' '));
      s.appendChild(el('b', null, p[1]));
      stats.appendChild(s);
    });

    d.depts.forEach(function (r) {
      var row = el('div', 'prog-row');
      row.appendChild(el('div', 'prog-name', r.title || r.cip));
      row.appendChild(el('div', 'num', r.cip));
      row.appendChild(el('div', 'num', Number(r.total).toLocaleString()));
      var v = el('div', 'share-v', pct(r.share));
      v.style.color = r.share >= 50 ? C_2025 : 'inherit';
      row.appendChild(v);
      var wrap = el('div', 'prog-bar-wrap');
      var bar = el('div', 'prog-bar');
      bar.style.background = r.share >= 50 ? C_2025 : C_BAR;
      bar.style.width = '0%';
      wrap.appendChild(bar);
      row.appendChild(wrap);
      host.appendChild(row);
      requestAnimationFrame(function () { bar.style.width = r.share + '%'; });
    });
  }

  function fail(id, msg) {
    var host = document.getElementById(id);
    if (host) { clear(host); host.appendChild(el('p', 'loading', msg)); }
  }

  /* ------------------------------------------------------------- wiring */

  fetch('/data/long_series.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var rows = Object.keys(d.series || {}).map(Number)
        .sort(function (a, b) { return a - b; })
        .map(function (y) {
          var v = d.series[String(y)];
          return { year: y, total: v.total, nra: v.nra, dom: v.domestic };
        });
      drawCounts(rows, { chart: 'counts-chart', legend: 'counts-legend',
        stats: 'counts-stats' }, { total: 'All core-STEM doctorates' });
    })
    .catch(function () {
      fail('counts-chart', 'Could not load the counts. See /data/long_series.json');
    });

  // The master's panel comes from the live bundle, which stores [total, nra]
  // per CIP family per year; sum the eight families to get the national count.
  fetch('/data/live_bundle.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var m = (d.degrees || {}).masters || {}, by = {};
      Object.keys(m).forEach(function (cip) {
        Object.keys(m[cip]).forEach(function (y) {
          var p = m[cip][y];
          if (!by[y]) by[y] = [0, 0];
          by[y][0] += p[0]; by[y][1] += p[1];
        });
      });
      var rows = Object.keys(by).map(Number).sort(function (a, b) { return a - b; })
        .map(function (y) {
          var p = by[String(y)];
          return { year: y, total: p[0], nra: p[1], dom: p[0] - p[1] };
        });
      drawCounts(rows, { chart: 'masters-chart', legend: 'masters-legend',
        stats: 'masters-stats' }, { total: "All core-STEM master's" });
    })
    .catch(function () {
      fail('masters-chart', 'Could not load the counts. See /data/live_bundle.json');
    });

  fetch('/data/distribution.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(drawHistogram)
    .catch(function () {
      fail('hist', 'Could not load the histogram. The same figures are in /data/distribution.json');
    });

  fetch('/data/programme_shares.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      progData = d;
      drawProgrammes('top');
      var sel = document.getElementById('prog-sort');
      if (sel) sel.addEventListener('change', function () { drawProgrammes(sel.value); });
    })
    .catch(function () {
      fail('programmes-list', 'Could not load programme shares. See /data/programme_shares.json');
    });

  fetch('/data/university_distribution.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      uniData = d;
      var sel = document.getElementById('uni-pick');
      if (!sel) return;
      clear(sel);
      Object.keys(d).map(function (k) { return d[k]; })
        .sort(function (a, b) {
          return (a.institution || '').localeCompare(b.institution || '');
        })
        .forEach(function (u) {
          var o = document.createElement('option');
          o.value = u.key;
          o.textContent = u.institution + '  (' + u.majority_non_resident
                        + ' of ' + u.departments + ' majority)';
          sel.appendChild(o);
        });
      // Open on a university whose spread makes the point immediately.
      var start = d.purdue ? 'purdue' : sel.options[0] && sel.options[0].value;
      if (start) { sel.value = start; drawUniversity(start); }
      sel.addEventListener('change', function () { drawUniversity(sel.value); });
    })
    .catch(function () {
      fail('uni-list', 'Could not load university distributions. See /data/university_distribution.json');
    });
})();
