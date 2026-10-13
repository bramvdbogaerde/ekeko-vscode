(function () {
  const vscode = acquireVsCodeApi();
  const status = document.getElementById('status');
  const container = document.getElementById('table-container');
  const showClassToggle = document.getElementById('show-class-tooltips');
  const hover = document.getElementById('hover');

  // The last result rendered, to re-render when the toggle changes, and the
  // toggle's setting, kept in the webview's state so it survives the view
  // being hidden and shown again.
  let lastResult = null;
  const state = vscode.getState() || {};
  showClassToggle.checked = state.showClassTooltips !== false;

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

  function render(result) {
    lastResult = result;
    hideHover();
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
    const rows = result.rows || [];
    let text = rows.length + ' result' + (rows.length === 1 ? '' : 's') + ' for ' + result.query;
    if (typeof result.elapsedMs === 'number') {
      text += ' (' + result.elapsedMs.toFixed(1) + ' ms)';
    }
    // The footnote is markup, so build the status line as HTML -- with the
    // query (user-supplied) escaped, since it goes in verbatim above.
    let statusHtml = escapeHtml(text);
    const hasWrappedValue = rows.some((row) => row.some((cell) => cell.kind === 'wrapped-value'));
    if (hasWrappedValue) {
      statusHtml +=
        "<br/><span class='wrapped-sign'>*</span> = unwrapped version of the value is shown";
    }
    status.innerHTML = statusHtml;

    let html = '<table><thead><tr>';
    for (const v of vars) {
      html += '<th>' + escapeHtml(v) + '<div class="column-resizer"></div></th>';
    }
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
    const th = resizer.parentElement;
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
    hover.style.top = top + window.scrollY + 'px';
    hover.style.left = left + window.scrollX + 'px';
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
