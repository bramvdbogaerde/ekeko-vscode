# Phase 0 — JDT compatibility spike findings

## Setup

- Environment did not have Java or Maven installed initially; JDK 21
  (`openjdk 21.0.12`) and the project's own Maven wrapper (`./mvnw`,
  Apache Maven 3.9.11) were used to build `eclipse.jdt.ls` locally from
  `/home/bram/ekeko/eclipse.jdt.ls` (`JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
  ./mvnw clean verify -U -DskipTests`). Build succeeded, producing
  `org.eclipse.jdt.ls.product/target/repository/` with
  `org.eclipse.jdt.core_3.48.0.v20260916-0808.jar` (a same-day snapshot,
  since the target platform tracks a rolling I-build repository).
- VSCodium (`codium`, 1.135.06055) is the VS Code variant installed on this
  machine — **use `codium`, not `code`**, for all interactive testing. Its
  default extension marketplace is Open VSX, which carries both
  `redhat.java` and `betterthantomorrow.calva` (confirmed installable).
- Installed `redhat.java` (v1.56.0) and `betterthantomorrow.calva`
  (v2.0.598) via `codium --install-extension`.
- **Baseline sanity check (Phase 0 step 2):** opened a minimal sample Maven-less
  Java project (`com.example.Hello`) in VSCodium. Confirmed via
  `~/.config/VSCodium/User/workspaceStorage/<hash>/redhat.java/client.log.*`
  and the jdt.ls `.metadata/.log` that the Java Language Server started,
  imported the project, reconciled `Hello.java` with "0 problems reported",
  and compiled it to `Hello.class`. redhat.java + jdt.ls works correctly on
  this machine.

## The actually-relevant JDT core version

Since the architecture decision (see the approved plan) is to depend on
`redhat.java` rather than launch our own `eclipse.jdt.ls`, the JDT core jar
that matters for compatibility is **the one redhat.java ships**, not the one
our own from-source build produces. That jar is:

```
/home/bram/.vscode-oss/extensions/redhat.java-1.56.0-linux-x64/server/plugins/org.eclipse.jdt.core_3.47.0.v20260828-1141.jar
```

(one day older than the from-source build's `3.48.0.v20260916-0808.jar` —
consistent with both tracking the same rolling I-build train.) The spike
below targets this jar directly. `spike/fetch-jdt-jars.sh` copies it (and
its runtime dependencies) from whatever `redhat.java` version is currently
installed, so the spike stays reproducible as that version changes; the
jars themselves are gitignored (large Eclipse binaries, not something to
vendor into this repo).

## JLS level constant

`org.eclipse.jdt.core.dom.AST` in this jar defines levels through `JLS26`
(`JLS_Latest = 26`) and a `public static int getJLSLatest()` accessor.
`AST.JLS8` (used today by `damp.ekeko`) still exists for backward
compatibility, so old code still *compiles*, but should be switched to
`AST.getJLSLatest()` to parse modern Java syntax.

Confirmed via `grep` that `damp.ekeko` has exactly **one** definition site:

```
damp.ekeko.plugin/src/damp/ekeko/JavaProjectModel.java:254:
    public static int JLS = AST.JLS8;
```

referenced elsewhere only as `JavaProjectModel/JLS`
(`damp/ekeko/jdt/astnode.clj:465`, `damp/ekeko/jdt/rewrites.clj:136`, both
`(AST/newAST JavaProjectModel/JLS)`). This is a **single mechanical edit**
in Phase 1: change that one field's initializer to `AST.getJLSLatest()`.

## Spike: does damp.ekeko.jdt.*'s API surface still work?

`spike/src/com/example/spike/EkekoJdtSpike.java` parses
`spike/testsrc/com/example/Sample.java` and exercises, against the real
redhat.java-bundled JDT core jar, the exact call patterns
`damp.ekeko.jdt.*` uses:

- `ASTParser.newParser(AST.getJLSLatest())` → `setKind(K_COMPILATION_UNIT)`
  → `setResolveBindings(true)` → `createAST(null)`, mirroring
  `JavaProjectModel.parse`'s call shape (using JDT's headless
  `setEnvironment(...)` classpath-based parsing instead of
  `setProject(IJavaProject)`, since there's no live Eclipse workspace here —
  the resulting `ASTNode`/`IBinding` object graph is identical either way,
  which is all `damp.ekeko.jdt.*` ever consumes).
- `instanceof` dispatch matching `astnode.clj`'s `typedeclaration?`/
  `methoddeclaration?`/etc. style relations.
- `.resolveBinding()` / a `MethodDeclaration`'s resolved `IMethodBinding`
  (`getReturnType()`, `getDeclaringClass()`), matching `ast.clj`'s direct
  binding-resolution calls.
- `structuralPropertiesForType()` + `getStructuralProperty(descriptor)`
  reflection, matching `astnode.clj`'s `node-properties`/
  `node-property-value`.
- `getParent()` / `getLocationInParent()`, matching the parent/child
  traversal `ast.clj`'s `has`/`child` relations rely on.
- `getStartPosition()` / `getLength()`, matching both `ast.clj` and the
  Barista UI's `MarkerUtility` (the pattern Phase 4's
  `QueryResultSerializer` will reuse for jump-to-source).
- An `ASTVisitor` resolving a `SimpleName` to an `IVariableBinding` and its
  type, matching `bindings.clj`'s binding-resolution relations.

Reproduce with:

```sh
cd ekeko-vscode/spike
./fetch-jdt-jars.sh
mkdir -p classes
javac -cp "$(ls lib/*.jar | tr '\n' ':')" -d classes src/com/example/spike/EkekoJdtSpike.java
java -cp "$(ls lib/*.jar | tr '\n' ':')classes" com.example.spike.EkekoJdtSpike testsrc/com/example/Sample.java
```

**Result: all 18 checks passed** against
`org.eclipse.jdt.core_3.47.0.v20260828-1141.jar`.

## Decision gate

**Mechanical port confirmed.** No deeper API breakage was found in the
surface area exercised. Phase 1 should proceed by vendor-copying
`damp.ekeko.jdt.*`/`damp.ekeko.logic`/`JavaProjectModel.java`/
`EkekoModel.java` largely as-is, with the one required edit being
`JavaProjectModel.JLS`'s initializer (`AST.JLS8` → `AST.getJLSLatest()`).
If any specific relation in the fuller `damp.ekeko.jdt.*` tree (not just
the representative subset spiked here) turns out to hit a real API gap
during Phase 1 vendoring, treat it as a one-off fix at that point rather
than evidence of a broader rewrite — the core AST/binding/reflection
surface has clearly not shifted in a way that breaks this style of code.
