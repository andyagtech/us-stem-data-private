/* Live dashboard: US graduate degrees by field, level and residency status.
 *
 * VOICE IS ON (2026-09-16), against phd-chat-prod. It was off for two days
 * because all three of the things it needs were missing: the /realtime route
 * pointed at the retired April `phd-chat` function, which has no such route;
 * the route that did exist read OPENAI_API_KEY straight from the environment,
 * which nothing sets, because the key lives in SSM; and nothing metered the
 * session. All three are fixed. A session is now charged its worst case to
 * cloud/chat/budget.py BEFORE the token is minted, and there is no settlement
 * because the audio never touches our servers -- see that file.
 *
 * If voice is refused (daily voice budget spent, or the ledger unwritable) the
 * page says so in one line and stays a working dashboard. That is the contract
 * below: every chart the voice can summon is also reachable by clicking.
 *
 * Two halves that are deliberately independent:
 *
 *   1. A dashboard that works with no microphone, no network and no OpenAI.
 *      It loads one 9 KB bundle and renders from memory. Every chart the voice
 *      can summon can also be reached by clicking a chip. If voice is
 *      unavailable the page is still a working dashboard, not a broken one.
 *
 *   2. A voice layer that connects the browser straight to OpenAI over WebRTC.
 *      Audio never touches our servers, which is the entire reason it feels
 *      instant. The only server call is minting an ephemeral token, once per
 *      session. Tool calls arrive on the data channel and are executed against
 *      the already-loaded bundle, so a chart changes in the same breath the
 *      sentence is spoken - there is no fetch in the render path.
 *
 * Nothing here uses innerHTML with anything but literal strings we authored;
 * every value that came from the model or the data goes in via textContent or
 * setAttribute.
 */
(function () {
  'use strict';

  var BUNDLE_URL = '/data/live_bundle.json';
  var VOICE_ENABLED = true;
  // The budgeted /realtime route on phd-chat-prod. Same function as the typed
  // assistant, same daily ledger, different upstream API.
  var TOKEN_URL = 'https://lamsi2swef2o2ark2ylnupz5wy0vedcw.lambda-url.us-east-1.on.aws/realtime';
  var COL = { dom: '#2AA3C4', nra: '#DE5C6B', accent: '#B58A2C' };

  var data = null;
  var pc = null, dc = null, micStream = null, sessionTimer = null;

  var $ = function (id) { return document.getElementById(id); };

  /* ---------------------------------------------------------------- data */

  function fieldName(cip) {
    return (data && data.meta.fields[cip]) || ('CIP ' + cip);
  }

  function seriesFor(cip, level) {
    var block = data.degrees[level] && data.degrees[level][cip];
    if (!block) return null;
    return Object.keys(block).map(Number).sort(function (a, b) { return a - b; })
      .map(function (y) {
        var t = block[String(y)][0], n = block[String(y)][1];
        return { year: y, total: t, nra: n, dom: t - n,
                 share: t ? (100 * n / t) : 0 };
      });
  }

  function aggregate(level) {
    var byYear = {};
    var fields = data.degrees[level] || {};
    Object.keys(fields).forEach(function (cip) {
      Object.keys(fields[cip]).forEach(function (y) {
        var row = fields[cip][y];
        if (!byYear[y]) byYear[y] = [0, 0];
        byYear[y][0] += row[0];
        byYear[y][1] += row[1];
      });
    });
    return Object.keys(byYear).map(Number).sort(function (a, b) { return a - b; })
      .map(function (y) {
        var t = byYear[y][0], n = byYear[y][1];
        return { year: y, total: t, nra: n, dom: t - n,
                 share: t ? (100 * n / t) : 0 };
      });
  }

  /* --------------------------------------------------------------- chart */

  var NS = 'http://www.w3.org/2000/svg';
  function el(name, attrs) {
    var n = document.createElementNS(NS, name);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      n.setAttribute(k, String(attrs[k]));
    });
    return n;
  }

  function clearNode(n) { while (n.firstChild) n.removeChild(n.firstChild); }

  function drawLines(rows, opts) {
    var holder = $('chart-holder');
    clearNode(holder);
    if (!rows || !rows.length) return;

    var W = holder.clientWidth || 700, H = 340;
    var m = { t: 14, r: 54, b: 26, l: 58 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var svg = el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H,
                          preserveAspectRatio: 'none' });

    var keys = opts.keys;
    var maxV = 0;
    rows.forEach(function (r) {
      keys.forEach(function (k) { if (r[k.field] > maxV) maxV = r[k.field]; });
    });
    if (opts.percent) maxV = Math.max(maxV, 10);
    maxV = maxV * 1.08 || 1;

    var years = rows.map(function (r) { return r.year; });
    var x = function (y) {
      var lo = years[0], hi = years[years.length - 1];
      return m.l + (hi === lo ? iw / 2 : ((y - lo) / (hi - lo)) * iw);
    };
    var yf = function (v) { return m.t + ih - (v / maxV) * ih; };

    // gridlines + y labels
    for (var g = 0; g <= 4; g++) {
      var val = (maxV / 4) * g, yy = yf(val);
      svg.appendChild(el('line', { class: 'gridline', x1: m.l, x2: m.l + iw,
                                   y1: yy, y2: yy }));
      var lab = el('text', { x: m.l - 9, y: yy + 4, 'text-anchor': 'end' });
      lab.textContent = opts.percent ? Math.round(val) + '%'
        : (val >= 1000 ? Math.round(val / 1000) + 'k' : Math.round(val));
      svg.appendChild(lab);
    }
    // x labels: first, last, and a couple between
    var step = Math.max(1, Math.floor(years.length / 5));
    years.forEach(function (y, i) {
      if (i % step && i !== years.length - 1) return;
      var t = el('text', { x: x(y), y: H - 6, 'text-anchor': 'middle' });
      t.textContent = String(y);
      svg.appendChild(t);
    });

    keys.forEach(function (k) {
      var d = rows.map(function (r, i) {
        return (i ? 'L' : 'M') + x(r.year).toFixed(1) + ' ' + yf(r[k.field]).toFixed(1);
      }).join(' ');
      var path = el('path', { class: 'series', d: d, stroke: k.color });
      svg.appendChild(path);
      // animate the draw so a new series visibly arrives
      try {
        var len = path.getTotalLength();
        if (len && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          path.style.strokeDasharray = len;
          path.style.strokeDashoffset = len;
          path.style.transition = 'stroke-dashoffset .55s ease-out';
          requestAnimationFrame(function () { path.style.strokeDashoffset = '0'; });
        }
      } catch (e) { /* getTotalLength unsupported: static line is fine */ }

      var last = rows[rows.length - 1];
      svg.appendChild(el('circle', { class: 'dot', cx: x(last.year),
                                     cy: yf(last[k.field]), r: 4, fill: k.color }));
      var vlab = el('text', { class: 'lbl', x: x(last.year) + 9,
                              y: yf(last[k.field]) + 4, fill: k.color });
      vlab.textContent = opts.percent
        ? Math.round(last[k.field]) + '%'
        : Intl.NumberFormat('en-US', { notation: 'compact' }).format(last[k.field]);
      svg.appendChild(vlab);
    });

    holder.appendChild(svg);
    renderLegend(keys);
  }

  function drawBars(items, opts) {
    var holder = $('chart-holder');
    clearNode(holder);
    if (!items.length) return;
    var W = holder.clientWidth || 700, H = 340;
    var m = { t: 12, r: 56, b: 26, l: 150 };
    var iw = W - m.l - m.r;
    var bh = Math.min(34, (H - m.t - m.b) / items.length - 8);
    var svg = el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H });
    var maxV = Math.max.apply(null, items.map(function (i) { return Math.abs(i.value); })) || 1;

    items.forEach(function (it, i) {
      var y = m.t + i * (bh + 8);
      var w = Math.max(2, (Math.abs(it.value) / maxV) * iw);
      var lab = el('text', { x: m.l - 10, y: y + bh / 2 + 4, 'text-anchor': 'end',
                             class: 'lbl' });
      lab.textContent = it.label;
      svg.appendChild(lab);
      var bar = el('rect', { class: 'bar', x: m.l, y: y, width: 0, height: bh,
                             fill: it.color || COL.nra });
      svg.appendChild(bar);
      requestAnimationFrame(function () {
        bar.style.transition = 'width .5s cubic-bezier(.2,.7,.3,1)';
        bar.setAttribute('width', w.toFixed(1));
      });
      var v = el('text', { x: m.l + w + 9, y: y + bh / 2 + 4, class: 'lbl',
                           fill: it.color || COL.nra });
      v.textContent = opts.percent ? Math.round(it.value) + '%'
        : Intl.NumberFormat('en-US', { notation: 'compact' }).format(it.value);
      svg.appendChild(v);
    });
    holder.appendChild(svg);
    renderLegend([]);
  }

  function renderLegend(keys) {
    var lg = $('legend');
    clearNode(lg);
    keys.forEach(function (k) {
      var s = document.createElement('span');
      var i = document.createElement('i');
      i.style.background = k.color;
      s.appendChild(i);
      s.appendChild(document.createTextNode(k.label));
      lg.appendChild(s);
    });
  }

  function setBoard(title, sub) {
    $('board-title').textContent = title;
    $('board-sub').textContent = sub || '';
  }

  function setKpi(label, value, caption) {
    $('kpi-label').textContent = label;
    $('kpi-value').textContent = value;
    $('kpi-cap').textContent = caption || '';
  }

  /* ---------------------------------------------------------- tool impls */

  var TOOLS = {
    show_series: function (a) {
      var cip = String(a.field || '11').replace(/\D/g, '').padStart(2, '0');
      var level = a.level === 'doctorate' ? 'doctorate' : 'masters';
      var rows = seriesFor(cip, level);
      if (!rows) return { ok: false, error: 'no data for that field' };
      var lvlWord = level === 'doctorate' ? 'doctorates' : "master's degrees";
      if (a.mode === 'share') {
        drawLines(rows, { percent: true,
          keys: [{ field: 'share', color: COL.nra, label: 'Non-resident share' }] });
        setBoard(fieldName(cip) + ' ' + lvlWord, 'Non-resident share of degrees conferred');
      } else {
        drawLines(rows, { keys: [
          { field: 'dom', color: COL.dom, label: 'Domestic' },
          { field: 'nra', color: COL.nra, label: 'Non-resident' }] });
        setBoard(fieldName(cip) + ' ' + lvlWord, 'Degrees conferred, by residency status');
      }
      var f = rows[0], l = rows[rows.length - 1];
      setKpi('Non-resident share, ' + l.year, Math.round(l.share) + '%',
        'Domestic ' + pct(f.dom, l.dom) + ', non-resident ' + pct(f.nra, l.nra) +
        ' since ' + f.year + '.');
      return { ok: true, first_year: f.year, last_year: l.year,
               domestic_change_pct: Math.round(chg(f.dom, l.dom)),
               nra_change_pct: Math.round(chg(f.nra, l.nra)),
               share_last: Math.round(l.share) };
    },

    compare_fields: function (a) {
      var level = a.level === 'doctorate' ? 'doctorate' : 'masters';
      var measure = a.measure || 'share';
      var cips = (a.fields || []).map(function (f) {
        return String(f).replace(/\D/g, '').padStart(2, '0');
      }).filter(function (c) { return data.degrees[level][c]; });
      if (!cips.length) cips = Object.keys(data.degrees[level]);
      var items = cips.map(function (c) {
        var r = seriesFor(c, level), f = r[0], l = r[r.length - 1];
        var v = measure === 'growth_domestic' ? chg(f.dom, l.dom)
              : measure === 'growth_nra' ? chg(f.nra, l.nra) : l.share;
        return { label: fieldName(c), value: v,
                 color: measure === 'growth_domestic' ? COL.dom : COL.nra };
      }).sort(function (p, q) { return q.value - p.value; });
      drawBars(items, { percent: true });
      var title = measure === 'growth_domestic' ? 'Domestic growth'
                : measure === 'growth_nra' ? 'Non-resident growth' : 'Non-resident share';
      setBoard(title + ', ' + (level === 'doctorate' ? 'doctorates' : "master's"),
               measure === 'share' ? 'Latest year' : 'Change across the series');
      setKpi(title, Math.round(items[0].value) + '%', 'Highest: ' + items[0].label + '.');
      return { ok: true, ranked: items.slice(0, 5).map(function (i) {
        return { field: i.label, value: Math.round(i.value) }; }) };
    },

    show_f1: function (a) {
      var f1 = data.f1 || {};
      var years = Object.keys(f1).map(Number).sort(function (p, q) { return p - q; });
      if (!years.length) return { ok: false, error: 'no F-1 data' };
      var rows = years.map(function (y) {
        var e = f1[String(y)];
        return { year: y, total: e.total, china: e.china || 0, india: e.india || 0 };
      });
      var keys = [{ field: 'total', color: COL.accent, label: 'F-1 issued' }];
      (a.countries || []).forEach(function (c) {
        var k = String(c).toLowerCase();
        if (k === 'china') keys.push({ field: 'china', color: COL.nra, label: 'China' });
        if (k === 'india') keys.push({ field: 'india', color: COL.dom, label: 'India' });
      });
      drawLines(rows, { keys: keys });
      setBoard('F-1 student visa issuance', 'State Department, by fiscal year');
      var peak = rows.reduce(function (p, r) { return r.total > p.total ? r : p; });
      var last = rows[rows.length - 1];
      setKpi('Off peak', Math.round(chg(peak.total, last.total)) + '%',
        'Peaked at ' + fmt(peak.total) + ' in ' + peak.year + '; ' +
        fmt(last.total) + ' in ' + last.year + '.');
      return { ok: true, peak_year: peak.year, peak: peak.total,
               last_year: last.year, last: last.total };
    },

    highlight: function (a) {
      setKpi(String(a.label || '').slice(0, 60), String(a.value || '').slice(0, 24),
             String(a.caption || '').slice(0, 220));
      return { ok: true };
    },

    clear_board: function () { opening(); return { ok: true }; }
  };

  function chg(a, b) { return a ? (100 * (b - a) / a) : 0; }
  function pct(a, b) { var c = chg(a, b); return (c >= 0 ? '+' : '') + Math.round(c) + '%'; }
  function fmt(n) { return Intl.NumberFormat('en-US').format(n); }

  /* -------------------------------------------------------------- voice */

  function say(who, text) {
    var body = $('t-body');
    var p = document.createElement('p');
    p.className = 't-line' + (who === 'You' ? ' you' : '');
    var b = document.createElement('b');
    b.textContent = who;
    p.appendChild(b);
    p.appendChild(document.createTextNode(text));
    body.appendChild(p);
    body.parentNode.scrollTop = body.parentNode.scrollHeight;
  }

  function micState(state, label) {
    var btn = $('mic');
    btn.setAttribute('data-state', state);
    $('mic-label').textContent = label;
    btn.disabled = (state === 'connecting');
  }

  function stopVoice(reason) {
    if (sessionTimer) { clearTimeout(sessionTimer); sessionTimer = null; }
    if (dc) { try { dc.close(); } catch (e) {} dc = null; }
    if (pc) { try { pc.close(); } catch (e) {} pc = null; }
    if (micStream) {
      micStream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
      micStream = null;
    }
    micState('idle', 'Start talking');
    if (reason) say('System', reason);
  }

  function handleToolCall(name, argsJson, callId) {
    var out;
    try {
      var args = argsJson ? JSON.parse(argsJson) : {};
      var fn = TOOLS[name];
      out = fn ? fn(args) : { ok: false, error: 'unknown tool' };
    } catch (e) {
      out = { ok: false, error: 'tool failed' };
    }
    if (dc && dc.readyState === 'open') {
      dc.send(JSON.stringify({
        type: 'conversation.item.create',
        item: { type: 'function_call_output', call_id: callId,
                output: JSON.stringify(out) }
      }));
      dc.send(JSON.stringify({ type: 'response.create' }));
    }
  }

  function wireChannel() {
    dc.addEventListener('message', function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }

      if (msg.type === 'response.function_call_arguments.done') {
        handleToolCall(msg.name, msg.arguments, msg.call_id);
      } else if (msg.type === 'response.audio_transcript.done' && msg.transcript) {
        say('Assistant', msg.transcript);
      } else if (msg.type === 'conversation.item.input_audio_transcription.completed'
                 && msg.transcript) {
        say('You', msg.transcript);
      } else if (msg.type === 'error') {
        say('System', 'The voice session hit an error.');
      }
    });
  }

  function startVoice() {
    if (pc) { stopVoice('Session ended.'); return; }
    if (!window.RTCPeerConnection || !navigator.mediaDevices) {
      say('System', 'This browser does not support live voice. The dashboard still works — use the buttons.');
      return;
    }
    micState('connecting', 'Connecting…');

    fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' },
                       body: '{}' })
      .then(function (r) {
        if (r.ok) return r.json();
        // The server says WHY it refused -- the voice budget for today is
        // spent, or the ledger could not be written. Carry that sentence
        // through instead of replacing it with a status code.
        return r.json().catch(function () { return {}; }).then(function (b) {
          var e = new Error('token ' + r.status);
          e.detail = b && b.detail;
          throw e;
        });
      })
      .then(function (tok) {
        if (!tok.client_secret) throw new Error('no token');
        return navigator.mediaDevices.getUserMedia({ audio: true })
          .then(function (stream) {
            micStream = stream;
            pc = new RTCPeerConnection();
            pc.addEventListener('connectionstatechange', function () {
              if (pc && (pc.connectionState === 'failed' ||
                         pc.connectionState === 'disconnected')) {
                stopVoice('Connection lost.');
              }
            });
            var audio = document.createElement('audio');
            audio.autoplay = true;
            pc.addEventListener('track', function (e) { audio.srcObject = e.streams[0]; });
            stream.getTracks().forEach(function (t) { pc.addTrack(t, stream); });

            dc = pc.createDataChannel('oai-events');
            wireChannel();

            return pc.createOffer().then(function (offer) {
              return pc.setLocalDescription(offer).then(function () {
                // /v1/realtime was the beta and now answers 400 with "The
                // Realtime Beta API is no longer supported. Please use
                // /v1/realtime/calls for the GA API." Taking it at its word.
                return fetch('https://api.openai.com/v1/realtime/calls?model=' +
                             encodeURIComponent(tok.model), {
                  method: 'POST',
                  body: offer.sdp,
                  headers: { Authorization: 'Bearer ' + tok.client_secret,
                             'Content-Type': 'application/sdp' }
                });
              });
            }).then(function (r) {
              if (!r.ok) throw new Error('sdp ' + r.status);
              return r.text();
            }).then(function (answer) {
              return pc.setRemoteDescription({ type: 'answer', sdp: answer });
            }).then(function () {
              micState('live', 'Listening — tap to stop');
              say('System', 'Connected. Ask about a field, a level, or visas.');
              var cap = (tok.max_session_seconds || 600) * 1000;
              sessionTimer = setTimeout(function () {
                stopVoice('Session ended after the time limit.');
              }, cap);
            });
          });
      })
      .catch(function (err) {
        stopVoice(null);
        var m = String(err && err.message || '');
        if (err && err.detail) {
          say('System', err.detail);
        } else if (m.indexOf('token') === 0 || m === 'no token') {
          say('System', 'Voice could not start. Everything on this page still works; use the buttons below the chart.');
        } else if (m.indexOf('Permission') >= 0 || m.indexOf('NotAllowed') >= 0) {
          say('System', 'Microphone permission was declined.');
        } else {
          say('System', 'Could not start the voice session. The dashboard still works.');
        }
      });
  }

  /* ------------------------------------------------------------ chrome */

  var CHIPS = [
    { t: "Computer science master's", f: function () {
        TOOLS.show_series({ field: '11', level: 'masters' }); } },
    { t: 'Engineering', f: function () {
        TOOLS.show_series({ field: '14', level: 'masters' }); } },
    { t: 'Compare all fields', f: function () {
        TOOLS.compare_fields({ level: 'masters', measure: 'share' }); } },
    { t: 'Domestic growth', f: function () {
        TOOLS.compare_fields({ level: 'masters', measure: 'growth_domestic' }); } },
    { t: 'F-1 visas', f: function () {
        TOOLS.show_f1({ countries: ['china', 'india'] }); } },
    { t: 'Doctorates', f: function () {
        TOOLS.show_series({ field: '11', level: 'doctorate' }); } }
  ];

  function buildChips() {
    var box = $('prompts');
    CHIPS.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'prompt-chip';
      b.textContent = c.t;
      b.addEventListener('click', c.f);
      box.appendChild(b);
    });
  }

  function opening() {
    var rows = aggregate('masters');
    drawLines(rows, { keys: [
      { field: 'dom', color: COL.dom, label: 'Domestic' },
      { field: 'nra', color: COL.nra, label: 'Non-resident' }] });
    setBoard("Core STEM master's degrees",
             'Domestic and non-resident recipients, all core-STEM fields');
    var f = rows[0], l = rows[rows.length - 1];
    setKpi('Non-resident share, ' + l.year, Math.round(l.share) + '%',
      'Both rose since ' + f.year + ': domestic ' + pct(f.dom, l.dom) +
      ', non-resident ' + pct(f.nra, l.nra) + '.');
  }

  function init() {
    fetch(BUNDLE_URL, { credentials: 'omit' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        data = j;
        buildChips();
        opening();
        if (VOICE_ENABLED && TOKEN_URL && $('mic')) {
          $('mic').addEventListener('click', startVoice);
        }
        window.addEventListener('resize', function () {
          clearTimeout(window.__liveRz);
          window.__liveRz = setTimeout(opening, 220);
        });
      })
      .catch(function () {
        setBoard('Data unavailable', 'The dashboard bundle could not be loaded.');
      });
  }

  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);
})();
