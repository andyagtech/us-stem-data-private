// Shared sidebar + footer for all pages
(function() {
  const currentPath = location.pathname;
  // "/" is the homepage. This fell back to 'stem.html', left over from when
  // that was the landing page; once stem.html became a drawer page the site's
  // front door lost its sidebar and showed a corner hamburger instead -- at
  // "/" only, which is the URL every shared link lands on, while /index.html
  // looked fine and was the one every check loaded.
  const currentPage = currentPath.split('/').pop() || 'index.html';
  // Detect if we're on a university page like /universities/mit.html
  const uniMatch = currentPath.match(/\/universities\/([a-z0-9_]+)\.html/);
  const currentUniKey = uniMatch ? uniMatch[1] : null;

  // Pages where sidebar should be a floating drawer (closed by default,
  // doesn't take horizontal space). Used for pages whose own layout
  // already pins a workspace-specific left panel.
  // stem.html and non_stem.html pin their own <nav id="sidebar"> of 220px,
  // which lists the universities -- navigation this one cannot replace. They
  // get the shared sidebar as a drawer so the page has one pinned panel, not
  // two. presentation.html is a slide deck: a 220px column would squash every
  // slide, so it opens on demand too.
  const DRAWER_PAGES = new Set(['query.html', 'stem.html', 'non_stem.html',
                                'presentation.html']);
  const isDrawerMode = DRAWER_PAGES.has(currentPage);
  // On pages with their own workspace sidebar, also pin the hamburger
  // hint to the lower-left so it doesn't collide.
  const CORNER_PAGES = new Set(['query.html', 'stem.html', 'non_stem.html']);
  const isCornerHint = CORNER_PAGES.has(currentPage);

  // Persist collapse state across navigations
  function getCollapsedSections() {
    try {
      return new Set(JSON.parse(localStorage.getItem('sb_collapsed') || '[]'));
    } catch { return new Set(); }
  }
  function setCollapsedSections(set) {
    try { localStorage.setItem('sb_collapsed', JSON.stringify([...set])); } catch {}
  }
  let collapsedSections = getCollapsedSections();

  const sections = [
    { title: 'National', items: [
      { href: '/overview.html', label: 'National Overview' },
      { href: '/stem.html', label: 'National Charts', anchors: [
        { hash: 'nat-phd', label: 'STEM PhD by Citizenship' },
        { hash: 'nat-opt', label: 'OPT Pipeline' },
        { hash: 'nat-funding', label: 'R&D vs American PhDs' },
        { hash: 'nat-total-pipeline', label: 'Total Foreign Work Auth' },
        { hash: 'nat-visas', label: 'US Visa Issuances' },
        { hash: 'nat-visa-calc', label: 'Cumulative Visa Calculator' },
        { hash: 'nat-fields', label: 'NRA by STEM Field' },
      ]},
      { href: '/ipeds_dashboard.html', label: 'IPEDS PhD Dashboard', anchors: [
        { hash: 'panel-trends', label: 'Trends' },
        { hash: 'panel-demographics', label: 'Demographics' },
        { hash: 'panel-institutions', label: 'Institutions' },
        { hash: 'panel-states', label: 'States' },
      ]},
      { href: '/immigration.html', label: 'Immigration Pipeline' },
      { href: '/pipeline.html', label: 'Pipeline Analysis', anchors: [
        { hash: 'pipeline-chart-section', label: 'A. Full Pipeline' },
        { hash: 'f1-diverge-chart-section', label: 'B. China vs India (F-1)' },
        { hash: 'h1b-diverge-chart-section', label: 'B. China vs India (H-1B)' },
        { hash: 'scatter-chart-section', label: 'C. Stay vs Refusal' },
        { hash: 'eb-chart-section', label: 'D. EB Bottleneck' },
        { hash: 'indexed-chart-section', label: 'E. Pipeline Growth' },
        { hash: 'heatmap-chart-section', label: 'F. Country × State' },
      ]},
      { href: '/medical.html', label: 'Medical Immigration', anchors: [
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
      { href: '/workforce.html', label: 'STEM Workforce (SDR)', anchors: [
        { hash: 'by-field-section', label: 'Foreign-Born by Field' },
        { hash: 'citizenship-section', label: 'Citizenship Composition' },
        { hash: 'totals-section', label: 'Totals by Field' },
        { hash: 'industry-section', label: 'By Major Industry' },
      ]},
      { href: '/presentation.html', label: 'Presentation: The Concentration Effect' },
      { href: '/institutions.html', label: 'Compare Institutions', anchors: [
        { hash: 'the-table', label: 'The table' },
        { hash: 'what-a-row-does-not-mean', label: 'What a row does not mean' },
      ]},
      { href: '/rankings.html', label: 'Where The Share Is Highest', anchors: [
        { hash: 'institutions', label: 'Institutions' },
        { hash: 'programmes', label: 'Programmes' },
        { hash: 'contrast', label: 'Two programmes, one university' },
      ]},
      { href: '/expansion.html', label: "The Master's Expansion", anchors: [
        { hash: 'volume', label: 'In absolute numbers' },
        { hash: 'share', label: 'As a proportion' },
        { hash: 'visas', label: 'The visas' },
        { hash: 'billed', label: 'What it is worth' },
      ]},
      { href: '/distributions.html', label: 'Distributions', anchors: [
        { hash: 'national', label: 'National, then and now' },
        { hash: 'programmes', label: 'By programme' },
        { hash: 'universities', label: 'Inside one university' },
      ]},
      { href: '/filers.html', label: 'Who Files The Visas' },
      { href: '/non_stem.html', label: 'Non-STEM Lists' },
      { href: '/usaid.html', label: 'Scholarships & NGOs' },
      { href: '/live.html', label: 'Live Dashboard' },
    ]},
    { title: 'International', items: [
      { href: '/india.html', label: 'India (Outbound)', anchors: [
        { hash: 'us-canada-chart-section', label: 'US vs Canada' },
        { hash: 'destinations-chart-section', label: 'Top Destinations' },
        { hash: 'field-chart-section', label: 'US Field of Study' },
        { hash: 'level-chart-section', label: 'US Study Level' },
        { hash: 'medical-dest-chart-section', label: 'Medical Destinations' },
        { hash: 'fmge-chart-section', label: 'FMGE Pass Rate' },
      ]},
      { href: '/china.html', label: 'China (Outbound)', anchors: [
        { hash: 'us-chart-section', label: 'Students in the US' },
        { hash: 'sevis-chart-section', label: 'SEVIS Active Records' },
        { hash: 'vs-india-chart-section', label: 'China vs India' },
        { hash: 'dest-trend-chart-section', label: 'US vs UK vs Australia' },
        { hash: 'canada-chart-section', label: 'Canada Study Permits' },
        { hash: 'return-chart-section', label: 'Cumulative Return Rate' },
      ]},
      { href: '/canada.html', label: 'Canada', anchors: [
        { hash: 'total-chart-section', label: 'Total International' },
        { hash: 'countries-chart-section', label: 'Top Source Countries' },
        { hash: 'flow-chart-section', label: 'New Study Permits' },
        { hash: 'study-level-section', label: 'Permits by Level' },
        { hash: 'pgwp-section', label: 'PGWP by Province' },
        { hash: 'imp-section', label: 'IMP Work Permit Stock' },
      ]},
      { href: '/uk.html', label: 'United Kingdom', anchors: [
        { hash: 'enrollment-chart-section', label: 'Enrollment' },
        { hash: 'visa-chart-section', label: 'Student Visa Grants' },
        { hash: 'grad-route-chart-section', label: 'Graduate Route' },
        { hash: 'ho-level-section', label: 'Visas by Course Level' },
        { hash: 'ho-region-section', label: 'Visas by World Region' },
      ]},
      { href: '/eu.html', label: 'EU & Germany', anchors: [
        { hash: 'germany-total-chart-section', label: 'Students in Germany' },
        { hash: 'india-china-chart-section', label: 'India vs China' },
        { hash: 'eu-destinations-chart-section', label: 'EU Destinations' },
        { hash: 'eu-in-us-chart-section', label: 'EU Students in the US' },
      ]},
      { href: '/mexico.html', label: 'Mexico', anchors: [
        { hash: 'us-trend-chart-section', label: 'Mexicans in the US' },
        { hash: 'destinations-chart-section', label: 'All Destinations' },
        { hash: 'level-chart-section', label: 'Study Level' },
        { hash: 'states-chart-section', label: 'Top US States' },
      ]},
      { href: '/vwp.html', label: 'Visa Waiver Program', anchors: [
        { hash: 'nat-top20-chart-section', label: 'Top 20 Naturalizations' },
        { hash: 'vwp-nat-chart-section', label: 'VWP Naturalizations' },
        { hash: 'overstay-chart-section', label: 'Overstay Rates' },
        { hash: 'sevis-chart-section', label: 'VWP Students in the US' },
        { hash: 'lpr-chart-section', label: 'Green Card Grants' },
        { hash: 'vwp-table-section', label: 'All 41 Countries' },
      ]},
    ]},
    { title: 'Reference', items: [
      { href: '/contents.html', label: 'Table of Contents' },
      { href: '/query.html', label: 'Data Query (SQL)' },
      { href: '/data_sources.html', label: 'Data Sources & Methodology' },
      { href: '/briefing.html', label: 'The Briefing (PDF)' },
      { href: '/data_requests.html', label: 'Federal Data Requests' },
      { href: '/ask.html', label: 'What You Can Ask' },
      { href: '/methodology.html', label: 'Dataset Catalogue' },
      { href: '/quality.html', label: 'Data Quality' },
      { href: '/implementation.html', label: 'Implementation' },
      { href: '/department_reports.html', label: 'Department Reports' },
      { href: '/stem_dashboard.html', label: 'Name Classification' },
      { href: '/catalog.json', label: 'Data Catalog (JSON)' },
      { href: '/llms.txt', label: 'WebMCP Integration' },
    ]},
    { title: 'About', items: [
      { href: '/about.html', label: 'About this Project' },
      { href: '/submit.html', label: 'Tip Line' },
      { href: 'https://andy-barr.com', label: 'Personal Webpage', external: true },
      { href: 'https://buymeacoffee.com/andybarr', label: 'Support this Page', external: true },
    ]},
  ];

  let universities = [];

  function buildGroups() {
    const currentHash = (location.hash || '').replace(/^#/, '');
    const groupHtml = sections.map(s => {
      const items = s.items.map(p => {
        const itemPath = p.href.replace(/^\//, '');
        const isCurrentPage = currentPage === itemPath;
        const active = isCurrentPage ? ' active' : '';
        const target = p.external ? ' target="_blank" rel="noopener"' : '';
        let html = `<a href="${p.href}"${target} class="sb-item${active}">${p.label}</a>`;
        // Render in-page anchor sub-items only on the page they belong to
        if (p.anchors && isCurrentPage) {
          const subs = p.anchors.map(a => {
            const subActive = currentHash === a.hash ? ' active' : '';
            return `<a href="#${a.hash}" class="sb-item sb-sub${subActive}">${a.label}</a>`;
          }).join('');
          html += subs;
        }
        return html;
      }).join('');
      const collapsed = collapsedSections.has(s.title) ? ' collapsed' : '';
      return `<div class="sb-group${collapsed}" data-section="${s.title}">
        <div class="sb-section" onclick="window._sbToggle(this.parentElement)"><span class="sb-chev">\u25BC</span> ${s.title}</div>
        <div class="sb-content">${items}</div>
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
        <div class="sb-section" onclick="window._sbToggle(this.parentElement)"><span class="sb-chev">\u25BC</span> Universities (${universities.length})</div>
        <div class="sb-content"><p class="sb-note">Ranked by NRA share of STEM doctoral completions (IPEDS).</p>${uniItems}</div>
      </div>`;

    // National (0), Universities (1), International (2 → was 1), Reference (3 → was 2)
    return [groupHtml[0], uniGroup, groupHtml[1], groupHtml[2]].join('');
  }

  // Global toggle handler that persists state
  window._sbToggle = function(groupEl) {
    const section = groupEl.dataset.section;
    if (!section) return;
    groupEl.classList.toggle('collapsed');
    if (groupEl.classList.contains('collapsed')) {
      collapsedSections.add(section);
    } else {
      collapsedSections.delete(section);
    }
    setCollapsedSections(collapsedSections);
  };

  function rerender() {
    const body = document.querySelector('#shared-sidebar .sb-body');
    if (body) body.innerHTML = buildGroups();
  }

  const html = `
    <div class="sb-header">
      <div class="sb-brand">
        <a href="index.html" class="sb-logo">PhD Demographics</a>
        <span class="sb-tagline">US Graduate Program Research</span>
      </div>
      <button type="button" class="sb-hide" aria-controls="shared-sidebar"
        aria-label="Hide the sidebar" title="Hide the sidebar" data-track="nav.sidebar-hide">\u00AB</button>
    </div>
    <div class="sb-body">${buildGroups()}</div>
    <div class="sb-footer-links">
      <a href="index.html" class="sb-item${currentPage === 'index.html' ? ' active' : ''}">Home</a>
    </div>
  `;

  const css = `
    #shared-sidebar { position: fixed; top: 0; left: 0; width: 220px; height: 100vh; background: var(--surface); border-right: 1px solid var(--border); z-index: 100; display: flex; flex-direction: column; transition: left 0.25s; }
    .sb-header { padding: 14px 16px 8px; border-bottom: 1px solid var(--border); }
    .sb-logo { font-size: 0.9rem; font-weight: 700; color: var(--accent); text-decoration: none; display: block; }
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
    body.has-sidebar { margin-left: 220px; }
    /* Reserving 220px narrows the content area, and a dozen pages then ran
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
  footer.innerHTML = 'A project by <a href="https://andy-barr.com" target="_blank" rel="noopener noreferrer">Andy Barr</a>. Data from US federal agencies (NCES, NSF, DOL, DHS) and university institutional repositories.<br>Last updated: August 2026 \u00B7 <a href="data_sources.html">Methodology</a> \u00B7 <a href="submit.html">Tip Line</a> \u00B7 <a href="https://x.com/andy_barr_data" target="_blank" rel="noopener noreferrer">Follow on X</a> \u00B7 <a href="catalog.json">API</a>';
  // A <body> that is itself a flex or grid container turns anything appended
  // to it into a track of that layout. On stem.html and non_stem.html, whose
  // body is display:flex with flex-wrap:nowrap, the footer joined the row
  // beside the nav and main: it shrank to 104px and hung 64px off the right
  // edge at phone width. Inside the main content element it is a normal
  // block again. Detected from the computed style rather than by naming
  // pages, so a page that adopts a flex body later is handled too.
  const bodyLayout = getComputedStyle(document.body).display;
  const footerHost = /flex|grid/.test(bodyLayout)
    ? (document.querySelector('main, .main, .page, .container') || document.body)
    : document.body;
  footerHost.appendChild(footer);

  // Remove back-link since sidebar provides navigation
  const backLink = document.querySelector('.back-link');
  if (backLink) backLink.style.display = 'none';

  // Load universities list and rerender sidebar with all 101 unis
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
})();
