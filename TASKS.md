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

## Phase 1 — Vendor and adapt the Ekeko query engine as an OSGi bundle

- [ ] Vendor-copy and adapt source files
- [ ] New bundle skeleton (MANIFEST, Clojure/core.logic on classpath)
- [ ] `EkekoModelListener` (IResourceChangeListener) replacing `EkekoBuilder`
- [ ] Standalone (non-Tycho) build producing the bundle jar
- [ ] Verify: load into test jdt.ls instance, run a basic query against a
      real project

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
