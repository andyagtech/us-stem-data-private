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
