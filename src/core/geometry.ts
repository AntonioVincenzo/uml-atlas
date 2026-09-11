import type { Diagram } from './model.js';
import { CONNECTOR_LABEL_NODE_GAP, connectorLabelSize, layoutSize } from './layout.js';

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type PortSide = 'top' | 'right' | 'bottom' | 'left';
export type GeometryComplaint = {
  kind: 'node-node-overlap' | 'label-node-overlap' | 'label-node-clearance' | 'label-label-overlap' | 'connector-through-node' | 'connector-through-label' | 'mixed-direction-port';
  connectorId?: string; otherConnectorId?: string; nodeId?: string; otherNodeId?: string;
};
export type ConnectorRoute = { sourceSide: PortSide; targetSide: PortSide; start: Point; end: Point; segments: { start: Point; end: Point }[]; labelPoint: Point; returnOffset?: number };

const center = (rect: Rect): Point => ({ x: (rect.left + rect.right) / 2, y: (rect.top + rect.bottom) / 2 });
export function connectionSides(source: Rect, target: Rect): { source: PortSide; target: PortSide } {
  const from = center(source); const to = center(target); const dx = to.x - from.x; const dy = to.y - from.y;
  const verticalClearance = dy >= 0 ? target.top - source.bottom : source.top - target.bottom;
  if (verticalClearance >= CONNECTOR_LABEL_NODE_GAP) return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' };
  return dy >= 0 ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' };
}
const port = (rect: Rect, side: PortSide): Point => side === 'left' ? { x: rect.left, y: center(rect).y } : side === 'right' ? { x: rect.right, y: center(rect).y } : side === 'top' ? { x: center(rect).x, y: rect.top } : { x: center(rect).x, y: rect.bottom };
export const isBackwardConnection = (source: Rect, target: Rect) => center(target).x < center(source).x;
export function connectionRoute(source: Rect, target: Rect, returnLane = 0, assignedSides?: { source: PortSide; target: PortSide }): ConnectorRoute {
  if (!assignedSides && isBackwardConnection(source, target)) {
    const sourceSide: PortSide = 'top'; const targetSide: PortSide = 'top'; const start = port(source, sourceSide); const end = port(target, targetSide); const returnOffset = 70 + returnLane * 42; const laneY = Math.min(start.y, end.y) - returnOffset;
    return { sourceSide, targetSide, start, end, returnOffset, segments: [{ start, end: { x: start.x, y: laneY } }, { start: { x: start.x, y: laneY }, end: { x: end.x, y: laneY } }, { start: { x: end.x, y: laneY }, end }], labelPoint: { x: (start.x + end.x) / 2, y: laneY } };
  }
  const sides = assignedSides ?? connectionSides(source, target); const start = port(source, sides.source); const end = port(target, sides.target);
  const horizontal = sides.source === 'left' || sides.source === 'right'; const bend = horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
  const segments = horizontal ? [{ start, end: { x: bend, y: start.y } }, { start: { x: bend, y: start.y }, end: { x: bend, y: end.y } }, { start: { x: bend, y: end.y }, end }] : [{ start, end: { x: start.x, y: bend } }, { start: { x: start.x, y: bend }, end: { x: end.x, y: bend } }, { start: { x: end.x, y: bend }, end }];
  return { sourceSide: sides.source, targetSide: sides.target, start, end, segments, labelPoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}

type RoutableEdge = Pick<Diagram['edges'][number], 'id' | 'source' | 'target'>;
type PortRole = 'input' | 'output';

export function diagramConnectionRoutes(edges: RoutableEdge[], bounds: Map<string, Rect>) {
  const backward = edges.filter(edge => isBackwardConnection(bounds.get(edge.source)!, bounds.get(edge.target)!));
  const returnLane = new Map(backward.map(edge => edge.id).sort().map((id, index) => [id, index]));
  const occupied = new Map<string, Map<PortSide, PortRole>>(); const routes = new Map<string, ConnectorRoute>();
  const roleConflict = (node: string, side: PortSide, role: PortRole) => { const current = occupied.get(node)?.get(side); return current !== undefined && current !== role; };
  const reserve = (node: string, side: PortSide, role: PortRole) => { const ports = occupied.get(node) ?? new Map<PortSide, PortRole>(); ports.set(side, role); occupied.set(node, ports); };
  for (const edge of edges) {
    const source = bounds.get(edge.source)!; const target = bounds.get(edge.target)!;
    if (returnLane.has(edge.id)) { routes.set(edge.id, connectionRoute(source, target, returnLane.get(edge.id)!)); continue; }
    const natural = connectionSides(source, target); const from = center(source); const to = center(target);
    const horizontal = to.x >= from.x ? { source: 'right', target: 'left' } as const : { source: 'left', target: 'right' } as const;
    const vertical = to.y >= from.y ? { source: 'bottom', target: 'top' } as const : { source: 'top', target: 'bottom' } as const;
    const candidates = [natural, horizontal, vertical, { source: 'bottom', target: 'top' } as const, { source: 'right', target: 'left' } as const];
    const sides = candidates.find((candidate, index) => candidates.findIndex(other => other.source === candidate.source && other.target === candidate.target) === index && !roleConflict(edge.source, candidate.source, 'output') && !roleConflict(edge.target, candidate.target, 'input')) ?? natural;
    reserve(edge.source, sides.source, 'output'); reserve(edge.target, sides.target, 'input');
    routes.set(edge.id, connectionRoute(source, target, 0, sides));
  }
  return routes;
}
const overlaps = (a: Rect, b: Rect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
const expanded = (rect: Rect, amount: number): Rect => ({ left: rect.left - amount, right: rect.right + amount, top: rect.top - amount, bottom: rect.bottom + amount });
const segmentIntersects = (segment: { start: Point; end: Point }, rect: Rect) => {
  if (segment.start.x === segment.end.x) return segment.start.x > rect.left && segment.start.x < rect.right && Math.max(Math.min(segment.start.y, segment.end.y), rect.top) < Math.min(Math.max(segment.start.y, segment.end.y), rect.bottom);
  return segment.start.y > rect.top && segment.start.y < rect.bottom && Math.max(Math.min(segment.start.x, segment.end.x), rect.left) < Math.min(Math.max(segment.start.x, segment.end.x), rect.right);
};
const labelBounds = (text: string, point: Point): Rect => {
  const { width, height } = connectorLabelSize(text);
  return { left: point.x - width / 2, right: point.x + width / 2, top: point.y - height / 2, bottom: point.y + height / 2 };
};
export function inspectDiagramGeometry(diagram: Diagram) {
  const items = [...diagram.nodes, ...diagram.imports];
  const nodes = items.map(item => { const size = layoutSize(item); const bounds = { left: item.position.x, top: item.position.y, right: item.position.x + size.width, bottom: item.position.y + size.height }; return { id: item.id, topLeft: { x: bounds.left, y: bounds.top }, bottomRight: { x: bounds.right, y: bounds.bottom }, bounds }; });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const routes = diagramConnectionRoutes(diagram.edges, new Map(nodes.map(node => [node.id, node.bounds])));
  const connectors = diagram.edges.map(edge => {
    const source = byId.get(edge.source)!; const target = byId.get(edge.target)!; const route = routes.get(edge.id)!;
    return { id: edge.id, source: edge.source, target: edge.target, ...route, label: edge.label ? { text: edge.label, bounds: labelBounds(edge.label, route.labelPoint) } : null };
  });
  const complaints: GeometryComplaint[] = [];
  const roles = new Map<string, Map<PortSide, Set<PortRole>>>();
  for (const connector of connectors.filter(connector => connector.returnOffset === undefined)) for (const [node, side, role] of [[connector.source, connector.sourceSide, 'output'], [connector.target, connector.targetSide, 'input']] as const) {
    const ports = roles.get(node) ?? new Map<PortSide, Set<PortRole>>(); const values = ports.get(side) ?? new Set<PortRole>(); values.add(role); ports.set(side, values); roles.set(node, ports);
  }
  for (const [nodeId, ports] of roles) for (const values of ports.values()) if (values.size > 1) complaints.push({ kind: 'mixed-direction-port', nodeId });
  for (let first = 0; first < nodes.length; first++) for (let second = first + 1; second < nodes.length; second++) if (overlaps(nodes[first].bounds, nodes[second].bounds)) complaints.push({ kind: 'node-node-overlap', nodeId: nodes[first].id, otherNodeId: nodes[second].id });
  for (const connector of connectors) {
    for (const node of nodes) {
      if (connector.label && overlaps(connector.label.bounds, node.bounds)) complaints.push({ kind: 'label-node-overlap', connectorId: connector.id, nodeId: node.id });
      else if (connector.label && (node.id === connector.source || node.id === connector.target) && overlaps(connector.label.bounds, expanded(node.bounds, CONNECTOR_LABEL_NODE_GAP))) complaints.push({ kind: 'label-node-clearance', connectorId: connector.id, nodeId: node.id });
      if (node.id !== connector.source && node.id !== connector.target && connector.segments.some(segment => segmentIntersects(segment, node.bounds))) complaints.push({ kind: 'connector-through-node', connectorId: connector.id, nodeId: node.id });
    }
  }
  for (let first = 0; first < connectors.length; first++) for (let second = first + 1; second < connectors.length; second++) {
    const a = connectors[first]; const b = connectors[second];
    if (a.label && b.label && overlaps(a.label.bounds, b.label.bounds)) complaints.push({ kind: 'label-label-overlap', connectorId: a.id, otherConnectorId: b.id });
    if (b.label && a.segments.some(segment => segmentIntersects(segment, b.label!.bounds))) complaints.push({ kind: 'connector-through-label', connectorId: a.id, otherConnectorId: b.id });
    if (a.label && b.segments.some(segment => segmentIntersects(segment, a.label!.bounds))) complaints.push({ kind: 'connector-through-label', connectorId: b.id, otherConnectorId: a.id });
  }
  return { nodes, connectors, complaints };
}
