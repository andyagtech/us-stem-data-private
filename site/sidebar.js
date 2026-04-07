// Shared sidebar + footer for all pages
(function() {
  const currentPath = location.pathname;
  const currentPage = currentPath.split('/').pop() || 'stem.html';
  // Detect if we're on a university page like /universities/mit.html
  const uniMatch = currentPath.match(/\/universities\/([a-z0-9_]+)\.html/);
  const currentUniKey = uniMatch ? uniMatch[1] : null;

  const sections = [
    { title: 'National', items: [
      { href: '/stem.html', label: 'National Charts' },
      { href: '/ipeds_dashboard.html', label: 'IPEDS PhD Dashboard' },
      { href: '/immigration.html', label: 'Immigration Pipeline' },
      { href: '/pipeline.html', label: 'Pipeline Analysis' },
    ]},
    { title: 'International', items: [
      { href: '/india.html', label: 'India (Outbound)' },
      { href: '/china.html', label: 'China (Outbound)' },
      { href: '/canada.html', label: 'Canada' },
      { href: '/uk.html', label: 'United Kingdom' },
      { href: '/eu.html', label: 'EU & Germany' },
      { href: '/mexico.html', label: 'Mexico' },
      { href: '/vwp.html', label: 'Visa Waiver Program' },
    ]},
    { title: 'Reference', items: [
      { href: '/query.html', label: 'Data Query (SQL)' },
      { href: '/data_sources.html', label: 'Data Sources & Methodology' },
      { href: '/data_catalog.json', label: 'Data Catalog (JSON)' },
      { href: '/llms.txt', label: 'WebMCP Integration' },
    ]},
  ];

  let universities = [];

  function buildGroups() {
    const groupHtml = sections.map(s => {
      const items = s.items.map(p => {
        const itemPath = p.href.replace(/^\//, '');
        const active = currentPage === itemPath ? ' active' : '';
        return `<a href="${p.href}" class="sb-item${active}">${p.label}</a>`;
      }).join('');
      return `<div class="sb-group">
        <div class="sb-section" onclick="this.parentElement.classList.toggle('collapsed')"><span class="sb-chev">\u25BC</span> ${s.title}</div>
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
    const uniGroup = `<div class="sb-group">
        <div class="sb-section" onclick="this.parentElement.classList.toggle('collapsed')"><span class="sb-chev">\u25BC</span> Universities (${universities.length})</div>
        <div class="sb-content">${uniItems}</div>
      </div>`;

    // National (0), Universities (1), International (2 → was 1), Reference (3 → was 2)
    return [groupHtml[0], uniGroup, groupHtml[1], groupHtml[2]].join('');
  }

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
      <a href="https://andy-barr.com" target="_blank" class="sb-item">About \u2197</a>
    </div>
  `;

  const css = `
    #shared-sidebar { position: fixed; top: 0; left: 0; width: 220px; height: 100vh; background: #1e293b; border-right: 1px solid #334155; z-index: 100; display: flex; flex-direction: column; transition: left 0.25s; }
    .sb-header { padding: 14px 16px 8px; border-bottom: 1px solid #334155; }
    .sb-logo { font-size: 0.9rem; font-weight: 700; color: #38bdf8; text-decoration: none; display: block; }
    .sb-sub { font-size: 0.68rem; color: #64748b; display: block; margin-top: 2px; }
    .sb-body { flex: 1; overflow-y: auto; padding-top: 6px; }
    .sb-section { padding: 12px 16px 5px; font-size: 0.68rem; font-weight: 700; color: #38bdf8; text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; }
    .sb-section:hover { color: #7dd3fc; }
    .sb-chev { font-size: 0.55rem; transition: transform 0.15s; color: #64748b; }
    .sb-group.collapsed .sb-chev { transform: rotate(-90deg); }
    .sb-group.collapsed .sb-content { display: none; }
    .sb-item { display: block; padding: 5px 16px; color: #94a3b8; text-decoration: none; font-size: 0.8rem; border-left: 3px solid transparent; transition: all 0.1s; }
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

  // Mobile toggle
  const btn = document.createElement('button');
  btn.className = 'sb-mobile-btn';
  btn.textContent = '\u2630';
  btn.onclick = () => nav.classList.toggle('open');
  document.body.appendChild(btn);

  // Inject footer
  const footer = document.createElement('footer');
  footer.className = 'site-footer';
  footer.innerHTML = 'A project by <a href="https://andy-barr.com" target="_blank">Andy Barr</a>. Data from US federal agencies (NCES, NSF, DOL, DHS) and university institutional repositories.<br>Last updated: April 2026 \u00B7 <a href="data_sources.html">Methodology</a> \u00B7 <a href="data_catalog.json">API</a>';
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

  // Load chat widget
  const chatScript = document.createElement('script');
  chatScript.src = '/chat-widget.js';
  document.body.appendChild(chatScript);
})();
