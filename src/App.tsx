import {
  CalendarDays,
  Flame,
  MousePointer2,
  Play,
  RotateCcw,
  Shirt,
  ShieldAlert,
  Trophy,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { TorwandScene } from "./game/TorwandScene";
import {
  computePullPreview,
  computeShotOutcome,
  estimateReleaseVelocity,
  getLaneForShot,
  isMeaningfulPull,
  TARGETS,
  type DragSample,
  type PullPreview,
} from "./game/physics";
import {
  loadBackend,
  saveProfile,
  submitRun,
  subscribeLeaderboard,
  type BackendSnapshot,
} from "./services/gameBackend";
import type { Cosmetic, DailyRun, LeaderboardEntry, Point2, ShotOutcome } from "./types";
import { generateClaimCode } from "./utils/claimCode";
import { getCycleInfo } from "./utils/dateCycle";

type GamePhase = "loading" | "ready" | "aiming" | "flying" | "completed" | "locked";

function formatPull(preview: PullPreview) {
  return `${Math.round(preview.charge * 100)}% · ${Math.round(preview.speed * 1000)} px/s`;
}

function getScoreLabel(score: number) {
  if (score === 6) {
    return "Perfekte Runde";
  }

  if (score >= 4) {
    return "Studio-tauglich";
  }

  if (score >= 2) {
    return "Solider Versuch";
  }

  return "Warmspielen";
}

function cosmeticUnlocked(cosmetic: Cosmetic, xp: number) {
  if (cosmetic === "classic") {
    return true;
  }

  if (cosmetic === "fire") {
    return xp >= 100;
  }

  return xp >= 240;
}

function getCosmeticLabel(cosmetic: Cosmetic) {
  if (cosmetic === "fire") {
    return "Feuerball";
  }

  if (cosmetic === "kit") {
    return "Trikotball";
  }

  return "Classic";
}

export default function App() {
  const cycle = useMemo(() => getCycleInfo(), []);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const pullRef = useRef<{ start: Point2; startedAt: number; samples: DragSample[] } | null>(null);
  const [backend, setBackend] = useState<BackendSnapshot | null>(null);
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [shots, setShots] = useState<ShotOutcome[]>([]);
  const [pullPreview, setPullPreview] = useState<PullPreview | null>(null);
  const [flight, setFlight] = useState<{ outcome: ShotOutcome; startedAt: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [notice, setNotice] = useState("Zieh in die gewuenschte Flugrichtung und lass schnell los.");
  const activeShotIndex = shots.length;
  const activeLane = getLaneForShot(Math.min(activeShotIndex, 5));
  const score = shots.filter((shot) => shot.hit).length;
  const locked = phase === "locked" || Boolean(backend?.todayRun);
  const currentProfile = backend?.profile;

  useEffect(() => {
    let cancelled = false;

    loadBackend(cycle.dayKey)
      .then((snapshot) => {
        if (cancelled) {
          return;
        }

        setBackend(snapshot);
        setDisplayNameDraft(snapshot.profile.displayName);
        setPhase(snapshot.todayRun ? "locked" : "ready");
        setNotice(
          snapshot.todayRun
            ? "Heute ist deine Tagesrunde gespeichert. Morgen gibt es sechs neue Schuesse."
            : "Zieh in die gewuenschte Flugrichtung und lass schnell los.",
        );
      })
      .catch((error: unknown) => {
        console.error(error);
        if (!cancelled) {
          setPhase("ready");
          setNotice("Firebase konnte nicht geladen werden. Der Prototyp laeuft lokal weiter.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [cycle.dayKey]);

  useEffect(() => {
    if (!backend) {
      return;
    }

    return subscribeLeaderboard(cycle.monthKey, backend.mode, setLeaderboard);
  }, [backend, cycle.monthKey]);

  const persistProfile = async (patch: Partial<NonNullable<typeof currentProfile>>) => {
    if (!backend || !currentProfile) {
      return;
    }

    const nextProfile = await saveProfile(
      {
        ...currentProfile,
        ...patch,
      },
      backend.mode,
    );

    setBackend({
      ...backend,
      profile: nextProfile,
    });
  };

  const handleNameBlur = () => {
    if (!currentProfile || displayNameDraft.trim() === currentProfile.displayName) {
      return;
    }

    void persistProfile({ displayName: displayNameDraft });
  };

  const resetLocalRound = () => {
    if (phase === "flying") {
      return;
    }

    setShots([]);
    setPullPreview(null);
    setFlight(null);
    setPhase(locked ? "locked" : "ready");
    setNotice(locked ? "Die gespeicherte Tagesrunde bleibt aktiv." : "Runde zurueckgesetzt.");
  };

  const submitCompletedRun = async (nextShots: ShotOutcome[]) => {
    if (!backend || !currentProfile) {
      return;
    }

    const runScore = nextShots.filter((shot) => shot.hit).length;
    const run: DailyRun = {
      uid: currentProfile.uid,
      displayName: displayNameDraft,
      dayKey: cycle.dayKey,
      monthKey: cycle.monthKey,
      claimCode: generateClaimCode(),
      score: runScore,
      shots: nextShots,
      xpEarned: 0,
      streak: currentProfile.streak,
      completedAt: Date.now(),
    };

    try {
      const result = await submitRun(run, currentProfile, backend.mode);
      setBackend({
        ...backend,
        profile: result.profile,
        todayRun: result.run,
      });
      setPhase("locked");
      setNotice(`${runScore}/6 Treffer gespeichert. Claim-Code: ${result.run.claimCode ?? "wird erstellt"}.`);
    } catch (error) {
      console.error(error);
      setPhase("locked");
      setNotice("Diese Tagesrunde wurde bereits gespeichert.");
    }
  };

  const getViewport = () => {
    const bounds = stageRef.current?.getBoundingClientRect();

    return {
      width: Math.max(1, bounds?.width ?? window.innerWidth),
      height: Math.max(1, bounds?.height ?? window.innerHeight),
    };
  };

  const pointFromEvent = (event: React.PointerEvent<HTMLDivElement>): Point2 => {
    const bounds = stageRef.current?.getBoundingClientRect();

    return {
      x: event.clientX - (bounds?.left ?? 0),
      y: event.clientY - (bounds?.top ?? 0),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!backend || phase === "loading" || phase === "flying" || locked || activeShotIndex >= 6) {
      return;
    }

    const point = pointFromEvent(event);
    const now = performance.now();
    pullRef.current = {
      start: point,
      startedAt: now,
      samples: [{ point, time: now }],
    };
    setPhase("aiming");
    setNotice(`${TARGETS[activeLane].label}: Richtung ziehen, Tempo gibt Kraft und Effet.`);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pullRef.current || phase !== "aiming") {
      return;
    }

    const end = pointFromEvent(event);
    const now = performance.now();
    pullRef.current.samples = [...pullRef.current.samples, { point: end, time: now }].slice(-10);

    setPullPreview(computePullPreview(pullRef.current.start, end, pullRef.current.samples, getViewport()));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const pull = pullRef.current;
    pullRef.current = null;

    if (!pull || phase !== "aiming") {
      return;
    }

    const end = pointFromEvent(event);
    const now = performance.now();
    const samples = [...pull.samples, { point: end, time: now }].slice(-10);
    const releaseVelocity = estimateReleaseVelocity(samples);
    setPullPreview(null);

    const shotInput = {
      start: pull.start,
      end,
      durationMs: Math.max(80, now - pull.startedAt),
      releaseVelocity,
    };

    if (!isMeaningfulPull(shotInput)) {
      setPhase("ready");
      setNotice("Zu wenig Zug oder zu langsamer Release. Zieh klar in eine Richtung und lass schneller los.");
      return;
    }

    const outcome = computeShotOutcome(shotInput, getViewport(), activeShotIndex);

    setPhase("flying");
    setFlight({ outcome, startedAt: performance.now() });
    setNotice(outcome.hit ? "Treffer." : "Knapp vorbei.");

    window.setTimeout(() => {
      const nextShots = [...shots, outcome];
      setShots(nextShots);
      setFlight(null);

      if (nextShots.length === 6) {
        setPhase("completed");
        setNotice(`${nextShots.filter((shot) => shot.hit).length}/6. Tagesrunde wird gespeichert.`);
        void submitCompletedRun(nextShots);
      } else {
        setPhase("ready");
        setNotice(`${nextShots.length}/6 Schuesse gespielt. Naechstes Ziel: ${TARGETS[getLaneForShot(nextShots.length)].label}.`);
      }
    }, 1120);
  };

  const activeCosmetic = currentProfile?.selectedCosmetic ?? "classic";
  const runSummary = backend?.todayRun ?? (shots.length === 6 ? null : undefined);

  return (
    <main className="app-shell">
      <section
        ref={stageRef}
        className="game-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={() => {
          pullRef.current = null;
          setPullPreview(null);
          setPhase(locked ? "locked" : "ready");
        }}
      >
        <TorwandScene
          activeLane={activeLane}
          pullPreview={pullPreview}
          flight={flight}
          cosmetic={activeCosmetic}
        />

        <div className="top-bar">
          <div className="brand-mark" aria-label="Goal Score Game">
            <span className="brand-zdf">ZDF</span>
            <span>Torwand Clash</span>
          </div>
          <div className="connection-pill">
            {backend?.mode === "firebase" ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span>{backend?.mode === "firebase" ? "Live Firestore" : "Offline Demo"}</span>
          </div>
        </div>

        <div className="score-strip" aria-live="polite">
          <div>
            <span className="metric-label">Treffer</span>
            <strong>{score}/6</strong>
          </div>
          <div>
            <span className="metric-label">Schuss</span>
            <strong>{Math.min(activeShotIndex + 1, 6)}/6</strong>
          </div>
          <div>
            <span className="metric-label">Ziel</span>
            <strong>{TARGETS[activeLane].label}</strong>
          </div>
        </div>

        <div className="bottom-status">
          <MousePointer2 size={18} />
          <span>{notice}</span>
          {pullPreview ? <strong>{formatPull(pullPreview)}</strong> : null}
        </div>
      </section>

      <aside className="control-rail">
        <section className="panel identity-panel">
          <label htmlFor="displayName">Spielername</label>
          <input
            id="displayName"
            value={displayNameDraft}
            maxLength={24}
            onChange={(event) => setDisplayNameDraft(event.target.value)}
            onBlur={handleNameBlur}
            disabled={!currentProfile}
          />
          <div className="profile-metrics">
            <span>{currentProfile?.xp ?? 0} XP</span>
            <span>{currentProfile?.streak ?? 0} Tage Streak</span>
          </div>
        </section>

        <section className="panel cycle-panel">
          <div className="panel-title">
            <CalendarDays size={18} />
            <span>Monatszyklus</span>
          </div>
          <div className="cycle-track">
            <span className={cycle.phase === "grind" ? "active" : ""}>Grind</span>
            <span className={cycle.phase === "ticket" ? "active" : ""}>Ticket</span>
            <span className={cycle.phase === "reset" ? "active" : ""}>Reset</span>
          </div>
          <p>
            {cycle.phaseLabel} - Tag {cycle.dayOfMonth}/{cycle.daysInMonth}
          </p>
        </section>

        <section className="panel actions-panel">
          <button type="button" className="primary-action" disabled={phase !== "ready"} onClick={() => setNotice("In Flugrichtung ziehen und mit schnellem Release schiessen.")}>
            <Play size={18} />
            <span>{locked ? "Heute gespielt" : "Bereit"}</span>
          </button>
          <button type="button" className="icon-action" onClick={resetLocalRound} title="Aktuelle Anzeige zuruecksetzen">
            <RotateCcw size={18} />
          </button>
        </section>

        <section className="panel cosmetics-panel">
          <div className="panel-title">
            <Flame size={18} />
            <span>Kosmetik</span>
          </div>
          <div className="cosmetic-grid">
            {(["classic", "fire", "kit"] as Cosmetic[]).map((cosmetic) => {
              const unlocked = cosmeticUnlocked(cosmetic, currentProfile?.xp ?? 0);

              return (
                <button
                  type="button"
                  key={cosmetic}
                  className={activeCosmetic === cosmetic ? "selected" : ""}
                  disabled={!unlocked}
                  onClick={() => void persistProfile({ selectedCosmetic: cosmetic })}
                  title={unlocked ? getCosmeticLabel(cosmetic) : "Mehr XP noetig"}
                >
                  {cosmetic === "kit" ? <Shirt size={18} /> : <Flame size={18} />}
                  <span>{getCosmeticLabel(cosmetic)}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel leaderboard-panel">
          <div className="panel-title">
            <Trophy size={18} />
            <span>Bestenliste</span>
          </div>
          <ol className="leaderboard-list">
            {leaderboard.map((entry) => (
              <li key={entry.uid} className={entry.uid === currentProfile?.uid ? "is-player" : ""}>
                <span className="rank">{entry.rank}</span>
                <span className="name">{entry.displayName}</span>
                <strong>{entry.totalHits}</strong>
              </li>
            ))}
          </ol>
        </section>

        <section className="panel risk-panel">
          <div className="panel-title">
            <ShieldAlert size={18} />
            <span>Prototyp-Schutz</span>
          </div>
          <p>
            Firestore speichert Live-Scores. Echte Anti-Cheat-Pruefung braucht spaeter serverseitige
            Schussvalidierung.
          </p>
        </section>

        {runSummary ? (
          <section className="panel result-panel">
            <strong>{getScoreLabel(runSummary.score)}</strong>
            <span>{runSummary.score}/6 Treffer heute gespeichert.</span>
            {runSummary.claimCode ? (
              <>
                <code>{runSummary.claimCode}</code>
                <small>Diesen Code aufbewahren. ZDF kann damit den Gewinner mit der gespeicherten Runde abgleichen.</small>
              </>
            ) : null}
          </section>
        ) : null}
      </aside>
    </main>
  );
}
