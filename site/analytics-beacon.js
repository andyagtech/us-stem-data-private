/* Shared analytics beacon. One file, so instrumenting a page is one script tag
 * rather than a copy-pasted closure that drifts.
 *
 * Replaces a per-page snippet that had two defects:
 *
 *   1. The click label was the element's VISIBLE TEXT --
 *      `t.dataset.key || t.textContent.trim().substr(0,40)` -- so rewording a
 *      button silently split its time series in two, retroactively.
 *   2. It only listened to four hardcoded classes (.nav-item, .dept-header,
 *      .toggle-wrap, a.name-link), none of which exist on index.html. The
 *      landing page would have recorded zero clicks even once instrumented.
 *
 * Now: identity comes from `data-track` on the element and `data-page` on
 * <body>, both structural and both independent of the copy. See
 * scripts/add_tracking_ids.py for how those are assigned and why they are not
 * `id` (id already serves anchors, ARIA and CSS; coupling analytics to it
 * means renaming an anchor breaks a metric).
 */
(function () {
  'use strict';
  var API = 'https://analytics.andy-barr.com/collect';
  var PAGE = (document.body && document.body.dataset.page) || 'unknown';

  var sid;
  try {
    sid = sessionStorage.getItem('_sid');
    if (!sid) {
      sid = Math.random().toString(36).slice(2, 14);
      sessionStorage.setItem('_sid', sid);
    }
  } catch (e) { sid = 'nostore'; }          // private mode: still send, no id

  // A broken page can fire errors in a loop. Cap what we will send so a bug
  // costs a handful of beacons rather than a flood.
  var budget = 40;
  function send(data) {
    if (budget-- <= 0) return;
    data.sid = sid;
    data.page = PAGE;
    data.path = location.pathname + location.hash;
    try {
      var body = JSON.stringify(data);
      if (navigator.sendBeacon) navigator.sendBeacon(API, body);
      else fetch(API, { method: 'POST', body: body, keepalive: true });
    } catch (e) { /* analytics must never break the page */ }
  }

  send({ type: 'pageview', referrer: document.referrer,
         screen: screen.width + 'x' + screen.height,
         ua: navigator.userAgent });

  // Any element carrying data-track, plus its ancestors, so a click on a span
  // inside a button still attributes to the button.
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-track]');
    if (t) send({ type: 'click', target: t.dataset.track });
  }, { passive: true });

  // Errors, which were previously not captured at all. A visitor hitting a
  // chart failure or a Parquet decode error left no trace anywhere.
  window.addEventListener('error', function (ev) {
    send({ type: 'error',
           message: String(ev.message || '').slice(0, 200),
           source: String(ev.filename || '').slice(0, 160),
           line: ev.lineno || 0 });
  });
  window.addEventListener('unhandledrejection', function (ev) {
    var r = ev.reason;
    send({ type: 'rejection',
           message: String((r && (r.message || r)) || '').slice(0, 200) });
  });
}());
