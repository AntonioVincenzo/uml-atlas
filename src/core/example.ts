import { validateDocument, newNode, type ArchDocument, type ArchNode } from './model.js';
const n = (id: string, label: string, kind: ArchNode['kind'], x: number, y: number, description: string, path?: string) => ({ ...newNode(id, kind, { x, y }), label, description, codeLinks: path ? [{ path, startLine: 1 }] : [] });
const e = (id: string, source: string, target: string, label: string, kind = 'dependency') => ({ id, source, target, label, kind, sourceMultiplicity: '', targetMultiplicity: '' });
export const exampleDocument: ArchDocument = validateDocument({
  schemaVersion: 1, id: 'atlas', name: 'Atlas · Architecture studio',
  diagrams: [
    { id: 'overview', name: 'System architecture', description: 'Atlas describes itself. People and agents use one portable architecture model. Proposals are reviewed before becoming a saved revision.',
      nodes: [
        n('designer', 'Designer', 'actor', 20, 140, 'Designs and reviews systems visually.'),
        n('studio', 'Architecture studio', 'component', 330, 70, 'Interactive canvas, UML source, inspector, and visual review.', 'src/ui/App.tsx'),
        n('agent', 'Any MCP agent', 'actor', 20, 420, 'Reads the model, proposes changes with a rationale, and receives structured diffs.'),
        n('mcp', 'MCP server', 'interface', 330, 390, 'Project-scoped tools exposed over stdio.', 'src/server/mcp.ts'),
        n('store', 'Revision store', 'database', 1080, 220, 'Atomic JSON revisions and proposals on the local filesystem.', 'src/server/store.ts'),
      ],
      imports: [{ id: 'core', diagramId: 'model_core', label: 'Shared model core', position: { x: 700, y: 180 }, expanded: false }],
      edges: [e('design', 'designer', 'studio', 'design / review', 'association'), e('tools', 'agent', 'mcp', 'read / propose', 'association'), e('ui_model', 'studio', 'core', 'validated edits'), e('agent_model', 'mcp', 'core', 'validated proposals'), e('persist', 'core', 'store', 'save with revision check')],
    },
    { id: 'model_core', name: 'Shared model core', description: 'The same validation, UML conversion, and structural diff logic is used by the browser and MCP server.',
      nodes: [n('document', 'Architecture document', 'class', 340, 160, 'Versioned, language-agnostic graph model.', 'src/core/model.ts'), n('uml', 'UML codec', 'component', 20, 30, 'Converts the supported PlantUML-style subset to and from JSON without losing IDs or metadata.', 'src/core/uml.ts'), n('validation', 'Validation', 'component', 20, 280, 'Checks IDs, endpoints, import cycles and inheritance cycles.', 'src/core/model.ts'), n('diff', 'Structural diff', 'component', 680, 160, 'Compares stable IDs and separates layout-only edits from design changes.', 'src/core/diff.ts')], imports: [],
      edges: [e('parse', 'uml', 'document', 'parse / serialize'), e('validates', 'validation', 'document', 'enforces invariants'), e('compares', 'diff', 'document', 'before / after')],
    },
    { id: 'review_flow', name: 'Agent review lifecycle', description: 'A proposal records a base revision. Acceptance fails safely if the design has changed; the agent must refresh and propose again.',
      nodes: [n('read', 'Read current revision', 'state', 20, 120, 'Agent receives document and revision ID.'), n('propose', 'Propose architecture', 'state', 340, 120, 'Validated candidate plus author and rationale.'), n('review', 'Review visual diff', 'state', 660, 120, 'Human inspects added, removed and modified elements.'), n('accept', 'Accept proposal', 'state', 990, 20, 'Commit if the base revision still matches.'), n('reject', 'Reject proposal', 'state', 990, 260, 'Keep the current architecture.')], imports: [],
      edges: [e('reads', 'read', 'propose', 'base revision', 'transition'), e('reviews', 'propose', 'review', 'pending', 'transition'), e('accepts', 'review', 'accept', 'accept · base matches', 'transition'), e('rejects', 'review', 'reject', 'reject', 'transition'), e('stale', 'accept', 'read', 'stale → refresh', 'transition')],
    },
  ],
});
exampleDocument.diagrams[1].nodes[0].members = ['+schemaVersion: 1', '+diagrams: Diagram[]', '+nodes: Node[]', '+edges: Relationship[]', '+imports: DiagramReference[]'];
exampleDocument.diagrams[1].nodes[0].snippet = { language: 'pseudocode', code: 'candidate = apply(current.document, edits)\nvalidate(candidate)\nchanges = diff(current.document, candidate)\npropose(current.revision, candidate, rationale)' };
