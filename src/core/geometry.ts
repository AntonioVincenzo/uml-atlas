import type { Diagram } from './model.js';
import { CONNECTOR_LABEL_NODE_GAP, connectorLabelSize, layoutSize } from './layout.js';

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type PortSide = 'top' | 'right' | 'bottom' | 'left';
export type GeometryComplaint = {
  kind: 'node-node-overlap' | 'label-node-overlap' | 'label-node-clearance' | 'label-label-overlap' | 'connector-through-node' | 'connector-through-label';
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
export function connectionRoute(source: Rect, target: Rect, returnLane = 0): ConnectorRoute {
  if (isBackwardConnection(source, target)) {
    const sourceSide: PortSide = 'top'; const targetSide: PortSide = 'top'; const start = port(source, sourceSide); const end = port(target, targetSide); const returnOffset = 70 + returnLane * 42; const laneY = Math.min(start.y, end.y) - returnOffset;
    return { sourceSide, targetSide, start, end, returnOffset, segments: [{ start, end: { x: start.x, y: laneY } }, { start: { x: start.x, y: laneY }, end: { x: end.x, y: laneY } }, { start: { x: end.x, y: laneY }, end }], labelPoint: { x: (start.x + end.x) / 2, y: laneY } };
  }
  const sides = connectionSides(source, target); const start = port(source, sides.source); const end = port(target, sides.target);
  const horizontal = sides.source === 'left' || sides.source === 'right'; const bend = horizontal ? (start.x + end.x) / 2 : (start.y + end.y) / 2;
  const segments = horizontal ? [{ start, end: { x: bend, y: start.y } }, { start: { x: bend, y: start.y }, end: { x: bend, y: end.y } }, { start: { x: bend, y: end.y }, end }] : [{ start, end: { x: start.x, y: bend } }, { start: { x: start.x, y: bend }, end: { x: end.x, y: bend } }, { start: { x: end.x, y: bend }, end }];
  return { sourceSide: sides.source, targetSide: sides.target, start, end, segments, labelPoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
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
  const returnLane = new Map(diagram.edges.filter(edge => isBackwardConnection(byId.get(edge.source)!.bounds, byId.get(edge.target)!.bounds)).map(edge => edge.id).sort().map((id, index) => [id, index]));
  const connectors = diagram.edges.map(edge => {
    const source = byId.get(edge.source)!; const target = byId.get(edge.target)!; const route = connectionRoute(source.bounds, target.bounds, returnLane.get(edge.id) ?? 0);
    return { id: edge.id, source: edge.source, target: edge.target, ...route, label: edge.label ? { text: edge.label, bounds: labelBounds(edge.label, route.labelPoint) } : null };
  });
  const complaints: GeometryComplaint[] = [];
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
