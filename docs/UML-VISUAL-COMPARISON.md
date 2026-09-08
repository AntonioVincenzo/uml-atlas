# UML 2.5.1 visualization compared with Atlas 0.1

The complete side-by-side visual report is available at [`/uml-comparison.html`](http://127.0.0.1:4311/uml-comparison.html) when Atlas is running, and in the source at [`public/uml-comparison.html`](../public/uml-comparison.html).

## Finding

Atlas is an architecture graph with a UML-flavored vocabulary. Its stable JSON model, reusable diagrams, structural diffs, code links, and agent proposal review are strong collaboration primitives. Its relationship renderings are mostly recognizable UML. Classes and enumerations now use UML-style compartments, while actors, use cases, notes, and generic stereotyped elements have distinct title treatments.

| Atlas construct | UML 2.5.1 equivalent | Fidelity | Main difference |
| --- | --- | --- | --- |
| `class` | Classifier rectangle with name, attribute, and operation compartments | Visually close | Atlas infers operations from parentheses while members remain strings in JSON |
| `interface` | `«interface»` classifier or ball/socket notation | Partial | Centered stereotype classifier; no provided/required interface or port semantics |
| `component` | Component classifier and optional component icon | Partial | Centered stereotype classifier; no ports, parts, assembly, or delegation connectors |
| `actor` | Stick figure or actor classifier notation | Atlas variant | Icon appears directly beside the actor name in a compact pill |
| `usecase` | Ellipse containing the use-case name | Partial | Compact pill matches the actor container without an icon; richer use-case semantics are absent |
| `package` | Folder-tab rectangle | Low | Top-border card without containment/import semantics |
| `state` | Rounded state with behavior compartments | Partial | Shape is close; pseudostates and state-machine semantics are absent |
| `note` | Dog-eared comment linked by dashed line | Partial | Color and folded corner carry the type; it remains an ordinary graph node |
| `enum` | `«enumeration»` classifier with literals | Visually close | Correct header and literal compartment; literals remain member strings in JSON |
| `database` | Usually a stereotyped Node, Component, Class, or Artifact | Atlas extension | Modeled as a first-class non-UML element kind |
| `service` | Usually a stereotype applied to a UML classifier | Atlas extension | Modeled as a first-class non-UML element kind |
| `association` | Solid line; optional open arrow for navigability | Partial | Atlas always draws a filled direction arrow |
| `dependency` | Dashed line with open arrow | Close | Visual form matches the conventional notation |
| `generalization` | Solid line with hollow triangle | Close | Visual form and direction match |
| `realization` | Dashed line with hollow triangle | Close | Target is not constrained to an Interface |
| `composition` | Filled diamond at composite end | Close | Atlas places diamond at source; UI should name source as whole |
| `aggregation` | Hollow diamond at aggregate end | Close | Visual form matches; UML semantics remain deliberately weak |
| `transition` | Directed transition line with `trigger [guard] / effect`; UML examples vary in arrowhead fill | Partial | Atlas uses one generic directed arrow and one free-text label |
| diagram import | Depends on semantics: package import, structured part, interaction use, etc. | Atlas extension | One universal expandable reference with propagated diffs |

## Coverage

Atlas partially covers class, component, package, state-machine, and use-case views. Object, composite structure, deployment, profile, activity, sequence, communication, interaction-overview, and timing diagram grammars are absent. A node kind is not equivalent to a UML diagram type.

## Recommended order

1. Extend the implemented classifier and stereotype-first grammar with ports and provided/required interfaces; make association non-directed by default.
2. Structure attributes, operations, literals, stereotypes, tagged values, roles, navigability, and transition labels in JSON.
3. Add a selectable UML-strict validation profile while retaining permissive architecture graphs.
4. Implement ports and provided/required interfaces for component and composite-structure architecture.
5. Give state machines, sequences, and activities separate schemas and renderers.
6. Map the strict subset to UML XMI and Diagram Interchange, preserving Atlas extensions in a profile or sidecar.

## Sources

- [OMG UML 2.5.1 specification](https://www.omg.org/spec/UML/2.5.1/PDF)
- [OMG UML specification index](https://www.omg.org/spec/UML)
- [OMG machine-readable UML 2.5.1 metamodel and Diagram Interchange](https://www.omg.org/spec/UML/machine-readable)
- [OMG UML diagram overview](https://www.omg.org/uml/what-is-uml.htm)

The visual examples in the HTML report are original explanatory drawings. “Proper UML” means conventional notation backed by UML model semantics; UML permits presentation variation and mixed diagrams, so purely cosmetic variation is not treated as a defect.
