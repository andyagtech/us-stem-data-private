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
 * Stops carry as few hard figures as possible: $875K per doctorate and the
 * 85% petroleum share. Everything else points at where a number lives rather
 * than restating it, because a figure quoted here is a second copy that goes
 * stale on its own.
 *
 * THE STOPS AVOID DARK-THEMED PAGES. An earlier version walked through
 * live.html and presentation.html, which carry their own dark treatment, so
 * the tour flipped between light and dark mid-sentence. Every stop below is
 * on a page that follows the site theme.
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

  /* TRACKS. The full tour is the whole argument. Each numbered step is a
     short tour of its own section, for a reader who wants one part rather
     than the sequence -- a committee staffer sent to look at the money, say,
     who does not need the visa pages.

     A track is just a filter over STOPS plus its own ordering, so there is
     one set of narration to maintain rather than five. A stop that names a
     page not in the track is simply not in it. */
  var TRACKS = {
    full: null,                       // every stop, in order
    step1: [
      { page: '/', anchor: 'who-pays',
        say: "Step one: who pays. A doctorate is not something you buy. In " +
             "science and engineering it is a job \u2014 an assistantship, " +
             "tuition waived, a stipend, funded largely out of federal " +
             "research grants." },
      { page: '/', anchor: 'public-cost', selector: '#cost-table',
        say: "Roughly $875,000 of federal research money per STEM research " +
             "doctorate awarded. Here it is beside the outcome, institution " +
             "by institution." },
      { page: '/ipeds_dashboard',
        say: "And the whole national series behind it: 1.19 million STEM " +
             "doctorates across 849 institutions and forty years. The money " +
             "grew; look at who the degrees went to." }
    ],
    step2: [
      { page: '/expansion',
        say: "Step two: the master's. This is where the volume is \u2014 more " +
             "than ten times as many degrees as the doctoral programs, and " +
             "it is where the change actually happened." },
      { page: '/institutions', anchor: 'the-table',
        say: "At 121 of 567 institutions large enough to measure, most of the " +
             "master's degrees awarded go to people who are not Americans. " +
             "Compare any two here." },
      { page: '/rankings',
        say: "And the programs where the share is highest. These are not one " +
             "unusual year; they are the settled state of the program." }
    ],
    step3: [
      { page: '/immigration',
        say: "Step three: the degree becomes a visa. OPT authorizations grew " +
             "elevenfold since 2007, and the 2016 STEM OPT rule extended the " +
             "window to three years." },
      { page: '/pipeline',
        say: "The pipeline end to end: student visa, degree, work " +
             "authorization, petition. Each stage is a separate federal " +
             "series and this is them joined." },
      { page: '/filers',
        say: "And who files the petitions at the far end." }
    ],
    universities: [
      { page: '/rankings', anchor: 'institutions',
        say: "Every institution large enough to measure, ranked by the share " +
             "of its degrees going to non-residents. Switch the level: the " +
             "master's and the doctorate are different pictures." },
      { page: '/institutions', anchor: 'the-table',
        say: "And side by side. Pick any two institutions and compare them " +
             "on the same measures \u2014 enrollment, degrees, the " +
             "non-resident share at each level." },
      { page: '/universities/njit.html',
        say: "Then any single one in full. Every dissertation here links to " +
             "the record in NJIT's own repository, so a name can be checked " +
             "at the source rather than taken on trust. There are 106 of " +
             "these pages." }
    ],
    industries: [
      { page: '/industries', anchor: 'all',
        say: "Five industries the country calls strategic, side by side. The " +
             "question each one asks is the same: who earns the degree, and " +
             "who is allowed to do the work." },
      { page: '/industries/petroleum', anchor: 'levels',
        say: "Petroleum is the sharpest. 85% of American petroleum " +
             "engineering doctorates went to temporary-visa holders. Look at " +
             "the split by level \u2014 the bachelor's is mostly American " +
             "and the graduate degrees are not." },
      { page: '/industries/aerospace', anchor: 'levels',
        say: "Aerospace is where the gap between the degree and the work is " +
             "widest. Much of this is export-controlled: ITAR limits access " +
             "to a 'U.S. person', which a temporary-visa holder is not." },
      { page: '/industries', anchor: 'restrictions',
        say: "And here is what actually restricts each field. Three different " +
             "regimes, often confused \u2014 export control, access " +
             "authorization, and a security clearance are not the same thing." }
    ],
    h1b: [
      { page: '/bodyshops', anchor: 'test',
        say: "The firms whose business is supplying workers to other " +
             "companies, identified from the employers' own answers on their " +
             "own certified filings." },
      { page: '/public-sector-visas', anchor: 'state_agencies',
        say: "The public payroll. Every state-agency permanent-residence " +
             "filing in the country, published whole, with the worker's " +
             "citizenship and the federal case number." },
      { page: '/eor',
        say: "And the route nobody counts. An employer-of-record firm lets " +
             "an American company hire abroad with no visa at all, so every " +
             "visa figure on this site is a floor." },
      { page: '/data_requests', anchor: 'asks',
        say: "Which is why this page exists: what a federal office holds, or " +
             "once published, that would answer what these pages cannot." }
    ],
    states: [
      { page: '/states', anchor: 'published',
        say: "One page per state, built from the same national files. Sort " +
             "by any column \u2014 the non-resident share, the federal R&D, " +
             "the number of institutions." },
      { page: '/states/mt.html',
        say: "Montana, as an example of what a state page holds: every " +
             "degree-granting institution in the state, including the ones " +
             "awarding no graduate degrees at all." },
      { page: '/public-sector-visas', anchor: 'states',
        say: "And the labor-visa side, by state. Open a state to see its " +
             "departments and every filing with the nationality of the " +
             "person it was for." }
    ],
    international: [
      { page: '/china', anchor: 'us-chart-section',
        say: "China, outbound. The United States peaked and then declined " +
             "as a destination \u2014 the shift is visible in the series, " +
             "and it is not what most people assume." },
      { page: '/india', anchor: 'us-canada-chart-section',
        say: "India, the other large source, and a different shape. India " +
             "issues more H-1B visas than F-1 \u2014 more people arrive on " +
             "the work visa than on the student visa." },
      { page: '/canada',
        say: "And Canada, which matters twice over: as a destination that " +
             "competes with the US, and as a staging post. The largest single " +
             "citizenship among people whose nationality differs from their " +
             "country of birth is Canadian." }
    ],
    india: [
      { page: '/india', anchor: 'stem-amp-higher-education-pipeline',
        say: "India sends more students abroad than any country on earth, and " +
             "it is deliberate policy: a young population, more graduates than " +
             "the domestic economy absorbs, and remittances and influence " +
             "flowing back from those who settle." },
      { page: '/india', anchor: 'destinations-chart-section',
        say: "Where they go. The United States is the largest single " +
             "destination, and the competition for those students is between " +
             "countries, not between students \u2014 each one is courted." },
      { page: '/india', anchor: 'field-chart-section',
        say: "And into which fields. It is not spread evenly. The " +
             "concentration is in exactly the graduate programs where " +
             "Americans have lost the most ground \u2014 computing, " +
             "engineering, data." },
      { page: '/visa-schools', anchor: 'how-it-works',
        say: "Which is the American end of the same arrangement: the " +
             "institutions built to receive that demand, funded by American " +
             "taxpayers, selling a degree whose value is the work visa " +
             "attached to it." }
    ],
    china: [
      { page: '/china', anchor: 'united-states-peak-and-decline',
        say: "China is the other half, and a different story. The United " +
             "States peaked as a destination and then declined \u2014 which " +
             "is not what most people assume, and the series shows it " +
             "plainly." },
      { page: '/china', anchor: 'sevis-chart-section',
        say: "The active student records give the live picture rather than " +
             "the visa count. A visa is stamped once; a record says who is " +
             "actually here." },
      { page: '/china', anchor: 'global-diversification',
        say: "And where the flow went instead. China diversified across " +
             "destinations rather than reducing the outflow. The students " +
             "did not stop leaving; they stopped concentrating here." },
      { page: '/industries/petroleum', anchor: 'levels',
        say: "Why an American should care which fields receive them. In " +
             "strategic fields the graduate pipeline is now overwhelmingly " +
             "non-resident \u2014 85% in petroleum engineering \u2014 and " +
             "much of the work those degrees lead to is restricted by " +
             "citizenship." }
    ],
    canada: [
      { page: '/canada', anchor: 'total-chart-section',
        say: "Canada is the competitor that matters most, because it offers " +
             "the thing the American system also sells: a degree with a " +
             "settlement path attached." },
      { page: '/canada', anchor: 'countries-chart-section',
        say: "And it draws from the same two countries. When Canada tightens " +
             "or loosens, the American numbers move \u2014 these are one " +
             "market with two doors." },
      { page: '/public-sector-visas', anchor: 'anomalies',
        say: "Canada also shows up inside the American record in a way few " +
             "notice. Among workers whose citizenship differs from their " +
             "country of birth, the largest single citizenship is Canadian: " +
             "a staging post, not a discrepancy." }
    ],
    uk: [
      { page: '/uk', anchor: 'enrollment-chart-section',
        say: "The United Kingdom runs the same model and says so more " +
             "openly: international tuition cross-subsidises the domestic " +
             "university sector." },
      { page: '/uk', anchor: 'visa-chart-section',
        say: "And the visa side. Watch what happens to enrollment when the " +
             "post-study work offer changes. The students follow the work " +
             "authorization, not the teaching." },
      { page: '/expansion',
        say: "Which is the American master's story in another country's " +
             "data. The degree is the product; the right to stay and work is " +
             "what gives it a price." }
    ],
    eu: [
      { page: '/eu', anchor: 'germany-total-chart-section',
        say: "Germany is the counter-example worth knowing. It educates large " +
             "numbers of international students and charges them almost " +
             "nothing \u2014 there is no tuition business to protect." },
      { page: '/eu', anchor: 'india-china-chart-section',
        say: "It draws from the same two source countries, so the demand is " +
             "the same. What differs is what the host country is selling." },
      { page: '/eu', anchor: 'top-countries-chart-section',
        say: "The lesson for an American reader is that none of this is " +
             "inevitable. A country can admit foreign students without " +
             "turning its graduate programs into a product sold to them." }
    ],
    mexico: [
      { page: '/mexico', anchor: 'us-trend-chart-section',
        say: "Mexico is the nearest large neighbour and sends strikingly few " +
             "students to American graduate programs \u2014 far fewer than " +
             "distance or population would predict." },
      { page: '/mexico', anchor: 'destinations-chart-section',
        say: "Where they go instead, and in what numbers. The flow this " +
             "system is built around is not a proximity effect." },
      { page: '/public-sector-visas', anchor: 'school_districts',
        say: "Mexican citizens do appear in the American record, heavily, " +
             "but in a different place: bilingual teaching posts in public " +
             "school districts, sponsored for permanent residence." }
    ],
    vwp: [
      { page: '/vwp', anchor: 'naturalizations',
        say: "The Visa Waiver Program covers the countries whose citizens " +
             "need no visa to visit. It is the comparison case: what the " +
             "flow looks like without a visa pipeline attached to it." },
      { page: '/vwp', anchor: 'nat-top20-chart-section',
        say: "Naturalisations by country of origin. Set this beside the " +
             "student-visa countries and the difference in route is the " +
             "whole point." },
      { page: '/data_requests', anchor: 'asks',
        say: "And the limit on all of it: these series are published by " +
             "citizenship, never by country of birth, so a naturalised " +
             "citizen of one country born in another is invisible in every " +
             "one of them." }
    ],
    explore: [
      { page: '/query', anchor: 'data-query',
        say: "Everything on this site is built from these tables, and you " +
             "can query them yourself. They load into your browser \u2014 " +
             "nothing is sent to a server." },
      { page: '/query', anchor: 'exampleQueries',
        say: "Start with the grey buttons under Run. They are worked " +
             "examples for whichever table is selected, and the ones marked " +
             "'join' cross two tables \u2014 which employer sits in which " +
             "industry, which public employers file both a green card and " +
             "an H-1B." },
      { page: '/live',
        say: "The live dashboard is the same data, spoken. Ask it a " +
             "question out loud and it draws the answer, or click a board " +
             "to pull one up without speaking." },
      { page: '/data_requests', anchor: 'no-requirement',
        say: "And this is where the record stops. No university is " +
             "required to publish a dissertation or even to list the ones " +
             "it awarded, so everything you just queried is a floor." }
    ],
    reference: [
      { page: '/data_sources', anchor: 'federal',
        say: "Every federal source this site reads, named, with what each " +
             "one can and cannot support." },
      { page: '/methodology', anchor: 'institutional-repositories',
        say: "And every institutional repository the harvest read \u2014 99 " +
             "of 106 with a direct link, so any dissertation can be checked " +
             "at its source." },
      { page: '/data_requests', anchor: 'asks',
        say: "Then where the record stops. Twenty-four asks, most needing no " +
             "new collection at all." },
      { page: '/query',
        say: "And the data itself. A SQL console over the published tables, " +
             "running in your browser, with sample queries to start from." }
    ],
    step4: [
      { page: '/visa-schools', anchor: 'how-it-works',
        say: "Step four: who profits. At some institutions the graduate " +
             "program is the product and the work visa is what it sells. " +
             "Here is how it works at one school, from its own filings." },
      { page: '/bodyshops', anchor: 'test',
        say: "On the hiring side, firms whose business is supplying workers " +
             "to other companies \u2014 identified by the employers' own " +
             "answers on their own certified filings." },
      { page: '/public-sector-visas', anchor: 'state_agencies',
        say: "And the public payroll itself: every state-agency " +
             "permanent-residence filing in the country, with the worker's " +
             "citizenship and the federal case number." },
      { page: '/postdocs', anchor: 'the-finding',
        say: "And the job the doctorate leads to. 58.3% of postdoctoral " +
             "appointees in this country hold a temporary visa, so " +
             "Americans are a minority of the people doing postdoctoral " +
             "research here \u2014 in a workforce where about half the " +
             "posts are paid for by the federal government." }
    ]
  };

  var activeTrack = 'full';

  function stopsFor(name) {
    var t = TRACKS[name];
    return (t && t.length) ? t : STOPS;
  }


  var STOPS = [
    {
      page: '/',
      anchor: 'finding',
      say: "Start with what this costs. Federal research funding runs to " +
           "roughly $875,000 for every STEM research doctorate awarded in the " +
           "United States. That is public money, and it is why the rest of " +
           "this matters."
    },
    {
      page: '/',
      anchor: 'cases',
      selector: '#cases-table',
      say: "These departments are the finding. In each one, seven of every ten " +
           "research doctorates or more went to students on temporary visas \u2014 " +
           "and not in one unusual year, but in at least six of the last eight " +
           "measured."
    },
    {
      page: '/',
      anchor: 'public-cost',
      selector: '#cost-table',
      say: "Here is the federal money beside the outcome, institution by " +
           "institution. Doctoral students are who that money largely pays " +
           "for. Master's students mostly pay tuition, so the two are never " +
           "mixed."
    },
    {
      page: '/overview',
      anchor: 'the-clearest-cases',
      selector: '.case-links',
      say: "Three cases where the pattern is not subtle. Each one opens onto " +
           "the page that shows its workings, and we are going to all three."
    },
    {
      page: '/universities/njit.html',
      say: "New Jersey Institute of Technology, a public university in Newark. " +
           "Around seven in ten of its STEM doctorates go to non-residents. " +
           "Every name on this page links to the university's own repository, " +
           "so any single record can be checked."
    },
    {
      page: '/industries/petroleum.html',
      anchor: 'levels',
      say: "Petroleum engineering. Across the whole window, 85% of American " +
           "petroleum engineering doctorates went to people on temporary " +
           "visas. Look at the split by level: the bachelor's is mostly " +
           "American and the graduate degrees are not."
    },
    {
      page: '/institutions',
      anchor: 'the-table',
      say: "The doctorate is the headline and the master's is the money. " +
           "Compare any two institutions here on the share of graduate " +
           "degrees going to non-residents."
    },
    {
      page: '/visa-schools',
      anchor: 'how-it-works',
      say: "What a degree is for. At some institutions the graduate program " +
           "is the product and the work visa is what it sells. This shows how " +
           "it works at one school, from its own filings."
    },
    {
      page: '/bodyshops',
      anchor: 'test',
      say: "Who hires on the far side. These firms supply workers to other " +
           "companies, and the test that identifies them uses the employers' " +
           "own answers on their own certified filings \u2014 not anyone's " +
           "opinion about a company."
    },
    {
      page: '/public-sector-visas',
      anchor: 'state_agencies',
      say: "It reaches the public payroll too. Every state-agency " +
           "permanent-residence filing in the country is published here in " +
           "full, with the worker's citizenship and the federal case number. " +
           "Open a state to see its departments."
    },
      { page: '/postdocs', anchor: 'the-finding',
        say: "And the job the doctorate leads to. 58.3% of postdoctoral " +
             "appointees in this country hold a temporary visa, so " +
             "Americans are a minority of the people doing postdoctoral " +
             "research here \u2014 in a workforce where about half the " +
             "posts are paid for by the federal government." },
    {
      page: '/data_requests',
      anchor: 'asks',
      say: "And here is where the record stops. These are the things a federal " +
           "office holds, or once published, that would answer a question this " +
           "site cannot. Most need no new collection at all."
    },
    {
      page: '/',
      anchor: 'who-pays',
      say: "That is the tour. Everything you saw is built from federal data at " +
           "render time \u2014 no figure is typed onto a page. Ask me about any " +
           "of it, or about a university, a field or a state by name."
    }
  ];

  function load() {
    try {
      var raw = sessionStorage.getItem(KEY);
      var st = raw ? JSON.parse(raw) : null;
      // THE TRACK HAS TO SURVIVE NAVIGATION TOO. Position was persisted and
      // the track was not, so starting the step-2 tour and moving to its
      // first page silently reverted to the full twelve-stop tour: the
      // reader asked for three stops about the master's and got the whole
      // argument, beginning somewhere else.
      if (st && st.track) activeTrack = st.track;
      return st;
    } catch (e) { return null; }
  }

  function save(state) {
    try {
      if (state) {
        state.track = state.track || activeTrack;
        sessionStorage.setItem(KEY, JSON.stringify(state));
      }
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


  /* A TOUR IS A LINK.
   *
   * /overview?tour=step2 starts the master's tour on arrival. That makes a
   * tour something the assistant can hand a reader -- "here, this walks you
   * through it" -- without any new protocol between the chat and this file,
   * and something anyone can put in an email.
   *
   * The parameter is removed from the address bar once consumed, so a reload
   * does not restart the tour the reader just finished, and so the URL they
   * copy afterwards is the page rather than the tour.
   */
  function trackFromUrl() {
    var m = /[?&]tour=([a-z0-9_]+)/i.exec(location.search)
         || /[#&]tour=([a-z0-9_]+)/i.exec(location.hash);
    return m ? m[1] : null;
  }

  function consumeUrlTrack() {
    var want = trackFromUrl();
    if (!want || TRACKS[want] === undefined) return null;
    try {
      var clean = location.pathname
        + location.search.replace(/([?&])tour=[a-z0-9_]+&?/i, '$1').replace(/[?&]$/, '')
        + location.hash.replace(/([#&])tour=[a-z0-9_]+&?/i, '$1').replace(/[#&]$/, '');
      history.replaceState(null, '', clean);
    } catch (e) { /* a failed tidy-up must not stop the tour */ }
    return want;
  }

  window.PhdTourAutostart = consumeUrlTrack;

  window.PhdTour = {
    stops: STOPS,
    tracks: TRACKS,
    get length() { return stopsFor(activeTrack).length; },
    setTrack: function (name) {
      var want = TRACKS[name] !== undefined ? name : 'full';
      // Choosing a track starts a new tour, so any tour already in progress
      // is cleared first. Without this, load() restored the previous
      // track from sessionStorage and the new choice was overwritten before
      // the first stop rendered.
      if (want !== activeTrack) save(null);
      activeTrack = want;
      return activeTrack;
    },
    track: function () { return activeTrack; },
    get: function (i) { return stopsFor(activeTrack)[i] || null; },
    state: load,
    save: save,
    samePage: samePage,
    clear: function () { save(null); },
    start: function () { save({ i: 0, started: true, track: activeTrack }); },
    advance: function () {
      var st = load() || { i: 0 };
      st.i = (st.i || 0) + 1;
      var list = stopsFor(activeTrack);
      if (st.i >= list.length) { save(null); return null; }
      save(st);
      // stopsFor(activeTrack), NOT STOPS. Returning from the default list
      // meant pressing Next on any section tour jumped into the middle of
      // the full twelve-stop tour: the bounds were checked against the
      // track and the stop was read from somewhere else.
      return list[st.i];
    },
    retreat: function () {
      var st = load() || { i: 0 };
      // At the first stop, going back does nothing rather than ending the
      // tour. Ending on a back-press would be a trap: the reader asked to
      // re-read something, not to leave.
      if ((st.i || 0) <= 0) return null;
      st.i -= 1;
      save(st);
      return stopsFor(activeTrack)[st.i];
    }
  };
})();
