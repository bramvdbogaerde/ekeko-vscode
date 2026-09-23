# damp.ekeko.plugin

Ekeko enables querying and manipulating an Eclipse workspace using applicative logic programs.

Its libraries provide support for answering program queries (e.g., "*is my code bug free?*" or "*does my code follow the prescribed design?*") as well as transforming programs (e.g., "*patch my code as follows*") in a declarative manner.

Ekeko is based on the excellent [core.logic](https://github.com/clojure/core.logic) port to [Clojure](http://clojure.org/) of the applicative logic programming library [Kanren](http://kanren.sourceforge.net/).

## Installation
Install the prebuilt Ekeko plugin from the Eclipse update site: 
[http://soft.vub.ac.be/~cderoove/eclipse/](http://soft.vub.ac.be/~cderoove/eclipse/) 

Ensure plugin dependency [Counterclockwise](http://code.google.com/p/counterclockwise/) is installed (e.g., from its update site found at [http://updatesite.ccw-ide.org/stable/](http://updatesite.ccw-ide.org/stable/)).

Using the optional [damp.ekeko.visualizer](https://github.com/cderoove/damp.ekeko/tree/master/damp.ekeko.visualizer.plugin) extension requires dependency [Zest](http://www.eclipse.org/gef/zest/) to be installed (e.g., from its update site found at [http://download.eclipse.org/tools/gef/updates/releases/](http://download.eclipse.org/tools/gef/updates/releases/)).

See [Installing New Software](http://help.eclipse.org/juno/topic/org.eclipse.platform.doc.user/tasks/tasks-124.htm) for help on installing Eclipse plugins from an update site. 

Ekeko has been tested against [Eclipse Luna (4.4)](http://www.eclipse.org)

Alternatively, the plugin can also be built from the [damp.ekeko.plugin](https://github.com/cderoove/damp.ekeko/tree/master/damp.ekeko.plugin) project in this repository. Its current build status is:

[![Build Status](https://travis-ci.org/cderoove/damp.ekeko.svg?branch=master)](https://travis-ci.org/cderoove/damp.ekeko)

## Documentation

See the [damp.ekeko wiki](https://github.com/cderoove/damp.ekeko/wiki) for information on:  

* [how to get started](https://github.com/cderoove/damp.ekeko/wiki/Getting-Started-with-Ekeko)
* [example queries](https://github.com/cderoove/damp.ekeko/wiki/Example-Ekeko-Queries)

See the [damp.ekeko API documentation](http://cderoove.github.com/damp.ekeko/) for an overview of all relations and functions that are included.

See the following publication for the motivation behind Ekeko and possible applications: 
> [Building Development Tools Interactively using the Ekeko Meta-Programming Library](http://soft.vub.ac.be/Publications/2013/vub-soft-tr-13-22.pdf)<br/> 
> Coen De Roover, Reinout Stevens<br/>
> Proceedings of the IEEE CSMR-WCRE 2014 Software Evolution Week (CSMR-WCRE14), Tool Demo Track, Antwerp (Belgium)

There is also a screencast accompanying this publication:
[![Ekeko Demonstration](http://img.youtube.com/vi/cPehkX5MvFg/0.jpg)](https://www.youtube.com/watch?v=cPehkX5MvFg)

## Requirements

VS Code or VSCodium, 1.85 or newer.

The following extensions will be installed alongside Ekeko:
- The [Language Support for Java](https://marketplace.visualstudio.com/items?itemName=redhat.java)
  (`redhat.java`) extension. Declared as a hard dependency
  (`extensionDependencies`), so installing this extension installs that one
  automatically if it isn't already present.
- The [Calva](https://marketplace.visualstudio.com/items?itemName=betterthantomorrow.calva) extension, to connect to the REPL. 

## Usage

1. **Open a Java project.** Any folder VS Code/`redhat.java` recognizes as a
   Java project (an Eclipse `.project`/`.classpath` pair, a Maven `pom.xml`,
   or a Gradle build) works. Wait for the status bar's Java icon to read
   "Java: Ready" — Ekeko's bundle activates alongside `redhat.java` and
   automatically enables itself on every open Java project, so there's
   nothing project-specific to configure.
2. **Ekeko: Rebuild Model** (command palette) — (re)builds Ekeko's queryable
   fact base for all open Java projects. Runs automatically on project open;
   use this after large offline changes (e.g. a git checkout) to force a
   full rebuild.
3. **Ekeko: Start REPL** (command palette) — starts an Ekeko nREPL server and connects
   Calva to it automatically, opening a classic prompted REPL window
   (`clj:user:>`) docked as a column on the right, beside the code editor.
   From here you can evaluate any Clojure code with full access to the live
   project's AST. The example depicted below finds all method declarations
   in the opened project:
   ```clojure
   (require 'damp.ekeko)
   (in-ns 'damp.ekeko)
   (count (ekeko [?m] (ast :MethodDeclaration ?m)))
   ```
   **Ekeko: Stop REPL** stops the server.
5. **Running a query and seeing results.** Tosee a
   query's results in the **Ekeko** panel: evaluate `(ekeko* ...)` or `(ekeko-n* n ...)` at the connected REPL —
     and the Ekeko panel pops open automatically with the result table. This is the
     primary, REPL-native way to query.

   In the results table, one column per query variable: cells that resolved
   to a real AST element (a method, type, statement, ...) render as
   clickable links — click one to open its source file at exactly
   that range. Other cells (strings, numbers, booleans, `nil`, ...) render
   as plain text.
6. **Loading your own scripts.** Ekeko scripts are just `.clj` files
   anywhere in your open workspace. Open one and run Calva's own **"Load/
   Evaluate Current File (and its Requires/Dependencies)"** command (command
   palette, or `Ctrl+Alt+C Enter`) to load it into the connected REPL —
   functions and vars it defines become callable from the REPL immediately
   afterward. 
   
## License  

Copyright © 2012-2026 Ekeko contributors: 

* [Coen De Roover](http://soft.vub.ac.be/~cderoove/): initial design, implementation and documentation
 
* [Carlos Noguera](http://soft.vub.ac.be/soft/members/carlosnoguera): Barista graphical [user interface](http://soft.vub.ac.be/SOUL/home/querying-from-eclipse/running-and-inspecting-a-query/)

* [Reinout Stevens](http://soft.vub.ac.be/soft/members/reinoutstevens): damp.ekeko.workspace.reification 
  
* [Bram Vandenbogaerde](https://vdb.space): damp.ekeko.jdtls.plugin

Distributed under the Eclipse Public License.

Ekeko stands on the shoulders of open source giants.    
Included dependencies:

* Clojure's applicative logic programming library [core.logic](https://github.com/clojure/core.logic/) (Eclipse Public License)
* [Reinout Stevens](http://soft.vub.ac.be/soft/members/reinoutstevens)' regular path expression library [damp.qwal](https://github.com/ReinoutStevens/damp.qwal 
) (Eclipse Public License)
* The intra-procedural JDT-based control flow graph of the Crystal static  analysis framework [edu.cmu.cs.crystal.cfg.eclipse](https://code.google.com/p/crystalsaf/) (LGPL)
* [Tim Molderez](http://ansymo.ua.ac.be/people/tim-molderez)' Clojure/Java object inspector [Inspector Jay](https://github.com/timmolderez/inspector-jay) (BSD 3-Clause license) 
* Sable's Java Optimization Framework [Soot](http://www.sable.mcgill.ca/soot/
) (LGPL)

