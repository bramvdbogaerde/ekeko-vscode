import * as vscode from 'vscode';

// Queries taking less than this never show a progress notification, so
// quick ones don't flash one on screen.
const SHOW_AFTER_MS = 500;

// Resolves the progress of each running query, by the id the server gave it.
const running = new Map<string, () => void>();

// Notified by the server (damp.ekeko.gui/with-query-progress in the jdt.ls
// bundle) when an (ekeko* ...)/(ekeko-n* ...) query starts at the REPL.
export function queryStarted(id: string, query: string): void {
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => (finish = resolve));
  running.set(id, finish);
  setTimeout(() => {
    if (!running.has(id)) {
      return;
    }
    void vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Ekeko: running query',
      },
      (_progress) => {
        return finished;
      }
    );
  }, SHOW_AFTER_MS);
}

// Notified by the server when that query has finished, failed or been
// interrupted; `expiredTimeoutMs` is set when the REPL's eval timeout
// stopped it.
export function queryFinished(id: string, expiredTimeoutMs?: number | null): void {
  running.get(id)?.();
  running.delete(id);
  if (typeof expiredTimeoutMs === 'number') {
    vscode.window.showWarningMessage(
      `Ekeko: query stopped timeout of ${expiredTimeoutMs} ms exceeded`);
  }
}

// Ends the progress of all queries, e.g. when the REPL they ran in stops.
export function clearQueryProgress(): void {
  for (const finish of running.values()) {
    finish();
  }
  running.clear();
}
