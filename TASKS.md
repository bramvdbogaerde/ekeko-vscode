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

- [ ] `package.json` (extensionDependencies, javaExtensions, commands)
- [ ] `src/extension.ts` command registration
- [ ] `EkekoCommandHandler` + `plugin.xml` delegateCommandHandler registration
- [ ] Verify: `.vsix` installs, bundle loads into redhat.java's jdt.ls,
      `ekeko.rebuildModel` succeeds

## Phase 3 — REPL integration (Calva)

- [ ] nREPL startup inside the bundle (no ccw dependency)
- [ ] `.nrepl-port` written automatically by the extension
- [ ] Start/stop REPL commands + Calva connect wiring
- [ ] Verify: REPL connects via Calva, live query returns correct results

## Phase 4 — Results table webview and jump-to-source

- [ ] `QueryResultSerializer` (code-element detection + offset/URI payload)
- [ ] Client-side offset→Range conversion
- [ ] Results webview (table, clickable code cells, inert value cells)
- [ ] Jump-to-source wiring
- [ ] `Ekeko: Run Query` command
- [ ] Verify: mixed-type query result table, click-to-jump works

## Phase 5 — Script loading button

- [ ] `ekeko.loadScript` delegate command
- [ ] "Ekeko: Load Script into REPL" command + editor-title button
- [ ] Verify: sample script loads and is callable from Calva REPL

## Phase 6 — Packaging and polish

- [ ] `vsce package`, verify auto-install of `redhat.java` dependency
- [ ] `.vscode/extensions.json` recommending Calva
- [ ] Top-level usage README
- [ ] Full end-to-end walkthrough on a nontrivial multi-file Java project
- [ ] Update `/home/bram/ekeko/GOAL.md` status section
