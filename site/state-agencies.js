/* /state-agencies.html — every figure from /data/state_agencies.json. */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(x) { return Number(x || 0).toLocaleString('en-US'); }

  function render(d) {
    var t = d.totals;
    $('totals').innerHTML = [
      [n(t.initial_approvals), 'initial approvals to state agencies',
       d.window + '. A new worker entering the programme.'],
      [n(t.continuing_approvals), 'continuing approvals',
       'Extensions for someone already here. Never add these to the initial count.'],
      [n(t.agencies), 'agencies in ' + t.states + ' states',
       'Identified from the employer name on the filing, from ' +
       n(t.name_variants) + ' different spellings of those names.'],
      [n(t.denials), 'denials across the whole period',
       'Refusals, counted separately from either approval column.']
    ].map(function (r) {
      return '<div class="stat"><div class="n">' + r[0] + '</div>' +
        '<p class="l">' + r[1] + '</p><p class="s">' + esc(r[2]) + '</p></div>';
    }).join('');

    $('state-rows').innerHTML = d.states.map(function (s) {
      return '<tr><td data-sort="' + esc(s.state.toLowerCase()) + '">' + esc(s.state) + '</td>' +
        '<td class="num share" data-sort="' + s.initial + '">' + n(s.initial) + '</td>' +
        '<td class="num" data-sort="' + s.continuing + '">' + n(s.continuing) + '</td>' +
        '<td class="num muted" data-sort="' + s.denied + '">' + n(s.denied) + '</td>' +
        '<td class="num" data-sort="' + s.agencies + '">' + n(s.agencies) + '</td>' +
        '<td class="num muted" data-sort="' + s.name_variants + '">' + n(s.name_variants) + '</td></tr>';
    }).join('');

    var picked = d.states.length ? d.states[0].state : null;
    $('picker').innerHTML = d.states.map(function (s) {
      return '<button type="button" data-state="' + esc(s.state) + '"' +
        (s.state === picked ? ' class="on"' : '') + '>' + esc(s.state) + '</button>';
    }).join('');

    function show(code) {
      picked = code;
      Array.prototype.forEach.call($('picker').children, function (b) {
        b.classList.toggle('on', b.dataset.state === code);
      });
      var s = d.states.filter(function (x) { return x.state === code; })[0];
      if (!s) { $('agency-list').innerHTML = ''; return; }
      $('agency-list').innerHTML = s.detail.map(function (a) {
        var yrs = a.years.length
          ? (a.years[0] === a.years[a.years.length - 1]
             ? 'FY' + a.years[0]
             : 'FY' + a.years[0] + '–FY' + a.years[a.years.length - 1])
          : '';
        var alias = a.filed_as.length > 1
          ? '<p class="alias">Also filed as: ' +
            a.filed_as.slice(1).map(esc).join(' &middot; ') + '</p>' : '';
        var jobs = '';
        if (a.lca && a.lca.titles && a.lca.titles.length) {
          jobs = '<p class="jobs"><strong>Jobs on its certified applications</strong> ' +
            '(' + n(a.lca.filings) + (a.lca.filings === 1 ? ' filing' : ' filings') +
            (a.lca.median_wage ? ', median $' + n(Math.round(a.lca.median_wage)) : '') +
            '):<br>' + a.lca.titles.map(function (p) {
              return '<span class="pill">' + esc(p[0]) + ' ×' + p[1] + '</span>';
            }).join('') + '</p>';
        }
        return '<div class="agency"><h3>' + esc(a.filed_as[0]) + '</h3>' +
          '<p class="meta"><strong>' + n(a.initial) + '</strong> initial &middot; <strong>' +
          n(a.continuing) + '</strong> continuing' +
          (a.denied ? ' &middot; ' + n(a.denied) + ' denied' : '') +
          ' &middot; ' + yrs +
          (a.cities && a.cities.length ? ' &middot; ' + esc(a.cities.join(', ')) : '') +
          '</p>' + alias + jobs + '</div>';
      }).join('');
    }

    $('picker').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-state]');
      if (b) show(b.dataset.state);
    });
    if (picked) show(picked);

    var no = d.national_origin;
    if (no && no.by_country) {
      $('origin-lede').innerHTML =
        '<strong>' + n(no.countries) + ' countries</strong> issued at least one ' +
        'H-1B visa in ' + no.year + ', ' + n(no.total_issuances) + ' in all. ' +
        'The top two are ' +
        Math.round((no.by_country[0].share_pct + no.by_country[1].share_pct)) +
        '% of the total between them.';
      $('origin-rows').innerHTML = no.by_country.map(function (r) {
        return '<tr><td data-sort="' + esc(r.country.toLowerCase()) + '">' +
          esc(r.country) + '</td>' +
          '<td class="num share" data-sort="' + r.issuances + '">' + n(r.issuances) + '</td>' +
          '<td class="num muted" data-sort="' + r.share_pct + '">' + r.share_pct + '%</td></tr>';
      }).join('');
      $('origin-note').textContent = no.not_linkable + ' Source: ' + no.source + '.';
    }

    $('caveats').innerHTML = (d.caveats || []).map(function (c) {
      return '<li>' + esc(c) + '</li>';
    }).join('');
  }

  fetch('/data/state_agencies.json')
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function (e) {
      Array.prototype.forEach.call(document.querySelectorAll('.loading'), function (el) {
        el.textContent = 'Could not load the data.';
      });
      if (window.console) console.error(e);
    });
})();
