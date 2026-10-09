/* /eor.html — every figure comes from /data/eor_market.json. Nothing typed in. */
(function () {
  'use strict';

  var KIND = {
    eor: 'Employer of record',
    us_payroll: 'US payroll or PEO',
    other_software: 'Other software',
    unknown: 'Not classified'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(x) { return Number(x || 0).toLocaleString('en-US'); }

  function render(d) {
    var t = d.totals;
    var live = d.providers.filter(function (p) { return p.available; });

    document.getElementById('totals').innerHTML = [
      [t.h1b_pages, 'pages whose web address names the H-1B',
       'Published by ' + t.providers_with_h1b_pages + ' of the ' +
       t.providers_read + ' vendors read. One is called ' +
       '&ldquo;h1b-visa-alternative&rdquo;.'],
      [t.companies_in_network, 'companies in the reference network',
       t.eor_companies_in_network + ' of them sell employer-of-record service; ' +
       'the rest are payroll, PEO and other software they compare against'],
      [t.reference_edges, 'published references between them',
       'Each one is a page at an address naming another company'],
      [t.countries_max, 'countries, at the widest vendor',
       'Counted from country guides in its own sitemap, across ' +
       n(t.urls_read) + ' addresses read in total']
    ].map(function (r) {
      return '<div class="stat"><div class="n">' + n(r[0]) + '</div>' +
        '<p class="l">' + r[1] + '</p><p class="s">' + r[2] + '</p></div>';
    }).join('');

    var byVendor = {};
    d.h1b_pages.forEach(function (p) {
      (byVendor[p.provider] = byVendor[p.provider] || []).push(p);
    });
    var order = live.slice().sort(function (a, b) { return b.h1b_pages - a.h1b_pages; });
    document.getElementById('h1b-host').innerHTML = order
      .filter(function (p) { return byVendor[p.name]; })
      .map(function (p) {
        return '<div class="vendor"><h3>' + esc(p.name) + '</h3>' +
          '<p class="host">' + esc(p.host) + ' &middot; ' + p.h1b_pages +
          ' pages</p><ul class="slugs">' +
          byVendor[p.name].map(function (r) {
            return '<li><a href="' + esc(r.url) + '"><code>' +
              esc(r.slug) + '</code></a></li>';
          }).join('') + '</ul></div>';
      }).join('');

    var silent = live.filter(function (p) { return !p.h1b_pages; });
    var translated = t.h1b_pages_translated_only || 0;
    document.getElementById('h1b-note').innerHTML =
      (silent.length
        ? esc(silent.map(function (p) { return p.name; }).join(', ')) +
          ' publish no page with the H-1B in its address. '
        : '') +
      (translated
        ? translated + ' further pages exist only in translation and are ' +
          'counted apart, because the same claim published in a dozen ' +
          'languages is still one claim. '
        : '') +
      'Addresses are shown exactly as the vendor publishes them.';

    document.getElementById('net-table').innerHTML =
      '<thead><tr><th>Company</th><th>What it sells</th>' +
      '<th class="num">References it makes</th>' +
      '<th class="num">Times it is referenced</th></tr></thead><tbody>' +
      d.network.map(function (r) {
        return '<tr><td>' + esc(r.company) + '</td><td><span class="tag' +
          (r.kind === 'eor' ? ' eor' : '') + '">' +
          esc(KIND[r.kind] || r.kind) + '</span></td>' +
          '<td class="num">' + n(r.references_made) + '</td>' +
          '<td class="num">' + n(r.referenced_by) + '</td></tr>';
      }).join('') + '</tbody>';

    var rows = d.providers.slice().sort(function (a, b) {
      return (b.countries || 0) - (a.countries || 0);
    });
    document.getElementById('country-table').innerHTML =
      '<thead><tr><th>Vendor</th><th>Site</th>' +
      '<th class="num">Country pages</th>' +
      '<th class="num">Addresses read</th></tr></thead><tbody>' +
      rows.map(function (p) {
        if (!p.available) {
          return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.host) +
            '</td><td class="num" colspan="2">Not read &mdash; ' +
            esc(p.reason) + '</td></tr>';
        }
        return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.host) +
          '</td><td class="num">' + n(p.countries) + '</td>' +
          '<td class="num">' + n(p.urls) + '</td></tr>';
      }).join('') + '</tbody>';
  }

  fetch('/data/eor_market.json')
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function (e) {
      document.querySelectorAll('.loading').forEach(function (el) {
        el.textContent = 'Could not load the data.';
      });
      if (window.console) console.error(e);
    });
})();
