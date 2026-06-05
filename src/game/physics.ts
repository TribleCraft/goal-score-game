import type { Point2, ShotLane, ShotOutcome } from "../types";

export type DragSample = {
  point: Point2;
  time: number;
};

export type PullInput = {
  start: Point2;
  end: Point2;
  durationMs: number;
  releaseVelocity: Point2;
};

export type PullPreview = {
  offsetX: number;
  offsetY: number;
  charge: number;
  speed: number;
};

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
  input: PullInput,
  viewport: { width: number; height: number },
  index: number,
): ShotOutcome {
  const lane = getLaneForShot(index);
  const dx = input.end.x - input.start.x;
  const dy = input.end.y - input.start.y;
  const distancePx = Math.hypot(dx, dy);
  const durationMs = Math.max(80, input.durationMs);
  const averageSpeed = distancePx / durationMs;
  const releaseSpeed = Math.hypot(input.releaseVelocity.x, input.releaseVelocity.y);
  const smallerSide = Math.max(1, Math.min(viewport.width, viewport.height));
  const pullX = dx / Math.max(1, viewport.width);
  const pullY = -dy / Math.max(1, viewport.height);
  const releaseX = input.releaseVelocity.x / Math.max(1, viewport.width);
  const releaseY = -input.releaseVelocity.y / Math.max(1, viewport.height);
  const directionX = releaseX * 0.68 + pullX * 0.32;
  const directionY = releaseY * 0.68 + pullY * 0.32;
  const power = clamp(distancePx / smallerSide * 0.72 + releaseSpeed * 0.9 + averageSpeed * 0.24, 0.12, 1.82);
  const curve = clamp((releaseX - pullX * 0.22) * releaseSpeed * 4.2, -0.58, 0.58);
  const landingX = clamp(directionX * 8.6 + curve, -3.05, 3.05);
  const landingY = clamp(directionY * 6.2 - 1.5 + (power - 1) * 0.5, -1.72, 2.45);
  const target = TARGETS[lane];
  const targetDistance = Math.hypot(landingX - target.x, landingY - target.y);
  const playablePower = releaseSpeed >= 0.12 && power >= 0.34 && power <= 1.68;
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

export function estimateReleaseVelocity(samples: DragSample[]) {
  const last = samples.at(-1);

  if (!last) {
    return { x: 0, y: 0 };
  }

  const recent = samples
    .slice()
    .reverse()
    .find((sample) => last.time - sample.time >= 36 && last.time - sample.time <= 160);
  const reference = recent ?? samples[0];
  const elapsed = Math.max(16, last.time - reference.time);

  return {
    x: (last.point.x - reference.point.x) / elapsed,
    y: (last.point.y - reference.point.y) / elapsed,
  };
}

export function computePullPreview(
  start: Point2,
  end: Point2,
  samples: DragSample[],
  viewport: { width: number; height: number },
): PullPreview {
  const velocity = estimateReleaseVelocity(samples);
  const distancePx = Math.hypot(end.x - start.x, end.y - start.y);
  const smallerSide = Math.max(1, Math.min(viewport.width, viewport.height));

  return {
    offsetX: (end.x - start.x) / Math.max(1, viewport.width),
    offsetY: (end.y - start.y) / Math.max(1, viewport.height),
    charge: clamp(distancePx / smallerSide, 0, 1),
    speed: Math.hypot(velocity.x, velocity.y),
  };
}

export function isMeaningfulPull(input: PullInput) {
  const distance = Math.hypot(input.end.x - input.start.x, input.end.y - input.start.y);
  const releaseSpeed = Math.hypot(input.releaseVelocity.x, input.releaseVelocity.y);

  return distance >= 42 && releaseSpeed >= 0.08;
}
