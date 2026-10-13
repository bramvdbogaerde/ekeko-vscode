import * as vscode from 'vscode';

export interface ResultCell {
  kind: 'code' | 'value' | 'wrapped-value';
  text: string;
  uri?: string;
  startOffset?: number;
  length?: number;
  // Class of the value shown, for its hover; absent for null.
  className?: string;
}

export interface QueryResult {
  query: string;
  vars: string[];
  rows: ResultCell[][];
  elapsedMs?: number;
  count?: number;
  // Documentation (Markdown) of the classes of the values in rows, by class
  // name, for the hover over their cells; left out for classes jdt.ls
  // couldn't find.
  classDocs?: Record<string, string>;
  // classDocs rendered to HTML, for the webview.
  classDocsHtml?: Record<string, string>;
}

export interface QueryError {
  query: string;
  error: string;
}

// A view docked in the bottom Panel area (contributes.viewsContainers.panel
// -- the same area as Terminal/Problems/Output), not an editor-area webview
// panel/tab, per explicit user request: results shouldn't compete for
// editor space while a Java file and the REPL are both open. VS Code has no
// manifest setting to default a contributed view straight into the
// secondary/right sidebar (that's always a user layout choice), but any
// Panel-area view -- this one included -- can be dragged there, or moved
// wholesale via "View: Move Panel to Secondary Side Bar".
export class EkekoResultsViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'ekeko.resultsView';

  private view: vscode.WebviewView | undefined;
  private lastResult: QueryResult | QueryError | undefined;

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')],
    };
    webviewView.webview.html = getHtml(webviewView.webview, this.extensionUri);
    webviewView.webview.onDidReceiveMessage(async (message) => {
      if (message.command === 'reveal') {
        await revealCodeCell(message.uri, message.startOffset, message.length);
      } else if (message.command === 'openLink') {
        await openLink(message.href);
      }
    });
    webviewView.onDidDispose(() => {
      this.view = undefined;
    });
    if (this.lastResult) {
      webviewView.webview.postMessage({ command: 'render', result: this.lastResult });
    }
  }

  // Called both from the "Ekeko: Run Query" command and from the
  // ekeko.showResults notification the server pushes whenever
  // ekeko*/ekeko-n* is evaluated at the connected Calva REPL. Focusing the
  // view (rather than posting directly) both reveals the sidebar if it's
  // closed and, the first time, triggers resolveWebviewView -- which then
  // renders lastResult itself, so the render below is only redundant (not
  // missed) if that race goes the other way.
  public async reveal(result: QueryResult | QueryError): Promise<void> {
    if ('classDocs' in result && result.classDocs) {
      result = { ...result, classDocsHtml: await renderMarkdown(result.classDocs) };
    }
    this.lastResult = result;
    await vscode.commands.executeCommand(`${EkekoResultsViewProvider.viewType}.focus`);
    this.view?.webview.postMessage({ command: 'render', result });
  }
}

// Renders each Markdown text to HTML with VS Code's built-in Markdown
// renderer (that of its Markdown preview); a text it fails to render is
// shown as is.
async function renderMarkdown(texts: Record<string, string>): Promise<Record<string, string>> {
  const html: Record<string, string> = {};
  for (const [key, text] of Object.entries(texts)) {
    try {
      html[key] = await vscode.commands.executeCommand<string>('markdown.api.render', text);
    } catch (err) {
      console.error(`Ekeko: failed to render documentation of ${key}`, err);
      html[key] = '<pre>' + escapeHtml(text) + '</pre>';
    }
  }
  return html;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Opens a link clicked in a hover, e.g. a jdt:// link to a class in the
// Javadoc, which redhat.java opens as the class's source.
async function openLink(href: string): Promise<void> {
  try {
    await vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(href));
  } catch (err) {
    vscode.window.showErrorMessage(`Ekeko: could not open ${href} - ${err}`);
  }
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
  <div id="toolbar">
    <label><input type="checkbox" id="show-class-tooltips" checked /> Show class documentation on hover</label>
    <label><input type="checkbox" id="hide-duplicates" /> Hide duplicate results</label>
  </div>
  <div id="status">Run an Ekeko query to see results here.</div>
  <div id="table-container"></div>
  <div id="hover" class="hover" hidden></div>
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
