# Project-view roadmap

Atlas needs views when they help someone make a design decision. A diagram should earn its place by answering a recurring question that the current project map cannot answer.

## Current priority

The project overview is the landing diagram. It names each diagram, shows its purpose, explains how the views relate, and opens the detailed view. Every diagram also shows its purpose below its title. This gives the project a readable entry point without turning the architecture into a mirror of the repository.

## Add when the project needs them

### Delivery and operations

Show how source becomes a running release, which scripts own each step, which artifacts they produce, and where a deployment can fail. Add this view when Atlas has continuous integration, more than one deployment target, or a release process that is hard to reconstruct from `package.json` and the README.

### Development lifecycle

Show the path from design proposal through implementation, verification, review, and release. Include ownership only when there are enough contributors or environments for handoffs to matter. Until then, the agent review lifecycle already covers the part that is special to Atlas.

### Design record

Index the documents and accepted decisions that explain Atlas's aims, constraints, and unresolved questions. Add this when the design record extends beyond the current README, design decisions, research report, and architecture revision rationales. This view should summarize decisions and link to their sources. It should not attempt to turn every conversation into permanent project data.

### Repository-to-architecture coverage

Show which architectural areas have current scan evidence and which remain assertions. Add this after the scanner produces parsed or resolved records. File inventory alone does not support a useful coverage view.
