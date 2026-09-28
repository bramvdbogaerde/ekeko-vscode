import * as path from 'path';
import * as vscode from 'vscode';

// Ekeko's .clj source ships as plain resources inside
// damp.ekeko.jdtls.jar, but nothing in an opened Java project tells
// clj-kondo that jar exists, so every Ekeko symbol in a user's script is
// reported unresolved. This points clojure-lsp at the jars via
// .lsp/config.edn. in which key :project-specs/:classpath-cmd sets the the classpath.

// Marks a generated file as ours, so we replace our own earlier output but
// never a hand-written file. Bump the version tag when a generated shape
// changes.
const MARKER_PREFIX = ';; Written by the Ekeko VS Code extension';
const MARKER = `${MARKER_PREFIX} (v4) -- see lsp.ts.`;

// Match on this tail, not the jar's absolute path: VS Code installs into a
// versioned directory (vdb.ekeko-0.0.1/), so an absolute path stops matching
// after every extension upgrade.
const BUNDLE_JAR_RELATIVE_PATH = ['server', 'damp.ekeko.jdtls.jar'];
const BUNDLE_JAR_MARKER = BUNDLE_JAR_RELATIVE_PATH.join('/');

// damp.ekeko re-exports these via (:use ...), but clj-kondo doesn't follow
// :use re-exports, so each has to be referred directly. Keep in sync with
// damp/ekeko.clj's ns form.
const EKEKO_REFERRED_NAMESPACES = [
  'damp.ekeko',
  'damp.ekeko.logic',
  'damp.ekeko.jdt.ast',
  'damp.ekeko.jdt.structure',
  'damp.ekeko.jdt.aststructure',
  'damp.ekeko.jdt.convenience',
  'damp.ekeko.jdt.rewrites',
  'damp.qwal',
  'clojure.core.logic',
];

// Hook source for .clj-kondo/hooks/damp/ekeko.clj, covering two things
// :lint-as can't express:
//
// 1. (ekeko [?a ?b] goal ...) -- no built-in macro has that binding shape
//    (clojure.core/fn leaves the vector's symbols unresolved, let rejects an
//    odd-length vector). core.logic's own `fresh` has the same problem, hence
//    the hook covers it too.
// 2. Scripts use (use 'damp.ekeko) + (in-ns 'damp.ekeko) instead of an ns
//    form. clj-kondo analyses such a file as `user`, ignores the in-ns, and
//    -- because the file claims to *be* damp.ekeko -- overwrites the real
//    damp.ekeko entry in its cache with the file's own vars.
const HOOKS_NAMESPACE = 'hooks.damp.ekeko';
const HOOKS_RELATIVE_PATH = ['hooks', 'damp', 'ekeko.clj'];
const HOOKS_SOURCE = `${MARKER}
(ns ${HOOKS_NAMESPACE}
  (:require [clj-kondo.hooks-api :as api]))

;; (ekeko [?a ?b] goal ...) -> (do ekeko (let [?a nil ?b nil] goal ...))
;; The let resolves the logic variables; re-emitting the macro symbol keeps
;; clojure-lsp colouring the call site as a macro rather than a function.
(defn- rewrite-bindings [macro-sym vars-node body-nodes]
  (when (api/vector-node? vars-node)
    (let [pairs (mapcat (fn [v] [v (api/token-node nil)])
                        (:children vars-node))]
      (api/list-node
       (list (api/token-node 'do)
             macro-sym
             (api/list-node
              (list* (api/token-node 'let)
                     (api/vector-node (vec pairs))
                     body-nodes)))))))

(defn ekeko [{:keys [node]}]
  (let [[macro-sym vars & body] (:children node)]
    (when-let [n (rewrite-bindings macro-sym vars body)]
      {:node n})))

;; ekeko-n* takes a solution count before the binding vector.
(defn ekeko-n [{:keys [node]}]
  (let [[macro-sym cnt vars & body] (:children node)]
    (when-let [n (rewrite-bindings macro-sym vars body)]
      {:node (api/list-node (list (api/token-node 'do) cnt n))})))

;; (in-ns 'damp.ekeko) -> (require '[damp.ekeko :refer :all] ...)
(defn in-ns->requires [_]
  {:node (api/list-node
          (list* (api/token-node 'clojure.core/require)
                 (map (fn [ns-sym]
                        (api/list-node
                         (list (api/token-node 'quote)
                               (api/vector-node
                                [(api/token-node ns-sym)
                                 (api/keyword-node :refer)
                                 (api/keyword-node :all)]))))
                      '[${EKEKO_REFERRED_NAMESPACES.join('\n                        ')}])))})
`;

const KONDO_CONFIG = `${MARKER}
{:hooks {:analyze-call {damp.ekeko/ekeko          ${HOOKS_NAMESPACE}/ekeko
                        damp.ekeko/ekeko*         ${HOOKS_NAMESPACE}/ekeko
                        damp.ekeko/ekeko-n*       ${HOOKS_NAMESPACE}/ekeko-n
                        clojure.core.logic/fresh  ${HOOKS_NAMESPACE}/ekeko
                        clojure.core/in-ns        ${HOOKS_NAMESPACE}/in-ns->requires}}
 ;; The in-ns hook's generated requires trip these on a line the user never
 ;; wrote. unresolved-symbol stays on, so real typos are still reported.
 :linters {:refer-all {:level :off}
           :duplicate-require {:level :off}
           :use {:level :off}}}
`;

export async function ensureClojureLspClasspath(context: vscode.ExtensionContext): Promise<void> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    return;
  }

  const jarPaths = await collectLintClasspathJars(context);
  if (jarPaths.length === 0) {
    return;
  }

  const classpathCmd = classpathEchoCommand(jarPaths.join(path.delimiter));
  const classpathWritten = await writeOwnedConfigFile(
    vscode.Uri.joinPath(folder.uri, '.lsp', 'config.edn'),
    `${MARKER}\n` +
      '{:project-specs [{:project-path ".lsp/config.edn"\n' +
      `                   :classpath-cmd ${classpathCmd}}]}\n`,
    `Add this :classpath-cmd entry to its :project-specs vector yourself: ${classpathCmd}`
  );

  // clj-kondo's own lint configuration (a different file from the
  // clojure-lsp classpath override above, read directly by clj-kondo): a
  // hook teaching it the ekeko/ekeko*/ekeko-n* binding-vector shape and the
  // use/in-ns script idiom. See HOOKS_SOURCE for why :lint-as can't do it.
  const hookWritten = await writeOwnedConfigFile(
    vscode.Uri.joinPath(folder.uri, '.clj-kondo', ...HOOKS_RELATIVE_PATH),
    HOOKS_SOURCE,
    `Put this hook at .clj-kondo/${HOOKS_RELATIVE_PATH.join('/')} yourself (see the extension's lsp.ts).`
  );

  const lintConfigWritten = await writeOwnedConfigFile(
    vscode.Uri.joinPath(folder.uri, '.clj-kondo', 'config.edn'),
    KONDO_CONFIG,
    `Add this :hooks map to it yourself (see the extension's lsp.ts): ${HOOKS_NAMESPACE}`
  );

  // Two separate caches matter here, and they need very different treatment.
  //
  // Our config change invalidates clj-kondo's cached analysis (a file
  // analysed before the in-ns hook existed leaves damp.ekeko cached as that
  // file's own vars). Cheap to rebuild, so just drop it.
  if (hookWritten || lintConfigWritten) {
    try {
      await vscode.workspace.fs.delete(
        vscode.Uri.joinPath(folder.uri, '.clj-kondo', '.cache'),
        { recursive: true, useTrash: false }
      );
    } catch {
      // Not present (or not removable) -- nothing to invalidate.
    }
  }

  // clojure-lsp's db is project-wide, not ours to clear on principle -- but
  // while it looks current clojure-lsp skips classpath discovery entirely, so
  // it never indexes our jars and every symbol stays unresolved (clearing
  // only .clj-kondo/.cache appears to fix that until the next reload). There
  // is no re-index request to ask for instead, so invalidate it -- but only
  // when it was built without our jars. See invalidateStaleLspDb.
  if (classpathWritten) {
    await invalidateStaleLspDb(folder.uri);
  }

  if (!classpathWritten && !hookWritten && !lintConfigWritten) {
    return; // Everything already set up correctly -- nothing changed.
  }

  // clojure-lsp resolves the classpath once at startup and doesn't watch
  // config.edn, so a restart is needed for that change to take effect.
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

// Deletes clojure-lsp's analysis db only if it was built without our bundle
// jar; if it already mentions the jar it is left alone. Matching on
// BUNDLE_JAR_MARKER rather than an absolute path means an extension upgrade
// doesn't look stale and doesn't cost a re-index.
async function invalidateStaleLspDb(folderUri: vscode.Uri): Promise<void> {
  const dbUri = vscode.Uri.joinPath(folderUri, '.lsp', '.cache', 'db.transit.json');
  let contents: string;
  try {
    contents = Buffer.from(await vscode.workspace.fs.readFile(dbUri)).toString('utf8');
  } catch {
    return; // No db yet -- clojure-lsp will do a full analysis anyway.
  }
  if (contents.includes(BUNDLE_JAR_MARKER)) {
    return; // Already built with our classpath; not stale.
  }
  try {
    await vscode.workspace.fs.delete(dbUri, { useTrash: false });
  } catch {
    // Not removable -- leave it; the user can restart Clojure LSP manually.
  }
}

async function collectLintClasspathJars(context: vscode.ExtensionContext): Promise<string[]> {
  const paths: string[] = [];

  const bundleJar = vscode.Uri.joinPath(context.extensionUri, ...BUNDLE_JAR_RELATIVE_PATH);
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

// The :classpath-cmd vector that prints `classpath` on stdout.
//
// clojure-lsp runs this with clojure.java.shell/sh, i.e. ProcessBuilder with
// no shell,  On Windows `echo` is a cmd.exe builtin with no echo.exe on PATH, 
// so it cannot be resolved or 
// spawned and the classpath lookup fails outright; cmd.exe itself is a real
// executable, so go through it there.
function classpathEchoCommand(classpath: string): string {
  if (process.platform !== 'win32') {
    return `["echo" ${ednString(classpath)}]`;
  }
  const escaped = classpath.replace(/[&|<>^]/g, (ch) => `^${ch}`);
  return `["cmd" "/c" "echo" ${ednString(escaped)}]`;
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
