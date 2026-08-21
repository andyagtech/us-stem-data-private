/* The master's expansion: volume, visas and tuition.
 *
 * One generic line renderer serves every panel here. Two rules it enforces,
 * both of which matter for the argument the page is making:
 *
 *   - never two y-scales on one chart. Where two series differ by orders of
 *     magnitude (tuition billed against total tuition revenue) they are
 *     indexed to a common base instead, and the axis says so.
 *   - a gap in the source is drawn as a gap. No series is interpolated across
 *     a year the federal collection did not publish.
 */
(function () {
  'use strict';

  var NS = 'http://www.w3.org/2000/svg';
  var C = { total: '#94a3b8', dom: '#38bdf8', nra: '#f0a5ae',
            alt: '#c4b5fd', warm: '#fcd34d' };

  function sv(n, a) {
    var e = document.createElementNS(NS, n);
    Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, String(a[k])); });
    return e;
  }
  function el(t, c, x) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (x !== undefined) n.textContent = x;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function fail(id, msg) {
    var h = document.getElementById(id);
    if (h) { clear(h); h.appendChild(el('p', 'note', msg)); }
  }
  function money(v) {
    if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
    if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(0) + 'M';
    return '$' + Math.round(v).toLocaleString();
  }

  /* rows: [{x: Number, <key>: Number, ...}]
   * series: [{key, color, label}]
   * opts: {fmt, axisFmt, host, legend, stats, suffix} */
  function lineChart(opts) {
    var host = document.getElementById(opts.host);
    if (!host) return;
    var legend = document.getElementById(opts.legend);
    var stats = document.getElementById(opts.stats);
    clear(host); clear(legend); clear(stats);

    var rows = opts.rows, series = opts.series;
    if (!rows.length) { fail(opts.host, 'No data.'); return; }
    var fmt = opts.fmt || function (v) { return Number(v).toLocaleString(); };
    var axisFmt = opts.axisFmt || function (v) {
      return v >= 1000 ? (v / 1000) + 'k' : String(Math.round(v));
    };

    var W = host.clientWidth || 800, H = opts.height || 300;
    var m = { t: 16, r: opts.rightPad || 74, b: 30, l: opts.leftPad || 60 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var svg = sv('svg', { class: 'line-chart', viewBox: '0 0 ' + W + ' ' + H,
                          preserveAspectRatio: 'none' });

    var peak = 0, floor = opts.zero === false ? Infinity : 0;
    rows.forEach(function (r) {
      series.forEach(function (s) {
        var v = r[s.key];
        if (typeof v !== 'number') return;
        if (v > peak) peak = v;
        if (v < floor) floor = v;
      });
    });
    if (floor === Infinity) floor = 0;
    var span = peak - floor || 1;
    // 1/2/5-style step so the gridline labels land on round numbers.
    var mag = Math.pow(10, Math.floor(Math.log(span / 4) / Math.LN10)), step = mag * 10;
    [1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].some(function (f) {
      if (mag * f >= span / 4) { step = mag * f; return true; }
      return false;
    });
    var lo = Math.floor(floor / step) * step, hi = lo + step * 4;
    while (hi < peak) hi += step;

    var xs = rows.map(function (r) { return r.x; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    function X(v) { return m.l + ((v - x0) / (x1 - x0 || 1)) * iw; }
    function Y(v) { return m.t + ih - ((v - lo) / (hi - lo)) * ih; }

    for (var g = 0; g <= 4; g++) {
      var val = lo + ((hi - lo) / 4) * g, gy = Y(val);
      svg.appendChild(sv('line', { class: 'grid', x1: m.l, x2: m.l + iw, y1: gy, y2: gy }));
      var lab = sv('text', { x: m.l - 8, y: gy + 4, 'text-anchor': 'end' });
      lab.textContent = axisFmt(val);
      svg.appendChild(lab);
    }
    var tickEvery = opts.tickEvery || 5;
    rows.forEach(function (r, i) {
      if (r.x % tickEvery && i !== rows.length - 1 && i !== 0) return;
      var t = sv('text', { x: X(r.x), y: H - 9, 'text-anchor': 'middle' });
      t.textContent = String(r.x);
      svg.appendChild(t);
    });

    series.forEach(function (s) {
      var d = '', bridges = [], lastPt = null;
      rows.forEach(function (r, i) {
        var v = r[s.key];
        if (typeof v !== 'number') return;
        var prev = lastPt;
        var gap = prev && r.x !== prev.x + 1;
        if (gap) {
          bridges.push('M' + X(prev.x).toFixed(1) + ' ' + Y(prev.v).toFixed(1) +
                       'L' + X(r.x).toFixed(1) + ' ' + Y(v).toFixed(1));
        }
        d += (prev && !gap ? 'L' : 'M') + X(r.x).toFixed(1) + ' ' + Y(v).toFixed(1);
        lastPt = { x: r.x, v: v };
      });
      if (bridges.length) {
        svg.appendChild(sv('path', { class: 'ser', d: bridges.join(' '), stroke: s.color,
          'stroke-dasharray': '3 4', 'stroke-opacity': '0.45', 'stroke-width': '1.6' }));
      }
      var p = sv('path', { class: 'ser', d: d, stroke: s.color });
      svg.appendChild(p);
      try {
        var len = p.getTotalLength();
        if (len && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
          p.style.transition = 'stroke-dashoffset .7s ease-out';
          requestAnimationFrame(function () { p.style.strokeDashoffset = '0'; });
        }
      } catch (e) { /* the chart is correct without the reveal */ }
      if (lastPt) {
        svg.appendChild(sv('circle', { class: 'dot', cx: X(lastPt.x), cy: Y(lastPt.v),
          r: 4, fill: s.color }));
        var t2 = sv('text', { x: X(lastPt.x) + 8, y: Y(lastPt.v) + 4, fill: s.color });
        t2.textContent = fmt(lastPt.v);
        svg.appendChild(t2);
      }
      if (legend) {
        var li = el('span'), sw = el('i');
        sw.style.background = s.color;
        li.appendChild(sw);
        li.appendChild(document.createTextNode(s.label));
        legend.appendChild(li);
      }
    });

    // hover: crosshair plus a readout of every series at the nearest year
    var hover = sv('g', { style: 'pointer-events:none;opacity:0' });
    var vline = sv('line', { class: 'grid', y1: m.t, y2: m.t + ih,
                             stroke: 'rgba(148,163,184,.5)' });
    hover.appendChild(vline);
    svg.appendChild(hover);
    var tip = el('div', 'chart-tip');
    tip.style.opacity = '0';
    host.style.position = 'relative';
    svg.addEventListener('mousemove', function (ev) {
      var box = svg.getBoundingClientRect();
      var px = (ev.clientX - box.left) / box.width * W;
      var best = null, bd = Infinity;
      rows.forEach(function (r) {
        var d = Math.abs(X(r.x) - px);
        if (d < bd) { bd = d; best = r; }
      });
      if (!best) return;
      vline.setAttribute('x1', X(best.x)); vline.setAttribute('x2', X(best.x));
      hover.style.opacity = '1';
      var html = '<b>' + best.x + '</b>';
      series.forEach(function (s) {
        if (typeof best[s.key] !== 'number') return;
        html += '<span><i style="background:' + s.color + '"></i>' +
                s.label + ' <b>' + fmt(best[s.key]) + '</b></span>';
      });
      tip.innerHTML = html;
      tip.style.opacity = '1';
      var left = X(best.x) / W * box.width;
      tip.style.left = Math.min(Math.max(left, 8), box.width - 8) + 'px';
    });
    svg.addEventListener('mouseleave', function () {
      hover.style.opacity = '0'; tip.style.opacity = '0';
    });

    host.appendChild(svg);
    host.appendChild(tip);

    if (stats && opts.stats_) {
      opts.stats_.forEach(function (p) {
        var sp = el('span');
        sp.appendChild(document.createTextNode(p[0] + ' '));
        sp.appendChild(el('b', null, p[1]));
        stats.appendChild(sp);
      });
    }
  }

  function pctChange(a, b) {
    return (b > a ? '+' : '') + Math.round(100 * (b - a) / a) + '%';
  }

  /* ---------------------------------------------- 1 + 2. the expansion */
  fetch('/data/live_bundle.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var deg = d.degrees || {};
      function roll(level) {
        var by = {};
        Object.keys(deg[level] || {}).forEach(function (cip) {
          Object.keys(deg[level][cip]).forEach(function (y) {
            var p = deg[level][cip][y];
            if (!by[y]) by[y] = [0, 0];
            by[y][0] += p[0]; by[y][1] += p[1];
          });
        });
        return by;
      }
      var ma = roll('masters'), dr = roll('doctorate');
      var years = Object.keys(ma).map(Number).sort(function (a, b) { return a - b; });

      lineChart({
        host: 'vol-chart', legend: 'vol-legend', stats: 'vol-stats',
        rows: years.map(function (y) {
          var p = ma[String(y)];
          return { x: y, total: p[0], nra: p[1], dom: p[0] - p[1] };
        }),
        series: [{ key: 'total', color: C.total, label: "All core-STEM master's" },
                 { key: 'dom', color: C.dom, label: 'Domestic' },
                 { key: 'nra', color: C.nra, label: 'Non-resident' }],
        stats_: (function () {
          var a = ma[String(years[0])], b = ma[String(years[years.length - 1])];
          return [['Non-resident', a[1].toLocaleString() + ' → ' + b[1].toLocaleString() +
                   '  (' + pctChange(a[1], b[1]) + ')'],
                  ['Domestic', (a[0] - a[1]).toLocaleString() + ' → ' +
                   (b[0] - b[1]).toLocaleString() + '  (' + pctChange(a[0] - a[1], b[0] - b[1]) + ')']];
        })()
      });

      lineChart({
        host: 'share-chart', legend: 'share-legend', stats: 'share-stats',
        zero: false,
        rows: years.map(function (y) {
          var p = ma[String(y)], q = dr[String(y)];
          var o = { x: y, ma: 100 * p[1] / p[0] };
          if (q && q[0]) o.dr = 100 * q[1] / q[0];
          return o;
        }),
        series: [{ key: 'ma', color: C.nra, label: "Master's" },
                 { key: 'dr', color: C.alt, label: 'Doctorate' }],
        fmt: function (v) { return v.toFixed(1) + '%'; },
        axisFmt: function (v) { return v.toFixed(0) + '%'; }
      });
    })
    .catch(function () { fail('vol-chart', 'Could not load /data/live_bundle.json'); });

  /* ------------------------------------------------------------ 3. visas */
  fetch('/data/live_bundle.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var f1 = d.f1 || {};
      var years = Object.keys(f1).map(Number).sort(function (a, b) { return a - b; });
      lineChart({
        host: 'visa-chart', legend: 'visa-legend', stats: 'visa-stats',
        rows: years.map(function (y) {
          var v = f1[String(y)];
          return { x: y, total: v.total, china: v.china, india: v.india };
        }),
        series: [{ key: 'total', color: C.total, label: 'All F-1 visas issued' },
                 { key: 'china', color: C.nra, label: 'China' },
                 { key: 'india', color: C.warm, label: 'India' }],
        stats_: (function () {
          var a = f1[String(years[0])], b = f1[String(years[years.length - 1])];
          return [['India', a.india.toLocaleString() + ' → ' + b.india.toLocaleString() +
                   '  (' + pctChange(a.india, b.india) + ')'],
                  ['China', a.china.toLocaleString() + ' → ' + b.china.toLocaleString() +
                   '  (' + pctChange(a.china, b.china) + ')']];
        })()
      });
    })
    .catch(function () { fail('visa-chart', 'Could not load the F-1 series'); });

  /* ---------------------------------------------------------- 4 + 5. tuition */
  fetch('/data/tuition.json', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var s = d.series || {};
      var years = Object.keys(s).map(Number).sort(function (a, b) { return a - b; });

      // The twenty-year arc, all four published rates. Without the earlier
      // years the recent decline reads as "tuition fell", which is the wrong
      // conclusion: it fell off a peak it had climbed steeply to.
      var rt = d.rates || {};
      var ry = Object.keys(rt).map(Number).sort(function (a, b) { return a - b; });
      if (ry.length) {
        lineChart({
          host: 'arc-chart', legend: 'arc-legend', stats: 'arc-stats',
          zero: false, leftPad: 70, rightPad: 96, height: 330,
          rows: ry.map(function (y) {
            var v = rt[String(y)];
            return { x: y, ugi: v.ug_ins_real, ugo: v.ug_oos_real,
                     gri: v.grad_ins_real, gro: v.grad_oos_real };
          }),
          series: [{ key: 'gro', color: C.nra, label: 'Graduate, out-of-state' },
                   { key: 'ugo', color: C.warm, label: 'Undergraduate, out-of-state' },
                   { key: 'gri', color: C.alt, label: 'Graduate, in-state' },
                   { key: 'ugi', color: C.dom, label: 'Undergraduate, in-state' }],
          fmt: function (v) { return '$' + Math.round(v).toLocaleString(); },
          axisFmt: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
          stats_: (function () {
            var a = rt[String(ry[0])], b = rt[String(ry[ry.length - 1])];
            var pk = ry.reduce(function (m, y) {
              return rt[String(y)].ug_ins_real > rt[String(m)].ug_ins_real ? y : m; }, ry[0]);
            var p = rt[String(pk)];
            return [['Undergraduate in-state', '$' + a.ug_ins_real.toLocaleString() +
                     ' → peak $' + p.ug_ins_real.toLocaleString() + ' in ' + pk +
                     ' (' + pctChange(a.ug_ins_real, p.ug_ins_real) + ') → $' +
                     b.ug_ins_real.toLocaleString()]];
          })()
        });
      }

      lineChart({
        host: 'rate-chart', legend: 'rate-legend', stats: 'rate-stats',
        zero: false, leftPad: 68, rightPad: 86,
        rows: years.map(function (y) {
          return { x: y, real: s[String(y)].median_oos_rate_real,
                   nom: s[String(y)].median_oos_rate };
        }),
        series: [{ key: 'real', color: C.dom, label: 'In constant 2024 dollars' },
                 { key: 'nom', color: C.total, label: 'As billed at the time' }],
        fmt: function (v) { return '$' + Math.round(v).toLocaleString(); },
        axisFmt: function (v) { return '$' + Math.round(v / 1000) + 'k'; },
        stats_: (function () {
          var a = s[String(years[0])], b = s[String(years[years.length - 1])];
          return [['Real terms', '$' + a.median_oos_rate_real.toLocaleString() + ' → $' +
                   b.median_oos_rate_real.toLocaleString() + '  (' +
                   pctChange(a.median_oos_rate_real, b.median_oos_rate_real) + ')']];
        })()
      });

      lineChart({
        host: 'billed-chart', legend: 'billed-legend', stats: 'billed-stats',
        leftPad: 70, rightPad: 92,
        rows: years.map(function (y) {
          return { x: y, billed: s[String(y)].billed_nra_real };
        }),
        series: [{ key: 'billed', color: C.nra,
                   label: "Billed to non-resident core-STEM master's students" }],
        fmt: money,
        axisFmt: function (v) { return '$' + (v / 1e9).toFixed(1) + 'B'; },
        stats_: (function () {
          var h = d.headline;
          return [['Annual', money(h.billed_nra_real_first) + ' → ' +
                   money(h.billed_nra_real_last) + '  (' +
                   (h.growth_pct_real > 0 ? '+' : '') + h.growth_pct_real + '%)'],
                  ['Degrees', h.nra_degrees_first.toLocaleString() + ' → ' +
                   h.nra_degrees_last.toLocaleString() + '  (' +
                   (h.degree_growth_pct > 0 ? '+' : '') + h.degree_growth_pct + '%)']];
        })()
      });

      // Indexed, NOT dual-axis: $3B and $174B cannot share a scale honestly.
      var fin = years.filter(function (y) { return s[String(y)].net_tuition_all_levels_real; });
      if (fin.length) {
        var b0 = s[String(fin[0])].billed_nra_real,
            n0 = s[String(fin[0])].net_tuition_all_levels_real;
        lineChart({
          host: 'index-chart', legend: 'index-legend', stats: 'index-stats',
          zero: false, leftPad: 56,
          rows: fin.map(function (y) {
            return { x: y,
                     billed: 100 * s[String(y)].billed_nra_real / b0,
                     net: 100 * s[String(y)].net_tuition_all_levels_real / n0 };
          }),
          series: [{ key: 'billed', color: C.nra, label: "Billed to non-resident master's" },
                   { key: 'net', color: C.total, label: 'All net tuition revenue, every level' }],
          fmt: function (v) { return Math.round(v); },
          axisFmt: function (v) { return Math.round(v); },
          stats_: [['Base', fin[0] + ' = 100, both series, constant dollars']]
        });
      }
    })
    .catch(function () { fail('rate-chart', 'Could not load /data/tuition.json'); });
}());
