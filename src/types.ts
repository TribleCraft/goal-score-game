export type ShotLane = "low" | "high";

export type Cosmetic = "classic" | "fire" | "kit";

export type BackendMode = "firebase" | "offline";

export type Point2 = {
  x: number;
  y: number;
};

export type SwipeInput = {
  start: Point2;
  end: Point2;
  durationMs: number;
};

export type ShotOutcome = {
  index: number;
  lane: ShotLane;
  hit: boolean;
  landingX: number;
  landingY: number;
  distance: number;
  power: number;
  curve: number;
  createdAt: number;
};

export type PlayerProfile = {
  uid: string;
  displayName: string;
  xp: number;
  streak: number;
  lastRunDayKey?: string;
  selectedCosmetic: Cosmetic;
};

export type DailyRun = {
  uid: string;
  displayName: string;
  dayKey: string;
  monthKey: string;
  score: number;
  shots: ShotOutcome[];
  xpEarned: number;
  streak: number;
  completedAt: number;
};

export type LeaderboardEntry = {
  uid: string;
  displayName: string;
  monthKey: string;
  totalHits: number;
  gamesPlayed: number;
  bestRound: number;
  xp: number;
  streak: number;
  rank?: number;
};

export type CyclePhase = "grind" | "ticket" | "reset";

export type CycleInfo = {
  dayKey: string;
  monthKey: string;
  dayOfMonth: number;
  daysInMonth: number;
  phase: CyclePhase;
  phaseLabel: string;
  daysRemaining: number;
};
