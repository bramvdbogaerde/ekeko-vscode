(function () {
  const vscode = acquireVsCodeApi();
  const status = document.getElementById('status');
  const container = document.getElementById('table-container');

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
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
      html += '<th>' + escapeHtml(v) + '</th>';
    }
    html += '</tr></thead><tbody>';
    for (const row of rows) {
      html += '<tr>';
      for (const cell of row) {
        html += '<td>' + renderCell(cell) + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    container.innerHTML = html;
  }

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

  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message.command === 'render') {
      render(message.result);
    }
  });

  render(null);
}());
