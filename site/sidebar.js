// Shared sidebar + footer for all pages
(function() {
  const currentPath = location.pathname;
  const currentPage = currentPath.split('/').pop() || 'stem.html';
  // Detect if we're on a university page like /universities/mit.html
  const uniMatch = currentPath.match(/\/universities\/([a-z0-9_]+)\.html/);
  const currentUniKey = uniMatch ? uniMatch[1] : null;

  // Pages where sidebar should be a floating drawer (closed by default,
  // doesn't take horizontal space). Used for pages whose own layout
  // already pins a workspace-specific left panel.
  const DRAWER_PAGES = new Set(['query.html']);
  const isDrawerMode = DRAWER_PAGES.has(currentPage);
  // On pages with their own workspace sidebar, also pin the hamburger
  // hint to the lower-left so it doesn't collide.
  const CORNER_PAGES = new Set(['query.html']);
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
      { href: '/concentration.html', label: 'The Concentration Effect' },
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
      { href: '/query.html', label: 'Data Query (SQL)' },
      { href: '/data_sources.html', label: 'Data Sources & Methodology' },
      { href: '/implementation.html', label: 'Implementation' },
      { href: '/data_catalog.json', label: 'Data Catalog (JSON)' },
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
    const uniItems = universities.map(u => {
      const active = currentUniKey === u.key ? ' active' : '';
      const dot = u.has_opt ? '<span class="opt-dot"></span>' : '';
      return `<a href="/stem.html#${u.key}" class="sb-item sb-uni${active}" data-key="${u.key}"><span>${u.name}</span><span class="sb-uni-meta"><span class="sb-uni-nra">${u.nra}%</span>${dot}</span></a>`;
    }).join('');
    const uniCollapsed = collapsedSections.has('Universities') ? ' collapsed' : '';
    const uniGroup = `<div class="sb-group${uniCollapsed}" data-section="Universities">
        <div class="sb-section" onclick="window._sbToggle(this.parentElement)"><span class="sb-chev">\u25BC</span> Universities (${universities.length})</div>
        <div class="sb-content">${uniItems}</div>
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
      <a href="index.html" class="sb-logo">PhD Demographics</a>
      <span class="sb-sub">US Graduate Program Research</span>
    </div>
    <div class="sb-body">${buildGroups()}</div>
    <div class="sb-footer-links">
      <a href="index.html" class="sb-item${currentPage === 'index.html' ? ' active' : ''}">Home</a>
    </div>
  `;

  const css = `
    #shared-sidebar { position: fixed; top: 0; left: 0; width: 220px; height: 100vh; background: #1e293b; border-right: 1px solid #334155; z-index: 100; display: flex; flex-direction: column; transition: left 0.25s; }
    .sb-header { padding: 14px 16px 8px; border-bottom: 1px solid #334155; }
    .sb-logo { font-size: 0.9rem; font-weight: 700; color: #38bdf8; text-decoration: none; display: block; }
    .sb-sub { font-size: 0.68rem; color: #64748b; display: block; margin-top: 2px; }
    .sb-body { flex: 1; overflow-y: auto; padding-top: 6px; scrollbar-gutter: stable; }
    .sb-section { padding: 12px 16px 5px; font-size: 0.68rem; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; }
    .sb-section:hover { color: #7dd3fc; }
    .sb-chev { font-size: 0.55rem; transition: transform 0.15s; color: #64748b; }
    .sb-group.collapsed .sb-chev { transform: rotate(-90deg); }
    .sb-group.collapsed .sb-content { display: none; }
    .sb-item { display: block; padding: 5px 16px; color: #94a3b8; text-decoration: none; font-size: 0.8rem; border-left: 3px solid transparent; transition: all 0.1s; }
    .sb-sub { padding: 3px 16px 3px 28px; font-size: 0.74rem; color: #64748b; }
    .sb-sub:hover { color: #cbd5e1; }
    .sb-sub.active { color: #38bdf8; }
    .sb-item:hover { background: #334155; color: #e2e8f0; }
    .sb-item.active { border-left-color: #38bdf8; color: #38bdf8; background: rgba(56,189,248,0.08); }
    .sb-uni { display: flex; justify-content: space-between; align-items: baseline; }
    .sb-uni-meta { display: flex; align-items: center; gap: 4px; }
    .sb-uni-nra { font-size: 0.7rem; color: #64748b; }
    .opt-dot { display: none; width: 7px; height: 7px; border-radius: 50%; background: #38bdf8; vertical-align: middle; }
    .h1b-active .opt-dot { display: inline-block; }
    .sb-footer-links { border-top: 1px solid #334155; padding: 6px 0; }
    .has-sidebar .page { margin-left: 220px; }
    .site-footer { text-align: center; padding: 24px 16px; font-size: 0.72rem; color: #64748b; border-top: 1px solid #334155; margin-top: 24px; }
    .site-footer a { color: #38bdf8; text-decoration: none; }
    .has-sidebar .site-footer { margin-left: 220px; }
    @media (max-width: 900px) {
      #shared-sidebar { left: -260px; width: 260px; }
      #shared-sidebar.open { left: 0; }
      .has-sidebar .page { margin-left: 0; }
      .has-sidebar .site-footer { margin-left: 0; }
      .sb-mobile-btn { display: block !important; }
    }
    .sb-mobile-btn { display: none; position: fixed; top: 8px; left: 8px; z-index: 99; background: #1e293b; border: 1px solid #334155; color: #94a3b8; font-size: 1.2rem; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
    /* On pages with their own workspace sidebar, pin the hint to lower-left */
    body.sb-corner .sb-mobile-btn { top: auto; bottom: 16px; left: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.35); }
    /* Drawer mode: closed by default, opens on hamburger click. Doesn't take horizontal space. */
    body.sb-drawer #shared-sidebar { left: -260px; width: 260px; box-shadow: 4px 0 24px rgba(0,0,0,0.4); }
    body.sb-drawer #shared-sidebar.open { left: 0; }
    body.sb-drawer.has-sidebar .page { margin-left: 0; }
    body.sb-drawer.has-sidebar .site-footer { margin-left: 0; }
    body.sb-drawer .sb-mobile-btn { display: block !important; }
  `;

  // Inject styles
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // Inject sidebar
  const nav = document.createElement('nav');
  nav.id = 'shared-sidebar';
  nav.innerHTML = html;
  document.body.prepend(nav);
  document.body.classList.add('has-sidebar');
  if (isDrawerMode) document.body.classList.add('sb-drawer');
  if (isCornerHint) document.body.classList.add('sb-corner');

  // Mobile toggle
  const btn = document.createElement('button');
  btn.className = 'sb-mobile-btn';
  btn.textContent = '\u2630';
  btn.onclick = () => nav.classList.toggle('open');
  document.body.appendChild(btn);

  // Inject footer
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = 'A project by <a href="https://andy-barr.com" target="_blank">Andy Barr</a>. Data from US federal agencies (NCES, NSF, DOL, DHS) and university institutional repositories.<br>Last updated: April 2026 \u00B7 <a href="data_sources.html">Methodology</a> \u00B7 <a href="submit.html">Tip Line</a> \u00B7 <a href="https://x.com/andy_barr_data" target="_blank">Follow on X</a> \u00B7 <a href="data_catalog.json">API</a>';
  document.body.appendChild(footer);

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

  // Keep the in-page anchor sub-items in step with the fragment, so a link
  // followed or pasted mid-session highlights the right section.
  window.addEventListener('hashchange', function () {
    const hash = (location.hash || '').replace(/^#/, '');
    document.querySelectorAll('#shared-sidebar .sb-sub').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('href') === '#' + hash);
    });
  });

  // Load chat widget
  const chatScript = document.createElement('script');
  chatScript.src = '/chat-widget.js';
  document.body.appendChild(chatScript);
})();
