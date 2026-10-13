(function () {
  const vscode = acquireVsCodeApi();
  const status = document.getElementById('status');
  const container = document.getElementById('table-container');
  const showClassToggle = document.getElementById('show-class-tooltips');
  const hideDuplicatesToggle = document.getElementById('hide-duplicates');
  const hover = document.getElementById('hover');
  const queryArea = document.getElementById('query');
  const queryCode = document.getElementById('query-code');
  const legend = document.getElementById('legend');

  // The last result rendered, to re-render when a toggle changes, and the
  // toggles' settings, kept in the webview's state so they survive the view
  // being hidden and shown again.
  let lastResult = null;
  const state = vscode.getState() || {};
  showClassToggle.checked = state.showClassTooltips !== false;
  hideDuplicatesToggle.checked = state.hideDuplicates === true;

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Marks a cell with the class of its value, for its hover.
  function cellClassAttribute(cell) {
    if (!cell.className) {
      return '';
    }
    return ' data-class="' + escapeHtml(cell.className) + '"';
  }

  function renderCell(cell) {
    if (cell.kind === 'code') {
      const uri = escapeHtml(cell.uri);
      const start = Number(cell.startOffset);
      const length = Number(cell.length);
      return (
        '<a class="code-cell" href="#" data-uri="' +
        uri +
        '" data-start="' +
        start +
        '" data-length="' +
        length +
        '">' +
        escapeHtml(cell.text) +
        '</a>'
      );
    } 
    if (cell.kind == 'wrapped-value') {
        return '<span class="value-cell">' + escapeHtml(cell.text) + '<span class="wrapped-sign" >*</span></span>';
    }
    return '<span class="value-cell">' + escapeHtml(cell.text) + '</span>';
  }

  // Identifies what a cell shows: a code cell by the source range of its
  // node (two nodes can print the same), any other cell by its text and
  // class (e.g. the number 1 and the string "1" differ).
  function cellKey(cell) {
    if (cell.kind === 'code') {
      return ['code', cell.uri, cell.startOffset, cell.length];
    }
    return [cell.kind, cell.text, cell.className];
  }

  // The rows without the ones identical to an earlier row.
  function withoutDuplicates(rows) {
    const seen = new Set();
    return rows.filter((row) => {
      const key = JSON.stringify(row.map(cellKey));
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // The column widths set by resizing (see below) on the table currently
  // shown, to keep them when the same result is shown again, e.g. when
  // toggling duplicates; null when the columns have their automatic widths.
  function resizedColumnWidths() {
    const table = container.querySelector('table.fixed-columns');
    if (!table) {
      return null;
    }
    return {
      table: table.style.width,
      columns: Array.from(table.querySelectorAll('th'), (th) => th.style.width),
    };
  }

  function restoreColumnWidths(widths) {
    const table = container.querySelector('table');
    const headers = table.querySelectorAll('th');
    if (headers.length !== widths.columns.length) {
      return;
    }
    headers.forEach((th, i) => {
      th.style.width = widths.columns[i];
    });
    table.style.width = widths.table;
    table.classList.add('fixed-columns');
  }

  // The query of the result, in the collapsible area below the status line,
  // highlighted by the extension (see resultsPanel.ts) or else shown as is.
  // The area keeps whether it is expanded from one result to the next.
  function renderQuery(result) {
    if (!result || !result.query) {
      queryArea.hidden = true;
      queryCode.innerHTML = '';
      return;
    }
    queryCode.innerHTML = result.queryHtml || '<pre><code>' + escapeHtml(result.query) + '</code></pre>';
    queryArea.hidden = false;
  }

  function render(result) {
    const widths = result === lastResult ? resizedColumnWidths() : null;
    lastResult = result;
    hideHover();
    renderQuery(result);
    legend.hidden = true;
    if (!result) {
      status.textContent = 'Run an Ekeko query to see results here.';
      container.innerHTML = '';
      return;
    }
    if (result.error) {
      status.textContent = 'Error: ' + result.error;
      container.innerHTML = '';
      return;
    }
    const vars = result.vars || [];
    const allRows = result.rows || [];
    const rows = hideDuplicatesToggle.checked ? withoutDuplicates(allRows) : allRows;
    let text = 'Found ' + rows.length + ' result' + (rows.length === 1 ? '' : 's');
    if (typeof result.elapsedMs === 'number') {
      text += ' in ' + result.elapsedMs.toFixed(1) + ' ms';
    }
    const hidden = allRows.length - rows.length;
    if (hidden > 0) {
      text += ' (' + hidden + ' duplicate' + (hidden === 1 ? '' : 's') + ' hidden)';
    }
    status.textContent = text;
    legend.hidden = !rows.some((row) => row.some((cell) => cell.kind === 'wrapped-value'));

    let html = '<table><thead><tr>';
    // Each border between two columns gets a handle on both sides of it,
    // both resizing the column on its left, so it is easy to grab.
    vars.forEach((v, i) => {
      html += '<th>';
      if (i > 0) {
        html += '<div class="column-resizer left"></div>';
      }
      html += escapeHtml(v) + '<div class="column-resizer right"></div></th>';
    });
    html += '</tr></thead><tbody>';
    for (const row of rows) {
      html += '<tr>';
      for (const cell of row) {
        html += '<td' + cellClassAttribute(cell) + '>' + renderCell(cell) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
    if (widths) {
      restoreColumnWidths(widths);
    }
  }

  // Resizing a column by dragging the right edge of its header. The first
  // drag fixes every column at its current width (and the table at their
  // sum), after which each column keeps the width it is dragged to; the
  // table can then grow wider than the view, which scrolls horizontally.
  const MIN_COLUMN_WIDTH = 40;

  function fixColumnWidths(table) {
    if (table.classList.contains('fixed-columns')) {
      return;
    }
    const headers = table.querySelectorAll('th');
    const widths = Array.from(headers, (th) => th.getBoundingClientRect().width);
    headers.forEach((th, i) => {
      th.style.width = widths[i] + 'px';
    });
    table.style.width = widths.reduce((sum, w) => sum + w, 0) + 'px';
    table.classList.add('fixed-columns');
  }

  container.addEventListener('mousedown', (event) => {
    const resizer = event.target.closest('.column-resizer');
    if (!resizer || event.button !== 0) {
      return;
    }
    event.preventDefault();
    hideHover();
    const th = resizer.classList.contains('left')
      ? resizer.parentElement.previousElementSibling
      : resizer.parentElement;
    const table = th.closest('table');
    fixColumnWidths(table);
    const startX = event.clientX;
    const startWidth = th.getBoundingClientRect().width;
    const startTableWidth = table.getBoundingClientRect().width;
    document.body.classList.add('resizing-column');
    resizer.classList.add('active');

    function onMove(moveEvent) {
      const width = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
      th.style.width = width + 'px';
      table.style.width = startTableWidth + width - startWidth + 'px';
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing-column');
      resizer.classList.remove('active');
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });

  container.addEventListener('click', (event) => {
    const target = event.target.closest('a.code-cell');
    if (!target) {
      return;
    }
    event.preventDefault();
    vscode.postMessage({
      command: 'reveal',
      uri: target.getAttribute('data-uri'),
      startOffset: Number(target.getAttribute('data-start')),
      length: Number(target.getAttribute('data-length')),
    });
  });

  hideDuplicatesToggle.addEventListener('change', () => {
    vscode.setState({ ...vscode.getState(), hideDuplicates: hideDuplicatesToggle.checked });
    render(lastResult);
  });

  showClassToggle.addEventListener('change', () => {
    vscode.setState({ ...vscode.getState(), showClassTooltips: showClassToggle.checked });
    hideHover();
  });

  // The hover over a cell, modelled on the Java editor's: it shows the
  // documentation of the class of the cell's value (rendered by the
  // extension, see resultsPanel.ts), or just the class's name when there is
  // none. Like the editor's, it appears after a short delay and stays open
  // while the mouse moves onto it, so it can be scrolled and its links
  // clicked.
  const SHOW_DELAY_MS = 300;
  const HIDE_DELAY_MS = 200;
  let hoveredCell = null;
  let showTimer = null;
  let hideTimer = null;

  function hoverHtml(className) {
    const docs = (lastResult && lastResult.classDocsHtml) || {};
    return docs[className] || '<pre><code>' + escapeHtml(className) + '</code></pre>';
  }

  function showHover(cell) {
    hover.innerHTML = hoverHtml(cell.getAttribute('data-class'));
    hover.hidden = false;
    hover.scrollTop = 0;
    // Below the cell, or above it when there is no room below; kept within
    // the view horizontally.
    const cellBox = cell.getBoundingClientRect();
    const hoverBox = hover.getBoundingClientRect();
    const below = cellBox.bottom + hoverBox.height <= window.innerHeight;
    const top = below ? cellBox.bottom : Math.max(0, cellBox.top - hoverBox.height);
    const left = Math.max(0, Math.min(cellBox.left, window.innerWidth - hoverBox.width));
    hover.style.top = top + 'px';
    hover.style.left = left + 'px';
  }

  function hideHover() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hoveredCell = null;
    hover.hidden = true;
  }

  function scheduleHide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hideHover, HIDE_DELAY_MS);
  }

  container.addEventListener('mouseover', (event) => {
    const cell = event.target.closest('td[data-class]');
    if (!cell || !showClassToggle.checked || document.body.classList.contains('resizing-column')) {
      return;
    }
    clearTimeout(hideTimer);
    if (cell === hoveredCell) {
      return;
    }
    hoveredCell = cell;
    clearTimeout(showTimer);
    if (hover.hidden) {
      showTimer = setTimeout(() => showHover(cell), SHOW_DELAY_MS);
    } else {
      showHover(cell);
    }
  });

  container.addEventListener('mouseout', (event) => {
    const cell = event.target.closest('td[data-class]');
    if (cell && !cell.contains(event.relatedTarget)) {
      scheduleHide();
    }
  });

  // The hover stays where it was shown, so it would no longer be next to
  // its cell once the table scrolls.
  container.addEventListener('scroll', hideHover);

  hover.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  hover.addEventListener('mouseleave', scheduleHide);

  hover.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (!link) {
      return;
    }
    event.preventDefault();
    vscode.postMessage({ command: 'openLink', href: link.getAttribute('href') });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'render') {
      render(message.result);
    }
  });

  render(null);
}());
