import * as path from 'path';
import * as vscode from 'vscode';

// clj-kondo/clojure-lsp (which power Calva's autocomplete and diagnostics)
// only know about symbols they can find on a classpath they can inspect.
// Ekeko's own .clj source is embedded as plain resources inside
// damp.ekeko.jdtls.jar -- readable by clj-kondo directly, the same way it
// reads any Clojure library dependency jar -- but nothing in an opened
// Java project tells clj-kondo that jar exists (there's no deps.edn/
// project.clj naming it; it's only ever loaded into jdt.ls's own OSGi
// runtime). Without that, every Ekeko/core.logic symbol in a user's .clj
// script shows up as an unresolved-symbol warning and gets no
// autocomplete.
//
// Fix: write a .lsp/config.edn with a :project-specs entry pointing
// clojure-lsp at a :classpath-cmd that just echoes the jars we want on the
// classpath (the bundle jar, plus core.logic/qwal's plain jars, staged
// separately by scripts/build-server.sh since those two are only embedded
// as *nested* jars inside the OSGi bundle, which clj-kondo can't see
// into). There is no plain static ":classpath" override key in
// clojure-lsp despite that being the first thing one reaches for --
// :project-specs/:classpath-cmd is the actual supported mechanism for "no
// build tool describes my classpath" (verified against clojure-lsp's own
// source: clojure-lsp.classpath/valid-project-spec? requires each entry's
// :project-path to be a file that exists under the project root before
// its :classpath-cmd is used at all -- ".lsp/config.edn" itself, which we
// just wrote, always qualifies). Only works where a plain "echo" binary
// is on PATH (Linux/macOS); Windows isn't handled here.

// Marks a file as ours: lets a later, fixed version of this module
// recognize and replace a file an earlier (possibly buggy) version of
// itself wrote, without touching a file the user wrote by hand. Bump the
// trailing version tag whenever a generated shape changes in a way that
// needs a fresh rewrite even if an already-tagged file is present (v1 of
// .lsp/config.edn used a plain, non-functional ":classpath" key, for
// example).
const MARKER_PREFIX = ';; Written by the Ekeko VS Code extension';
const MARKER = `${MARKER_PREFIX} (v2) -- see lsp.ts.`;

export async function ensureClojureLspClasspath(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }

  const jarPaths = await collectLintClasspathJars(context);
  if (jarPaths.length === 0) {
    return;
  }

  const classpathString = jarPaths.join(path.delimiter);
  const classpathWritten = await writeOwnedConfigFile(
    vscode.Uri.joinPath(folder.uri, '.lsp', 'config.edn'),
    `${MARKER}\n` +
      '{:project-specs [{:project-path ".lsp/config.edn"\n' +
      `                   :classpath-cmd ["echo" ${ednString(classpathString)}]}]}\n`,
    `Add this :classpath-cmd entry to its :project-specs vector yourself: ["echo" ${ednString(classpathString)}]`
  );

  // ekeko/ekeko*/ekeko-n* bind their first (or, for ekeko-n*, second)
  // argument as a core.logic `fresh` binding vector -- clj-kondo doesn't
  // execute our macros to discover that, so every logic variable used in
  // the body (e.g. ?m in (ekeko [?m] ...)) shows as unresolved even once
  // the macro itself resolves. :lint-as maps them onto clojure.core/fn,
  // whose own binding-vector shape clj-kondo already understands, so it
  // treats [?m] as real parameter bindings instead. This is clj-kondo's
  // own lint configuration, not clojure-lsp's -- it lives in a different
  // file (.clj-kondo/config.edn) that clj-kondo reads directly, unlike
  // the classpath override above.
  const lintAsWritten = await writeOwnedConfigFile(
    vscode.Uri.joinPath(folder.uri, '.clj-kondo', 'config.edn'),
    `${MARKER}\n` +
      '{:lint-as {damp.ekeko/ekeko clojure.core/fn\n' +
      '           damp.ekeko/ekeko* clojure.core/fn\n' +
      '           damp.ekeko/ekeko-n* clojure.core/fn}}\n',
    'Add these entries to its :lint-as map yourself: {damp.ekeko/ekeko clojure.core/fn, ' +
      'damp.ekeko/ekeko* clojure.core/fn, damp.ekeko/ekeko-n* clojure.core/fn}'
  );

  if (!classpathWritten && !lintAsWritten) {
    return; // Both already set up correctly -- nothing changed.
  }

  // A restart is only strictly necessary for the classpath change (which
  // clojure-lsp resolves once at startup and doesn't watch config.edn for
  // afterward -- a rescan means re-parsing every .clj file in every jar on
  // the classpath); clj-kondo re-reads its own lint config per analysis
  // pass, so :lint-as changes alone would likely take effect without one.
  // We can't always tell which happened, and restarting is low-risk and
  // one-time (this whole function no-ops on every later activation, once
  // both files are up to date), so just do it rather than ask.
  vscode.window.setStatusBarMessage(
    'Ekeko: updated .lsp/config.edn and restarted Clojure LSP so Calva recognizes Ekeko/core.logic symbols.',
    8000
  );
  try {
    await vscode.commands.executeCommand('calva.clojureLsp.restart');
  } catch (err) {
    // Calva may not be installed, or not active yet (it only activates
    // once a Clojure file is open) -- the config is already written and
    // will take effect the next time clojure-lsp starts regardless.
    console.error('Ekeko: could not restart Clojure LSP', err);
  }
}

// Writes `content` to `targetUri` unless it's already there, UNLESS an
// existing file at that path isn't one we wrote ourselves (no MARKER_PREFIX
// -- a real user config), in which case it's left untouched and
// `conflictHint` is shown instead. Returns whether a write happened.
async function writeOwnedConfigFile(
  targetUri: vscode.Uri,
  content: string,
  conflictHint: string
): Promise<boolean> {
  const existing = await readFileIfExists(targetUri);
  if (existing !== undefined) {
    if (existing === content) {
      return false; // Already set up correctly.
    }
    if (!existing.startsWith(MARKER_PREFIX)) {
      vscode.window.showWarningMessage(
        `Ekeko: ${vscode.workspace.asRelativePath(targetUri)} already exists without Ekeko's settings, ` +
          `so Calva won't fully recognize Ekeko/core.logic symbols. ${conflictHint}`
      );
      return false;
    }
    // Ours, but stale (an older/buggy version wrote it, or the content
    // changed, e.g. a reinstall to a new extension version path) --
    // fall through and rewrite it below.
  }

  await vscode.workspace.fs.createDirectory(
    vscode.Uri.joinPath(targetUri, '..')
  );
  await vscode.workspace.fs.writeFile(targetUri, Buffer.from(content, 'utf8'));
  return true;
}

async function collectLintClasspathJars(context: vscode.ExtensionContext): Promise<string[]> {
  const paths: string[] = [];

  const bundleJar = vscode.Uri.joinPath(context.extensionUri, 'server', 'damp.ekeko.jdtls.jar');
  if (await fileExists(bundleJar)) {
    paths.push(bundleJar.fsPath);
  }

  const lintLibsDir = vscode.Uri.joinPath(context.extensionUri, 'server', 'lint-libs');
  try {
    const entries = await vscode.workspace.fs.readDirectory(lintLibsDir);
    for (const [name, type] of entries) {
      if (type === vscode.FileType.File && name.endsWith('.jar')) {
        paths.push(vscode.Uri.joinPath(lintLibsDir, name).fsPath);
      }
    }
  } catch {
    // lint-libs/ not present -- e.g. a dev build where build-server.sh
    // hasn't been re-run since this feature was added. Ekeko's own
    // symbols (from the bundle jar above, if present) still get set up.
  }

  return paths;
}

function ednString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function fileExists(uri: vscode.Uri): Promise<boolean> {
  try {
    await vscode.workspace.fs.stat(uri);
    return true;
  } catch {
    return false;
  }
}

async function readFileIfExists(uri: vscode.Uri): Promise<string | undefined> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return undefined;
  }
}
