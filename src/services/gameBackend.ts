import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import type { DailyRun, LeaderboardEntry, PlayerProfile } from "../types";
import { calculateNextStreak, calculateXp } from "../utils/dateCycle";
import { ensureAnonymousUser, getFirebaseClient, hasFirebaseConfig } from "./firebaseClient";
import {
  getOfflineLeaderboard,
  getOfflineProfile,
  getOfflineRun,
  saveOfflineProfile,
  submitOfflineRun,
} from "./offlineStore";

export type BackendSnapshot = {
  mode: "firebase" | "offline";
  profile: PlayerProfile;
  todayRun: DailyRun | null;
};

function defaultDisplayName() {
  const randomId = Math.floor(1000 + Math.random() * 9000);
  return `Torwand-${randomId}`;
}

function normalizeDisplayName(value: string) {
  const cleaned = value.trim().replace(/\s+/g, " ").slice(0, 24);
  return cleaned || defaultDisplayName();
}

function rankEntries(entries: LeaderboardEntry[]) {
  return entries
    .sort((a, b) => {
      if (b.totalHits !== a.totalHits) {
        return b.totalHits - a.totalHits;
      }

      if (b.bestRound !== a.bestRound) {
        return b.bestRound - a.bestRound;
      }

      return a.displayName.localeCompare(b.displayName);
    })
    .map((entry, index) => ({ ...entry, rank: index + 1 }));
}

export async function loadBackend(dayKey: string): Promise<BackendSnapshot> {
  if (!hasFirebaseConfig()) {
    const profile = getOfflineProfile(defaultDisplayName());
    return {
      mode: "offline",
      profile,
      todayRun: getOfflineRun(dayKey),
    };
  }

  try {
    const client = getFirebaseClient();

    if (!client) {
      const profile = getOfflineProfile(defaultDisplayName());
      return {
        mode: "offline",
        profile,
        todayRun: getOfflineRun(dayKey),
      };
    }

    const user = await ensureAnonymousUser(client.auth);
    const profileRef = doc(client.db, "players", user.uid);
    const runRef = doc(client.db, "players", user.uid, "runs", dayKey);
    const [profileSnap, runSnap] = await Promise.all([getDoc(profileRef), getDoc(runRef)]);
    const fallbackProfile: PlayerProfile = {
      uid: user.uid,
      displayName: defaultDisplayName(),
      xp: 0,
      streak: 0,
      selectedCosmetic: "classic",
    };

    if (!profileSnap.exists()) {
      await setDoc(profileRef, {
        ...fallbackProfile,
        updatedAt: serverTimestamp(),
      });
    }

    const profile = profileSnap.exists() ? (profileSnap.data() as PlayerProfile) : fallbackProfile;

    return {
      mode: "firebase",
      profile,
      todayRun: runSnap.exists() ? (runSnap.data() as DailyRun) : null,
    };
  } catch (error) {
    console.warn("Firebase startup failed, falling back to offline mode.", error);
    const profile = getOfflineProfile(defaultDisplayName());
    return {
      mode: "offline",
      profile,
      todayRun: getOfflineRun(dayKey),
    };
  }
}

export async function saveProfile(profile: PlayerProfile, mode: "firebase" | "offline") {
  const nextProfile = {
    ...profile,
    displayName: normalizeDisplayName(profile.displayName),
  };

  if (mode === "offline") {
    saveOfflineProfile(nextProfile);
    return nextProfile;
  }

  const client = getFirebaseClient();

  if (!client) {
    saveOfflineProfile(nextProfile);
    return nextProfile;
  }

  await setDoc(
    doc(client.db, "players", profile.uid),
    {
      ...nextProfile,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return nextProfile;
}

export async function submitRun(run: DailyRun, profile: PlayerProfile, mode: "firebase" | "offline") {
  const cleanRun: DailyRun = {
    ...run,
    displayName: normalizeDisplayName(run.displayName),
    score: Math.max(0, Math.min(6, run.score)),
  };

  if (mode === "offline") {
    return submitOfflineRun(cleanRun, profile);
  }

  const client = getFirebaseClient();

  if (!client) {
    return submitOfflineRun(cleanRun, profile);
  }

  const profileRef = doc(client.db, "players", profile.uid);
  const runRef = doc(client.db, "players", profile.uid, "runs", cleanRun.dayKey);
  const entryRef = doc(client.db, "leaderboards", cleanRun.monthKey, "entries", profile.uid);

  const result = await runTransaction(client.db, async (transaction) => {
    const [existingRun, profileSnap, entrySnap] = await Promise.all([
      transaction.get(runRef),
      transaction.get(profileRef),
      transaction.get(entryRef),
    ]);

    if (existingRun.exists()) {
      throw new Error("already_played_today");
    }

    const previousProfile = profileSnap.exists() ? (profileSnap.data() as PlayerProfile) : profile;
    const previousEntry = entrySnap.exists() ? (entrySnap.data() as LeaderboardEntry) : null;
    const streak = calculateNextStreak(previousProfile.lastRunDayKey, cleanRun.dayKey, previousProfile.streak);
    const xpEarned = calculateXp(cleanRun.score, streak);
    const nextProfile: PlayerProfile = {
      ...previousProfile,
      displayName: cleanRun.displayName,
      xp: previousProfile.xp + xpEarned,
      streak,
      lastRunDayKey: cleanRun.dayKey,
      selectedCosmetic: previousProfile.selectedCosmetic,
    };
    const storedRun: DailyRun = {
      ...cleanRun,
      xpEarned,
      streak,
    };
    const entry: LeaderboardEntry = {
      uid: profile.uid,
      displayName: cleanRun.displayName,
      monthKey: cleanRun.monthKey,
      totalHits: (previousEntry?.totalHits ?? 0) + cleanRun.score,
      gamesPlayed: (previousEntry?.gamesPlayed ?? 0) + 1,
      bestRound: Math.max(previousEntry?.bestRound ?? 0, cleanRun.score),
      xp: nextProfile.xp,
      streak,
    };

    transaction.set(runRef, {
      ...storedRun,
      createdAt: serverTimestamp(),
    });
    transaction.set(profileRef, {
      ...nextProfile,
      updatedAt: serverTimestamp(),
    });
    transaction.set(entryRef, {
      ...entry,
      updatedAt: serverTimestamp(),
    });

    return {
      profile: nextProfile,
      run: storedRun,
    };
  });

  return result;
}

export function subscribeLeaderboard(
  monthKey: string,
  mode: "firebase" | "offline",
  callback: (entries: LeaderboardEntry[]) => void,
) {
  if (mode === "offline") {
    callback(getOfflineLeaderboard(monthKey));
    return () => undefined;
  }

  const client = getFirebaseClient();

  if (!client) {
    callback(getOfflineLeaderboard(monthKey));
    return () => undefined;
  }

  const leaderboardQuery = query(
    collection(client.db, "leaderboards", monthKey, "entries"),
    orderBy("totalHits", "desc"),
    limit(20),
  );

  return onSnapshot(leaderboardQuery, (snapshot) => {
    const entries = snapshot.docs.map((entry) => entry.data() as LeaderboardEntry);
    callback(rankEntries(entries));
  });
}
