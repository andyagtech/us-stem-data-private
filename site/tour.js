/* Guided tour: the assistant walks a reader through the argument.
 *
 * WHAT IT IS
 *
 * A declarative list of stops. Each stop names a page, an optional anchor, an
 * optional CSS selector to ring, and what the assistant says when it arrives.
 * The tour drives the chat widget's existing machinery rather than inventing a
 * second navigation system: performNav() to move, scrollToFragment() to land on
 * an anchor, and the cb-target-ring class to highlight.
 *
 * WHY IT SURVIVES NAVIGATION
 *
 * Stops span pages, and moving between them is a real page load that destroys
 * every variable. Position is therefore kept in sessionStorage, and the widget
 * resumes on the far side: it reads the saved index on load, opens the panel,
 * and continues. The conversation transcript already persists the same way, so
 * a reader arrives at the next page with the whole thread intact.
 *
 * WHY IT SPEAKS THROUGH THE CHAT
 *
 * The reader is already looking at the chat panel, and every stop is a sentence
 * plus a place on the page. Putting the narration in the transcript means the
 * tour leaves a record: someone who takes it can scroll back through what they
 * were told, and ask a follow-up about any of it, with the session's facts
 * record making earlier figures quotable.
 *
 * FIGURES
 *
 * Stops carry a small number of hard figures: $875K per doctorate, 49
 * departments, 90.6% top share, and the master's expansion split (about
 * 159,000 seats added, nearly 96,000 to non-residents). Everything else points
 * at where a number lives rather than restating it.
 *
 * Those figures are derived, not typed from memory, and they will go stale if
 * the corpus is rebuilt. scripts/test_site.py asserts the first three against
 * the published artifacts; the expansion split comes from
 * scripts/analyze_domestic_trend.py and should be re-derived when IPEDS adds a
 * year.
 */
(function () {
  'use strict';

  var KEY = 'phd-tour-v1';

  var STOPS = [
    {
      page: '/',
      anchor: 'finding',
      say: "Let's start with what this costs. Federal research funding runs to " +
           "roughly $875,000 for every STEM research doctorate awarded in the " +
           "United States. That is public money, and it is the reason the rest " +
           "of this matters."
    },
    {
      page: '/',
      anchor: 'cases',
      selector: '#cases-table',
      say: "These 49 departments are the finding. In each one, seven of every " +
           "ten research doctorates or more went to students on temporary " +
           "visas — and not once, but in at least six of the last eight " +
           "measured years."
    },
    {
      page: '/',
      anchor: 'public-cost',
      selector: '#cost-table',
      say: "Here is the funding beside the outcome, institution by institution. " +
           "Doctoral students are the ones federal money largely pays for; " +
           "master's students mostly pay tuition, so the two are kept separate."
    },
    {
      page: '/presentation.html',
      anchor: 'national-flat',
      say: "Now the part most people get wrong. Nationally, the non-resident " +
           "share of US research doctorates has barely moved in fifteen years. " +
           "It ends lower than it started. Anyone checking the national number " +
           "finds no trend at all."
    },
    {
      page: '/presentation.html',
      anchor: 'concentration',
      say: "What changed is concentration. The count of departments where " +
           "non-residents are the overwhelming majority more than doubled, " +
           "while the national average sat still. The average was hiding it."
    },
    {
      page: '/presentation.html',
      anchor: 'by-field',
      say: "And it is not spread evenly. Engineering, computing and mathematics " +
           "separated from everything else. Biology barely moved. This is a " +
           "story about particular fields, not about graduate education at large."
    },
    {
      page: '/presentation.html',
      anchor: 'persistence',
      say: "These are not one unusual year. The programs on this list stayed " +
           "above the threshold for a decade or more — it is the settled state " +
           "of the program, not a spike."
    },
    {
      page: '/live.html',
      anchor: 'cases',
      selector: '#chart-holder',
      say: "This is the master's picture, and it is where the volume is — more " +
           "than ten times as many degrees as the doctoral programs. Core-STEM " +
           "master's roughly doubled over this period."
    },
    {
      page: '/live.html',
      selector: '#chart-holder',
      say: "Here is the opportunity cost. That expansion added about 159,000 " +
           "core-STEM master's seats. Nearly 96,000 of them — three in every " +
           "five — went to students on temporary visas. Americans received " +
           "under 40% of an expansion their taxes underwrote."
    },
    {
      page: '/live.html',
      selector: '#chart-holder',
      say: "And a graduate seat is not free to create. STEM master's students " +
           "teach the labs and grade the sections; doctoral students are paid " +
           "off federal grants. Every funded place is a place, and it is " +
           "finite whatever the total enrolment does."
    },
    {
      page: '/distributions.html',
      anchor: 'national',
      selector: '#hist',
      say: "Here is why a flat national average is misleading. Every doctoral " +
           "department in the country, sorted by how many of its degrees go to " +
           "non-residents. The middle barely moved. The top end nearly tripled."
    },
    {
      page: '/distributions.html',
      anchor: 'programmes',
      say: "And it tracks the field, not the school. Petroleum engineering runs " +
           "above eighty percent. Electrical engineering is seventy-one across " +
           "nearly eighteen thousand doctorates. Clinical psychology is under " +
           "four."
    },
    {
      page: '/distributions.html',
      anchor: 'programmes',
      say: "Look at information security though — under three percent, while " +
           "general computer science is above sixty. The likeliest reason is " +
           "that clearance work is effectively closed to non-citizens. Where " +
           "citizenship is required, the composition changes completely."
    },
    {
      page: '/distributions.html',
      anchor: 'universities',
      say: "And no single number describes a university. Purdue has twenty of " +
           "twenty-seven departments majority non-resident. MIT runs from " +
           "sixteen percent in biology to seventy-three in computer science. " +
           "The average describes neither."
    },
    {
      page: '/',
      anchor: 'public-cost',
      say: "Now the part about who pays. Three in four international science " +
           "and engineering doctorates are funded by an assistantship. Barely " +
           "half of American ones are — and Americans are four and a half times " +
           "more likely to be paying their own way. That is a federal census, " +
           "and the gap shows up in every single field."
    },
    {
      page: '/',
      anchor: 'method',
      say: "Everything here comes from federal files anyone can download: IPEDS " +
           "Completions for degrees, the NSF surveys for funding and support. " +
           "The limits are written down too — what this data shows, and what it " +
           "cannot. Ask me anything about any of it."
    }
  ];

  function load() {
    try {
      var raw = sessionStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function save(state) {
    try {
      if (state) sessionStorage.setItem(KEY, JSON.stringify(state));
      else sessionStorage.removeItem(KEY);
    } catch (e) { /* private mode: the tour just will not resume */ }
  }

  function here() {
    return location.pathname.replace(/index\.html$/, '') || '/';
  }

  function samePage(stop) {
    var want = stop.page.replace(/index\.html$/, '') || '/';
    return want === here();
  }

  window.PhdTour = {
    stops: STOPS,
    length: STOPS.length,
    get: function (i) { return STOPS[i] || null; },
    state: load,
    save: save,
    samePage: samePage,
    clear: function () { save(null); },
    start: function () { save({ i: 0, started: true }); },
    advance: function () {
      var st = load() || { i: 0 };
      st.i = (st.i || 0) + 1;
      if (st.i >= STOPS.length) { save(null); return null; }
      save(st);
      return STOPS[st.i];
    }
  };
})();
