import * as vscode from 'vscode';
import { EkekoResultsViewProvider, QueryResult } from './resultsPanel';

const EXAMPLE_QUERY = '(ekeko [?m] (ast :MethodDeclaration ?m))';

export async function runQuery(resultsView: EkekoResultsViewProvider): Promise<void> {
  const query = await getQueryText();
  if (!query) {
    return;
  }

  let result: unknown;
  try {
    result = await vscode.commands.executeCommand(
      'java.execute.workspaceCommand',
      'ekeko.runQuery',
      query
    );
  } catch (err) {
    await resultsView.reveal({ query, error: String(err) });
    vscode.window.showErrorMessage(`Ekeko: query failed - ${err}`);
    return;
  }

  await resultsView.reveal({ ...(result as Omit<QueryResult, 'query'>), query });
}

// Per GOAL.md/plan: read the query from the active editor's selection when
// one exists (e.g. a snippet selected inside an open .clj script), so users
// can keep queries in a real file instead of retyping them; otherwise fall
// back to a one-off input box.
async function getQueryText(): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (editor && !editor.selection.isEmpty) {
    const selected = editor.document.getText(editor.selection).trim();
    if (selected.length > 0) {
      return selected;
    }
  }

  return vscode.window.showInputBox({
    prompt: 'Ekeko query',
    placeHolder: EXAMPLE_QUERY,
    value: EXAMPLE_QUERY,
    ignoreFocusOut: true,
  });
}
