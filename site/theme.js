/* Theme toggle: auto -> light -> dark, remembered across pages.
 *
 * The site shipped dark only. This adds the other two states without changing
 * the default: "auto" follows the operating system, and an explicit choice
 * overrides it.
 *
 * The flash of the wrong theme is the thing that makes toggles feel broken, so
 * the stored preference is applied by a tiny inline script in the page head
 * (see THEME_BOOT below, injected at build time) BEFORE this file loads. This
 * file only draws the button and handles clicks.
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

  var btn = document.createElement('button');
  btn.className = 'themebtn';
  btn.type = 'button';

  function paint() {
    var p = pref();
    var icon = p === 'light' ? '☀' : p === 'dark' ? '☾' : '◐';
    btn.innerHTML = '<span class="ic">' + icon + '</span>' + p;
    btn.title = 'Theme: ' + p + ' — click to change (auto → light → dark)';
    btn.setAttribute('aria-label', 'Theme: ' + p + '. Click to change.');
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

  btn.addEventListener('click', function () {
    var p = pref();
    set(p === 'auto' ? 'light' : p === 'light' ? 'dark' : 'auto');
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
