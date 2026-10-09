/* The schools page: renders from site/data/visa_schools.json and
 * site/data/visa_substitution.json. Nothing here hard-codes a figure --
 * every number on the page comes from the builders, so a rebuild moves the
 * page and a stale number cannot survive one.
 */
(function () {
  'use strict';

  var SCHOOLS = '/data/visa_schools.json';
  var VISAS = '/data/visa_substitution.json';
  var charts = {};
  var state = { rows: [], sort: 'share', dir: -1, q: '', sector: '' };
  var visaData = null;

  function $(id) { return document.getElementById(id); }
  function tok(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '#888'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(v) { return typeof v === 'number' ? v.toLocaleString('en-US') : '—'; }
  function money(v) {
    if (typeof v !== 'number' || !v) return '—';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'bn';
    if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
    return '$' + v;
  }

  /* ---------------------------------------------------------------- stats */
  function renderStats(d) {
    var y = String(d.latest_fall), first = String(Math.min.apply(null, Object.keys(d.summary).map(Number)));
    var now = d.summary[y].at_or_above, then = d.summary[first].at_or_above;
    var t = d.totals;
    var aid = t.pell_dollars + t.federal_loan_dollars;
    var cards = [
      { n: n(now['50'].schools), l: 'schools where foreign students are most of the graduate enrolment',
        s: 'up from ' + then['50'].schools + ' in fall ' + first + ' · fall ' + y },
      { n: n(now['90'].nonresident_grad_students), l: 'foreign graduate students at the ' +
          now['90'].schools + ' schools that are 90% foreign or more',
        s: 'up from ' + n(then['90'].nonresident_grad_students) + ' in ' + first },
      { n: money(aid), l: 'in federal student aid to these schools in 2022&ndash;23',
        s: money(t.pell_dollars) + ' Pell · ' + money(t.federal_loan_dollars) + ' federal loans · ' +
           now['50'].take_federal_student_aid + ' of ' + now['50'].schools + ' take part' },
      { n: money(t.recruiting_firm_dollars), l: 'reported paid to recruiting firms',
        s: t.schools_reporting_recruitment + ' of the ' + t.recruitment_filers_checked +
           ' nonprofits that file a Form 990, last four returns' }
    ];
    $('stats').innerHTML = cards.map(function (c) {
      return '<div class="stat"><div class="n">' + c.n + '</div><p class="l">' + c.l +
             '</p><p class="s">' + c.s + '</p></div>';
    }).join('');
  }

  /* ------------------------------------------------------------ one school */
  function renderCase(d) {
    var trine = d.schools.filter(function (s) { return s.unitid === '414878'; })[0];
    if (!trine) { $('case-enrol').textContent = 'Not in this year’s file.'; return; }
    var years = Object.keys(trine.trend).sort();
    var max = Math.max.apply(null, years.map(function (y) {
      return trine.trend[y] ? trine.trend[y].grad : 0; }));
    $('case-enrol').innerHTML = years.map(function (y) {
      var t = trine.trend[y];
      if (!t) return '';
      var f = 100 * t.grad_nra / max, dm = 100 * (t.grad - t.grad_nra) / max;
      return '<div class="enrol-row"><span class="enrol-yr">' + y + '</span>' +
        '<span class="enrol-track"><span class="f" style="width:' + f + '%"></span>' +
        '<span class="d" style="width:' + dm + '%"></span></span>' +
        '<span class="enrol-n">' + n(t.grad) + ' <span class="muted">(' +
        (100 * t.grad_nra / t.grad).toFixed(1) + '%)</span></span></div>';
    }).join('');

    var r = trine.recruitment_990;
    if (!r || !r.years.length) { $('case-990').textContent = 'No recruitment entries on the filed returns.'; return; }
    var rows = r.years.map(function (yr) {
      var names = yr.firms.map(function (f) { return esc(f.name); }).join(', ') || '—';
      return '<tr><td>' + esc((yr.tax_period_end || '').slice(0, 4)) + '</td><td>' + names +
             '</td><td class="num">' + money(yr.firms_total) + '</td></tr>';
    }).join('');
    $('case-990').innerHTML =
      '<table class="mini"><thead><tr><th>Year ending</th><th>Firms, as filed</th>' +
      '<th class="num">Paid</th></tr></thead><tbody>' + rows + '</tbody>' +
      '<tfoot><tr><td colspan="2">Four returns</td><td class="num">' + money(r.firms_total) +
      '</td></tr></tfoot></table>' +
      (r.filer_is_parent ? '<p class="note">The return covers ' + esc(r.filer_name) +
        ' as a whole, not the regional record alone.</p>' : '');
  }

  /* -------------------------------------------------------------- the table */
  function aidOf(s) {
    var a = s.federal_aid_2022_23;
    return a ? a.pell_dollars + a.federal_loan_dollars : 0;
  }
  function recruitOf(s) {
    var h = (s.recruitment_990 || {}).headline;
    return h ? h.amount : 0;
  }
  function growthOf(s) {
    var ys = Object.keys(s.trend).sort(), a = s.trend[ys[0]], b = s.trend[ys[ys.length - 1]];
    return a && b && a.grad ? (b.grad - a.grad) / a.grad : null;
  }
  function renderTable() {
    var rows = state.rows.filter(function (s) {
      if (state.sector && s.control !== state.sector) return false;
      if (!state.q) return true;
      var hay = (s.name + ' ' + s.city + ' ' + s.state).toLowerCase();
      return hay.indexOf(state.q) >= 0;
    });
    var key = state.sort, dir = state.dir;
    rows.sort(function (a, b) {
      var va, vb;
      if (key === 'name') { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); }
      else if (key === 'control') { va = a.control; vb = b.control; }
      else if (key === 'grad') { va = a.grad; vb = b.grad; }
      else if (key === 'growth') { va = growthOf(a); vb = growthOf(b); }
      else if (key === 'aid') { va = aidOf(a); vb = aidOf(b); }
      else if (key === 'recruit') { va = recruitOf(a); vb = recruitOf(b); }
      else { va = a.grad_nra_share_pct; vb = b.grad_nra_share_pct; }
      // Missing values sort last whichever way the column runs: a blank is
      // "not reported", not a zero, and should never head the table.
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
    $('count').textContent = rows.length + ' of ' + state.rows.length + ' schools';
    document.querySelectorAll('#schools-table th[data-k]').forEach(function (th) {
      if (th.dataset.k === key) th.setAttribute('aria-sort', dir > 0 ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
    $('schools-table').querySelector('tbody').innerHTML = rows.map(function (s) {
      var g = growthOf(s), a = s.federal_aid_2022_23, h = (s.recruitment_990 || {}).headline;
      var ys = Object.keys(s.trend).sort();
      var first = s.trend[ys[0]];
      var recruit = '—', sub = '';
      if (h) {
        recruit = money(h.amount);
        sub = h.basis === 'firms' ? 'recruiting firms'
            : '&ldquo;' + esc((h.label || '').toLowerCase()) + '&rdquo;';
        if (s.recruitment_990.filer_is_parent) sub += ' · whole university';
      } else if (s.control !== 'private nonprofit') {
        sub = 'files no 990';
      }
      return '<tr><td><a href="' + (s.web && /^https?:/.test(s.web) ? esc(s.web) : '#') + '"' +
          (s.web && /^https?:/.test(s.web) ? ' target="_blank" rel="noopener noreferrer"' : '') + '>' +
          esc(s.name) + '</a><div class="where">' + esc(s.city) + ', ' + esc(s.state) + '</div></td>' +
        '<td>' + esc(s.control) + (s.title_iv ? '' : '<div class="where">no federal aid</div>') + '</td>' +
        '<td class="num">' + n(s.grad) + '<div class="where">' + n(s.grad_nra) + ' foreign</div></td>' +
        '<td class="num">' + (g == null ? '—' : (g >= 0 ? '+' : '') + Math.round(g * 100) + '%') +
          '<div class="where">' + (first ? 'from ' + n(first.grad) : '') + '</div></td>' +
        '<td class="num share">' + s.grad_nra_share_pct.toFixed(1) + '%</td>' +
        '<td class="num">' + (a ? money(a.pell_dollars + a.federal_loan_dollars) : '—') +
          '<div class="where">' + (a ? money(a.pell_dollars) + ' Pell' : '') + '</div></td>' +
        '<td class="num">' + recruit + '<div class="where">' + sub + '</div></td></tr>';
    }).join('') || '<tr><td colspan="7" class="loading">No school matches that search.</td></tr>';
  }

  /* ------------------------------------------------------------- the charts */
  var SERIES = [
    { key: 'H1B', from: 'issuance', label: 'H-1B visas', short: 'H-1B', c: '--s2' },
    { key: 'O1', from: 'issuance', label: 'O-1 visas', short: 'O-1', c: '--s6' },
    { key: 'F1', from: 'issuance', label: 'F-1 student visas', short: 'F-1', c: '--s1' },
    { key: 'opt', from: 'student_work', label: 'OPT', short: 'OPT', c: '--s3' },
    { key: 'stem_opt', from: 'student_work', label: 'STEM OPT', short: 'STEM OPT', c: '--s5' },
    { key: 'cpt', from: 'student_work', label: 'CPT', short: 'CPT', c: '--s4' }
  ];
  var BASE = '2015';

  function markerPlugin(events, years) {
    return {
      id: 'markers',
      afterDatasetsDraw: function (chart) {
        var x = chart.scales.x, area = chart.chartArea, ctx = chart.ctx;
        ctx.save();
        events.forEach(function (e, i) {
          var idx = years.indexOf(String(e.fiscal_year));
          if (idx < 0) return;
          var px = x.getPixelForValue(idx);
          ctx.strokeStyle = tok('--text-muted');
          ctx.globalAlpha = 0.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(px, area.top); ctx.lineTo(px, area.bottom); ctx.stroke();
          ctx.globalAlpha = 1; ctx.setLineDash([]);
          ctx.fillStyle = tok('--surface'); ctx.strokeStyle = tok('--text-muted');
          ctx.beginPath(); ctx.arc(px, area.top + 8, 8, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
          ctx.fillStyle = tok('--text');
          ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(i + 1), px, area.top + 8);
        });
        ctx.restore();
      }
    };
  }

  // Three light-mode hues sit under 3:1 against white, so each line is named
  // at its right-hand end as well as in the legend.
  var endLabels = {
    id: 'endLabels',
    afterDatasetsDraw: function (chart) {
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      chart.data.datasets.forEach(function (ds, i) {
        var meta = chart.getDatasetMeta(i);
        if (meta.hidden) return;
        var pts = meta.data.filter(function (p, j) { return ds.data[j] != null; });
        var last = pts[pts.length - 1];
        if (!last) return;
        ctx.fillStyle = ds.borderColor;
        ctx.fillText(ds.short || ds.label, last.x + 6, last.y);
      });
      ctx.restore();
    }
  };

  function drawCharts() {
    if (!visaData || typeof Chart === 'undefined') return;
    var years = visaData.years.map(String);
    var ink = tok('--text-muted'), grid = tok('--grid');
    // Eight turning points get a numbered marker; the other 27 verified
    // actions are listed under the chart rather than crowding it.
    var events = (visaData.events || []).filter(function (e) { return e.chart_marker; });
    var later = (visaData.events || []).filter(function (e) { return !e.charted; });
    var all = visaData.events || [];

    var datasets = SERIES.map(function (s) {
      var raw = visaData[s.from][s.key] || {};
      var base = raw[BASE];
      return {
        label: s.label + (s.from === 'student_work' ? ' (calendar yr)' : ''),
        data: years.map(function (y) {
          return base && raw[y] != null ? Math.round(1000 * raw[y] / base) / 10 : null; }),
        short: s.short,
        borderColor: tok(s.c), backgroundColor: tok(s.c),
        borderWidth: 2, pointRadius: 0, pointHitRadius: 12, tension: 0.25, spanGaps: false,
        raw: raw
      };
    });
    if (charts.index) charts.index.destroy();
    charts.index = new Chart($('chart-index').getContext('2d'), {
      type: 'line',
      data: { labels: years, datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 74, top: 6 } },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { position: 'bottom', labels: { color: ink, boxWidth: 10, boxHeight: 10,
            usePointStyle: true, pointStyle: 'line', font: { size: 11 } } },
          tooltip: { callbacks: { label: function (c) {
            var raw = c.dataset.raw[c.label];
            return c.dataset.label + ': ' + (raw == null ? '—' : raw.toLocaleString('en-US')) +
                   ' (' + c.formattedValue + ' vs ' + BASE + ')'; } } }
        },
        scales: {
          x: { ticks: { color: ink, maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
          y: { ticks: { color: ink, callback: function (v) { return v; } }, grid: { color: grid },
               title: { display: true, text: BASE + ' = 100', color: ink, font: { size: 11 } } }
        }
      },
      plugins: [endLabels, markerPlugin(events, years)]
    });

    var dr = visaData.h1b_initial_denial_rate_pct || {};
    if (charts.denial) charts.denial.destroy();
    charts.denial = new Chart($('chart-denial').getContext('2d'), {
      type: 'bar',
      data: { labels: years, datasets: [{
        label: 'H-1B initial denial rate',
        data: years.map(function (y) { return dr[y] == null ? null : dr[y]; }),
        backgroundColor: tok('--s2'), borderRadius: { topLeft: 3, topRight: 3 },
        borderSkipped: 'bottom', maxBarThickness: 26 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        layout: { padding: { right: 96 } },
        plugins: { legend: { display: false },
          tooltip: { callbacks: { label: function (c) {
            return 'Initial denial rate ' + c.formattedValue + '% (fiscal ' + c.label + ')'; } } },
          title: { display: true, align: 'start', color: ink, font: { size: 11, weight: '600' },
                   text: 'H-1B initial petition denial rate, % (USCIS, fiscal year)' } },
        scales: {
          x: { ticks: { color: ink, maxRotation: 0, autoSkipPadding: 12 }, grid: { display: false } },
          y: { beginAtZero: true, ticks: { color: ink, callback: function (v) { return v + '%'; } },
               grid: { color: grid } }
        }
      },
      plugins: [markerPlugin(events, years)]
    });

    function item(e) {
      return '<li><strong>' + esc(e.date) + '</strong> — ' + esc(e.title) +
        ' <span class="tag">' + esc(e.direction) + '</span><br>' + esc(e.summary) +
        (e.source_url ? ' <a href="' + esc(e.source_url) + '" target="_blank" rel="noopener noreferrer">' +
          esc(e.instrument || 'source') + '</a>' : '') + '</li>';
    }
    $('events').innerHTML = events.map(item).join('') ||
      '<li class="loading">Policy events are still being verified against their primary sources.</li>';
    $('later').innerHTML = later.length
      ? '<h3>Since the data ends</h3><p class="lede">' + later.length + ' further federal actions, ' +
        'after the last year these series cover.</p><ol class="events">' +
        later.map(item).join('') + '</ol>'
      : '';
    $('all-events').innerHTML = '<ol class="events">' + all.map(item).join('') + '</ol>';

    var w = visaData.windows;
    $('windows').innerHTML = [
      { h: 'H-1B adjudication hardens, FY2015&ndash;2019',
        p: 'Initial denial rates went from <strong>' + w.h1b_tightening_fy2015_2019.h1b_initial_denial_rate_pct['2015'] +
           '%</strong> to <strong>' + w.h1b_tightening_fy2015_2019.h1b_initial_denial_rate_pct['2018'] +
           '%</strong>. F-1 issuance fell ' + Math.abs(w.h1b_tightening_fy2015_2019.f1_issuance_change_pct) +
           '%, while STEM OPT rose <strong>' + w.h1b_tightening_fy2015_2019.stem_opt_change_pct +
           '%</strong> and CPT reached ' + n(w.h1b_tightening_fy2015_2019.cpt_2018) + ' in 2018.' },
      { h: 'The pandemic, FY2019&ndash;2021 &mdash; an event, not a trend',
        p: 'H-1B issuance fell <strong>' + Math.abs(w.entry_suspension_fy2019_2021.h1b_issuance_change_pct) +
           '%</strong> and L-1 ' + Math.abs(w.entry_suspension_fy2019_2021.l1_issuance_change_pct) +
           '%. OPT plus STEM OPT, which need no visa, fell only ' +
           Math.abs(w.entry_suspension_fy2019_2021.opt_plus_stem_opt_change_pct) + '% — ' +
           n(w.entry_suspension_fy2019_2021.opt_plus_stem_opt_2021) + ' authorisations in 2021. Consulates were shut for much of that period, which is why issuance fell so far. This window is recorded because it happened, not as evidence of anything: one closed year carries no trend. The long comparison above is the one to read. These are also authorisations rather than people, and the two series overlap by design.' },
      { h: 'FY2023&ndash;2024',
        p: 'H-1B issuance fell <strong>' + Math.abs(w.fy2023_2024.h1b_issuance_change_pct) +
           '%</strong>. In the same year STEM OPT rose <strong>' + w.fy2023_2024.stem_opt_change_pct +
           '%</strong>, OPT rose ' + w.fy2023_2024.opt_change_pct + '%, and O-1 issuance hit ' +
           n(w.fy2023_2024.o1_2024) + (w.fy2023_2024.o1_record ? ', the highest in this series, which starts in 2007' : '') + '.' }
    ].map(function (c) { return '<div class="window"><h3>' + c.h + '</h3><p>' + c.p + '</p></div>'; }).join('');

    var head = '<thead><tr><th>Year</th>' + SERIES.map(function (s) {
      return '<th class="num">' + esc(s.label) + '</th>'; }).join('') +
      '<th class="num">H-1B denial %</th></tr></thead>';
    $('figures').innerHTML = head + '<tbody>' + years.map(function (y) {
      return '<tr><td>' + y + '</td>' + SERIES.map(function (s) {
        var v = (visaData[s.from][s.key] || {})[y];
        return '<td class="num">' + (v == null ? '—' : n(v)) + '</td>'; }).join('') +
        '<td class="num">' + (dr[y] == null ? '—' : dr[y] + '%') + '</td></tr>';
    }).join('') + '</tbody>';

    // The levels comparison: no lag to argue about and nothing inferred.
    var rs = visaData.route_scale || {};
    if (rs.years && rs.years.length && $('route-scale')) {
      var show = rs.years.filter(function (r) {
        return ['2007', '2014', '2017', '2019', '2021', '2024'].indexOf(r.year) >= 0;
      });
      $('route-scale').innerHTML =
        '<thead><tr><th>Fiscal year</th>' +
        '<th class="num">Students holding OPT</th>' +
        '<th class="num">H-1B visas issued</th>' +
        '<th class="num">Student route as a multiple</th></tr></thead><tbody>' +
        show.map(function (r) {
          var big = r.ratio > 1;
          return '<tr><td>' + esc(r.year) + '</td>' +
            '<td class="num">' + n(r.student_work) + '</td>' +
            '<td class="num">' + n(r.h1b_issued) + '</td>' +
            '<td class="num"' + (big ? ' style="font-weight:700;color:var(--hl)"' : '') +
            '>' + r.ratio.toFixed(2) + '\u00d7</td></tr>';
        }).join('') + '</tbody>';
      var sr = visaData.stem_opt_rule || {};
      $('route-scale-note').innerHTML =
        'In ' + esc(rs.first.year) + ' the student route was ' +
        rs.first.ratio.toFixed(2) + ' times the size of the H-1B inflow. In ' +
        esc(rs.latest.year) + ' it was <strong>' + rs.latest.ratio.toFixed(2) +
        '</strong> times, having been larger in ' + rs.years_student_route_larger +
        ' of ' + rs.years_counted + ' years. ' + esc(rs.note) +
        (sr.change_pct_2015_2019 ? ' The STEM extension grew <strong>' +
          sr.change_pct_2015_2019 + '%</strong> between 2015 and 2019.<sup>*</sup> ' +
          '<span class="muted">* ' + esc(sr.note) + '</span>' : '');
    }

    var oc = visaData.opt_cost || {};
    if (oc.employer_share_pct) {
      $('opt-cost-lede').innerHTML =
        'Three things make an OPT graduate cheaper and less mobile than the American ' +
        'Federal law writes the first two. ' + esc(oc.rule);
      var empl = Math.round(1000 * oc.employer_share_pct);       // 7.65% of $100,000
      var both = Math.round(1000 * oc.total_payroll_tax_pct);    // 15.3% of $100,000
      $('opt-cost').innerHTML = [
        { h: 'Payroll tax: ' + oc.total_payroll_tax_pct + '% that is never paid',
          p: 'The wages are not &ldquo;employment&rdquo;. Neither side pays. The employer ' +
            'skips <strong>' + oc.employer_share_pct + '%</strong> and the worker skips ' +
            'another <strong>' + oc.employer_share_pct + '%</strong>. On a $100,000 salary ' +
            'the employer never pays <strong>$' + empl.toLocaleString('en-US') + '</strong>. ' +
            'The graduate takes home $' + empl.toLocaleString('en-US') + ' more than an ' +
            'American on the same figure. The same take-home therefore costs less to buy, ' +
            'and <strong>$' + both.toLocaleString('en-US') + '</strong> leaves the job.' },
        { h: 'The job is the visa', p: '<em>&ldquo;' + esc(oc.dependency_quote) + '&rdquo;</em> ' +
            esc(oc.dependency_rule) + ' An American graduate who quits looks for another job. ' +
            'A graduate on OPT has 90 days before losing the right to stay.' },
        { h: 'No petition, cap or lottery', p: 'OPT is work authorisation on a visa the ' +
            'graduate already holds. The student files the application. The employer files ' +
            'nothing with USCIS, enters no lottery and pays no petition fee. ' +
            esc(oc.stem_opt_pay_rule) }
      ].map(function (c) { return '<div class="window"><h3>' + c.h + '</h3><p>' + c.p + '</p></div>'; }).join('');
      $('opt-cost-note').innerHTML = 'Sources: <a href="' + esc(oc.statute_url) +
        '" target="_blank" rel="noopener noreferrer">' + esc(oc.statute) + '</a>, ' +
        '<a href="' + esc(oc.irs_url) + '" target="_blank" rel="noopener noreferrer">IRS guidance ' +
        'on foreign student liability for Social Security and Medicare taxes</a>, and ' +
        '<a href="' + esc(oc.stem_opt_rule_url) + '" target="_blank" rel="noopener noreferrer">' +
        '8 CFR 214.2(f)(10)</a>, including ' + esc(oc.dependency_cite) + '. The tax exclusion ' +
        'applies while the graduate is a nonresident alien for tax purposes; it ends if they ' +
        'become a resident alien or change status.';
    }

    var tn = visaData.tn || {};
    if (tn.issuance_year) {
      var byNat = Object.keys(tn.issued_by_nationality || {}).slice(0, 2).map(function (c) {
        return esc(c) + ' ' + n(tn.issued_by_nationality[c]); }).join(', ');
      var admYears = Object.keys(tn.admissions || {}).sort();
      var lastAdm = admYears[admYears.length - 1];
      $('tn-lede').textContent = 'TN rose while H-1B collapsed, which looks like the same ' +
        'substitution — but it is a different path, open only to Canadians and Mexicans, and ' +
        'the visa series barely sees it. That is why TN is kept out of the chart above.';
      $('tn-cards').innerHTML = [
        { h: 'The visas go almost entirely to Mexicans', p: 'TN visas issued in FY' +
            esc(tn.issuance_year) + ': <strong>' + byNat + '</strong>. ' +
            esc(tn.why_the_visa_series_misses_it) },
        { h: 'The real traffic is in admissions', p: lastAdm ? '<strong>' +
            n(tn.admissions[lastAdm]) + '</strong> TN admissions in ' + esc(lastAdm) +
            ', against about ' + n(tn.issued_by_nationality.Mexico || 0) + ' visas issued. ' +
            'Admissions count entries, not people: a commuter crossing weekly is counted ' +
            'every time.' : 'No admissions series available.' },
        { h: 'What the data cannot tell you', p: esc(tn.what_the_data_cannot_say) }
      ].map(function (c) { return '<div class="window"><h3>' + c.h + '</h3><p>' + c.p + '</p></div>'; }).join('');
      $('tn-note').textContent = 'Sources: State Department Nonimmigrant Visa Detail Tables ' +
        '(issuances, by nationality) and the DHS Yearbook of Immigration Statistics ' +
        '(admissions by class). Country of birth is not published for either series.';
    }

    $('caveats').innerHTML = (visaData.caveats || []).map(function (c) {
      return '<li>' + esc(c) + '</li>'; }).join('');
  }

  /* ---------------------------------------------------------------- wiring */
  fetch(SCHOOLS, { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (d) {
    state.rows = d.schools;
    renderStats(d);
    renderCase(d);
    renderTable();
  }).catch(function () {
    $('stats').innerHTML = '<p class="loading">The school figures could not be loaded.</p>';
  });

  fetch(VISAS, { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (d) {
    visaData = d;
    drawCharts();
  }).catch(function () {
    $('windows').innerHTML = '<p class="loading">The visa series could not be loaded.</p>';
  });

  $('q').addEventListener('input', function (e) { state.q = e.target.value.toLowerCase().trim(); renderTable(); });
  $('sector').addEventListener('change', function (e) { state.sector = e.target.value; renderTable(); });
  document.querySelectorAll('#schools-table th[data-k]').forEach(function (th) {
    th.querySelector('button').addEventListener('click', function () {
      var k = th.dataset.k;
      if (state.sort === k) state.dir = -state.dir;
      else { state.sort = k; state.dir = (k === 'name' || k === 'control') ? 1 : -1; }
      renderTable();
    });
  });

  // Charts bake their colours in at construction, so rebuild on a theme flip.
  new MutationObserver(drawCharts).observe(document.documentElement,
    { attributes: true, attributeFilter: ['data-theme'] });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(drawCharts);
  }
})();
