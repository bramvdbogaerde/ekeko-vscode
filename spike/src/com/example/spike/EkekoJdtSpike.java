package com.example.spike;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

import org.eclipse.jdt.core.dom.AST;
import org.eclipse.jdt.core.dom.ASTNode;
import org.eclipse.jdt.core.dom.ASTParser;
import org.eclipse.jdt.core.dom.ASTVisitor;
import org.eclipse.jdt.core.dom.Block;
import org.eclipse.jdt.core.dom.CompilationUnit;
import org.eclipse.jdt.core.dom.Expression;
import org.eclipse.jdt.core.dom.FieldDeclaration;
import org.eclipse.jdt.core.dom.IMethodBinding;
import org.eclipse.jdt.core.dom.ITypeBinding;
import org.eclipse.jdt.core.dom.MethodDeclaration;
import org.eclipse.jdt.core.dom.SimpleName;
import org.eclipse.jdt.core.dom.Statement;
import org.eclipse.jdt.core.dom.StructuralPropertyDescriptor;
import org.eclipse.jdt.core.dom.TypeDeclaration;

/**
 * Phase 0 compatibility spike: exercises the exact JDT DOM/AST/binding API
 * surface that damp.ekeko.jdt.* relies on (see
 * damp.ekeko.plugin/src/damp/ekeko/JavaProjectModel.java:254-266,
 * damp.ekeko.plugin/src/damp/ekeko/jdt/astnode.clj,
 * damp.ekeko.plugin/src/damp/ekeko/jdt/ast.clj) against the JDT core jar
 * actually bundled with the installed redhat.java extension
 * (org.eclipse.jdt.core_3.47.0.v20260828-1141.jar), to validate the
 * mechanical-port hypothesis before vendoring the real query engine.
 */
public class EkekoJdtSpike {

    static int failures = 0;

    static void check(String label, boolean condition) {
        if (condition) {
            System.out.println("OK   " + label);
        } else {
            System.out.println("FAIL " + label);
            failures++;
        }
    }

    public static void main(String[] args) throws Exception {
        Path sourceFile = Path.of(args[0]);
        String source = Files.readString(sourceFile);

        // Mirrors JavaProjectModel.parse(ICompilationUnit, IProgressMonitor):
        //   ASTParser.newParser(JLS) -> setResolveBindings(true) ->
        //   setKind(K_COMPILATION_UNIT) -> setProject/setEnvironment -> createAST(monitor)
        // damp.ekeko.JavaProjectModel.JLS is currently AST.JLS8; here we use
        // AST.getJLSLatest() (JLS_Latest = 26 in this jar) as the fix Phase 1 needs.
        int jls = AST.getJLSLatest();
        System.out.println("Using AST level: " + jls + " (AST.getJLSLatest())");

        ASTParser parser = ASTParser.newParser(jls);
        parser.setKind(ASTParser.K_COMPILATION_UNIT);
        parser.setResolveBindings(true);
        parser.setStatementsRecovery(false);
        parser.setBindingsRecovery(false);
        parser.setUnitName("/com/example/Sample.java");

        // Headless binding resolution without a live IJavaProject/workspace,
        // using the running JVM's boot classpath -- damp.ekeko.jdt.* only
        // consumes the resulting ASTNode/IBinding object graph, which is
        // identical regardless of how the CompilationUnit was produced.
        String[] classpathEntries = new String[0];
        String[] sourcepathEntries = new String[] { sourceFile.getParent().getParent().toString() };
        parser.setEnvironment(classpathEntries, sourcepathEntries, new String[] { "UTF-8" }, true);
        parser.setSource(source.toCharArray());

        Map compilerOptions = org.eclipse.jdt.core.JavaCore.getOptions();
        compilerOptions.put(org.eclipse.jdt.core.JavaCore.COMPILER_SOURCE, "21");
        compilerOptions.put(org.eclipse.jdt.core.JavaCore.COMPILER_COMPLIANCE, "21");
        parser.setCompilerOptions(compilerOptions);

        CompilationUnit cu = (CompilationUnit) parser.createAST(null);

        List<?> types = cu.types();
        check("compilation unit has 1 top-level type", types.size() == 1);
        Object typeObj = types.get(0);
        check("top-level type is a TypeDeclaration (astnode.clj typedeclaration? pattern)",
                typeObj instanceof TypeDeclaration);
        TypeDeclaration type = (TypeDeclaration) typeObj;
        check("type name resolves to 'Sample'", "Sample".equals(type.getName().getIdentifier()));

        // instanceof-based dispatch, mirroring astnode.clj's
        // expression?/statement?/methoddeclaration?/block? style relations.
        MethodDeclaration incrementMethod = null;
        FieldDeclaration counterField = null;
        for (Object bd : type.bodyDeclarations()) {
            if (bd instanceof MethodDeclaration md && "increment".equals(md.getName().getIdentifier())) {
                incrementMethod = md;
            }
            if (bd instanceof FieldDeclaration fd) {
                counterField = fd;
            }
        }
        check("found 'increment' MethodDeclaration via instanceof dispatch", incrementMethod != null);
        check("found a FieldDeclaration via instanceof dispatch", counterField != null);

        // Binding resolution: damp.ekeko.jdt.ast/method-invocation and friends
        // call .resolveBinding()/.resolveTypeBinding() directly on nodes.
        IMethodBinding methodBinding = incrementMethod.resolveBinding();
        check(".resolveBinding() on MethodDeclaration returns non-null IMethodBinding", methodBinding != null);
        if (methodBinding != null) {
            ITypeBinding returnType = methodBinding.getReturnType();
            check("resolved return type is 'int'", returnType != null && "int".equals(returnType.getName()));
            check("resolved declaring class is 'Sample'",
                    methodBinding.getDeclaringClass() != null
                            && "Sample".equals(methodBinding.getDeclaringClass().getName()));
        }

        // Structural property descriptor reflection, mirroring
        // astnode.clj's node-properties / node-property-value
        // (structuralPropertiesForType() + getStructuralProperty(descriptor)).
        List<?> descriptors = incrementMethod.structuralPropertiesForType();
        check("MethodDeclaration has structural property descriptors", !descriptors.isEmpty());
        boolean foundBodyDescriptor = false;
        for (Object d : descriptors) {
            StructuralPropertyDescriptor spd = (StructuralPropertyDescriptor) d;
            Object value = incrementMethod.getStructuralProperty(spd);
            if (value instanceof Block) {
                foundBodyDescriptor = true;
            }
        }
        check("getStructuralProperty() reflection finds the method Block body", foundBodyDescriptor);

        // getParent()/getLocationInParent(), used by ast.clj's 'has'/'child' relations.
        Block body = incrementMethod.getBody();
        check("method body block's getParent() is the MethodDeclaration itself",
                body.getParent() == incrementMethod);
        check("body block has a non-null getLocationInParent()", body.getLocationInParent() != null);

        // getStartPosition()/getLength(), used by ast.clj (and Barista's
        // MarkerUtility / our Phase 4 QueryResultSerializer) to map an
        // ASTNode back to a source Range.
        check("method has a valid startPosition/length", incrementMethod.getStartPosition() >= 0
                && incrementMethod.getLength() > 0);

        // SimpleName resolveBinding() -> IVariableBinding, exercised via a
        // visitor to find a use of 'counter' inside increment's body.
        final IMethodBinding[] resolvedViaVisitor = new IMethodBinding[1];
        final boolean[] foundVariableUse = { false };
        cu.accept(new ASTVisitor() {
            @Override
            public boolean visit(SimpleName node) {
                if ("counter".equals(node.getIdentifier())) {
                    Object binding = node.resolveBinding();
                    if (binding instanceof org.eclipse.jdt.core.dom.IVariableBinding vb) {
                        foundVariableUse[0] = true;
                        check("resolved 'counter' variable binding type is 'int'",
                                "int".equals(vb.getType().getName()));
                    }
                }
                return true;
            }
        });
        check("visitor found at least one resolved 'counter' SimpleName binding", foundVariableUse[0]);

        System.out.println();
        if (failures == 0) {
            System.out.println("SPIKE RESULT: PASS - all " + jls
                    + "-level AST/binding/reflection checks succeeded against this JDT core jar.");
        } else {
            System.out.println("SPIKE RESULT: FAIL - " + failures + " check(s) failed.");
            System.exit(1);
        }
    }
}
