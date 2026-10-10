/* Sortable, filterable tables.
 *
 * Upgrades any <table data-sortable> in place: click a header to sort, click
 * again to reverse. A table that also carries data-controls gets a panel below
 * it for choosing columns, limiting the rows, and filtering.
 *
 * Written generically rather than for one page, because the next table that
 * wants this should not need a second copy of it.
 *
 * EVERYTHING IS ON BY DEFAULT. The panel narrows a table that is already
 * showing everything; it never hides something a reader has to go and find.
 * A row hidden by a filter is still in the document and comes straight back.
 *
 * The sort key comes from data-sort where the builder supplies one, and is
 * parsed from the text otherwise. That matters here: "44 of 52" and "$1.56bn"
 * sort wrongly both as strings and as a naive parseFloat, and a dash has to
 * sort below every real number rather than above them.
 */
(function () {
  'use strict';

  function keyOf(cell) {
    if (cell && cell.dataset && cell.dataset.sort !== undefined) {
      var d = parseFloat(cell.dataset.sort);
      return isNaN(d) ? cell.dataset.sort.toLowerCase() : d;
    }
    var text = ((cell && cell.textContent) || '').trim();
    var num = text.replace(/,/g, '').replace(/^\$/, '').replace(/%$/, '');
    var m = num.match(/^-?\d*\.?\d+/);
    if (m && /^[-$]?[\d,.]+\s*%?$/.test(text.replace(/,/g, ''))) {
      return parseFloat(m[0]);
    }
    if (m && m[0].length === num.length) return parseFloat(m[0]);
    return text.toLowerCase();
  }

  // DRILL-DOWN TABLES. A sortable table may also be a drill-down, where each
  // row is followed by a hidden detail row holding what it opens onto. Those
  // detail rows are not rows of the table in any sense a reader would mean:
  // they are not sorted, not counted, and not limited. They move with the row
  // they belong to.
  function isDetail(tr) {
    return !!tr && tr.classList && tr.classList.contains('detail');
  }

  function detailFor(tr) {
    var next = tr.nextElementSibling;
    if (isDetail(next)) return next;
    // The public-sector page names a detail row after its own row rather than
    // carrying a second copy of the id on the row, for page weight.
    return tr.id ? document.getElementById('d-' + tr.id) : null;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function upgrade(table) {
    var head = table.querySelector('thead');
    var body = table.querySelector('tbody');
    if (!head || !body) return;
    var headers = Array.prototype.slice.call(head.querySelectorAll('th'));
    var state = { col: -1, dir: 1, hidden: {}, limit: 0, gradOnly: false };

    // Rows the generator marked as having a graduate programme. The filter is
    // offered only when the table says which rows qualify -- inferring it from
    // a column would break the moment a column moved.
    var gradRows = body.querySelectorAll('tr[data-has-grad]').length;

    function apply() {
      headers.forEach(function (th, i) {
        var off = !!state.hidden[i];
        th.style.display = off ? 'none' : '';
        Array.prototype.forEach.call(body.rows, function (r) {
          if (isDetail(r)) return;
          if (r.cells[i]) r.cells[i].style.display = off ? 'none' : '';
        });
      });
      var shown = 0;
      Array.prototype.forEach.call(body.rows, function (r) {
        // A drill-down's detail row is part of the row above it, not a row of
        // its own. It must not count against a limit, and it must not have
        // its display forced -- the `hidden` attribute is what opens it.
        if (isDetail(r)) return;
        var ok = true;
        if (state.gradOnly && r.dataset.hasGrad !== '1') ok = false;
        if (ok && state.limit && shown >= state.limit) ok = false;
        if (ok) shown++;
        r.style.display = ok ? '' : 'none';
      });
      if (table.__count) {
        var total = Array.prototype.filter.call(
          body.rows, function (r) { return !isDetail(r); }).length;
        table.__count.textContent = shown + ' of ' + total
          + ' institution' + (total === 1 ? '' : 's') + ' shown';
      }
    }
    table.__apply = apply;

    headers.forEach(function (th, i) {
      th.tabIndex = 0;
      th.setAttribute('role', 'button');
      th.setAttribute('aria-sort', 'none');
      th.classList.add('sortable');
      th.setAttribute('aria-label', 'Sort by ' + th.textContent.trim());

      function sort() {
        state.dir = state.col === i ? -state.dir : 1;
        state.col = i;
        // `body.rows` is this tbody's own rows. querySelectorAll('tr') was
        // every descendant row, so a table nested inside a drill-down's
        // detail cell had its ten filing rows sorted into the outer table and
        // lost -- the inner table was left with an empty tbody.
        var rows = Array.prototype.filter.call(
          body.rows, function (r) { return !isDetail(r); });
        rows.sort(function (a, b) {
          var x = keyOf(a.cells[i]), y = keyOf(b.cells[i]);
          if (typeof x === 'number' && typeof y === 'number') {
            return (x - y) * state.dir;
          }
          return String(x).localeCompare(String(y)) * state.dir;
        });
        // A detail row follows the row it belongs to. Sorting the two
        // independently would file every open drill-down under the wrong
        // employer, which is worse than not sorting at all. The pairs are
        // read before anything moves: nextElementSibling is not stable once
        // rows start being re-appended.
        var pairs = rows.map(function (r) { return [r, detailFor(r)]; });
        pairs.forEach(function (p) {
          body.appendChild(p[0]);
          if (p[1]) body.appendChild(p[1]);
        });
        headers.forEach(function (h, j) {
          h.setAttribute('aria-sort', j === i
            ? (state.dir === 1 ? 'ascending' : 'descending') : 'none');
          h.classList.toggle('sorted', j === i);
          h.classList.toggle('desc', j === i && state.dir === -1);
        });
        // A row limit means "the top N of what is on screen now", so it has
        // to be re-applied after every sort or it would pin the first N rows
        // of the original order forever.
        apply();
      }

      th.addEventListener('click', sort);
      th.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); sort(); }
      });
    });

    if (table.hasAttribute('data-controls')) {
      buildControls(table, headers, state, apply, gradRows);
    }
  }

  function buildControls(table, headers, state, apply, gradRows) {
    var id = 'tc' + Math.random().toString(36).slice(2, 8);
    var panel = el('div', 'tbl-controls');

    var rowsGroup = el('div', 'tc-group');
    rowsGroup.appendChild(el('span', 'tc-label', 'Show'));
    [['All', 0], ['Top 5', 5], ['Top 10', 10], ['Top 15', 15], ['Top 25', 25]]
      .forEach(function (opt, i) {
        var b = el('button', 'tc-chip' + (i === 0 ? ' on' : ''), opt[0]);
        b.type = 'button';
        b.addEventListener('click', function () {
          state.limit = opt[1];
          custom.value = '';
          Array.prototype.forEach.call(rowsGroup.querySelectorAll('.tc-chip'),
            function (o) { o.classList.toggle('on', o === b); });
          apply();
        });
        rowsGroup.appendChild(b);
      });
    var custom = el('input', 'tc-num');
    custom.type = 'number';
    custom.min = '1';
    custom.placeholder = 'N';
    custom.id = id + '-n';
    custom.setAttribute('aria-label', 'Show the top how many institutions');
    custom.addEventListener('input', function () {
      var v = parseInt(custom.value, 10);
      state.limit = isNaN(v) || v < 1 ? 0 : v;
      Array.prototype.forEach.call(rowsGroup.querySelectorAll('.tc-chip'),
        function (o) { o.classList.remove('on'); });
      apply();
    });
    rowsGroup.appendChild(custom);
    panel.appendChild(rowsGroup);

    if (gradRows) {
      var filterGroup = el('div', 'tc-group');
      var lab = el('label', 'tc-check');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.addEventListener('change', function () {
        state.gradOnly = cb.checked;
        apply();
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(
        ' Only institutions with a graduate programme'));
      filterGroup.appendChild(lab);
      panel.appendChild(filterGroup);
    }

    var colGroup = el('div', 'tc-group tc-cols');
    colGroup.appendChild(el('span', 'tc-label', 'Columns'));
    headers.forEach(function (th, i) {
      if (i === 0) return;                       // the row's name always stays
      var lab = el('label', 'tc-check');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.addEventListener('change', function () {
        state.hidden[i] = !cb.checked;
        apply();
      });
      lab.appendChild(cb);
      lab.appendChild(document.createTextNode(' ' + th.textContent.trim()));
      colGroup.appendChild(lab);
    });
    panel.appendChild(colGroup);

    var count = el('p', 'tc-count', '');
    table.__count = count;
    panel.appendChild(count);

    var wrap = table.closest('.table-wrap') || table;
    wrap.parentNode.insertBefore(panel, wrap.nextSibling);
    apply();
  }

  function style() {
    var css = document.createElement('style');
    css.textContent = [
      'table th.sortable{cursor:pointer;user-select:none;position:relative;',
      'padding-right:1.1rem;}',
      'table th.sortable:hover{color:var(--text);}',
      'table th.sortable:focus-visible{outline:2px solid var(--accent,#38bdf8);',
      'outline-offset:2px;}',
      'table th.sortable::after{content:"\\2195";position:absolute;right:.25rem;',
      'opacity:.3;font-size:.8em;}',
      'table th.sortable.sorted::after{content:"\\2191";opacity:1;}',
      'table th.sortable.sorted.desc::after{content:"\\2193";}',
      '.tbl-controls{margin:.8rem 0 0;padding:.8rem .9rem;border:1px solid ',
      'var(--border);border-radius:10px;display:flex;flex-direction:column;',
      'gap:.6rem;font-size:.82rem;}',
      '.tc-group{display:flex;flex-wrap:wrap;gap:.45rem .9rem;align-items:center;}',
      '.tc-label{font-size:.71rem;text-transform:uppercase;letter-spacing:.07em;',
      'color:var(--text-muted);}',
      '.tc-chip{font:inherit;font-size:.78rem;padding:.2rem .7rem;border-radius:999px;',
      'border:1px solid var(--border);background:transparent;color:var(--text-muted);',
      'cursor:pointer;}',
      '.tc-chip.on{background:var(--text);color:var(--bg);border-color:var(--text);}',
      '.tc-num{font:inherit;font-size:.78rem;width:4.5rem;padding:.18rem .45rem;',
      'border-radius:6px;border:1px solid var(--border);background:transparent;',
      'color:var(--text);}',
      '.tc-check{display:inline-flex;align-items:center;gap:.3rem;color:var(--text-muted);',
      'cursor:pointer;}',
      '.tc-check input{accent-color:var(--accent);}',
      '.tc-count{margin:0;font-size:.74rem;color:var(--text-muted);}',
      '@media (max-width:620px){.tc-cols{gap:.35rem .7rem;}}'
    ].join('');
    document.head.appendChild(css);
  }

  function init() {
    style();
    Array.prototype.forEach.call(
      document.querySelectorAll('table[data-sortable]'), upgrade);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
