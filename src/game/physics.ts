import type { Point2, ShotLane, ShotOutcome, SwipeInput } from "../types";

export const TARGETS: Record<ShotLane, { x: number; y: number; radius: number; label: string }> = {
  low: {
    x: -1.55,
    y: -0.98,
    radius: 0.45,
    label: "Unten links",
  },
  high: {
    x: 1.55,
    y: 1.18,
    radius: 0.45,
    label: "Oben rechts",
  },
};

export function getLaneForShot(index: number): ShotLane {
  return index < 3 ? "low" : "high";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function computeShotOutcome(
  input: SwipeInput,
  viewport: { width: number; height: number },
  index: number,
): ShotOutcome {
  const lane = getLaneForShot(index);
  const dx = input.end.x - input.start.x;
  const dy = input.end.y - input.start.y;
  const distancePx = Math.hypot(dx, dy);
  const durationMs = Math.max(80, input.durationMs);
  const speed = distancePx / durationMs;
  const smallerSide = Math.max(1, Math.min(viewport.width, viewport.height));
  const power = clamp(distancePx / smallerSide * 1.65 + speed * 0.32, 0.18, 1.7);
  const rawX = dx / Math.max(1, viewport.width) * 7.8;
  const rawY = -dy / Math.max(1, viewport.height) * 5.8 - 1.72;
  const curve = clamp((dx / Math.max(1, viewport.width)) * speed * 1.55, -0.48, 0.48);
  const landingX = clamp(rawX + curve, -3.05, 3.05);
  const landingY = clamp(rawY + (power - 1) * 0.38, -1.72, 2.45);
  const target = TARGETS[lane];
  const targetDistance = Math.hypot(landingX - target.x, landingY - target.y);
  const playablePower = power >= 0.42 && power <= 1.58;
  const hit = playablePower && targetDistance <= target.radius;

  return {
    index,
    lane,
    hit,
    landingX,
    landingY,
    distance: targetDistance,
    power,
    curve,
    createdAt: Date.now(),
  };
}

export function isMeaningfulSwipe(start: Point2, end: Point2) {
  return Math.hypot(end.x - start.x, end.y - start.y) >= 34;
}
