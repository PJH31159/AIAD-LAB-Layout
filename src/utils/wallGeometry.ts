import type { LayoutObject, Point } from '../types/layout';
import { getRoomWallOuterSegments } from './roomGeometry';
import { getWallEndpoints } from './structurePlacement';

export type WallFaceGeometry = {
  id: string;
  source: 'room' | 'object';
  start: Point;
  end: Point;
  outerStart: Point;
  outerEnd: Point;
  thickness: number;
};

export function getObjectWallFaceGeometry(wall: LayoutObject): WallFaceGeometry | null {
  if (wall.type !== 'wall') return null;
  const { start, end } = getWallEndpoints(wall);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;
  const side = wall.wallSide ?? 1;
  const offset = {
    x: (-dy / length) * wall.depth * side,
    y: (dx / length) * wall.depth * side,
  };
  return {
    id: wall.id,
    source: 'object',
    start,
    end,
    outerStart: { x: start.x + offset.x, y: start.y + offset.y },
    outerEnd: { x: end.x + offset.x, y: end.y + offset.y },
    thickness: wall.depth,
  };
}

export function getRoomWallFaceGeometries(
  vertices: Point[],
  removedWallIndices: number[],
  thickness: number | number[],
): WallFaceGeometry[] {
  const thicknesses = Array.isArray(thickness) ? thickness : vertices.map(() => thickness);
  return getRoomWallOuterSegments(vertices, removedWallIndices, thickness).flatMap((segment, index) => segment ? [{
    id: `room-wall-${index}`,
    source: 'room' as const,
    start: segment.inStart,
    end: segment.inEnd,
    outerStart: segment.outStart,
    outerEnd: segment.outEnd,
    thickness: thicknesses[index],
  }] : []);
}

function lineIntersection(a: Point, b: Point, c: Point, d: Point): Point | null {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const cdX = d.x - c.x;
  const cdY = d.y - c.y;
  const denominator = abX * cdY - abY * cdX;
  if (Math.abs(denominator) < 0.000001) return null;
  const ratio = ((c.x - a.x) * cdY - (c.y - a.y) * cdX) / denominator;
  return { x: a.x + abX * ratio, y: a.y + abY * ratio };
}

type WallEndpoint = { wall: WallFaceGeometry; face: Point; outer: Point };

export function getWallJoinPolygons(walls: WallFaceGeometry[], tolerance = 1): Point[][] {
  const endpoints: WallEndpoint[] = walls.flatMap((wall) => [
    { wall, face: wall.start, outer: wall.outerStart },
    { wall, face: wall.end, outer: wall.outerEnd },
  ]);
  const polygons: Point[][] = [];
  const joinedCorners = new Set<string>();

  endpoints.forEach((first, index) => {
    endpoints.slice(index + 1).forEach((second) => {
      if (first.wall.id === second.wall.id) return;
      if (first.wall.source === 'room' && second.wall.source === 'room') return;
      const firstDx = first.wall.end.x - first.wall.start.x;
      const firstDy = first.wall.end.y - first.wall.start.y;
      const secondDx = second.wall.end.x - second.wall.start.x;
      const secondDy = second.wall.end.y - second.wall.start.y;
      const firstLength = Math.hypot(firstDx, firstDy);
      const secondLength = Math.hypot(secondDx, secondDy);
      if (firstLength === 0 || secondLength === 0) return;
      const directionDot = Math.abs((firstDx * secondDx + firstDy * secondDy) / (firstLength * secondLength));
      if (directionDot > 0.01) return;
      const shared = lineIntersection(
        first.wall.start,
        first.wall.end,
        second.wall.start,
        second.wall.end,
      );
      if (!shared) return;
      const joinReach = Math.max(first.wall.thickness, second.wall.thickness) + tolerance;
      if (Math.hypot(first.face.x - shared.x, first.face.y - shared.y) > joinReach) return;
      if (Math.hypot(second.face.x - shared.x, second.face.y - shared.y) > joinReach) return;
      const cornerKey = [first.wall.id, second.wall.id].sort().join('|')
        + `@${Math.round(shared.x * 1000)},${Math.round(shared.y * 1000)}`;
      if (joinedCorners.has(cornerKey)) return;
      joinedCorners.add(cornerKey);
      const intersection = lineIntersection(
        first.wall.outerStart,
        first.wall.outerEnd,
        second.wall.outerStart,
        second.wall.outerEnd,
      );
      const miterLimit = Math.max(first.wall.thickness, second.wall.thickness) * 4;
      const safeIntersection = intersection
        && Math.hypot(intersection.x - shared.x, intersection.y - shared.y) <= miterLimit
        ? intersection
        : null;
      const firstOuterAtShared = {
        x: shared.x + first.wall.outerStart.x - first.wall.start.x,
        y: shared.y + first.wall.outerStart.y - first.wall.start.y,
      };
      const secondOuterAtShared = {
        x: shared.x + second.wall.outerStart.x - second.wall.start.x,
        y: shared.y + second.wall.outerStart.y - second.wall.start.y,
      };
      const polygon = safeIntersection
        ? [shared, firstOuterAtShared, safeIntersection, secondOuterAtShared]
        : [shared, firstOuterAtShared, secondOuterAtShared];
      const area = polygon.reduce((sum, point, pointIndex) => {
        const next = polygon[(pointIndex + 1) % polygon.length];
        return sum + point.x * next.y - next.x * point.y;
      }, 0) / 2;
      if (Math.abs(area) > 0.01) polygons.push(polygon);
    });
  });
  return polygons;
}

export function getClosedWallLoops(objects: LayoutObject[], tolerance = 1): Point[][] {
  const entries = objects.flatMap((object) => object.type === 'wall'
    ? [{ ...getWallEndpoints(object) }]
    : []);
  const nodes: Point[] = [];
  const nodeIndex = (point: Point) => {
    const existing = nodes.findIndex((node) => Math.hypot(node.x - point.x, node.y - point.y) <= tolerance);
    if (existing >= 0) return existing;
    nodes.push(point);
    return nodes.length - 1;
  };
  const edges = entries.map((entry) => ({ a: nodeIndex(entry.start), b: nodeIndex(entry.end) }));
  const adjacency = nodes.map(() => [] as number[]);
  edges.forEach((edge, edgeIndex) => {
    adjacency[edge.a].push(edgeIndex);
    adjacency[edge.b].push(edgeIndex);
  });
  const visited = new Set<number>();
  const loops: Point[][] = [];

  edges.forEach((_, seedIndex) => {
    if (visited.has(seedIndex)) return;
    const component: number[] = [];
    const queue = [seedIndex];
    while (queue.length > 0) {
      const edgeIndex = queue.pop()!;
      if (visited.has(edgeIndex)) continue;
      visited.add(edgeIndex);
      component.push(edgeIndex);
      const edge = edges[edgeIndex];
      [...adjacency[edge.a], ...adjacency[edge.b]].forEach((neighbor) => {
        if (!visited.has(neighbor)) queue.push(neighbor);
      });
    }
    if (component.length < 3) return;
    const componentNodes = new Set(component.flatMap((edgeIndex) => [edges[edgeIndex].a, edges[edgeIndex].b]));
    if ([...componentNodes].some((node) => adjacency[node].filter((edgeIndex) => component.includes(edgeIndex)).length !== 2)) return;
    const first = edges[component[0]];
    const polygon = [nodes[first.a], nodes[first.b]];
    let currentNode = first.b;
    let previousEdge = component[0];
    while (polygon.length <= component.length) {
      const nextEdgeIndex = adjacency[currentNode].find((edgeIndex) =>
        edgeIndex !== previousEdge && component.includes(edgeIndex));
      if (nextEdgeIndex === undefined) return;
      const nextEdge = edges[nextEdgeIndex];
      currentNode = nextEdge.a === currentNode ? nextEdge.b : nextEdge.a;
      previousEdge = nextEdgeIndex;
      if (currentNode === first.a) break;
      polygon.push(nodes[currentNode]);
    }
    if (currentNode !== first.a || polygon.length !== component.length) return;
    const area = polygon.reduce((sum, point, index) => {
      const next = polygon[(index + 1) % polygon.length];
      return sum + point.x * next.y - next.x * point.y;
    }, 0) / 2;
    if (Math.abs(area) > 1) loops.push(polygon);
  });
  return loops;
}
