import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, ConnectionMode, applyNodeChanges, BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type Node, type Edge, type NodeProps, type EdgeProps, type Connection } from '@xyflow/react';
import type { ArchDocument, Diagram, ArchEdge } from '../core/model';
import type { Change } from '../core/diff';
import { expansionBounds, expansionOffset, layoutSize } from '../core/layout';
import { diagramConnectionRoutes, type Rect } from '../core/geometry';
const EMPTY_CHANGES: Change[] = [];
const icons: Partial<Record<string, string>> = { actor: '♙' };
function Ports() { return <><Handle id="port-top" type="source" position={Position.Top}/><Handle id="port-right" type="source" position={Position.Right}/><Handle id="port-bottom" type="source" position={Position.Bottom}/><Handle id="port-left" type="source" position={Position.Left}/></>; }
function ChangeMark({ change }: { change?: string }) {
  return <span className="node-change">{change === 'added' ? '+' : change === 'removed' ? '−' : change === 'modified' ? 'Δ' : ''}</span>;
}
function ClassifierMeta({ node }: { node: any }) {
  if (!node.codeLinks?.length && !node.snippet) return null;
  return <div className="node-meta">{node.codeLinks?.length ? '⌘ Code linked' : ''}{node.snippet ? '  ·  { } Snippet' : ''}</div>;
}
function UmlNode({ data, selected }: NodeProps) {
  const n = data as any;
  const visibleMembers = (n.members ?? []).slice(0, 6) as string[];
  const remaining = Math.max(0, (n.members?.length ?? 0) - visibleMembers.length);
  if (n.kind === 'class') {
    const attributes = visibleMembers.filter(member => !member.includes('('));
    const operations = visibleMembers.filter(member => member.includes('('));
    return <div className={`uml-node classifier-node kind-class ${selected ? 'selected' : ''} change-${n.change || ''}`}>
      <Ports/><ChangeMark change={n.change}/>
      <div className="classifier-heading">{n.stereotype && <div className="classifier-stereotype">«{n.stereotype}»</div>}<div className="classifier-name">{n.label}</div></div>
      <div className="classifier-compartment">{attributes.map((member, i) => <div key={i}>{member}</div>)}</div>
      <div className="classifier-compartment">{operations.map((member, i) => <div key={i}>{member}</div>)}{remaining > 0 && <div>+{remaining} more</div>}<ClassifierMeta node={n}/></div>
    </div>;
  }
  if (n.kind === 'enum') {
    return <div className={`uml-node classifier-node kind-enum ${selected ? 'selected' : ''} change-${n.change || ''}`}>
      <Ports/><ChangeMark change={n.change}/>
      <div className="classifier-heading"><div className="classifier-stereotype">«enumeration»</div><div className="classifier-name">{n.label}</div></div>
      <div className="classifier-compartment">{visibleMembers.map((member, i) => <div key={i}>{member}</div>)}{remaining > 0 && <div>+{remaining} more</div>}<ClassifierMeta node={n}/></div>
    </div>;
  }
  if (n.kind === 'actor' || n.kind === 'usecase') {
    return <div className={`uml-node compact-node kind-${n.kind} ${selected ? 'selected' : ''} change-${n.change || ''}`}>
      <Ports/><ChangeMark change={n.change}/>
      <div className="compact-title">{icons[n.kind] && <span className="compact-icon" aria-hidden="true">{icons[n.kind]}</span>}<span>{n.label}</span></div>
      {visibleMembers.length > 0 && <div className="node-members">{visibleMembers.map((member, i) => <div key={i}>{member}</div>)}</div>}<ClassifierMeta node={n}/>
    </div>;
  }
  if (n.kind === 'note') {
    return <div className={`uml-node kind-note ${selected ? 'selected' : ''} change-${n.change || ''}`}>
      <Ports/><ChangeMark change={n.change}/>
      <div className="note-title">{n.label}</div>{n.description && <div className="node-note">{n.description}</div>}<ClassifierMeta node={n}/>
    </div>;
  }
  return <div className={`uml-node kind-${n.kind} ${selected ? 'selected' : ''} change-${n.change || ''}`}>
    <Ports/>
    <ChangeMark change={n.change}/><div className="node-kind">«{n.stereotype || n.kind}»</div>
    <div className="node-label">{n.label}</div>
    {visibleMembers.length > 0 && <div className="node-members">{visibleMembers.map((m, i) => <div key={i}>{m}</div>)}{remaining > 0 && <div>+{remaining} more</div>}</div>}
    <ClassifierMeta node={n}/>
  </div>;
}
function EmbedNode({ data, selected }: NodeProps) {
  const n = data as any;
  return <div className={`embed-node ${n.expanded ? 'expanded' : ''} ${selected ? 'selected' : ''} change-${n.change || ''}`} style={n.expanded ? { width: n.width, height: n.height } : undefined}>
    <Ports/>
    <div className="embed-heading"><span>«diagramRef»</span>{n.change && <b>{n.change}</b>}</div>
    <div className="node-label">{n.label}</div>
    {!n.expanded && <>{n.description ? <div className="embed-description">{n.description}</div> : <div className="embed-preview">{n.preview?.slice(0, 3).map((x: string, i: number) => <span key={i}>{x}</span>)}</div>}<div className="node-meta">{n.count} elements · {n.name}</div></>}
    <div className="embed-actions nodrag nopan"><button onClick={() => n.onOpen(n.diagramId)}>Open diagram ↗</button><button onClick={() => n.onExpand(n.localId)}>{n.expanded ? 'Collapse' : 'Expand'}</button></div>
  </div>;
}
const nodeTypes = { uml: UmlNode, embed: EmbedNode };
function UmlEdge(props: EdgeProps) {
  const data = props.data as any; const [edgePath, x, y] = getSmoothStepPath({ ...props, borderRadius: 18, ...(data?.returnOffset ? { offset: data.returnOffset } : {}) });
  const color = data?.change === 'added' ? '#087b64' : data?.change === 'removed' ? '#cd4658' : data?.change === 'modified' ? '#b47b16' : '#78909d';
  const kind = data?.kind as ArchEdge['kind'];
  const marker = kind === 'generalization' || kind === 'realization' ? 'triangle' : kind === 'dependency' ? 'openarrow' : 'arrow';
  const label = props.label;
  return <><BaseEdge id={props.id} path={edgePath} markerEnd={['composition', 'aggregation'].includes(kind) ? undefined : `url(#atlas-${marker})`} markerStart={kind === 'composition' ? 'url(#atlas-diamond)' : kind === 'aggregation' ? 'url(#atlas-hollow)' : undefined} style={{ stroke: color, strokeWidth: props.selected ? 3 : 1.7, strokeDasharray: ['dependency', 'realization'].includes(kind) ? '6 5' : undefined }}/>{label && <EdgeLabelRenderer><div className={`edge-label nodrag nopan change-${data?.change || ''}`} style={{ transform: `translate(-50%, -50%) translate(${x}px,${y}px)` }}>{label}</div></EdgeLabelRenderer>}{[data?.sourceMultiplicity, data?.targetMultiplicity].map((value, i) => value ? <EdgeLabelRenderer key={i}><div className="edge-multiplicity" style={{ transform: `translate(${i ? props.targetX - 25 : props.sourceX + 12}px, ${i ? props.targetY - 22 : props.sourceY - 22}px)` }}>{value}</div></EdgeLabelRenderer> : null)}</>;
}
const edgeTypes = { uml: UmlEdge };
export function Markers() { return <svg className="marker-definitions"><defs>
  <marker id="atlas-arrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M1 1 L11 6 L1 11 Z" fill="#78909d"/></marker>
  <marker id="atlas-openarrow" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M1 1 L11 6 L1 11 L1 9 L7.2 6 L1 3 Z" fill="#78909d" stroke="none"/></marker>
  <marker id="atlas-triangle" viewBox="0 0 14 14" refX="13" refY="7" markerWidth="14" markerHeight="14" orient="auto"><path d="M1 1 L13 7 L1 13 Z" fill="white" stroke="#78909d" strokeDasharray="none"/></marker>
  <marker id="atlas-diamond" viewBox="0 0 16 12" refX="0" refY="6" markerWidth="16" markerHeight="12" orient="auto"><path d="M0 6 L8 0 L16 6 L8 12 Z" fill="#78909d"/></marker>
  <marker id="atlas-hollow" viewBox="0 0 16 12" refX="0" refY="6" markerWidth="16" markerHeight="12" orient="auto"><path d="M0 6 L8 0 L16 6 L8 12 Z" fill="white" stroke="#78909d" strokeDasharray="none"/></marker>
</defs></svg>; }
export default function Canvas({ document, diagram, onSelect, onMove, onConnect, onOpen, onExpand, changes = EMPTY_CHANGES, readOnly = false, focusId }: {
  document: ArchDocument; diagram: Diagram; onSelect?: (kind: 'node' | 'edge' | 'import', id: string) => void;
  onMove?: (kind: 'node' | 'import', id: string, position: { x: number; y: number }) => void;
  onConnect?: (c: Connection) => void; onOpen: (id: string) => void; onExpand?: (id: string) => void; changes?: Change[]; readOnly?: boolean; focusId?: string;
}) {
  const built = useMemo(() => {
    const nodes: Node[] = []; const edges: Edge[] = [];
    const change = (id: string, diagramId: string) => changes.find(c => c.diagramId === diagramId && c.id === id)?.kind;
    function collect(d: Diagram, prefix = '', parentId?: string, offset = { x: 0, y: 0 }) {
      for (const n of d.nodes) {
        const visualOffset = parentId ? { x: 0, y: 0 } : expansionOffset(document, d, n);
        nodes.push({ id: prefix + n.id, type: 'uml', parentId, position: { x: n.position.x + offset.x + visualOffset.x, y: n.position.y + offset.y + visualOffset.y }, data: { ...n, localId: n.id, visualOffset, change: change(n.id, d.id) }, draggable: !readOnly && !parentId, selectable: !parentId, style: { width: 240 }, selected: !parentId && focusId === n.id });
      }
      for (const i of d.imports) {
        const child = document.diagrams.find(x => x.id === i.diagramId)!;
        const childItems = [...child.nodes, ...child.imports];
        const { minX, minY, width, height } = expansionBounds(document, i);
        const visualOffset = parentId ? { x: 0, y: 0 } : expansionOffset(document, d, i);
        const expanded = i.expanded && !parentId;
        nodes.push({ id: prefix + i.id, type: 'embed', parentId, position: { x: i.position.x + offset.x + visualOffset.x, y: i.position.y + offset.y + visualOffset.y }, style: { width: expanded ? width : 270, height: expanded ? height : undefined }, data: { ...i, visualOffset, expanded, width, height, localId: i.id, name: child.name, description: child.description, count: childItems.length, preview: child.nodes.map(n => n.label), change: change(i.id, d.id), onOpen, onExpand: !parentId && !readOnly ? onExpand ?? (() => {}) : () => onOpen(i.diagramId) }, draggable: !readOnly && !parentId, selectable: !parentId, selected: !parentId && focusId === i.id, zIndex: expanded ? -1 : 0 });
        if (expanded) collect(child, `${prefix}${i.id}__`, prefix + i.id, { x: 35 - minX, y: 120 - minY });
      }
      const rectangle = (node: Node): Rect => { const estimated = layoutSize(node.data as any); const width = Number(node.style?.width ?? estimated.width); const height = Number(node.style?.height ?? estimated.height); return { left: node.position.x, top: node.position.y, right: node.position.x + width, bottom: node.position.y + height }; };
      const bounds = new Map([...d.nodes, ...d.imports].map(entity => [entity.id, rectangle(nodes.find(node => node.id === prefix + entity.id)!)]));
      const routes = diagramConnectionRoutes(d.edges, bounds);
      for (const e of d.edges) {
        const route = routes.get(e.id)!;
        edges.push({ id: prefix + e.id, type: 'uml', source: prefix + e.source, target: prefix + e.target, sourceHandle: `port-${route.sourceSide}`, targetHandle: `port-${route.targetSide}`, label: e.label, data: { ...e, returnOffset: route.returnOffset, localId: e.id, nested: !!parentId, change: change(e.id, d.id) }, selectable: !parentId, selected: !parentId && focusId === e.id });
      }
    }
    collect(diagram); return { nodes, edges };
  }, [document, diagram, changes, readOnly, onOpen, onExpand, focusId]);
  const [nodes, setNodes] = useState(built.nodes);
  useEffect(() => setNodes(built.nodes), [built]);
  return <ReactFlow nodes={nodes} edges={built.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionMode={ConnectionMode.Loose} onNodesChange={c => setNodes(n => applyNodeChanges(c, n))} onNodeDragStop={(_, n) => onMove?.(n.type === 'embed' ? 'import' : 'node', n.id, { x: n.position.x - ((n.data.visualOffset as any)?.x ?? 0), y: n.position.y - ((n.data.visualOffset as any)?.y ?? 0) })} onNodeClick={(_, n) => { if (!n.parentId) onSelect?.(n.type === 'embed' ? 'import' : 'node', n.id); }} onEdgeClick={(_, e) => { if (!e.data?.nested) onSelect?.('edge', e.id); }} onConnect={onConnect} nodesConnectable={!readOnly} nodesDraggable={!readOnly} deleteKeyCode={null} fitView fitViewOptions={{ padding: .2 }} minZoom={.15} maxZoom={2} aria-label={`${diagram.name} diagram canvas`}>
    <Background color="#cbd6dc" gap={24} size={1}/><Controls showInteractive={false}/>{!readOnly && <MiniMap pannable zoomable nodeColor={n => n.type === 'embed' ? '#98c9c0' : '#b7c8d4'} maskColor="rgba(243,247,249,.75)"/>}
    {!diagram.nodes.length && !diagram.imports.length && <div className="canvas-empty"><div>Start with a building block</div><p>Add an element from the toolbar, or describe your design in UML.</p></div>}
  </ReactFlow>;
}
