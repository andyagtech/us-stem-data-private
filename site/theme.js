/* Light / dark switch, remembered across pages.
 *
 * ONE CLICK FLIPS WHAT YOU SEE. This used to cycle auto -> light -> dark, and
 * on a machine set to light the first click went from auto to light -- no
 * visible change at all -- so the switch looked broken and dark mode looked
 * missing. Now a click always goes to the opposite of the theme on screen, and
 * the label names the mode you will get ("Dark mode" while looking at light).
 * Until the first click the page follows the operating system; Option/Alt-click
 * returns it to that.
 *
 * The stored choice is applied by a tiny inline script in each page head
 * (phd-theme-boot, injected by scripts/add_theme_toggle.py) BEFORE first
 * paint, so there is no flash of the wrong theme. This file only draws the
 * button and handles clicks.
 *
 * The button's styles live here and nowhere else. They were copied into
 * style.css and into 240 inline stylesheets, which is how it ended up
 * lowercase, muted, 12px and easy to miss. Every colour has a fallback because
 * the deck names its palette --paper/--ink/--rule rather than --surface/--text.
 */
(function () {
  if (window.__phdTheme) return;
  var KEY = 'phd-theme', R = document.documentElement;

  function pref() {
    try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; }
  }
  function effective() {
    var p = pref();
    if (p !== 'auto') return p;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function apply(p) {
    if (p === 'auto') { delete R.dataset.theme; } else { R.dataset.theme = p; }
  }

  var css = document.createElement('style');
  css.id = 'phd-themebtn-css';
  css.textContent = [
    '.themebtn{position:fixed;right:20px;bottom:84px;z-index:60;',
    'display:inline-flex;align-items:center;gap:8px;padding:8px 14px;',
    'border-radius:999px;background:var(--surface,var(--panel,Canvas));color:var(--text,var(--ink,CanvasText));',
    'border:1px solid var(--border,var(--rule2,GrayText));cursor:pointer;',
    'box-shadow:0 2px 10px rgba(0,0,0,.18);',
    "font:600 13px/1 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;",
    'letter-spacing:.01em;text-transform:none;}',
    '.themebtn:hover{border-color:var(--accent,var(--nra,Highlight));}',
    '.themebtn:focus-visible{outline:2px solid var(--accent,var(--nra,Highlight));outline-offset:2px;}',
    '.themebtn .ic{font-size:15px;line-height:1;}',
    '@media print{.themebtn{display:none;}}'
  ].join('');

  var btn = document.createElement('button');
  btn.className = 'themebtn';
  btn.type = 'button';

  function paint() {
    var next = effective() === 'dark' ? 'light' : 'dark';
    btn.innerHTML = '<span class="ic" aria-hidden="true">' +
      (next === 'dark' ? '☾' : '☀') + '</span>' +
      (next === 'dark' ? 'Dark mode' : 'Light mode');
    btn.title = 'Switch to ' + next + ' mode' + (pref() === 'auto'
      ? ' (now following your system setting)'
      : ' — Option-click to follow your system setting again');
  }

  function set(p) {
    try {
      if (p === 'auto') { localStorage.removeItem(KEY); }
      else { localStorage.setItem(KEY, p); }
    } catch (e) { /* private browsing: the choice just will not persist */ }
    apply(p);
    paint();
    // Charts pick their own colours; give them a chance to repaint.
    if (typeof window.onThemeChange === 'function') {
      try { window.onThemeChange(effective()); } catch (e) {}
    }
    document.dispatchEvent(new CustomEvent('themechange', { detail: effective() }));
  }

  btn.addEventListener('click', function (e) {
    if (e.altKey) { set('auto'); return; }
    set(effective() === 'dark' ? 'light' : 'dark');
  });

  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (pref() === 'auto') {
        paint();
        document.dispatchEvent(new CustomEvent('themechange', { detail: effective() }));
      }
    });
  } catch (e) { /* older Safari */ }

  function mount() {
    document.head.appendChild(css);
    paint();
    document.body.appendChild(btn);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }

  window.__phdTheme = { get: pref, effective: effective, set: set };
})();
