/* One row per institution, sortable and filterable, plus a rollup to states.
 *
 * The point of the page is comparison, so the columns are the same for every
 * row and a value that is missing is left blank rather than shown as zero. An
 * institution with no HERD row was not surveyed; it did not spend nothing, and
 * a zero would sort it alongside institutions that genuinely spend little.
 *
 * Sorting therefore has to put blanks last in both directions, which a plain
 * numeric comparator does not do -- nulls would lead the ascending sort and
 * the first screenful of "lowest federal funding" would be institutions with
 * no data at all.
 */
(function () {
  'use strict';

  var DATA = null, VIEW = 'inst', SORT = null, DESC = true;

  var COLS = [
    { k: 'institution', label: 'Institution', text: true,
      get: function (r) { return r.institution; } },
    { k: 'state', label: 'State', text: true, get: function (r) { return r.state; } },
    { k: 'control', label: 'Sector', text: true, dim: true,
      get: function (r) { return r.control === 'private nonprofit' ? 'private'
        : r.control === 'private for-profit' ? 'for-profit' : r.control; } },
    { k: 'm_n', label: "Master's", title: "Core-STEM master's degrees awarded, 2021-2025",
      get: function (r) { return r.masters && r.masters.awarded || null; }, fmt: 'int' },
    { k: 'm_s', label: "Master's NRA", title: "Non-resident share of those master's degrees",
      get: function (r) { return r.masters && r.masters.share; }, fmt: 'pct', hi: 50 },
    { k: 'm_c', label: 'Change', title: "Change in the master's non-resident share since 2010-2014, in percentage points",
      get: function (r) { return r.masters && r.masters.share_change; }, fmt: 'pp' },
    { k: 'd_n', label: 'Doctorates', title: 'Core-STEM research doctorates awarded, 2021-2025',
      get: function (r) { return r.doctorate && r.doctorate.awarded || null; }, fmt: 'int' },
    { k: 'd_s', label: 'Doctorate NRA', title: 'Non-resident share of those doctorates',
      get: function (r) { return r.doctorate && r.doctorate.share; }, fmt: 'pct', hi: 50 },
    { k: 'd_c', label: 'Change', title: 'Change in the doctoral non-resident share since 2010-2014, in percentage points',
      get: function (r) { return r.doctorate && r.doctorate.share_change; }, fmt: 'pp' },
    { k: 'g_n', label: 'Grad enrolled', title: 'Total graduate enrolment, autumn 2023',
      get: function (r) { return r.graduate_enrolment && r.graduate_enrolment.total; }, fmt: 'int' },
    { k: 'g_s', label: 'Grad NRA', title: 'Non-resident share of graduate enrolment',
      get: function (r) { return r.graduate_enrolment && r.graduate_enrolment.share; }, fmt: 'pct', hi: 50 },
    { k: 'f_o', label: 'Federal obligations', title: 'Federal obligations from all agencies, FY2023',
      get: function (r) { return r.federal && r.federal.obligations; }, fmt: 'money' },
    { k: 'f_t', label: 'Of which training', title: 'S&E fellowships, traineeships and training grants, FY2023',
      get: function (r) { return r.federal && r.federal.training; }, fmt: 'money' },
    { k: 'f_r', label: 'Federal R&D', title: 'Federally financed R&D expenditure, FY2024',
      get: function (r) { return r.federal && r.federal.rd_federal; }, fmt: 'money' },
    { k: 'f_d', label: 'Per doctorate', title: 'Federal obligations over the annual rate of core-STEM research doctorates. An intensity ratio, not a price.',
      get: function (r) { return r.federal_per_doctorate; }, fmt: 'money' },
    { k: 'f_c', label: 'Core-STEM of doctorates', title: 'How much of the institution’s research doctorates the per-doctorate denominator covers. A low figure means the ratio is measured against a small part of the output.',
      get: function (r) { return r.cost_basis_share_of_all_doctorates; }, fmt: 'pct', dim: true },
    { k: 'f_p', label: 'Professional doctorates', title: 'MD, DDS, PharmD, JD and the like, awarded 2015-2022. Large here means the per-doctorate ratio is misleading.',
      get: function (r) { return r.cost_basis_professional_doctorates || null; }, fmt: 'int', dim: true },
    { k: 't_o', label: 'Grad tuition', title: 'Published out-of-state graduate tuition, 2023-24 — the rate a foreign student pays',
      get: function (r) { return r.graduate_tuition_out_of_state; }, fmt: 'money0' }
  ];

  var SCOLS = [
    { k: 'state', label: 'State', text: true, get: function (r) { return r.state; } },
    { k: 'institutions', label: 'Institutions', get: function (r) { return r.institutions; }, fmt: 'int' },
    { k: 'm_n', label: "Master's", get: function (r) { return r.masters_awarded || null; }, fmt: 'int' },
    { k: 'm_s', label: "Master's NRA", get: function (r) { return r.masters_non_resident_share; }, fmt: 'pct', hi: 50 },
    { k: 'd_n', label: 'Doctorates', get: function (r) { return r.doctorates_awarded || null; }, fmt: 'int' },
    { k: 'd_s', label: 'Doctorate NRA', get: function (r) { return r.doctorates_non_resident_share; }, fmt: 'pct', hi: 50 },
    { k: 'g_n', label: 'Grad enrolled', get: function (r) { return r.graduate_enrolment || null; }, fmt: 'int' },
    { k: 'g_s', label: 'Grad NRA', get: function (r) { return r.graduate_non_resident_share; }, fmt: 'pct', hi: 50 },
    { k: 'f_o', label: 'Federal obligations', get: function (r) { return r.federal_obligations || null; }, fmt: 'money' },
    { k: 'f_r', label: 'Federal R&D', get: function (r) { return r.federal_rd || null; }, fmt: 'money' },
    { k: 'f_d', label: 'Per doctorate', get: function (r) { return r.federal_per_doctorate; }, fmt: 'money' }
  ];

  function el(t, c, x) {
    var n = document.createElement(t);
    if (c) n.className = c;
    if (x !== undefined && x !== null) n.textContent = x;
    return n;
  }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }

  function fmt(v, kind) {
    if (v === null || v === undefined) return null;
    if (kind === 'int') return v.toLocaleString('en-US');
    if (kind === 'pct') return v.toFixed(1) + '%';
    if (kind === 'pp') return (v > 0 ? '+' : '') + v.toFixed(1);
    if (kind === 'money0') return '$' + Math.round(v).toLocaleString('en-US');
    if (kind === 'money') {
      if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'bn';
      if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'm';
      if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'k';
      return '$' + Math.round(v);
    }
    return String(v);
  }

  function cols() { return VIEW === 'state' ? SCOLS : COLS; }

  function rows() {
    if (VIEW === 'state') return DATA.states.slice();
    var q = (document.getElementById('q').value || '').trim().toLowerCase();
    var st = document.getElementById('state').value;
    var ct = document.getElementById('control').value;
    var has = document.getElementById('has').value;
    return DATA.institutions.filter(function (r) {
      if (q && r.institution.toLowerCase().indexOf(q) < 0) return false;
      if (st && r.state !== st) return false;
      if (ct && r.control !== ct) return false;
      if (has === 'masters' && !(r.masters && r.masters.awarded)) return false;
      if (has === 'doctorate' && !(r.doctorate && r.doctorate.awarded)) return false;
      if (has === 'federal' && !r.federal) return false;
      if (has === 'perdoc' && !r.federal_per_doctorate) return false;
      return true;
    });
  }

  function sorted(list) {
    var spec = null, cs = cols();
    for (var i = 0; i < cs.length; i++) if (cs[i].k === SORT) spec = cs[i];
    if (!spec) return list;
    var dir = DESC ? -1 : 1;
    return list.slice().sort(function (a, b) {
      var x = spec.get(a), y = spec.get(b);
      // Missing values sort last whichever way the column is pointing: a blank
      // is "not surveyed", and letting it lead the ascending sort would fill
      // the top of "least federal money" with institutions that have no row.
      var xn = x === null || x === undefined || x === '';
      var yn = y === null || y === undefined || y === '';
      if (xn && yn) return 0;
      if (xn) return 1;
      if (yn) return -1;
      if (spec.text) return dir * String(x).localeCompare(String(y));
      return dir * (x - y);
    });
  }

  function render() {
    var host = document.getElementById('host');
    var list = sorted(rows()), cs = cols();
    clear(host);

    var t = el('table', 'cmp');
    var cap = el('caption');
    cap.textContent = VIEW === 'state'
      ? 'Institutions summed to their state. Every share is recomputed from the '
        + 'sums, never averaged across institutions.'
      : 'Degrees pooled over ' + DATA.windows.late[0] + '–' + DATA.windows.late[1]
        + '. A blank means no data, not a zero.';
    t.appendChild(cap);

    var thead = el('thead'), hr = el('tr');
    cs.forEach(function (c) {
      var th = el('th');
      th.setAttribute('scope', 'col');
      if (SORT === c.k) th.setAttribute('aria-sort', DESC ? 'descending' : 'ascending');
      var b = el('button', null, c.label + (SORT === c.k ? (DESC ? ' ↓' : ' ↑') : ''));
      b.type = 'button';
      if (c.title) { b.title = c.title; th.title = c.title; }
      b.setAttribute('data-track', 'sort.' + c.k);
      b.addEventListener('click', function () {
        if (SORT === c.k) { DESC = !DESC; } else { SORT = c.k; DESC = !c.text; }
        render();
      });
      th.appendChild(b);
      hr.appendChild(th);
    });
    thead.appendChild(hr);
    t.appendChild(thead);

    var tb = el('tbody');
    list.forEach(function (r) {
      var tr = el('tr');
      cs.forEach(function (c) {
        var v = c.get(r), s = c.text ? (v || null) : fmt(v, c.fmt);
        var td = el('td', c.dim ? 'dim' : null);
        if (s === null) { td.appendChild(el('span', 'empty', '—')); }
        else if (c.hi && typeof v === 'number' && v >= c.hi) {
          td.appendChild(el('span', 'hi', s));
        } else { td.textContent = s; }
        tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    host.appendChild(t);

    document.getElementById('count').textContent =
      list.length.toLocaleString('en-US') + (VIEW === 'state' ? ' states' : ' institutions');
  }

  function boot(d) {
    DATA = d;
    var sel = document.getElementById('state');
    var states = DATA.states.map(function (s) { return s.state; }).sort();
    states.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s; o.textContent = s;
      sel.appendChild(o);
    });
    ['q', 'state', 'control', 'has'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', render);
    });
    Array.prototype.forEach.call(
      document.querySelectorAll('.seg button'), function (b) {
        b.addEventListener('click', function () {
          VIEW = b.getAttribute('data-view');
          Array.prototype.forEach.call(document.querySelectorAll('.seg button'), function (o) {
            o.setAttribute('aria-pressed', String(o === b));
          });
          // The two views share no column keys beyond the obvious ones, so a
          // sort carried across can silently point at nothing.
          SORT = VIEW === 'state' ? 'm_n' : null; DESC = true;
          ['q', 'state', 'control', 'has'].forEach(function (id) {
            document.getElementById(id).disabled = (VIEW === 'state');
          });
          render();
        });
      });
    var c = DATA.coverage, x = DATA.crosswalk;
    document.getElementById('prov').textContent =
      c.institutions.toLocaleString('en-US') + ' institutions; '
      + c.with_late_degrees.toLocaleString('en-US') + ' award core-STEM graduate degrees, '
      + c.with_federal.toLocaleString('en-US') + ' have federal money attached and '
      + c.with_per_doctorate + ' clear the floor for a per-doctorate ratio. '
      + 'The two NCSES surveys publish institution names and no identifier; '
      + x.herd_unmatched_dollars_pct + '% of HERD dollars and '
      + x.federal_support_unmatched_dollars_pct + '% of Federal Support dollars '
      + 'could not be resolved to an IPEDS unit and are excluded rather than '
      + 'guessed at — they are research institutes with no IPEDS unit, such '
      + 'as Scripps, Woods Hole and Cold Spring Harbor. '
      + 'Sources: ' + DATA.sources.degrees + '; ' + DATA.sources.enrolment + '; '
      + DATA.sources.federal_rd + '; ' + DATA.sources.federal_obligations + '.';
    SORT = 'm_n'; DESC = true;
    render();
  }

  fetch('/data/institution_profiles.json')
    .then(function (r) { return r.json(); })
    .then(boot)
    .catch(function () {
      document.getElementById('host').innerHTML =
        '<p class="note">Could not load the institution table.</p>';
    });
})();
