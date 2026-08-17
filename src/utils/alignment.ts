import type { LayoutObject } from '../types/layout';
import { rotatedBounds } from './coordinates';

export type AlignmentGuides = { x?: number; y?: number };

type AlignmentCandidate = {
  delta: number;
  guide: number;
  perpendicularGap: number;
};

function intervalGap(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return Math.max(0, firstStart - secondEnd, secondStart - firstEnd);
}

function selectCandidate(current: AlignmentCandidate | null, candidate: AlignmentCandidate) {
  if (!current) return candidate;
  const currentDistance = Math.abs(current.delta);
  const candidateDistance = Math.abs(candidate.delta);
  if (candidateDistance < currentDistance) return candidate;
  if (candidateDistance === currentDistance && candidate.perpendicularGap < current.perpendicularGap) return candidate;
  return current;
}

export function alignObjectPosition(
  object: LayoutObject,
  x: number,
  y: number,
  others: LayoutObject[],
  threshold: number,
  maximumPerpendicularGap: number | ((other: LayoutObject) => number) = Number.POSITIVE_INFINITY,
): { x: number; y: number; guides: AlignmentGuides } {
  const moving = rotatedBounds({ ...object, x, y });
  const movingX = [moving.left, moving.centerX, moving.right];
  const movingY = [moving.top, moving.centerY, moving.bottom];
  let bestX: AlignmentCandidate | null = null;
  let bestY: AlignmentCandidate | null = null;

  for (const other of others) {
    const target = rotatedBounds(other);
    const gapLimit = typeof maximumPerpendicularGap === 'function'
      ? maximumPerpendicularGap(other)
      : maximumPerpendicularGap;
    const verticalGap = intervalGap(moving.top, moving.bottom, target.top, target.bottom);
    const horizontalGap = intervalGap(moving.left, moving.right, target.left, target.right);

    if (verticalGap <= gapLimit) {
      const targetX = [target.left, target.centerX, target.right];
      for (const movingValue of movingX) {
        for (const targetValue of targetX) {
          const delta = targetValue - movingValue;
          if (Math.abs(delta) <= threshold) {
            bestX = selectCandidate(bestX, { delta, guide: targetValue, perpendicularGap: verticalGap });
          }
        }
      }
    }

    if (horizontalGap <= gapLimit) {
      const targetY = [target.top, target.centerY, target.bottom];
      for (const movingValue of movingY) {
        for (const targetValue of targetY) {
          const delta = targetValue - movingValue;
          if (Math.abs(delta) <= threshold) {
            bestY = selectCandidate(bestY, { delta, guide: targetValue, perpendicularGap: horizontalGap });
          }
        }
      }
    }
  }

  return {
    x: x + (bestX?.delta ?? 0),
    y: y + (bestY?.delta ?? 0),
    guides: {
      x: bestX?.guide,
      y: bestY?.guide,
    },
  };
}
