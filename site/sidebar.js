// Shared sidebar + footer for all pages
(function() {
  const currentPath = location.pathname;
  // "/" is the homepage. This fell back to 'stem.html', left over from when
  // that was the landing page; once stem.html became a drawer page the site's
  // front door lost its sidebar and showed a corner hamburger instead -- at
  // "/" only, which is the URL every shared link lands on, while /index.html
  // looked fine and was the one every check loaded.
  const currentPage = currentPath.split('/').pop() || 'index.html';
  // The full path, normalised the way a nav href is: no leading slash, no
  // .html, no trailing slash. "/industries/grid.html" and "/industries/grid"
  // both become "industries/grid".
  const currentKey = (currentPath.replace(/^\//, '').replace(/\.html$/, '')
    .replace(/\/$/, '')) || 'index';
  // Detect if we're on a university page like /universities/mit.html
  const uniMatch = currentPath.match(/\/universities\/([a-z0-9_]+)\.html/);
  const currentUniKey = uniMatch ? uniMatch[1] : null;
  // A reader who arrived at one university -- /universities/njit.html, or
  // /stem.html#njit, which is the same destination reached through the STEM
  // table -- came in from outside, usually on a shared link, and has seen
  // nothing else on the site. A compact rail is right for someone working
  // through the argument in order and wrong for someone who landed in the
  // middle of it, so these pages open the whole rail.
  const uniHash = /^#[a-z0-9_]{2,}$/i.test(location.hash || '')
    && /^(stem|non_stem)$/.test(currentKey);
  const ARRIVED_AT_A_UNIVERSITY = Boolean(currentUniKey) || uniHash;

  // Pages where sidebar should be a floating drawer (closed by default,
  // doesn't take horizontal space). Used for pages whose own layout
  // already pins a workspace-specific left panel.
  // stem.html and non_stem.html pin their own <nav id="sidebar"> of 220px,
  // which lists the universities -- navigation this one cannot replace. They
  // get the shared sidebar as a drawer so the page has one pinned panel, not
  // two. presentation.html is a slide deck: a 220px column would squash every
  // slide, so it opens on demand too.
  // stem.html and non_stem.html used to pin their own 220px nav of
  // universities, so the shared sidebar was given to them as a drawer to
  // avoid two pinned panels. They no longer bake in a nav -- they use this
  // one -- so the drawer is gone and they look like every other page.
  const DRAWER_PAGES = new Set(['query.html', 'presentation.html']);
  const isDrawerMode = DRAWER_PAGES.has(currentPage);
  // On pages with their own workspace sidebar, also pin the hamburger
  // hint to the lower-left so it doesn't collide.
  const CORNER_PAGES = new Set(['query.html', 'stem.html', 'non_stem.html']);
  const isCornerHint = CORNER_PAGES.has(currentPage);

  // COLLAPSE STATE IS NOT PERSISTED ACROSS NAVIGATIONS, deliberately.
  //
  // It used to be, in localStorage. The effect was cumulative: open a section
  // to look at something, and it stayed open on every page afterwards. Open
  // three over a few minutes and the rail arrived with four sections and forty
  // items unfolded, which is the problem the sections exist to solve. Worse,
  // the saved set then OVERRODE the default on every later visit, so the rail
  // a reader saw depended on what they had clicked days earlier and no two
  // readers saw the same thing.
  //
  // The rule now is one sentence: every page opens the section that holds it,
  // and nothing else. Expanding a section still works and still sticks while
  // you are on that page -- it just does not follow you to the next one.
  let collapsedSections = new Set();
  let states = [];
  let statesOpen = false;
  //: The current page's own section list, open by default: a reader
  //: who arrived here usually wants to see what is on the page.
  let anchorsShut = false;
  const UNIVERSITIES_AFTER = '4 · Who profits';

  // ONE BUCKET, TWO SITES.
  //
  // h1b.andy-barr.com and phd-demographics.andy-barr.com are aliases on the
  // same CloudFront distribution over the same bucket, so every page is
  // reachable from both. They are different subjects with different readers:
  // a staffer reading visa filings does not need the doctorate pipeline in
  // the left rail, and the pipeline reader does not need petrol stations.
  //
  // So the host picks the navigation. Pages are shared; the rail is not.
  const H1B_HOST = /^h-?1b\./i.test(location.hostname);

  const H1B_SECTIONS = [
    { title: 'Start here', items: [
      { href: '/h1b', label: 'The H-1B Explorer', anchors: [
        { hash: 'cases', label: 'The filings nobody expects' },
        { hash: 'reports', label: 'The reports' },
        { hash: 'method', label: 'How to read any of this' },
      ]},
    ]},
    { title: 'The public payroll', items: [
      { href: '/public-sector-visas', label: 'Who The Public Sector Sponsors', anchors: [
        { hash: 'sectors', label: 'The three sectors' },
        { hash: 'state_agencies', label: 'State agencies' },
        { hash: 'school_districts', label: 'School districts' },
        { hash: 'universities', label: 'Universities' },
        { hash: 'states', label: 'By state' },
        { hash: 'every-agency-filing', label: 'Every agency filing' },
        { hash: 'anomalies', label: 'The filings that do not fit' },
      ]},
      { href: '/state-agencies', label: 'H-1B in State Government' },
      { href: '/postdocs', label: 'Postdocs & Citizenship' },
    ]},
    { title: 'Who files', items: [
      { href: '/bodyshops', label: 'The Visa Body Shops' },
      { href: '/filers', label: 'Who Files The Visas' },
      { href: '/eor', label: 'Hiring With No Visa' },
    ]},
    { title: 'Reference', items: [
      { href: '/data_requests', label: 'Data Asks' },
      { href: '/data_sources', label: 'Data Sources & Methodology' },
      { href: '/query', label: 'Data Query (SQL)' },
      { href: '/security', label: 'The Frozen Case Register' },
    ]},
    { title: 'Elsewhere', items: [
      { href: 'https://phd-demographics.andy-barr.com/',
        label: 'STEM Demographics \u2197' },
    ]},
  ];

  const STEM_SECTIONS = [
    { title: 'Start here', items: [
      { href: '/overview', label: 'National Overview' },
      { href: '/stem', label: 'National Charts', anchors: [
        { hash: 'nat-phd', label: 'STEM PhD by Citizenship' },
        { hash: 'nat-opt', label: 'OPT Pipeline' },
        { hash: 'nat-funding', label: 'R&D vs American PhDs' },
        { hash: 'nat-total-pipeline', label: 'Total Foreign Work Auth' },
        { hash: 'nat-visas', label: 'US Visa Issuances' },
        { hash: 'nat-visa-calc', label: 'Cumulative Visa Calculator' },
        { hash: 'nat-fields', label: 'NRA by STEM Field' },
      ]},
      { href: '/presentation', label: 'Presentation' },
    ]},
    { title: '1 · The public pays for the doctorate', items: [
      { href: '/ipeds_dashboard', label: 'IPEDS PhD Dashboard', anchors: [
        { hash: 'panel-trends', label: 'Trends' },
        { hash: 'panel-demographics', label: 'Demographics' },
        { hash: 'panel-institutions', label: 'Institutions' },
        { hash: 'panel-states', label: 'States' },
      ]},
      { href: '/distributions', label: 'Distributions', anchors: [
        { hash: 'national', label: 'National, then and now' },
        { hash: 'programmes', label: 'By programme' },
        { hash: 'universities', label: 'Inside one university' },
      ]},
      { href: '/non_stem', label: 'Non-STEM Lists' },
      { href: '/rankings', label: 'Where The Share Is Highest', anchors: [
        { hash: 'institutions', label: 'Institutions' },
        { hash: 'programmes', label: 'Programmes' },
        { hash: 'contrast', label: 'Two programmes, one university' },
      ]},
    ]},
    { title: "2 · The master's as a moneymaker", items: [
      { href: '/expansion', label: "The Master's Expansion", anchors: [
        { hash: 'volume', label: 'In absolute numbers' },
        { hash: 'share', label: 'As a proportion' },
        { hash: 'visas', label: 'The visas' },
        { hash: 'billed', label: 'What it is worth' },
      ]},
      { href: '/institutions', label: 'Compare Institutions', anchors: [
        { hash: 'the-table', label: 'The table' },
        { hash: 'what-a-row-does-not-mean', label: 'What a row does not mean' },
      ]},
      { href: '/rankings', label: 'Where The Share Is Highest', anchors: [
        { hash: 'institutions', label: 'Institutions' },
        { hash: 'programmes', label: 'Programmes' },
        { hash: 'contrast', label: 'Two programmes, one university' },
      ]},
    ]},
    { title: '3 · The degree becomes a visa', items: [
      { href: '/immigration', label: 'Immigration Pipeline' },
      { href: '/pipeline', label: 'Pipeline Analysis', anchors: [
        { hash: 'pipeline-chart-section', label: 'A. Full Pipeline' },
        { hash: 'f1-diverge-chart-section', label: 'B. China vs India (F-1)' },
        { hash: 'h1b-diverge-chart-section', label: 'B. China vs India (H-1B)' },
        { hash: 'scatter-chart-section', label: 'C. Stay vs Refusal' },
        { hash: 'eb-chart-section', label: 'D. EB Bottleneck' },
        { hash: 'indexed-chart-section', label: 'E. Pipeline Growth' },
        { hash: 'heatmap-chart-section', label: 'F. Country × State' },
      ]},
      { href: '/medical', label: 'Medical Immigration', anchors: [
        { hash: 'history-section', label: 'Enrollment 1980-2025' },
        { hash: 'recent-section', label: 'Apps vs Matric vs Grad' },
        { hash: 'daca-section', label: 'DACA Med Students' },
        { hash: 'origins-section', label: 'Asian-Origin Matriculants' },
        { hash: 'evsp-yearly-section', label: 'J-1 Physicians in GME' },
        { hash: 'evsp-countries-section', label: 'J-1 Countries of Origin' },
        { hash: 'evsp-states-section', label: 'J-1 Host States' },
        { hash: 'evsp-specialties-section', label: 'J-1 Specialties' },
        { hash: 'nrmp-section', label: 'NRMP Match: IMGs' },
        { hash: 'nrmp-rate-section', label: 'NRMP IMG Match Rate' },
      ]},
      { href: '/workforce', label: 'STEM Workforce (SDR)', anchors: [
        { hash: 'by-field-section', label: 'Foreign-Born by Field' },
        { hash: 'citizenship-section', label: 'Citizenship Composition' },
        { hash: 'totals-section', label: 'Totals by Field' },
        { hash: 'industry-section', label: 'By Major Industry' },
      ]},
      { href: '/filers', label: 'Who Files The Visas' },
    ]},
    { title: '4 · Who profits', items: [
      { href: '/name-lists', label: 'Thesis & Dissertation Lists', anchors: [
        { hash: 'open', label: 'Open the lists' },
        { hash: 'how', label: 'How to read one' },
        { hash: 'largest', label: 'The largest collections' },
        { hash: 'highest-nra', label: 'Highest non-resident share' },
        { hash: 'limits', label: 'What this record is not' },
      ]},
      { href: '/postdocs', label: 'Postdocs & Citizenship', anchors: [
        { hash: 'the-finding', label: 'Americans are a minority' },
        { hash: 'the-nine', label: 'The nine named universities' },
        { hash: 'ranking', label: 'Highest shares' },
        { hash: 'federal', label: 'Who pays for the posts' },
        { hash: 'method', label: 'Method and limits' },
      ]},
      { href: '/visa-schools', label: 'Schools That Launder Visas', anchors: [
        { hash: 'how-it-works', label: 'How it works, at one school' },
        { hash: 'schools', label: 'Every school' },
        { hash: 'visas', label: 'When one visa tightens' },
        { hash: 'cheaper', label: 'Why an OPT hire costs less' },
        { hash: 'tn', label: 'TN is a different path' },
        { hash: 'method', label: 'Method and limits' },
      ]},
      { href: '/bodyshops', label: 'The Visa Body Shops', anchors: [
        { hash: 'test', label: 'What counts as a body shop' },
        { hash: 'firms', label: 'The firms that meet the test' },
        { hash: 'wages', label: 'Same job title, two prices' },
        { hash: 'trend', label: 'Four years of filings' },
        { hash: 'barred', label: 'Who has been barred' },
        { hash: 'concentration', label: 'How concentrated it is' },
        { hash: 'method', label: 'Method and limits' },
      ]},
      { href: '/usaid', label: 'Scholarships & NGOs' },
      { href: '/filers', label: 'Who Files The Visas' },
    ]},
    { title: 'Critical industries', items: [
      { href: '/industries', label: 'All Five, Compared', anchors: [
        { hash: 'grid', label: 'Who runs it, once built' },
        { hash: 'all', label: 'Side by side' },
        { hash: 'restrictions', label: 'What restricts the work' },
        { hash: 'method', label: 'Method and limits' },
      ]},
      { href: '/industries/grid', label: 'The Grid Workforce', anchors: [
        { hash: 'scarcest', label: 'The smallest pipelines' },
        { hash: 'programmes', label: 'Every programme' },
      ]},
      { href: '/industries/ai', label: 'Artificial Intelligence' },
      { href: '/industries/petroleum', label: 'Petroleum' },
      { href: '/industries/mining', label: 'Mining & Metals' },
      { href: '/industries/battery', label: 'Battery Technology' },
      { href: '/industries/aerospace', label: 'Aerospace' },
      { href: '/industries/nuclear', label: 'Nuclear' },
    ]},
    { title: 'H-1B and labor visas', items: [
      { href: '/bodyshops', label: 'The Visa Body Shops' },
      { href: '/state-agencies', label: 'H-1B in State Government' },
      { href: '/public-sector-visas', label: 'Who The Public Sector Sponsors', anchors: [
        { hash: 'sectors', label: 'The three sectors' },
        { hash: 'state_agencies', label: 'State agencies' },
        { hash: 'school_districts', label: 'School districts' },
        { hash: 'universities', label: 'Universities' },
        { hash: 'anomalies', label: 'The filings that do not fit' },
        { hash: 'method', label: 'Method and limits' },
      ]},
      { href: '/filers', label: 'Who Files The Visas' },
      { href: '/eor', label: 'Hiring With No Visa' },
      { href: '/security', label: 'The Frozen Case Register' },
    ]},
    { title: 'States', items: [
      { href: '/states', label: 'All State Profiles' },
    ]},
    { title: 'Explore', items: [
      { href: '/query', label: 'Data Query (SQL)' },
      { href: '/live', label: 'Live Dashboard (Experimental)' },
    ]},
    { title: 'International', items: [
      { href: '/india', label: 'India (Outbound)', anchors: [
        { hash: 'us-canada-chart-section', label: 'US vs Canada' },
        { hash: 'destinations-chart-section', label: 'Top Destinations' },
        { hash: 'field-chart-section', label: 'US Field of Study' },
        { hash: 'level-chart-section', label: 'US Study Level' },
        { hash: 'medical-dest-chart-section', label: 'Medical Destinations' },
        { hash: 'fmge-chart-section', label: 'FMGE Pass Rate' },
      ]},
      { href: '/china', label: 'China (Outbound)', anchors: [
        { hash: 'us-chart-section', label: 'Students in the US' },
        { hash: 'sevis-chart-section', label: 'SEVIS Active Records' },
        { hash: 'vs-india-chart-section', label: 'China vs India' },
        { hash: 'dest-trend-chart-section', label: 'US vs UK vs Australia' },
        { hash: 'canada-chart-section', label: 'Canada Study Permits' },
        { hash: 'return-chart-section', label: 'Cumulative Return Rate' },
      ]},
      { href: '/canada', label: 'Canada', anchors: [
        { hash: 'total-chart-section', label: 'Total International' },
        { hash: 'countries-chart-section', label: 'Top Source Countries' },
        { hash: 'flow-chart-section', label: 'New Study Permits' },
        { hash: 'study-level-section', label: 'Permits by Level' },
        { hash: 'pgwp-section', label: 'PGWP by Province' },
        { hash: 'imp-section', label: 'IMP Work Permit Stock' },
      ]},
      { href: '/uk', label: 'United Kingdom', anchors: [
        { hash: 'enrollment-chart-section', label: 'Enrollment' },
        { hash: 'visa-chart-section', label: 'Student Visa Grants' },
        { hash: 'grad-route-chart-section', label: 'Graduate Route' },
        { hash: 'ho-level-section', label: 'Visas by Course Level' },
        { hash: 'ho-region-section', label: 'Visas by World Region' },
      ]},
      { href: '/eu', label: 'EU & Germany', anchors: [
        { hash: 'germany-total-chart-section', label: 'Students in Germany' },
        { hash: 'india-china-chart-section', label: 'India vs China' },
        { hash: 'eu-destinations-chart-section', label: 'EU Destinations' },
        { hash: 'eu-in-us-chart-section', label: 'EU Students in the US' },
      ]},
      { href: '/mexico', label: 'Mexico', anchors: [
        { hash: 'us-trend-chart-section', label: 'Mexicans in the US' },
        { hash: 'destinations-chart-section', label: 'All Destinations' },
        { hash: 'level-chart-section', label: 'Study Level' },
        { hash: 'states-chart-section', label: 'Top US States' },
      ]},
      { href: '/vwp', label: 'Visa Waiver Program', anchors: [
        { hash: 'nat-top20-chart-section', label: 'Top 20 Naturalizations' },
        { hash: 'vwp-nat-chart-section', label: 'VWP Naturalizations' },
        { hash: 'overstay-chart-section', label: 'Overstay Rates' },
        { hash: 'sevis-chart-section', label: 'VWP Students in the US' },
        { hash: 'lpr-chart-section', label: 'Green Card Grants' },
        { hash: 'vwp-table-section', label: 'All 41 Countries' },
      ]},
    ]},
    { title: 'Reference', items: [
      { href: '/contents', label: 'Table of Contents' },
      { href: '/query', label: 'Data Query (SQL)' },
      { href: '/data_sources', label: 'Data Sources & Methodology' },
      { href: '/briefing', label: 'The Briefing (PDF)' },
      { href: '/executive-brief.pdf', label: 'Executive Brief (4pp)' },
      { href: '/data_requests', label: 'Data Asks', anchors: [
        { hash: 'how-to-read', label: 'How to read an ask' },
        { hash: 'asks', label: 'The asks' },
        { hash: 'method', label: 'How this page is built' },
      ]},
      { href: '/ask', label: 'What You Can Ask' },
      { href: '/methodology', label: 'Dataset Catalogue' },
      { href: '/quality', label: 'Data Quality' },
      { href: '/implementation', label: 'Implementation' },
      { href: '/department_reports', label: 'Department Reports' },
      { href: '/stem_dashboard', label: 'Name Classification' },
      { href: '/catalog.json', label: 'Data Catalog (JSON)' },
      { href: '/llms.txt', label: 'WebMCP Integration' },
    ]},
    { title: 'About', items: [
      { href: '/about', label: 'About this Project' },
      { href: '/submit', label: 'Tip Line' },
      { href: 'https://andy-barr.com', label: 'Personal Webpage', external: true },
      { href: 'https://buymeacoffee.com/andybarr', label: 'Support this Page', external: true },
    ]},
  ];

  // Which tour belongs to which section. A section with no entry gets no
  // button: a tour is only offered where one actually exists, so the rail
  // never promises a walk it cannot give.
  const SECTION_TOURS = {
    'Start here': 'full',
    '1 \u00b7 The public pays for the doctorate': 'step1',
    "2 \u00b7 The master's as a moneymaker": 'step2',
    '3 \u00b7 The degree becomes a visa': 'step3',
    '4 \u00b7 Who profits': 'step4',
    'Universities': 'universities',
    'Critical industries': 'industries',
    'H-1B and labor visas': 'h1b',
    'States': 'states',
    'International': 'international',
    'Reference': 'reference',
    'The public payroll': 'h1b',
    'Who files': 'h1b',
  };

  /* "Show states" is a second level inside one group, not a group of its
     own: the States section holds one page plus 52 more that most readers
     never want open. It carries its own arrow so it reads as expandable,
     and it stays shut until asked. */
  function statesExpander() {
    if (!states.length) return '';
    const open = statesOpen ? ' open' : '';
    const items = states.map(st => {
      const href = '/states/' + st.key;
      const active = currentKey === ('states/' + st.key) ? ' active' : '';
      return `<a href="${href}" class="sb-item sb-sub${active}">${st.name}</a>`;
    }).join('');
    return `<div class="sb-sublist${open}">
        <button type="button" class="sb-item sb-expander" data-states-toggle
          aria-expanded="${statesOpen ? 'true' : 'false'}">
          <span class="sb-chev sb-chev-sm">\u25BC</span> Show states (${states.length})
        </button>
        <div class="sb-subcontent">${items}</div>
      </div>`;
  }

  /* Some individual pages have a tour of their own, not just the section.
     Each country tells a different story and a reader interested in India
     does not want the three-stop walk through all of them. Keyed by href so
     a renamed label cannot silently detach the tour from its page. */
  const ITEM_TOURS = {
    '/india': 'india', '/china': 'china', '/canada': 'canada',
    '/uk': 'uk', '/eu': 'eu', '/mexico': 'mexico', '/vwp': 'vwp',
  };

  function itemTourBadge(href) {
    const t = ITEM_TOURS[href];
    if (!t) return '';
    return ` <button type="button" class="sb-tour sb-tour-item"` +
           ` data-start-tour="${t}" title="Take a short guided tour"` +
           ` aria-label="Tour">tour</button>`;
  }

  function tourBadge(title) {
    const t = SECTION_TOURS[title];
    if (!t) return '';
    return ` <button type="button" class="sb-tour" data-start-tour="${t}"` +
           ` title="Take a short guided tour of this section"` +
           ` aria-label="Tour: ${title}">tour</button>`;
  }

  const sections = H1B_HOST ? H1B_SECTIONS : STEM_SECTIONS;

  let universities = [];

  // The state page being read, injected under the States hub so the rail
  // names it. Read from the page itself rather than from a table of 52, which
  // would have to be kept in step with PUBLISH in build_state_pages.py.
  function injectCurrentState() {
    const body = document.body;
    const name = body && body.dataset ? body.dataset.stateName : '';
    if (!name || !currentKey.startsWith('states/')) return;
    const group = sections.find(s => s.title === 'States');
    if (!group || group.items.some(i => i.href === '/' + currentKey)) return;
    group.items.push({ href: '/' + currentKey, label: name });
  }
  injectCurrentState();

  // Which sections hold the page being read. A page listed twice lights up in
  // both, which is the point of listing it twice.
  function sectionsWithCurrentPage() {
    // Must use the same comparison as the item rendering, or a page opens no
    // section at all: /industries/mining reduced to "mining", which matches no
    // entry, so every section stayed shut and the page the reader was on was
    // nowhere in the rail.
    return sections.filter(s => s.items.some(p => {
      const item = p.href.replace(/^\//, '').replace(/\.html$/, '');
      return item === currentKey || item === currentPage
             || currentKey.startsWith(item + '/');
    })).map(s => s.title);
  }

  // Runs ONCE per page load, never on a rerender: a reader who closes the
  // section they are reading should have it stay closed until they navigate.
  function openTheSectionBeingRead() {
    const open = new Set(sectionsWithCurrentPage());
    if (currentUniKey) open.add('Universities');
    if (ARRIVED_AT_A_UNIVERSITY) sections.forEach(s => open.add(s.title));
    // No fallback. A page that belongs to no section opens no section: the
    // rail should arrive compact and unfold only where the reader is. This
    // used to open "Start here", so the front page always landed with a
    // section already expanded.
    // The page being read is always reachable; everything else starts shut.
    open.forEach(t => collapsedSections.delete(t));
    sections.forEach(s => { if (!open.has(s.title)) collapsedSections.add(s.title); });
    if (!open.has('Universities')) collapsedSections.add('Universities');
    if (ARRIVED_AT_A_UNIVERSITY) collapsedSections.delete('Universities');
  }
  openTheSectionBeingRead();

  function buildGroups() {
    const currentHash = (location.hash || '').replace(/^#/, '');
    const groupHtml = sections.map(s => {
      const items = s.items.map(p => {
        const itemPath = p.href.replace(/^\//, '').replace(/\.html$/, '');
        const isCurrentPage = currentKey === itemPath || currentPage === itemPath
          || currentKey.startsWith(itemPath + '/');
        const active = isCurrentPage ? ' active' : '';
        const target = p.external ? ' target="_blank" rel="noopener"' : '';
        // A nav item with its own tour becomes a row: the link, then the
        // badge pushed right. Without the wrapper the badge would sit
        // inside the <a> and clicking the tour would also follow the link.
        const badge = itemTourBadge(p.href);
        let html = badge
          ? `<div class="sb-item-row"><a href="${p.href}"${target}` +
            ` class="sb-item${active}">${p.label}</a>${badge}</div>`
          : `<a href="${p.href}"${target} class="sb-item${active}">${p.label}</a>`;
        // Render in-page anchor sub-items only on the page they belong to,
        // and let the reader close them. On a page with many sections --
        // Canada has six -- the open list pushes everything below it out of
        // view, and there was no way to put it away.
        if (p.anchors && isCurrentPage) {
          const shut = anchorsShut ? ' collapsed' : '';
          const subs = p.anchors.map(a => {
            const subActive = currentHash === a.hash ? ' active' : '';
            return `<a href="#${a.hash}" class="sb-item sb-sub${subActive}">${a.label}</a>`;
          }).join('');
          html += `<div class="sb-anchors${shut}">
            <button type="button" class="sb-anchor-toggle" data-anchors-toggle
              aria-expanded="${anchorsShut ? 'false' : 'true'}"
              aria-label="${anchorsShut ? 'Show' : 'Hide'} sections on this page"
              ><span class="sb-chev sb-chev-sm">\u25BC</span> On this page</button>
            <div class="sb-anchor-list">${subs}</div>
          </div>`;
        }
        return html;
      }).join('');
      const collapsed = collapsedSections.has(s.title) ? ' collapsed' : '';
      return `<div class="sb-group${collapsed}" data-section="${s.title}">
        <div class="sb-section" role="button" tabindex="0"
          aria-expanded="${collapsed ? 'false' : 'true'}"
          onclick="window._sbToggle(this.parentElement, event)"><span class="sb-chev">\u25BC</span> ${s.title}${tourBadge(s.title)}</div>
        <div class="sb-content">${items}${
          s.title === 'States' ? statesExpander() : ''}</div>
      </div>`;
    });

    // Insert Universities group between National and International
    // Use stem.html#key so the full SPA (with toggles/panels) handles each university
    // Ranked by the figure each row shows. The list used to arrive in config
    // order -- 74.3%, 66.7%, 64.5%, 66.1%, 58.8%, 46.9%, 48.7% -- which reads
    // as a ranking and is not one. Ties share a rank (1, 2, 2, 4) and are
    // listed alphabetically; a school with no figure goes last, unranked.
    const ranked = universities.slice().sort((a, b) =>
      ((b.nra ?? -1) - (a.nra ?? -1)) || a.name.localeCompare(b.name));
    let prevNra = null, prevRank = 0;
    const uniItems = ranked.map((u, i) => {
      const hasNra = typeof u.nra === 'number';
      const rank = !hasNra ? '' : (u.nra === prevNra ? prevRank : i + 1);
      if (hasNra) { prevNra = u.nra; prevRank = rank; }
      const active = currentUniKey === u.key ? ' active' : '';
      const dot = u.has_opt ? '<span class="opt-dot"></span>' : '';
      // One decimal throughout, so a ranked column reads as one column: the
      // data holds 56 for Iowa State and 55.9 for the school below it.
      const nra = hasNra ? `${u.nra.toFixed(1)}%` : '\u2014';
      return `<a href="/stem.html#${u.key}" class="sb-item sb-uni${active}" data-key="${u.key}"><span class="sb-uni-rank">${rank}</span><span class="sb-uni-name">${u.name}</span><span class="sb-uni-meta"><span class="sb-uni-nra">${nra}</span>${dot}</span></a>`;
    }).join('');
    const uniCollapsed = collapsedSections.has('Universities') ? ' collapsed' : '';
    const uniGroup = `<div class="sb-group${uniCollapsed}" data-section="Universities">
        <div class="sb-section" role="button" tabindex="0"
          aria-expanded="${uniCollapsed ? 'false' : 'true'}"
          onclick="window._sbToggle(this.parentElement, event)"><span class="sb-chev">\u25BC</span> Universities (${universities.length})${tourBadge('Universities')}</div>
        <div class="sb-content"><p class="sb-note">Ranked by NRA share of STEM doctoral completions (IPEDS).</p>${uniItems}</div>
      </div>`;

    // Universities goes in by NAME, after the last step of the argument. This
    // used to be a hardcoded list of indices -- [0, uni, 1, 2] -- written when
    // there were three sections. A fourth was added later and simply fell off
    // the end: the About group, with the tip line in it, has never rendered on
    // any page. An index list cannot say that it is incomplete; a splice can.
    const out = sections.map((s, i) => groupHtml[i]);
    // The 106 university pages belong to the pipeline site. On the H-1B host
    // they are 106 rows of noise in a rail that is meant to be focused, and
    // the splice below would have put them there whatever the nav said,
    // because it is applied after the sections are chosen.
    if (!H1B_HOST) {
      const after = sections.findIndex(s => s.title === UNIVERSITIES_AFTER);
      out.splice(after < 0 ? out.length : after + 1, 0, uniGroup);
    }
    return out.join('');
  }

  // Global toggle handler that persists state
  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('[data-anchors-toggle]');
    if (a) {
      e.preventDefault();
      e.stopPropagation();
      anchorsShut = !anchorsShut;
      try { sessionStorage.setItem('phd-anchors-shut', anchorsShut ? '1' : ''); }
      catch (err) { /* private mode */ }
      rerender();
      return;
    }
    const t = e.target.closest && e.target.closest('[data-states-toggle]');
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    statesOpen = !statesOpen;
    // Opening the list has to keep its own section open too. rerender()
    // rebuilds every group from collapsedSections, so without this the
    // States group closed itself the moment the list inside it expanded.
    if (statesOpen) collapsedSections.delete('States');
    try { sessionStorage.setItem('phd-states-open', statesOpen ? '1' : ''); }
    catch (err) { /* private mode: it just will not persist */ }
    rerender();
  });

  /* KEYBOARD ON THE RAIL.
   *
   * A focused section header behaves like a tree node: Right opens it, Left
   * closes it, Enter and Space toggle. Up and Down move between headers, so
   * the whole rail can be worked without a mouse.
   *
   * These only fire when a section header has focus, so they cannot collide
   * with the tour's own arrow keys -- the tour reads arrows at the document
   * level while it is running, and the reader is not focused on the rail
   * then.
   */
  function sectionHeaders() {
    return Array.prototype.slice.call(
      document.querySelectorAll('#shared-sidebar .sb-section'));
  }

  function setGroupOpen(groupEl, open) {
    const section = groupEl.dataset.section;
    if (!section) return;
    const isCollapsed = groupEl.classList.contains('collapsed');
    if (open === !isCollapsed) return;           // already in that state
    window._sbToggle(groupEl, null);
  }

  document.addEventListener('keydown', function (e) {
    // The on-this-page toggle takes the same keys as a section header.
    const atog = e.target && e.target.closest
      ? e.target.closest('[data-anchors-toggle]') : null;
    if (atog) {
      if (e.key === 'ArrowRight' && anchorsShut) { e.preventDefault(); atog.click(); }
      if (e.key === 'ArrowLeft' && !anchorsShut) { e.preventDefault(); atog.click(); }
      return;
    }
    const head = e.target && e.target.closest
      ? e.target.closest('#shared-sidebar .sb-section') : null;
    if (!head) return;
    const group = head.parentElement;
    const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp',
                  'Enter', ' '];
    if (keys.indexOf(e.key) === -1) return;
    e.preventDefault();
    if (e.key === 'ArrowRight') { setGroupOpen(group, true); return; }
    if (e.key === 'ArrowLeft')  { setGroupOpen(group, false); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      window._sbToggle(group, null);
      return;
    }
    const all = sectionHeaders();
    const i = all.indexOf(head);
    const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
    if (all[next]) all[next].focus();
  });

  window._sbToggle = function(groupEl, ev) {
    // The tour badge sits inside the section header, so its click bubbles
    // here. The badge has its own job and must not also collapse the
    // section it belongs to. The event is passed explicitly from the inline
    // handler; window.event is not reliable.
    if (ev && ev.target && ev.target.classList &&
        ev.target.classList.contains('sb-tour')) return;
    const section = groupEl.dataset.section;
    if (!section) return;
    groupEl.classList.toggle('collapsed');
    if (groupEl.classList.contains('collapsed')) {
      collapsedSections.add(section);
    } else {
      collapsedSections.delete(section);
    }
    // Not written to storage. The in-memory set is what rerender() reads, so
    // the toggle holds for this page and is forgotten on the next.
  };

  function rerender() {
    const body = document.querySelector('#shared-sidebar .sb-body');
    if (body) body.innerHTML = buildGroups();
  }

  const html = `
    <div class="sb-header">
      <div class="sb-brand">
        <a href="${H1B_HOST ? '/h1b' : '/'}" class="sb-logo" data-track="nav.home-brand">${H1B_HOST ? 'H-1B Explorer' : 'STEM Demographics'}</a>
        <span class="sb-tagline">${H1B_HOST ? 'What the visa files actually say' : 'American academia trends'}</span>
      </div>
      <button type="button" class="sb-hide" aria-controls="shared-sidebar"
        aria-label="Hide the sidebar" title="Hide the sidebar" data-track="nav.sidebar-hide">\u00AB</button>
    </div>
    <div class="sb-body">${buildGroups()}</div>
    <div class="sb-footer-links">
      <a href="${H1B_HOST ? 'h1b' : 'index'}" class="sb-item${currentPage === (H1B_HOST ? 'h1b.html' : 'index.html') ? ' active' : ''}">Home</a>
    </div>
  `;

  const css = `
    /* ONE width for every page, declared once. The rail was 220px on most
       pages and 260px in drawer mode, so it visibly changed size as a reader
       moved around. 260 is the one that fits the section names without
       wrapping them three lines deep.
       The explicit padding:0 is not decoration. #shared-sidebar is a <nav>,
       and overview.html styles its own top bar with a bare "nav" selector
       carrying 24px of side padding -- which landed on this element and
       squeezed its usable width by 48px, wrapping the brand and every section
       label on that page alone.
       An id beats a type selector, so declaring it here ends that class of
       collision for any page, not just the one that had it. */
    #shared-sidebar { position: fixed; top: 0; left: 0; width: 260px; height: 100vh; padding: 0; margin: 0; background: var(--surface); border-right: 1px solid var(--border); z-index: 100; display: flex; flex-direction: column; transition: left 0.25s; }
    .sb-header { padding: 14px 16px 8px; border-bottom: 1px solid var(--border); }
    /* The name stays on one line. It wrapped to two on any page whose own CSS
       narrowed this rail, and a masthead that reflows page to page reads as a
       different site each time. */
    .sb-logo { font-size: 0.9rem; font-weight: 700; color: var(--accent); text-decoration: none; display: block; white-space: nowrap; }
    .sb-tagline { font-size: 0.68rem; color: var(--text-muted); display: block; margin-top: 2px; }
    .sb-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .sb-hide { flex: 0 0 auto; background: none; border: 1px solid transparent;
      color: var(--text-muted); border-radius: 6px; cursor: pointer; font-size: 1rem;
      line-height: 1; padding: 3px 7px; margin: -3px -8px 0 0; }
    .sb-hide:hover { color: var(--text); border-color: var(--border); }
    .sb-hide:focus-visible, .sb-mobile-btn:focus-visible {
      outline: 2px solid var(--accent); outline-offset: 2px; }
    .sb-body { flex: 1; overflow-y: auto; padding-top: 6px; scrollbar-gutter: stable; }
    .sb-section { padding: 12px 16px 5px; font-size: 0.68rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; }
    .sb-section:hover { color: var(--text); }
    .sb-chev { font-size: 0.55rem; transition: transform 0.15s; color: var(--text-muted); }
    .sb-group.collapsed .sb-chev { transform: rotate(-90deg); }
    .sb-group.collapsed .sb-content { display: none; }
    .sb-item { display: block; padding: 5px 16px; color: var(--text-muted); text-decoration: none; font-size: 0.8rem; border-left: 3px solid transparent; transition: all 0.1s; }
    .sb-sub { padding: 3px 16px 3px 28px; font-size: 0.74rem; color: var(--text-muted); }
    .sb-sub:hover { color: var(--text); }
    .sb-sub.active { color: var(--accent); }
    .sb-item:hover { background: var(--border); color: var(--text); }
    .sb-item.active { border-left-color: var(--accent); color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, transparent); }
    .sb-uni { display: flex; align-items: baseline; gap: 6px; }
    .sb-uni-rank { flex: 0 0 1.6em; text-align: right; font-size: 0.68rem;
      color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .sb-uni-name { flex: 1 1 auto; min-width: 0; }
    .sb-uni .sb-uni-meta { font-variant-numeric: tabular-nums; }
    .sb-note { margin: 2px 16px 6px; font-size: 0.68rem; line-height: 1.35;
      color: var(--text-muted); }
    .sb-uni-meta { display: flex; align-items: center; gap: 4px; }
    .sb-uni-nra { font-size: 0.7rem; color: var(--text-muted); }
    .opt-dot { display: none; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); vertical-align: middle; }
    .h1b-active .opt-dot { display: inline-block; }
    .sb-footer-links { border-top: 1px solid var(--border); padding: 6px 0; }
    /* The sidebar reserves its own width on <body>. It used to offset only an
       element called .page, so every page whose wrapper had another name --
       main, .container, .page-wrap, .header -- ran underneath it. Margin, not
       padding, so a page's own body padding survives. */
    body.has-sidebar { margin-left: 260px; }
    /* Reserving the rail's width narrows the content area, and a dozen pages ran
       past the right edge by ~108px at 1280 wide. The cause is not the
       sidebar: a grid item defaults to min-width:auto, so a <canvas> that
       Chart.js sizes in device pixels forces its track wider than the column
       and drags the page with it. Both halves are needed -- min-width:0 lets
       the track shrink, max-width:100% stops the canvas exceeding it. Scoped
       to the chart wrappers rather than every canvas, so the deck and the
       live dashboard keep sizing themselves. Each affected page carries its
       own copy of this .charts grid in an inline <style>, so this stylesheet
       -- injected on every page -- is the only single place to fix it. */
    .charts > *, .chart-box { min-width: 0; }
    .charts canvas, .chart-box canvas { max-width: 100%; }
    /* Shared responsive repairs. Each page carries its own inline <style>,
       so there is no site stylesheet to put these in; this one is injected
       everywhere, which is why they live here. All three are the same bug in
       different clothes -- a flex or grid child defaults to min-width:auto,
       so anything with a wide min-content floor (a table, a code block, a
       column) stops the page shrinking and the reader has to pan sideways. */
    .content-col, .chart-card, .chart-grid > *, .grid > * { min-width: 0; }
    pre { overflow-x: auto; max-width: 100%; }
    /* An inline <code> holding a URL or a file path offers no break
       opportunity, so it sets a min-content floor wider than a phone screen
       and takes the whole page with it. Block code is left alone: <pre>
       already scrolls, and breaking inside it would mangle the formatting. */
    code { overflow-wrap: anywhere; }
    pre code { overflow-wrap: normal; }
    /* Tables that would push the page sideways get a scroll box of their own;
       see wrapOverflowingTables(). Not table{display:block}, which this used
       to be: a block table keeps its box at 100% but lays its rows out at
       their content width, so a three-column table ended three-quarters of
       the way across its card, borders and shaded rows stopping short. */
    .sb-table-scroll { overflow-x: auto; max-width: 100%;
      -webkit-overflow-scrolling: touch; }
    .site-footer { text-align: center; padding: 24px 16px; font-size: 0.72rem; color: var(--text-muted); border-top: 1px solid var(--border); margin-top: 24px; }
    .site-footer a { color: var(--accent); text-decoration: none; }
    @media (max-width: 900px) {
      #shared-sidebar { left: -260px; width: 260px; }
      #shared-sidebar.open { left: 0; }
      body.has-sidebar { margin-left: 0; }
      .sb-mobile-btn { display: block !important; }
    }
    .sb-mobile-btn { display: none; position: fixed; top: 8px; left: 8px; z-index: 99; background: var(--surface); border: 1px solid var(--border); color: var(--text-muted); font-size: 1.2rem; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
    /* On pages with their own workspace sidebar, pin the hint to lower-left */
    body.sb-corner .sb-mobile-btn { top: auto; bottom: 16px; left: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.35); }
    /* Drawer mode: closed by default, opens on hamburger click. Doesn't take horizontal space. */
    /* A light, quiet control. The section title is the primary action and
       the tour is the alternative; a solid button here would compete with
       every link in the rail. The click is stopped so opening a tour does
       not also collapse the section it belongs to. */
    /* Pushed to the right edge and faded back: it is the secondary action
       in the row and should read that way until someone looks for it. The
       section header is a flex row so the badge can sit hard right whatever
       the title's length -- a margin would leave it ragged down the rail. */
    .sb-section { display: flex; align-items: center; gap: .4rem; }
    .sb-section:focus-visible { outline: 2px solid var(--hl); outline-offset: -2px;
      border-radius: 4px; }
    .sb-item-row { display: flex; align-items: center; }
    .sb-item-row > .sb-item { flex: 1 1 auto; min-width: 0; }
    .sb-tour-item { margin-right: .55rem; }
    .sb-anchors { margin: 0 0 .15rem; }
    .sb-anchor-toggle { width: 100%; text-align: left; background: none; border: 0;
      font-family: inherit; font-weight: 600; font-size: .66rem;
      text-transform: uppercase;
      letter-spacing: .05em; cursor: pointer; color: var(--text-muted);
      padding: .18rem 0 .18rem 1.1rem; opacity: .8; }
    .sb-anchor-toggle:hover { opacity: 1; color: var(--hl); }
    .sb-anchors.collapsed .sb-chev-sm { transform: rotate(-90deg); }
    .sb-anchors.collapsed .sb-anchor-list { display: none; }
    .sb-sublist { margin: .1rem 0 0; }
    /* font-family only, never the font shorthand. The shorthand resets
       font-size to the inherited 16px and beats .sb-item 0.8rem on
       specificity, so this row rendered a third larger than every nav item
       around it. (No backticks in here: this CSS lives inside a JS template
       literal and a backtick ends the string.) */
    .sb-expander { width: 100%; text-align: left; background: none; border: 0;
      font-family: inherit; font-size: 0.8rem; font-weight: 400;
      line-height: inherit; cursor: pointer; color: var(--text-muted); }
    .sb-chev-sm { display: inline-block; font-size: .55em; transition: transform .15s;
      transform: rotate(-90deg); }
    .sb-sublist.open .sb-chev-sm { transform: rotate(0deg); }
    .sb-subcontent { display: none; max-height: 18rem; overflow-y: auto; }
    .sb-sublist.open .sb-subcontent { display: block; }
    .sb-tour { font: inherit; font-size: .58rem; text-transform: uppercase;
      letter-spacing: .07em; font-weight: 700; cursor: pointer;
      padding: .08rem .4rem; margin-left: auto; flex: 0 0 auto;
      border-radius: 999px; background: transparent;
      color: var(--text-muted); border: 1px solid var(--border);
      opacity: .55; transition: opacity .12s, color .12s, border-color .12s; }
    .sb-tour:hover, .sb-tour:focus-visible {
      opacity: 1; color: var(--hl); border-color: var(--hl); }
    body.sb-drawer #shared-sidebar { left: -260px; width: 260px; box-shadow: 4px 0 24px rgba(0,0,0,0.4); }
    body.sb-drawer #shared-sidebar.open { left: 0; }
    body.sb-drawer.has-sidebar { margin-left: 0; }
    body.sb-drawer .sb-mobile-btn { display: block !important; }
    /* Collapsed by the reader. Only where the sidebar would otherwise be
       pinned -- a desktop-width page that is not a drawer page. It collapses
       to a 36px rail holding the menu button, and the page gets the other
       184px back. A rail rather than a floating button: floating it top-left
       covered the heading on nine pages, and bottom-left covered charts and
       table cells on twenty-six at 1024px wide. Content starts right of the
       rail, so nothing can sit under it. Below 900px, and on drawer pages,
       nothing changes. */
    @media (min-width: 901px) {
      body.sb-hidden:not(.sb-drawer) #shared-sidebar { left: -260px; }
      body.sb-hidden:not(.sb-drawer).has-sidebar { margin-left: 36px; }
      /* flex, not block: a button centres its content vertically whatever its
         padding says, which left the menu icon halfway down the page. */
      body.sb-hidden:not(.sb-drawer) .sb-mobile-btn { display: flex; flex-direction: column;
        align-items: center; justify-content: flex-start; top: 0; left: 0;
        width: 36px; height: 100vh; padding: 12px 0 0; border: 0; border-radius: 0;
        border-right: 1px solid var(--border); background: var(--surface);
        font-size: 1.05rem; line-height: 1; text-align: center; vertical-align: top; }
      body.sb-hidden:not(.sb-drawer) .sb-mobile-btn:hover { color: var(--text); }
    }
    /* No slide on page load: a reader who hid it should not watch it leave
       again on every page they open. */
    body.sb-no-anim #shared-sidebar { transition: none; }
    @media (prefers-reduced-motion: reduce) { #shared-sidebar { transition: none; } }
  `;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Inject sidebar
  const nav = document.createElement('nav');
  nav.id = 'shared-sidebar';
  nav.innerHTML = html;
  // Open by default; hidden only if this reader hid it. Remembered across
  // pages so the choice is not undone by every link they follow.
  const HIDDEN_KEY = 'sb_hidden';
  function readHidden() {
    try { return localStorage.getItem(HIDDEN_KEY) === '1'; } catch { return false; }
  }
  function writeHidden(v) {
    try { if (v) localStorage.setItem(HIDDEN_KEY, '1'); else localStorage.removeItem(HIDDEN_KEY); } catch {}
  }
  document.body.classList.add('sb-no-anim');
  if (readHidden()) document.body.classList.add('sb-hidden');
  document.body.prepend(nav);
  document.body.classList.add('has-sidebar');
  if (isDrawerMode) document.body.classList.add('sb-drawer');
  if (isCornerHint) document.body.classList.add('sb-corner');

  // Mobile toggle
  const btn = document.createElement('button');
  btn.className = 'sb-mobile-btn';
  btn.type = 'button';
  btn.textContent = '\u2630';
  btn.setAttribute('aria-controls', 'shared-sidebar');
  btn.setAttribute('data-track', 'nav.sidebar-show');
  document.body.appendChild(btn);

  const hideBtn = nav.querySelector('.sb-hide');
  // "Pinned" is the desktop layout the hide control applies to. Elsewhere the
  // sidebar is an overlay drawer, and the same two buttons open and close it.
  const pinnedLayout = () => !isDrawerMode && window.matchMedia('(min-width: 901px)').matches;
  function syncControls() {
    const shown = pinnedLayout()
      ? !document.body.classList.contains('sb-hidden')
      : nav.classList.contains('open');
    btn.setAttribute('aria-expanded', String(shown));
    btn.setAttribute('aria-label', shown ? 'Hide the sidebar' : 'Show the sidebar');
    btn.title = btn.getAttribute('aria-label');
    hideBtn.setAttribute('aria-expanded', String(shown));
  }
  function setHidden(hidden) {
    document.body.classList.toggle('sb-hidden', hidden);
    writeHidden(hidden);
    syncControls();
    (hidden ? btn : hideBtn).focus({ preventScroll: true });
    // The content column just changed width. Charts and the wide-table check
    // size themselves on resize, so tell them once the slide has finished.
    setTimeout(() => window.dispatchEvent(new Event('resize')), 280);
  }
  btn.addEventListener('click', () => {
    if (pinnedLayout()) setHidden(false);
    else { nav.classList.toggle('open'); syncControls(); }
  });
  hideBtn.addEventListener('click', () => {
    if (pinnedLayout()) setHidden(true);
    else { nav.classList.remove('open'); syncControls(); btn.focus({ preventScroll: true }); }
  });
  window.addEventListener('resize', syncControls);
  syncControls();
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.body.classList.remove('sb-no-anim')));

  // Inject footer
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = 'A project by <a href="https://andy-barr.com" target="_blank" rel="noopener noreferrer">Andy Barr</a>. Data from US federal agencies (NCES, NSF, DOL, DHS) and university institutional repositories.<br>Last updated: <!--auto:data_last_updated-->October 2026<!--/auto--> \u00B7 <a href="data_sources">Methodology</a> \u00B7 <a href="submit">Tip Line</a> \u00B7 <a href="https://x.com/andy_barr_data" target="_blank" rel="noopener noreferrer">Follow on X</a> \u00B7 <a href="catalog.json">API</a>';
  // A <body> that is itself a flex or grid container turns anything appended
  // to it into a track of that layout. On stem.html and non_stem.html, whose
  // body is display:flex with flex-wrap:nowrap, the footer joined the row
  // beside the nav and main: it shrank to 104px and hung 64px off the right
  // edge at phone width. Inside the main content element it is a normal
  // block again. Detected from the computed style rather than by naming
  // pages, so a page that adopts a flex body later is handled too.
  // The host must STACK ITS CHILDREN VERTICALLY, which is not the same as
  // "is not a flex body". The first version only asked whether <body> was a
  // flex container and, if so, moved the footer into .main -- but on
  // /query .main is itself `display:flex` in the ROW direction, so the
  // footer became a fourth column beside the rail, the editor and the
  // guide, and sat in the top-right corner taking a third of the page.
  // Fixing the row on <body> had created the same bug one level down.
  //
  // So: walk the candidates and take the first that actually stacks. A
  // column-direction flex body -- which /query has -- is a perfectly good
  // host and is now used directly.
  const stacksVertically = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'flex' || cs.display === 'inline-flex') {
      return cs.flexDirection.startsWith('column');
    }
    if (cs.display === 'grid' || cs.display === 'inline-grid') {
      // One column is a stack; more than one is a row of tracks.
      return cs.gridTemplateColumns.split(' ').filter(Boolean).length <= 1;
    }
    return true;   // block, flow-root and the rest stack by default
  };
  const footerHost =
    [document.body,
     document.querySelector('main, .main, .page, .container')]
      .find(stacksVertically)
    || document.body;
  footerHost.appendChild(footer);

  // Remove back-link since sidebar provides navigation
  const backLink = document.querySelector('.back-link');
  if (backLink) backLink.style.display = 'none';

  // Load universities list and rerender sidebar with all 101 unis
  try {
    statesOpen = sessionStorage.getItem('phd-states-open') === '1';
    anchorsShut = sessionStorage.getItem('phd-anchors-shut') === '1';
  } catch (e) { /* private mode */ }

  fetch('/data/states_index.json')
    .then(r => r.json())
    .then(d => { states = d.states || []; rerender(); })
    .catch(() => { /* the rail still works without the state list */ });

  fetch('/data/universities_index.json')
    .then(r => r.json())
    .then(data => {
      universities = data.universities || [];
      rerender();
      // Auto-scroll active university into view
      if (currentUniKey) {
        const active = document.querySelector(`#shared-sidebar .sb-uni.active`);
        if (active) active.scrollIntoView({ block: 'center' });
      }
    })
    .catch(() => {/* fail silently — sidebar still has other groups */});

  // A table too wide for its column scrolls inside its own box instead of
  // moving the page. Only when it really overflows, and only when its author
  // has not already put it in a scroll container -- most have (all 101 on the
  // homepage), and a second container would take over their sticky headers.
  // Tables that fit keep their DOM untouched. Re-checked as content renders
  // and on resize, because most of these tables are filled in by script.
  function inScroller(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowX + cs.overflowY)) return true;
    }
    return false;
  }
  function wrapOverflowingTables() {
    document.querySelectorAll('table').forEach(function (t) {
      const box = t.parentElement;
      if (!box || box.classList.contains('sb-table-scroll')) return;
      if (t.scrollWidth <= box.clientWidth + 1 || inScroller(t)) return;
      const wrap = document.createElement('div');
      wrap.className = 'sb-table-scroll';
      box.insertBefore(wrap, t);
      wrap.appendChild(t);
    });
  }
  let tableTimer = null;
  function scheduleTables() {
    clearTimeout(tableTimer);
    tableTimer = setTimeout(wrapOverflowingTables, 150);
  }
  scheduleTables();
  window.addEventListener('load', scheduleTables);
  window.addEventListener('resize', scheduleTables);
  new MutationObserver(scheduleTables).observe(document.body,
    { childList: true, subtree: true });

  // Keep the in-page anchor sub-items in step with the fragment, so a link
  // followed or pasted mid-session highlights the right section.
  window.addEventListener('hashchange', function () {
    const hash = (location.hash || '').replace(/^#/, '');
    document.querySelectorAll('#shared-sidebar .sb-sub').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + hash);
    });
  });

  // Load the tour definition before the widget, so the widget finds
  // window.PhdTour when it mounts and can offer to run it.
  const tourScript = document.createElement('script');
  tourScript.src = '/tour.js';
  document.body.appendChild(tourScript);

  // Load chat widget
  const chatScript = document.createElement('script');
  chatScript.src = '/chat-widget.js';
  document.body.appendChild(chatScript);

  // Load the glossary. Injected here, with the tour and the chat widget,
  // because this file is the one include every page already carries -- and
  // "non-resident" needs its definition on all sixteen pages that use it, not
  // only the ones someone remembered to add a script tag to.
  if (!document.querySelector('script[src="/glossary.js"]')) {
    const glossaryScript = document.createElement('script');
    glossaryScript.src = '/glossary.js';
    document.body.appendChild(glossaryScript);
  }
})();
