/* /security.html — every figure comes from /data/security_cases.json.
   Nothing on this page is typed in. If the builder's numbers move, the page
   moves with them, which is the only way a stale figure cannot survive. */
(function () {
  'use strict';

  var ROLE_LABEL = {
    faculty: 'Professor or faculty',
    university_researcher: 'University researcher',
    hospital_researcher: 'Hospital researcher',
    federal_lab: 'Federal laboratory or NASA',
    student: 'Graduate student',
    degree_holder: 'Named by degree (PhD)',
    corporate_technical: 'Company engineer or chemist',
    unclassified: 'No job stated in the headline'
  };
  var CAT_LABEL = {
    research_pipeline: 'A person in a research post',
    state_actor: 'An intelligence officer or foreign agent',
    trade_secrets: 'Trade secrets or economic espionage',
    export_control: 'Export control or smuggling',
    cyber: 'Hacking',
    grant_or_visa_fraud: 'Grant or visa fraud',
    fraud_or_sanctions: 'Fraud or sanctions',
    not_a_prosecution: 'Not a prosecution at all',
    unclassified: 'Not classified'
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function n(x) { return Number(x || 0).toLocaleString('en-US'); }
  function day(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return esc(iso);
    var m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
             'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(p[1]) - 1];
    return Number(p[2]) + ' ' + m + ' ' + p[0];
  }

  function bars(host, rows, labels, alt) {
    var max = rows.reduce(function (a, r) { return Math.max(a, r[1]); }, 0) || 1;
    host.innerHTML = rows.map(function (r) {
      var w = (100 * r[1] / max).toFixed(1);
      return '<div class="bar-row"><span class="lab">' +
        esc(labels[r[0]] || r[0]) + '</span>' +
        '<span class="bar-track"><span class="bar-fill' + (alt ? ' alt' : '') +
        '" style="width:' + w + '%"></span></span>' +
        '<span class="v">' + n(r[1]) + '</span></div>';
    }).join('');
  }

  function render(d) {
    var t = d.totals;

    document.querySelectorAll('[data-f="updated"]').forEach(function (el) {
      el.textContent = d.list.last_updated;
    });

    document.getElementById('totals').innerHTML = [
      ['n', t.prosecutions, 'prosecutions on the government&rsquo;s own list',
       d.list.first_case.slice(0, 4) + ' to ' + d.list.last_case.slice(0, 4) +
       ', plus ' + t.not_a_prosecution + ' entries that are not prosecutions'],
      ['n', t.in_pipeline, 'of them were people in a research post',
       t.in_pipeline_pct + '% &mdash; professors, university and hospital ' +
       'researchers, federal laboratory staff'],
      ['n', t.charge_only, 'were announced as an accusation only',
       t.charge_only_pct + '% of the prosecutions. The list records no ' +
       'outcome for them.'],
      ['y', 0, 'years since the list was last updated',
       'The China Initiative ended on 23 February 2022. Nothing replaced the list.']
    ].map(function (r) {
      var v = r[0] === 'y'
        ? (new Date().getFullYear() - Number(d.list.last_updated.slice(-4)))
        : r[1];
      return '<div class="stat"><div class="n">' + n(v) + '</div>' +
        '<p class="l">' + r[2] + '</p><p class="s">' + r[3] + '</p></div>';
    }).join('');

    bars(document.getElementById('role-bars'),
         Object.keys(d.by_research_role).map(function (k) {
           return [k, d.by_research_role[k]];
         }), ROLE_LABEL, false);

    bars(document.getElementById('cat-bars'),
         Object.keys(d.by_category).map(function (k) {
           return [k, d.by_category[k]];
         }), CAT_LABEL, true);

    var np = d.cases.filter(function (c) { return c.category === 'not_a_prosecution'; });
    document.getElementById('notpros').innerHTML =
      '<strong>' + np.length + ' of the ' + t.entries + ' entries are not a ' +
      'criminal case against a person</strong>: ' +
      np.map(function (c) {
        return '<a href="' + esc(c.url) + '">' + esc(c.title) + '</a>';
      }).join('; ') + '. They are excluded from every share on this page. ' +
      'Counting them as prosecutions would inflate all of them.';

    document.getElementById('reg-table').innerHTML =
      '<thead><tr><th>Date</th><th>What DOJ called it</th><th>Who</th>' +
      '<th>Kind</th><th>Stage</th></tr></thead><tbody>' +
      d.cases.map(function (c) {
        return '<tr><td class="d">' + day(c.date) + '</td>' +
          '<td><a href="' + esc(c.url) + '">' + esc(c.title) + '</a></td>' +
          '<td>' + (c.in_pipeline
            ? '<span class="tag pipe">' + esc(ROLE_LABEL[c.research_role] || c.research_role) + '</span>'
            : '<span class="tag">' + esc(ROLE_LABEL[c.research_role] || c.research_role) + '</span>') +
          '</td><td>' + esc(CAT_LABEL[c.category] || c.category) + '</td>' +
          '<td>' + (c.category === 'not_a_prosecution'
            ? '&mdash;'
            : (c.outcome_stated
                ? 'Outcome stated'
                : '<span class="tag alleg">Charged</span>')) +
          '</td></tr>';
      }).join('') + '</tbody>';

    document.getElementById('since-cards').innerHTML = d.since.map(function (r) {
      var cred = '';
      if (r.graduate_credential) {
        cred = '<p class="cred"><strong>Graduate credential:</strong> ' +
          esc(r.graduate_credential) + '. ' +
          '<a href="' + esc(r.credential_source) + '">Source</a>. ' +
          esc(r.credential_note || '') + '</p>';
      }
      return '<div class="case"><h3><a href="' + esc(r.url) + '">' +
        esc(r.title) + '</a></h3>' +
        '<p class="meta">' + day(r.date) + ' &middot; ' + esc(r.name) +
        (r.age ? ', ' + r.age : '') + ' &middot; ' + esc(r.institution) +
        (r.visa_or_status && r.visa_or_status !== 'not stated by DOJ'
          ? ' &middot; ' + esc(r.visa_or_status) + ' visa' : '') +
        ' &middot; ' + esc(r.status) + '</p>' +
        '<p class="meta">Charged with: ' + esc(r.charges) + '</p>' +
        r.quotes.map(function (q) {
          return '<blockquote>&ldquo;' + esc(q) + '&rdquo;</blockquote>';
        }).join('') + cred + '</div>';
    }).join('');
  }

  fetch('/data/security_cases.json')
    .then(function (r) { return r.json(); })
    .then(render)
    .catch(function (e) {
      document.querySelectorAll('.loading').forEach(function (el) {
        el.textContent = 'Could not load the register.';
      });
      if (window.console) console.error(e);
    });
})();
