import type { DailyRun, LeaderboardEntry, PlayerProfile } from "../types";
import { calculateNextStreak, calculateXp } from "../utils/dateCycle";

const UID_KEY = "goal-score-game:offline-uid";
const PROFILE_KEY = "goal-score-game:profile";
const RUN_PREFIX = "goal-score-game:run:";
const LEADERBOARD_PREFIX = "goal-score-game:leaderboard:";

const sampleNames = ["NoScopeNina", "TorwandTimo", "MainzMVP", "SpandauSix", "SwipeSven"];

function getOfflineUid() {
  const existing = localStorage.getItem(UID_KEY);

  if (existing) {
    return existing;
  }

  const uid = `offline-${crypto.randomUUID()}`;
  localStorage.setItem(UID_KEY, uid);
  return uid;
}

function readJson<T>(key: string): T | null {
  const raw = localStorage.getItem(key);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson<T>(key: string, value: T) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getOfflineProfile(defaultName: string): PlayerProfile {
  const stored = readJson<PlayerProfile>(PROFILE_KEY);

  if (stored) {
    return stored;
  }

  const profile: PlayerProfile = {
    uid: getOfflineUid(),
    displayName: defaultName,
    xp: 0,
    streak: 0,
    selectedCosmetic: "classic",
  };
  writeJson(PROFILE_KEY, profile);

  return profile;
}

export function saveOfflineProfile(profile: PlayerProfile) {
  writeJson(PROFILE_KEY, profile);
}

export function getOfflineRun(dayKey: string) {
  return readJson<DailyRun>(`${RUN_PREFIX}${dayKey}`);
}

export function submitOfflineRun(run: DailyRun, currentProfile: PlayerProfile) {
  if (getOfflineRun(run.dayKey)) {
    throw new Error("already_played_today");
  }

  const streak = calculateNextStreak(currentProfile.lastRunDayKey, run.dayKey, currentProfile.streak);
  const xpEarned = calculateXp(run.score, streak);
  const profile: PlayerProfile = {
    ...currentProfile,
    displayName: run.displayName,
    xp: currentProfile.xp + xpEarned,
    streak,
    lastRunDayKey: run.dayKey,
  };
  const storedRun: DailyRun = {
    ...run,
    xpEarned,
    streak,
  };
  const board = readJson<LeaderboardEntry[]>(`${LEADERBOARD_PREFIX}${run.monthKey}`) ?? [];
  const existing = board.find((entry) => entry.uid === profile.uid);
  const entry: LeaderboardEntry = {
    uid: profile.uid,
    displayName: profile.displayName,
    monthKey: run.monthKey,
    totalHits: (existing?.totalHits ?? 0) + run.score,
    gamesPlayed: (existing?.gamesPlayed ?? 0) + 1,
    bestRound: Math.max(existing?.bestRound ?? 0, run.score),
    xp: profile.xp,
    streak: profile.streak,
  };

  const nextBoard = [entry, ...board.filter((item) => item.uid !== profile.uid)];
  writeJson(`${RUN_PREFIX}${run.dayKey}`, storedRun);
  writeJson(PROFILE_KEY, profile);
  writeJson(`${LEADERBOARD_PREFIX}${run.monthKey}`, nextBoard);

  return { profile, run: storedRun };
}

export function getOfflineLeaderboard(monthKey: string): LeaderboardEntry[] {
  const stored = readJson<LeaderboardEntry[]>(`${LEADERBOARD_PREFIX}${monthKey}`) ?? [];
  const samples = sampleNames.map((displayName, index) => ({
    uid: `sample-${index}`,
    displayName,
    monthKey,
    totalHits: Math.max(0, 19 - index * 3),
    gamesPlayed: 4 + index,
    bestRound: Math.max(2, 6 - Math.floor(index / 2)),
    xp: 340 + index * 110,
    streak: 3 + index,
  }));
  const merged = [...stored, ...samples].sort((a, b) => {
    if (b.totalHits !== a.totalHits) {
      return b.totalHits - a.totalHits;
    }

    if (b.bestRound !== a.bestRound) {
      return b.bestRound - a.bestRound;
    }

    return a.displayName.localeCompare(b.displayName);
  });

  return merged.map((entry, index) => ({ ...entry, rank: index + 1 })).slice(0, 20);
}
