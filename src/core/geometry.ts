import type { Diagram } from './model.js';
import { CONNECTOR_LABEL_NODE_GAP, connectorLabelSize, layoutSize } from './layout.js';

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type PortSide = 'top' | 'right' | 'bottom' | 'left';
export type GeometryComplaint = {
  kind: 'node-node-overlap' | 'label-node-overlap' | 'label-node-clearance' | 'label-label-overlap' | 'connector-through-node' | 'connector-through-label' | 'mixed-direction-port';
  connectorId?: string; otherConnectorId?: string; nodeId?: string; otherNodeId?: string;
};
export type ConnectorRoute = { sourceSide: PortSide; targetSide: PortSide; start: Point; end: Point; segments: { start: Point; end: Point }[]; labelPoint: Point; returnOffset?: number; detour?: boolean };

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

type RoutableEdge = Pick<Diagram['edges'][number], 'id' | 'source' | 'target' | 'label'>;
type PortRole = 'input' | 'output';

const pointKey = (point: Point) => `${point.x},${point.y}`;
const pointInside = (point: Point, rect: Rect) => point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
const segmentLength = (segment: { start: Point; end: Point }) => Math.abs(segment.end.x - segment.start.x) + Math.abs(segment.end.y - segment.start.y);
const direction = (segment: { start: Point; end: Point }) => segment.start.x === segment.end.x ? 'vertical' : 'horizontal';
const stepFromPort = (point: Point, side: PortSide, distance: number): Point => side === 'left' ? { x: point.x - distance, y: point.y } : side === 'right' ? { x: point.x + distance, y: point.y } : side === 'top' ? { x: point.x, y: point.y - distance } : { x: point.x, y: point.y + distance };
const compactPoints = (points: Point[]) => points.filter((point, index) => {
  if (index === 0 || index === points.length - 1) return true;
  const previous = points[index - 1]; const next = points[index + 1];
  return !(previous.x === point.x && point.x === next.x) && !(previous.y === point.y && point.y === next.y);
});
const segmentsFromPoints = (points: Point[]) => points.slice(1).map((end, index) => ({ start: points[index], end }));

function cycleClosingEdgeIds(edges: RoutableEdge[], bounds: Map<string, Rect>) {
  const adjacency = new Map([...bounds.keys()].map(id => [id, new Set<string>()])); const closing = new Set<string>();
  const hasPath = (source: string, target: string) => {
    const pending = [source]; const seen = new Set<string>();
    while (pending.length) { const current = pending.pop()!; if (current === target) return true; if (seen.has(current)) continue; seen.add(current); pending.push(...(adjacency.get(current) ?? [])); }
    return false;
  };
  for (const edge of edges.filter(edge => bounds.has(edge.source) && bounds.has(edge.target) && edge.source !== edge.target)) {
    if (hasPath(edge.target, edge.source)) closing.add(edge.id); else adjacency.get(edge.source)!.add(edge.target);
  }
  return closing;
}

function safeLabelPoint(edge: RoutableEdge, segments: { start: Point; end: Point }[], bounds: Map<string, Rect>) {
  if (!edge.label) { const segment = segments.reduce((longest, candidate) => segmentLength(candidate) > segmentLength(longest) ? candidate : longest); return center({ left: segment.start.x, right: segment.end.x, top: segment.start.y, bottom: segment.end.y }); }
  const candidates = [...segments].sort((left, right) => segmentLength(right) - segmentLength(left));
  for (const segment of candidates) {
    const point = { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 }; const label = labelBounds(edge.label, point);
    if (segmentLength(segment) >= (direction(segment) === 'horizontal' ? connectorLabelSize(edge.label).width : connectorLabelSize(edge.label).height) + 12 && [...bounds.values()].every(rect => !overlaps(label, expanded(rect, 8)))) return point;
  }
  const segment = candidates[0]; return { x: (segment.start.x + segment.end.x) / 2, y: (segment.start.y + segment.end.y) / 2 };
}

function obstacleRoute(edge: RoutableEdge, source: Rect, target: Rect, sides: { source: PortSide; target: PortSide }, bounds: Map<string, Rect>): ConnectorRoute | null {
  const clearance = 24; const start = port(source, sides.source); const end = port(target, sides.target); const sourceStub = stepFromPort(start, sides.source, clearance); const targetStub = stepFromPort(end, sides.target, clearance);
  const obstacles = [...bounds.entries()].map(([id, rect]) => ({ id, rect: expanded(rect, clearance) }));
  const xs = [...new Set([sourceStub.x, targetStub.x, ...obstacles.flatMap(({ rect }) => [rect.left, rect.right])])].sort((a, b) => a - b);
  const ys = [...new Set([sourceStub.y, targetStub.y, ...obstacles.flatMap(({ rect }) => [rect.top, rect.bottom])])].sort((a, b) => a - b);
  const points = new Map<string, Point>();
  for (const x of xs) for (const y of ys) { const point = { x, y }; if (!obstacles.some(({ rect }) => pointInside(point, rect))) points.set(pointKey(point), point); }
  points.set(pointKey(sourceStub), sourceStub); points.set(pointKey(targetStub), targetStub);
  const neighbors = new Map([...points.keys()].map(key => [key, [] as Point[]]));
  const clear = (a: Point, b: Point) => !obstacles.some(({ rect }) => segmentIntersects({ start: a, end: b }, rect));
  for (const y of ys) {
    const row = [...points.values()].filter(point => point.y === y).sort((a, b) => a.x - b.x);
    for (let index = 1; index < row.length; index++) if (clear(row[index - 1], row[index])) { neighbors.get(pointKey(row[index - 1]))!.push(row[index]); neighbors.get(pointKey(row[index]))!.push(row[index - 1]); }
  }
  for (const x of xs) {
    const column = [...points.values()].filter(point => point.x === x).sort((a, b) => a.y - b.y);
    for (let index = 1; index < column.length; index++) if (clear(column[index - 1], column[index])) { neighbors.get(pointKey(column[index - 1]))!.push(column[index]); neighbors.get(pointKey(column[index]))!.push(column[index - 1]); }
  }
  type State = { point: Point; previousDirection: 'horizontal' | 'vertical' | null; cost: number; key: string };
  const startState: State = { point: sourceStub, previousDirection: sides.source === 'left' || sides.source === 'right' ? 'horizontal' : 'vertical', cost: 0, key: `${pointKey(sourceStub)}|${sides.source === 'left' || sides.source === 'right' ? 'horizontal' : 'vertical'}` };
  const pending = [startState]; const best = new Map([[startState.key, 0]]); const previous = new Map<string, string>(); let found: State | undefined;
  while (pending.length) {
    pending.sort((a, b) => a.cost - b.cost || a.key.localeCompare(b.key)); const current = pending.shift()!;
    if (current.cost !== best.get(current.key)) continue;
    if (pointKey(current.point) === pointKey(targetStub)) { found = current; break; }
    for (const next of neighbors.get(pointKey(current.point)) ?? []) {
      const nextDirection = next.x === current.point.x ? 'vertical' : 'horizontal'; const bendCost = current.previousDirection === nextDirection ? 0 : 34; const cost = current.cost + Math.abs(next.x - current.point.x) + Math.abs(next.y - current.point.y) + bendCost; const key = `${pointKey(next)}|${nextDirection}`;
      if (cost + .001 >= (best.get(key) ?? Number.POSITIVE_INFINITY)) continue;
      best.set(key, cost); previous.set(key, current.key); pending.push({ point: next, previousDirection: nextDirection, cost, key });
    }
  }
  if (!found) return null;
  const core: Point[] = []; let key: string | undefined = found.key;
  while (key) { const [x, y] = key.split('|')[0].split(',').map(Number); core.push({ x, y }); key = previous.get(key); }
  core.reverse(); const routePoints = compactPoints([start, ...core, end]); const segments = segmentsFromPoints(routePoints); const labelPoint = safeLabelPoint(edge, segments, bounds);
  return { sourceSide: sides.source, targetSide: sides.target, start, end, segments, labelPoint, detour: true };
}

export function diagramConnectionRoutes(edges: RoutableEdge[], bounds: Map<string, Rect>) {
  const cycleClosing = cycleClosingEdgeIds(edges, bounds); const returnLane = new Map([...cycleClosing].sort().map((id, index) => [id, index]));
  const occupied = new Map<string, Map<PortSide, PortRole>>(); const routes = new Map<string, ConnectorRoute>();
  const roleConflict = (node: string, side: PortSide, role: PortRole) => { const current = occupied.get(node)?.get(side); return current !== undefined && current !== role; };
  const reserve = (node: string, side: PortSide, role: PortRole) => { const ports = occupied.get(node) ?? new Map<PortSide, PortRole>(); ports.set(side, role); occupied.set(node, ports); };
  for (const edge of edges) {
    const source = bounds.get(edge.source)!; const target = bounds.get(edge.target)!;
    if (returnLane.has(edge.id)) { routes.set(edge.id, connectionRoute(source, target, returnLane.get(edge.id)!)); continue; }
    const natural = connectionSides(source, target); const from = center(source); const to = center(target);
    const horizontal = to.x >= from.x ? { source: 'right', target: 'left' } as const : { source: 'left', target: 'right' } as const;
    const vertical = to.y >= from.y ? { source: 'bottom', target: 'top' } as const : { source: 'top', target: 'bottom' } as const;
    const candidates = [natural, horizontal, vertical, { source: 'top', target: 'top' } as const, { source: 'bottom', target: 'bottom' } as const, { source: 'left', target: 'left' } as const, { source: 'right', target: 'right' } as const, { source: 'bottom', target: 'top' } as const, { source: 'top', target: 'bottom' } as const, { source: 'right', target: 'left' } as const, { source: 'left', target: 'right' } as const];
    const uniqueCandidates = candidates.filter((candidate, index) => candidates.findIndex(other => other.source === candidate.source && other.target === candidate.target) === index);
    const available = uniqueCandidates.filter(candidate => !roleConflict(edge.source, candidate.source, 'output') && !roleConflict(edge.target, candidate.target, 'input'));
    const detours: { sides: { source: PortSide; target: PortSide }; route: ConnectorRoute; cost: number }[] = []; let selected: { sides: { source: PortSide; target: PortSide }; route: ConnectorRoute } | undefined;
    for (const [preference, sides] of (available.length ? available : [natural]).entries()) {
      const direct = connectionRoute(source, target, 0, sides); const directLabel = edge.label ? labelBounds(edge.label, direct.labelPoint) : null;
      const obstructed = [...bounds.entries()].some(([id, rect]) => id !== edge.source && id !== edge.target && (direct.segments.some(segment => segmentIntersects(segment, expanded(rect, 8))) || (directLabel && overlaps(directLabel, expanded(rect, 8)))));
      if (!obstructed) { selected = { sides, route: direct }; break; }
      const route = obstacleRoute(edge, source, target, sides, bounds); if (!route) continue;
      const turns = Math.max(0, route.segments.length - 1); const cost = route.segments.reduce((sum, segment) => sum + segmentLength(segment), 0) + turns * 34 + preference * 80;
      detours.push({ sides, route, cost });
    }
    selected ??= detours.sort((left, right) => left.cost - right.cost)[0] ?? { sides: natural, route: connectionRoute(source, target, 0, natural) }; const { sides } = selected;
    reserve(edge.source, sides.source, 'output'); reserve(edge.target, sides.target, 'input');
    routes.set(edge.id, selected.route);
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
