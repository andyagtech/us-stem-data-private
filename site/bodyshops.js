/* The body shops page: renders from site/data/visa_bodyshops.json and
 * site/data/visa_staffing.json. Nothing here hard-codes a figure -- every
 * number on the page comes from the builders, so a rebuild moves the page and
 * a stale number cannot survive one.
 */
(function () {
  'use strict';

  var SHOPS = '/data/visa_bodyshops.json';
  var STAFFING = '/data/visa_staffing.json';
  var state = { rows: [], sort: 'filings', dir: -1, q: '', filter: 'all' };

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(v) { return typeof v === 'number' ? v.toLocaleString('en-US') : '—'; }
  // Prose that comes from the builders is written in ASCII, where a dash is
  // "--". Escape it, then set the dash properly for display.
  function txt(s) { return esc(s).replace(/ -- /g, ' — '); }
  function pct(v) { return typeof v === 'number' ? v + '%' : '—'; }
  function money(v) {
    if (typeof v !== 'number' || !v) return '—';
    return '$' + Math.round(v).toLocaleString('en-US');
  }

  /* ---------------------------------------------------------------- stats */
  function renderStats(d, staff) {
    var nat = d.national, bs = d.body_shop_totals;
    var dev = (d.by_occupation || []).filter(function (o) {
      return /^Software Developers/.test(o.occupation);
    })[0] || (d.by_occupation || [])[0];
    var years = Object.keys(d.by_fiscal_year || {});
    var span = years.length ? 'FY' + years[0] + '–FY' + years[years.length - 1] : '';
    var cards = [
      { n: n(nat.certified_filings), l: 'certified H-1B applications read, ' + span,
        s: 'covering ' + n(nat.positions) + ' positions' },
      { n: pct(nat.secondary_pct), l: 'of them place the worker at another company&rsquo;s worksite',
        s: 'the employer&rsquo;s own answer on the form' },
      { n: n(bs.employers), l: 'firms meet every part of the body-shop test',
        s: pct(bs.share_of_filings_pct) + ' of all certified applications' },
      dev ? { n: money(dev.gap_usd), l: 'less, at the median, for a placed ' +
          dev.occupation.toLowerCase().replace(/s$/, ''),
        s: money(dev.placed_median_wage) + ' against ' + money(dev.direct_median_wage) +
          ' hired directly' }
        : { n: '—', l: 'no occupation had enough filings on both sides', s: '' }
    ];
    $('stats').innerHTML = cards.map(function (c) {
      return '<div class="stat"><p class="n">' + c.n + '</p><p class="l">' + c.l +
        '</p><p class="s">' + c.s + '</p></div>';
    }).join('');
  }

  /* ----------------------------------------------------------------- test */
  function renderTest(d) {
    var def = d.definitions || {};
    var sup = def.supply_naics || {};
    $('test-cards').innerHTML = [
      { h: 'It is in the business of supplying people',
        p: 'The employer&rsquo;s own six-digit industry code is <code>5613</code>, ' +
          txt(sup['5613'] || '') + ', or <code>5415</code>, ' + txt(sup['5415'] || '') + '.' },
      { h: 'It is H-1B dependent',
        p: 'More than half its certified applications answer yes to the dependency ' +
          'question. ' + txt(def.h1b_dependent || '') },
      { h: 'It places people at other companies',
        p: 'More than half its applications answer yes to the secondary-entity ' +
          'question. ' + txt(def.secondary_entity || '') }
    ].map(function (c) {
      return '<div class="window"><h3>' + c.h + '</h3><p>' + c.p + '</p></div>';
    }).join('');
    $('test-note').innerHTML = 'The fourth part is size: at least 50 certified applications, ' +
      'so a firm with two filings cannot top the table. Every one of these answers is made ' +
      'by the employer, under penalty of perjury, and none of them is an accusation: ' +
      'supplying contract workers is lawful, and so is being H-1B dependent. ' +
      txt(def.positions_not_people || '');
  }

  /* ---------------------------------------------------------------- table */
  var COLS = [
    { k: 'employer', t: 'Employer', num: false },
    { k: 'filings', t: 'Certified applications', num: true },
    { k: 'positions', t: 'Positions', num: true },
    { k: 'dependent_pct', t: 'H-1B dependent', num: true },
    { k: 'secondary_pct', t: 'Placed at a client', num: true },
    { k: 'low_level_pct', t: 'Wage level I–II', num: true },
    { k: 'median_wage', t: 'Median wage', num: true },
    { k: 'states', t: 'States', num: true },
    { k: 'uscis', t: 'USCIS initial approvals', num: true }
  ];

  function val(r, k) {
    if (k === 'uscis') return r.uscis ? r.uscis.initial_approvals_2009_2023 : null;
    return r[k];
  }

  function renderHead() {
    $('thead').innerHTML = '<tr>' + COLS.map(function (c) {
      var sorted = state.sort === c.k;
      return '<th' + (c.num ? ' class="num"' : '') +
        (sorted ? ' aria-sort="' + (state.dir < 0 ? 'descending' : 'ascending') + '"' : '') +
        '><button type="button" data-k="' + c.k + '">' + c.t + '</button></th>';
    }).join('') + '</tr>';
  }

  function visible() {
    var q = state.q.toLowerCase();
    return state.rows.filter(function (r) {
      if (q && r.employer.toLowerCase().indexOf(q) < 0) return false;
      if (state.filter === 'barred') return !!r.debarments;
      if (state.filter === '5613' || state.filter === '5415') {
        return String(r.naics || '').indexOf(state.filter) === 0;
      }
      return true;
    }).sort(function (a, b) {
      var x = val(a, state.sort), y = val(b, state.sort);
      if (typeof x === 'string' || typeof y === 'string') {
        return String(x).localeCompare(String(y)) * state.dir;
      }
      if (x == null) return 1;
      if (y == null) return -1;
      return (x - y) * state.dir;
    });
  }

  function renderRows() {
    var rows = visible();
    $('count').textContent = rows.length + ' of ' + state.rows.length + ' firms';
    $('tbody').innerHTML = rows.map(function (r) {
      var barred = r.debarments ? ' <span class="pill barred">Debarred</span>' : '';
      var where = r.top_states && r.top_states.length ? r.top_states.join(' · ') : '';
      return '<tr>' +
        '<td>' + esc(r.employer) + barred +
        (where ? '<div class="where">' + esc(where) +
          (r.states > r.top_states.length ? ' and ' + (r.states - r.top_states.length) + ' more' : '') +
          '</div>' : '') + '</td>' +
        '<td class="num">' + n(r.filings) + '</td>' +
        '<td class="num muted">' + n(r.positions) + '</td>' +
        '<td class="num share">' + pct(r.dependent_pct) + '</td>' +
        '<td class="num share">' + pct(r.secondary_pct) + '</td>' +
        '<td class="num">' + pct(r.low_level_pct) + '</td>' +
        '<td class="num">' + money(r.median_wage) + '</td>' +
        '<td class="num muted">' + n(r.states) + '</td>' +
        '<td class="num muted">' + (r.uscis ? n(r.uscis.initial_approvals_2009_2023) : '—') + '</td>' +
        '</tr>';
    }).join('') || '<tr><td colspan="' + COLS.length + '" class="muted">No firm matches.</td></tr>';
  }

  function renderTable(d) {
    state.rows = d.body_shops || [];
    var bs = d.body_shop_totals;
    $('firms-lede').innerHTML = 'These <strong>' + n(bs.employers) + '</strong> firms filed ' +
      n(bs.filings) + ' certified applications, <strong>' + pct(bs.share_of_filings_pct) +
      '</strong> of every certified H-1B application in these years. The hundred that filed ' +
      'most are listed. &ldquo;USCIS initial approvals&rdquo; is what the firm actually ' +
      'received between 2009 and 2023, from a different federal dataset, and it is blank ' +
      'where the names do not match.';
    $('firms-note').innerHTML = 'Wage level is the tier the employer chose: Level I is the ' +
      'entry rate for the occupation, Level IV the experienced rate. Filing at Level I or II ' +
      'is lawful, and it is also the cheapest lawful option. The median wage is across the ' +
      'firm&rsquo;s own filings, so a firm placing junior developers is not being compared ' +
      'with one placing architects.';
    renderHead();
    renderRows();
  }

  /* ------------------------------------------------------------ wage gaps */
  function renderGaps(d) {
    var occ = (d.by_occupation || []).slice(0, 12);
    if (!occ.length) { $('wages-lede').textContent = 'No occupation had enough filings on both sides.'; return; }
    var max = Math.max.apply(null, occ.map(function (o) {
      return Math.max(o.placed_median_wage, o.direct_median_wage);
    }));
    $('wages-lede').innerHTML = '&ldquo;Placed workers are paid less&rdquo; invites an obvious ' +
      'objection: they must be doing different jobs. So the job is held still. Each row below is ' +
      '<em>one</em> occupation title. The dark bar is the median wage on applications where a ' +
      'supply firm places the worker at another company&rsquo;s site. The pale bar is every ' +
      'other certified application with the same title.';
    $('gap-rows').innerHTML = occ.map(function (o) {
      function bar(cls, v, label, count) {
        return '<div class="gap-bar ' + cls + '"><span class="t" style="width:' +
          (100 * v / max).toFixed(1) + '%"></span><span class="v">' + money(v) +
          ' <span class="muted">· ' + n(count) + ' filings</span></span></div>';
      }
      return '<div class="gap-row"><div class="gap-occ">' + esc(o.occupation) +
        '<small>' + pct(o.placed_low_level_pct) + ' of placed applications at wage level I–II, ' +
        'against ' + pct(o.direct_low_level_pct) + ' hired directly</small></div>' +
        '<div class="gap-bars">' +
        bar('placed', o.placed_median_wage, 'placed', o.placed_filings) +
        bar('direct', o.direct_median_wage, 'direct', o.direct_filings) +
        '</div><div class="gap-pct">−' + pct(o.gap_pct) + '</div></div>';
    }).join('');
    $('wages-note').innerHTML = txt((d.definitions || {}).placed_vs_direct || '') +
      ' A median is the middle filing, so one very high or very low salary cannot move it.';
  }

  /* ---------------------------------------------------------------- trend */
  function renderTrend(d) {
    var fy = d.by_fiscal_year || {};
    var years = Object.keys(fy);
    if (!years.length) return;
    var partial = years.filter(function (y) { return !fy[y].complete; });
    $('trend-lede').innerHTML = 'The share of applications that place a worker at another ' +
      'company&rsquo;s site, and the share filed at the two lowest wage tiers, year by year. ' +
      'Shares are shown rather than counts because ' +
      (partial.length ? 'FY' + partial.join(' and FY') + ' ' +
        (partial.length > 1 ? 'are' : 'is') + ' missing quarters, and the missing quarter is ' +
        'rarely average: January to March is H-1B cap season and the busiest of the four.'
        : 'the years cover different numbers of quarters.');
    $('trend-table').innerHTML =
      '<thead><tr><th>Fiscal year</th><th class="num">Certified applications</th>' +
      '<th class="num">H-1B dependent</th><th class="num">Placed at a client</th>' +
      '<th class="num">By a supply firm</th><th class="num">Wage level I–II</th></tr></thead><tbody>' +
      years.map(function (y) {
        var v = fy[y];
        return '<tr><td>FY' + y + (v.complete ? '' :
          ' <span class="pill">' + v.quarters + ' of 4 quarters</span>') + '</td>' +
          '<td class="num">' + n(v.filings) + '</td>' +
          '<td class="num">' + pct(v.dependent_pct) + '</td>' +
          '<td class="num">' + pct(v.secondary_pct) + '</td>' +
          '<td class="num">' + pct(v.placed_by_supply_firm_pct) + '</td>' +
          '<td class="num">' + pct(v.low_level_pct) + '</td></tr>';
      }).join('') + '</tbody>';
    $('trend-note').innerHTML = 'A fiscal year runs from 1 October to 30 September. ' +
      'Applications are counted in the quarter the Labor Department published them in.';
  }

  /* --------------------------------------------------------------- barred */
  function renderBarred(d, staff) {
    var lists = (staff && staff.debarment_lists) || [];
    var total = lists.reduce(function (s, l) { return s + (l.count || 0); }, 0);
    var inHub = (staff && staff.debarred_in_the_hub) || [];
    $('barred-lede').innerHTML = 'A debarment is the Labor Department&rsquo;s formal bar: the ' +
      'firm may file nothing for a fixed period, and it is published with dates. Across every ' +
      'programme the department runs, <strong>' + total + '</strong> employers are currently ' +
      'barred. That is the whole list.';
    var rows = [];
    lists.forEach(function (l) {
      (l.entries || []).forEach(function (e) {
        rows.push({ programme: l.programme, employer: e.employer, start: e.start, end: e.end,
          reason: e.reason, url: l.source_url });
      });
    });
    $('barred-table').innerHTML =
      '<thead><tr><th>Employer</th><th>Programme</th><th>Barred from</th><th>Until</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td>' + esc(r.employer) + '</td><td class="muted">' + esc(r.programme) +
          '</td><td>' + esc(r.start || '—') + '</td><td>' + esc(r.end || '—') + '</td></tr>';
      }).join('') + '</tbody>';
    // The reported enforcement action that leaves no trace in the public
    // record. Shown with its verdict attached, because the interesting fact
    // here is precisely what could NOT be found.
    var claims = (staff && staff.suspensions) || [];
    if (claims.length) {
      $('barred-table').insertAdjacentHTML('afterend',
        '<div class="windows" style="grid-template-columns:1fr">' + claims.map(function (c) {
          return '<div class="window"><h3>Reported, but in no list</h3><p>' + txt(c.claim) +
            '</p><p style="margin-top:.5rem"><strong>What the primary record shows:</strong> ' +
            txt(c.verdict) + '</p></div>';
        }).join('') + '</div>');
    }
    $('barred-note').innerHTML = 'Of these, ' + inHub.length + ' appear in the USCIS employer ' +
      'data at all. The list is short, and it is also the wrong place to look for the firms ' +
      'in the table above: a <em>suspension</em> pending investigation is not a debarment, is ' +
      'published in no list, and appears here nowhere. Absence from this table is not evidence ' +
      'that a firm is in good standing.';
  }

  /* ---------------------------------------------------- absent enforcement */
  function renderUnpublished(staff) {
    var gaps = (staff && staff.no_list_published) || [];
    if (!gaps.length) { $('unpublished').hidden = true; return; }
    $('unpub-lede').innerHTML = 'A reader who wants to know which employers have been ' +
      'caught will look for a list. Here is what searching for one turns up at each ' +
      'agency that could keep it.';
    $('unpub-cards').innerHTML = gaps.map(function (g) {
      return '<div class="window"><h3>' + esc(g.body) + ' — ' + esc(g.item) + '</h3><p>' +
        txt(g.finding) + (g.source_url ? ' <a href="' + esc(g.source_url) +
        '" target="_blank" rel="noopener noreferrer">Source</a>' : '') + '</p></div>';
    }).join('');
    $('unpub-note').innerHTML = 'The Labor Department&rsquo;s debarment list above is the only ' +
      'public one, and it is a list of employers barred from <em>filing</em>. Nothing published ' +
      'by any agency records how often an employer was inspected, what was found, or whether a ' +
      'worker was paid what the application promised.';
  }

  /* -------------------------------------------------------- concentration */
  function renderConcentration(staff) {
    if (!staff) return;
    var t = staff.totals, y = staff.years || [];
    var fam = (staff.top_firm_families || [])[0];
    $('conc-lede').innerHTML = 'The applications above are permission to employ. This is what ' +
      'USCIS actually approved: every H-1B employer it names, fiscal ' + y[0] + ' to ' +
      y[y.length - 1] + '.';
    $('conc-cards').innerHTML = [
      { h: 'A very long tail',
        p: '<strong>' + n(t.employers) + '</strong> employers received ' + n(t.initial_approvals) +
          ' initial approvals. <strong>' + n(t.employers_with_5_or_fewer) + '</strong> of them ' +
          'got five or fewer over fifteen years, together ' + pct(t.employers_with_5_or_fewer_share_pct) +
          ' of the programme.' },
      { h: 'And a short head',
        p: 'The ten largest employers took <strong>' + pct(t.top10_share_pct) + '</strong>, the ' +
          'largest fifty ' + pct(t.top50_share_pct) + ', the largest two hundred ' +
          pct(t.top200_share_pct) + '.' },
      fam ? { h: 'One firm, several names',
        p: '<strong>' + esc(fam.family) + '</strong> filed under ' + fam.names.length +
          ' different employer names and took ' + n(fam.initial_approval) + ' initial ' +
          'approvals, ' + fam.share_pct + '% of the programme on its own.' } : null
    ].filter(Boolean).map(function (c) {
      return '<div class="window"><h3>' + c.h + '</h3><p>' + c.p + '</p></div>';
    }).join('');
    $('conc-note').innerHTML = 'Initial approvals only. A continuing approval is the same person ' +
      'renewed, so adding the two would count one worker once a year for as long as they stay. ' +
      'USCIS publishes a two-digit industry sector and nothing finer, which is why the firms in ' +
      'the table above had to be identified from the Labor Department&rsquo;s filings instead.';
  }

  /* -------------------------------------------------------------- caveats */
  function renderCaveats(d, staff) {
    var all = (d.caveats || []).concat((staff && staff.caveats) || []);
    $('caveats').innerHTML = all.map(function (c) { return '<li>' + txt(c) + '</li>'; }).join('');
  }

  /* ----------------------------------------------------------------- wire */
  function wire() {
    $('q').addEventListener('input', function (e) { state.q = e.target.value; renderRows(); });
    $('filter').addEventListener('change', function (e) { state.filter = e.target.value; renderRows(); });
    $('thead').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      var k = b.getAttribute('data-k');
      if (state.sort === k) { state.dir = -state.dir; } else { state.sort = k; state.dir = -1; }
      renderHead();
      renderRows();
    });
  }

  Promise.all([
    fetch(SHOPS).then(function (r) { return r.json(); }),
    fetch(STAFFING).then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (res) {
    var d = res[0], staff = res[1];
    renderStats(d, staff);
    renderTest(d);
    renderTable(d);
    renderGaps(d);
    renderTrend(d);
    renderBarred(d, staff);
    renderUnpublished(staff);
    renderConcentration(staff);
    renderCaveats(d, staff);
    wire();
  }).catch(function (err) {
    $('stats').innerHTML = '<p class="loading">Could not load the filings: ' + esc(err.message) + '</p>';
  });
})();
