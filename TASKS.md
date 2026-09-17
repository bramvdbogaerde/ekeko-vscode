# Task checklist

Tracks completed tasks against the approved plan
(`/home/bram/.claude/plans/sleepy-napping-willow.md`). One commit per
checked-off task, per GOAL.md's process requirements.

## Phase 0 — Bootstrap + JDT compatibility spike

- [x] `git init` new repo, `.gitignore`, skeleton `README.md`
- [x] Build `eclipse.jdt.ls` locally, obtain JDT core jars
- [x] Install VSCodium + redhat.java + Calva on Gnome desktop, baseline
      sanity check (sample project imports, reconciles, compiles cleanly)
- [x] Identify current `AST.JLS*` constant in the JDT core jar redhat.java
      actually bundles (`AST.getJLSLatest()`, `JLS_Latest = 26`)
- [x] Spike: minimal driver exercising `JavaProjectModel.parse`'s call shape
      plus representative `damp.ekeko.jdt.*` relation patterns (instanceof
      dispatch, binding resolution, structural property reflection,
      parent/child traversal, start/length) against that JDT core jar — all
      18 checks passed, see `spike/FINDINGS.md`
- [x] Decision gate: **mechanical port confirmed** — `damp.ekeko.jdt.*`
      needs only the `AST.JLS8` → `AST.getJLSLatest()` edit, no rewrite

## Phase 1 — Adapt the Ekeko query engine + build the jdt.ls OSGi bundle

**Architecture correction (see `/home/bram/ekeko/GOAL.md`'s "Modifications to
damp.ekeko" section):** rather than vendor-copying `damp.ekeko` source into
this repo, the query-engine-side adaptations happen as real commits directly
in `damp.ekeko` (contributable upstream), and the jdt.ls-specific bundle
glue lives in a new `damp.ekeko/damp.ekeko.jdtls/` directory inside that
repo instead — building against/reusing `damp.ekeko.plugin`'s source
directly (single source of truth). This repo (`ekeko-vscode/`) is the VS
Code extension (TypeScript) only.

- [x] Adapt `damp.ekeko.plugin` so its query engine loads without an
      Eclipse workbench (EkekoLog facade, reflective JLS-level resolution,
      PROCESSERRORS_PROPERTY relocation, Clojure 1.12.6/core.logic 1.1.1
      bump, Barista glue extraction, deferred gui/dropped forced Soot
      `:use`) — 6 commits in `damp.ekeko`, verified by loading every
      `damp.ekeko.jdt.*` namespace + `damp.ekeko` itself and running a
      trivial query through the `ekeko` macro
- [x] Create `damp.ekeko/damp.ekeko.jdtls/` bundle (Maven + maven-bundle-plugin
      generating the OSGi manifest, not hand-written; not Tycho/Neon-targeted —
      see `damp.ekeko.jdtls/README.md`)
- [x] Bundle activator (`EkekoJdtlsActivator`): auto-enables the Ekeko nature
      (`Natures.addNature`) on open Java projects so the existing
      `EkekoNature`→`EkekoBuilder` wiring drives model population via
      jdt.ls's normal build lifecycle — no custom `IResourceChangeListener`
      rebuild trigger needed, just a short delayed retry job for the
      startup race against jdt.ls's own project import
- [x] Verify: built the jar, installed it into a real jdt.ls Standard server
      (VSCodium + redhat.java, via a scratch extension contributing the jar
      through `contributes.javaExtensions`) against a sample Java project.
      Confirmed via the Java Language Server output channel: bundle
      installs and starts, `EkekoJdtlsActivator` runs, nature gets enabled,
      and `EkekoModel.populate()` runs ("Populating Ekeko project models
      for queried projects."). Running an actual Ekeko query end-to-end
      needs a command entry point, which is Phase 2's delegate command
      handler — not yet exercised.

## Phase 2 — VS Code extension shell + bundle wiring + delegate commands

- [x] `package.json` (extensionDependencies, javaExtensions, commands),
      `scripts/build-server.sh` (builds `damp.ekeko.jdtls` and stages its
      jar into `server/` for packaging), `src/extension.ts`
- [x] `EkekoCommandHandler` + `plugin.xml` delegateCommandHandler
      registration (in `damp.ekeko.jdtls`, its own commit)
- [x] Verify: packaged a real `.vsix`, installed it in VSCodium alongside
      `redhat.java`, ran "Ekeko: Rebuild Model" from the command palette
      against a sample Java project, and confirmed the
      "Ekeko: rebuilt model for sample-java-project" success notification —
      full round trip (command palette → extension → `java.execute.
      workspaceCommand` → `EkekoCommandHandler` → `EkekoModel.
      fullProjectBuild`) verified interactively. Along the way, fixed:
      the OSGi bundle needing `singleton:=true` for its `plugin.xml`
      extensions to be processed at all; `EkekoNature` needing its own
      nature/builder extension declarations (not just referencing the ids);
      and the client-side command needing a distinct id
      (`ekeko.command.rebuildModel`) since the LSP client library
      auto-registers a same-named passthrough for every server-advertised
      command, colliding with our own registration under the raw id.

## Phase 3 — REPL integration (Calva)

- [x] nREPL startup inside the bundle (`EkekoReplController`, no ccw
      dependency — see `damp.ekeko.jdtls`'s own commits)
- [x] `.nrepl-port` written automatically by the extension (`src/repl.ts`,
      to the first workspace folder root)
- [x] Start/stop REPL commands (`Ekeko: Start REPL`/`Ekeko: Stop REPL`) +
      Calva connect wiring (`calva.connect` invoked automatically after
      starting, with an explicit `connectSequence: 'Generic'` so Calva
      connects straight away instead of prompting the user to pick a
      project type/connect sequence; prompts to install Calva if not
      present). `.vscode/extensions.json` recommends
      `betterthantomorrow.calva`.
- [x] REPL UX polish: `EkekoReplController`'s nREPL server now runs with
      cider-nrepl's middleware (`damp.ekeko.jdtls`'s own commit) instead of
      bare nREPL, so Calva no longer warns about missing cider-nrepl
      `info`/`complete`/etc. support; `startRepl` also points Calva at its
      classic prompted `repl-window` output destination (rather than the
      newer promptless terminal/sidebar destinations) and auto-arranges the
      editor layout so that window docks at the bottom of the screen, below
      the code editor, instead of opening as a side-by-side column. Since
      the repl-window is a real file, VS Code also restores it as an
      already-open (but disconnected/stale) tab across editor restarts;
      `startRepl` now closes any such leftover tab before reconnecting.
- [x] Verify: started the REPL from the command palette — connects
      immediately with no project-type quick pick, no cider-nrepl warning,
      and the prompted REPL window (`clj:user:>`) opens docked at the
      bottom. Quit and relaunched the editor to reproduce the stale-tab
      restore, then confirmed "Ekeko: Start REPL" closed it and reconnected
      cleanly in the same bottom-docked position. Confirmed the "nREPL
      server started on port N" notification and `.nrepl-port` file, then
      ran a real Ekeko query against the live
      project — `(count (ekeko [?m] (ast :MethodDeclaration ?m)))` => `2`,
      correctly matching the sample file's two methods. First real Clojure
      execution (not just Java) in the live bundle; surfaced a stale
      Equinox bundle cache issue along the way (not a source bug — see
      `damp.ekeko.jdtls/README.md`'s troubleshooting note).

## Phase 4 — Results table webview and jump-to-source

- [x] `EkekoQueryRunner` (code-element detection + offset/URI payload),
      wired as the `ekeko.runQuery` delegate command
- [x] Client-side offset→Range conversion (`TextDocument.positionAt` in
      `resultsPanel.ts`'s `revealCodeCell`)
- [x] Results webview (table, clickable code cells, inert value cells) --
      `resultsPanel.ts` + `media/results.{js,css}`
- [x] Jump-to-source wiring
- [x] `Ekeko: Run Query` command (`queryRunner.ts`: reads the active
      editor's selection, or prompts)
- [x] **Architecture correction (see GOAL.md):** the plan's Phase 4 didn't
      cover the REPL-driven path damp.ekeko's own Eclipse plugin actually
      uses -- `ekeko*`/`ekeko-n*` popping a results view as a side effect
      of evaluating them at the REPL, not a separate "run query" action.
      Added: this bundle's own `damp/ekeko/gui.clj` (replacing the
      Eclipse-plugin one, which isn't loadable outside Eclipse -- see
      `damp.ekeko.jdtls/pom.xml`) implements the same
      `eclipse-uithread-return`/`open-barista-results-viewer*` contract
      those macros already call via `requiring-resolve`, calling
      `EkekoResultsBridge.showResults` to push the finished query to VS
      Code as a `workspace/notify` notification; the extension's
      `ekeko.showResults` command (`extension.ts`) opens/updates the same
      results webview from that push, unprompted.
- [x] Verify: on the Gnome/XFCE desktop, started the REPL, then evaluated
      `(ekeko* [?m ?name] (ast :MethodDeclaration ?m) (fresh [?sn] (has
      :name ?m ?sn) (equals ?name (.getIdentifier ?sn))))` at the
      connected Calva REPL against the sample project -- the results
      webview popped open automatically (no separate command run),
      showing a mixed-type table (`?M` clickable code cells, `?NAME`
      plain value cells) for both of the sample file's methods,
      `greet`/`main`. Clicked both code cells: each opened `Hello.java`
      and selected exactly that method declaration's source range.
- [x] **Follow-up (UI placement, verified interactively):** moved the
      results webview off the editor area (`vscode.window.
      createWebviewPanel`) into a bottom-panel tab instead
      (`EkekoResultsViewProvider`, `contributes.views` +
      `viewsContainers.panel`) -- shows as "Ekeko" next to
      Problems/Output/Terminal, alongside the code editor rather than
      competing with it, per explicit user request. Re-verified the same
      REPL-driven auto-reveal and jump-to-source both still work from the
      new location.

## Phase 5 — Script loading button

- [x] **Skipped, per explicit user decision.** Calva's own "Load/Evaluate
      Current File (and its Requires/Dependencies)" command already loads
      any `.clj` file's definitions into the connected REPL's runtime --
      exactly what a custom `ekeko.loadScript` delegate command + editor-
      title button would have added, just without Ekeko-specific code to
      build and maintain. Confirmed as part of the Phase 6 walkthrough
      below: `scripts/helpers.clj`-style scripts load via that stock Calva
      command and their defined functions become callable from the REPL
      immediately afterward, with no Ekeko-side involvement at all.

## Phase 6 — Packaging and polish

- [x] `vsce package`, verify auto-install of `redhat.java` dependency --
      uninstalled both `ekeko.ekeko` and `redhat.java`, installed only the
      built `ekeko-0.0.1.vsix` via `codium --install-extension`, and
      confirmed `codium --list-extensions` then listed `redhat.java` again
      on its own (Calva stayed uninstalled, as expected -- it's a
      recommendation, not a hard `extensionDependencies` entry).
- [x] `.vscode/extensions.json` recommending Calva (already in place since
      Phase 3)
- [x] Top-level usage README (this directory's `README.md`, rewritten with
      install/usage instructions) and `damp.ekeko.jdtls/README.md` updated
      to document `EkekoQueryRunner`/`EkekoResultsBridge`/`gui.clj`
- [x] Full end-to-end walkthrough on a nontrivial multi-file Java project
      -- a fresh 5-file `shapes-demo` project (`Shape` interface,
      `Circle`/`Rectangle` implementations, `ShapeUtils`, `Main`),
      deliberately created *without* the Ekeko nature pre-set in
      `.project`, verified interactively on the XFCE desktop:
      1. Installed the `.vsix` as above (`redhat.java` auto-installed).
      2. Opened `shapes-demo`; `EkekoJdtlsActivator` auto-enabled the
         Ekeko nature on its own (confirmed by `.project` being rewritten
         on disk to add `damp.ekeko.plugin.ekekoNature` and its builder,
         with no manual step).
      3. **Ekeko: Rebuild Model** → "Ekeko: rebuilt model for shapes-demo".
      4. **Ekeko: Start REPL** → connects, docks right as before.
      5. Evaluated `(ekeko* [?t] (ast :TypeDeclaration ?t))` (via a
         `scratch.clj`, since typing directly into the live repl-window
         buffer at a guessed cursor position turned out to corrupt its
         scrollback -- evaluating a real file avoids that) -- the Ekeko
         panel auto-opened showing all 5 type declarations, one per file
         (`Shape`, `ShapeUtils`, `Circle implements Shape`, `Rectangle
         implements Shape`, `Main`).
      6. **Cross-file jump-to-source:** clicked the `Rectangle` row while
         `Rectangle.java` was *not* open in any tab -- it opened and
         selected exactly that class body, confirming jump-to-source
         works across files, not just within the currently active one.
      7. **Script loading via Calva (Phase 5's replacement):** loaded
         `scripts/helpers.clj` (defining `count-of-kind`) with Calva's own
         "Load/Evaluate Current File" command; then, from the *separate*
         `scratch.clj`, called `(count-of-kind :MethodDeclaration)` →
         `7`, matching independently running **Ekeko: Run Query** with
         `(ekeko [?m] (ast :MethodDeclaration ?m))` → also `7` results.
         Confirms a plain `.clj` script's definitions become callable
         project-wide immediately after loading, with zero Ekeko-specific
         "load script" mechanism involved.
      8. **Ekeko: Stop REPL** → "nREPL server stopped", `.nrepl-port`
         removed.
- [x] Update `/home/bram/ekeko/GOAL.md` status section
