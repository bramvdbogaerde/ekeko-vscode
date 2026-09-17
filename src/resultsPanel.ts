import * as vscode from 'vscode';

export interface ResultCell {
  kind: 'code' | 'value';
  text: string;
  uri?: string;
  startOffset?: number;
  length?: number;
}

export interface QueryResult {
  query: string;
  vars: string[];
  rows: ResultCell[][];
  elapsedMs?: number;
  count?: number;
}

export interface QueryError {
  query: string;
  error: string;
}

// Singleton: repeated queries (whether typed at the Calva REPL as
// ekeko*/ekeko-n*, per GOAL.md's "just like the Eclipse plugin" requirement,
// or run via the "Ekeko: Run Query" command) reveal/update the same panel
// rather than piling up a new tab per query.
let currentPanel: vscode.WebviewPanel | undefined;

export function showQueryResult(context: vscode.ExtensionContext, result: QueryResult | QueryError): void {
  const panel = getOrCreatePanel(context);
  panel.webview.postMessage({ command: 'render', result });
}

function getOrCreatePanel(context: vscode.ExtensionContext): vscode.WebviewPanel {
  if (currentPanel) {
    currentPanel.reveal(vscode.ViewColumn.Beside, true);
    return currentPanel;
  }

  const panel = vscode.window.createWebviewPanel(
    'ekekoResults',
    'Ekeko Results',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')],
      retainContextWhenHidden: true,
    }
  );

  panel.webview.html = getHtml(panel.webview, context.extensionUri);
  panel.onDidDispose(() => {
    currentPanel = undefined;
  });
  panel.webview.onDidReceiveMessage(async (message) => {
    if (message.command === 'reveal') {
      await revealCodeCell(message.uri, message.startOffset, message.length);
    }
  });

  currentPanel = panel;
  return panel;
}

async function revealCodeCell(uriString: string, startOffset: number, length: number): Promise<void> {
  try {
    const uri = vscode.Uri.parse(uriString);
    const document = await vscode.workspace.openTextDocument(uri);
    const start = document.positionAt(startOffset);
    const end = document.positionAt(startOffset + length);
    const range = new vscode.Range(start, end);
    await vscode.window.showTextDocument(document, {
      viewColumn: vscode.ViewColumn.One,
      selection: range,
    });
  } catch (err) {
    vscode.window.showErrorMessage(`Ekeko: could not jump to source - ${err}`);
  }
}

function getHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'results.js'));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'results.css'));
  const nonce = getNonce();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Ekeko Results</title>
</head>
<body>
  <div id="status">Run an Ekeko query to see results here.</div>
  <div id="table-container"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
