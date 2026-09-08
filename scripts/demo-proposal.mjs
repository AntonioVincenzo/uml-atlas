import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'node:path';
const workspace = path.resolve(process.argv[2] || '.');
const client = new Client({ name: 'Atlas self-design agent', version: '0.1.0' });
await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.resolve('dist/server/cli.js'), 'mcp', '--workspace', workspace] }));
try {
  const call = async (name, args = {}) => { const r = await client.callTool({ name, arguments: args }); if (r.isError) throw new Error(r.content[0].text); return JSON.parse(r.content[0].text); };
  const current = await call('get_architecture');
  const existing = (await call('list_proposals')).find(p => p.status === 'pending' && p.author === 'Atlas self-design agent' && p.baseRevision === current.revision);
  if (existing) console.log(`Existing self-design proposal: ${existing.id}`);
  else {
    const diagram = current.document.diagrams.find(d => d.id === 'model_core');
    if (!diagram) throw new Error('This demo needs the Atlas self-description (initialize with --demo).');
    if (diagram.nodes.some(n => n.id === 'diagram')) throw new Error('The self-design refinement has already been applied.');
    diagram.nodes.find(n => n.id === 'document').members = ['+schemaVersion: 1', '+id: string', '+name: string', '+diagrams: Diagram[]'];
    diagram.nodes.find(n => n.id === 'document').description = 'Portable project document. Each document contains one or more reusable diagrams.';
    diagram.nodes.find(n => n.id === 'diff').position = { x: 700, y: 420 };
    diagram.nodes.push({ id: 'diagram', kind: 'class', label: 'Diagram', description: 'A named graph owns nodes, relationships and references to other diagrams.', stereotype: '', position: { x: 700, y: 90 }, members: ['+id: string', '+name: string', '+nodes: Node[]', '+edges: Relationship[]', '+imports: DiagramReference[]'], codeLinks: [{ path: 'src/core/model.ts', startLine: 16, endLine: 18 }] });
    diagram.edges.push({ id: 'contains_diagrams', source: 'document', target: 'diagram', kind: 'composition', label: 'contains', sourceMultiplicity: '1', targetMultiplicity: '1..*' });
    const result = await call('propose_diagram', { diagramId: 'model_core', diagram, baseRevision: current.revision, author: 'Atlas self-design agent', rationale: 'Separate Architecture document from Diagram so the self-description matches the JSON schema: documents contain diagrams; diagrams own nodes, relationships, and reusable references.' });
    console.log(`Created proposal ${result.proposal.id}: ${result.changes.length} changes. Review in the studio.`);
  }
} finally { await client.close(); }
