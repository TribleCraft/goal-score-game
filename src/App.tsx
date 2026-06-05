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
import { computeShotOutcome, getLaneForShot, isMeaningfulSwipe, TARGETS } from "./game/physics";
import {
  loadBackend,
  saveProfile,
  submitRun,
  subscribeLeaderboard,
  type BackendSnapshot,
} from "./services/gameBackend";
import type { Cosmetic, DailyRun, LeaderboardEntry, Point2, ShotOutcome } from "./types";
import { getCycleInfo } from "./utils/dateCycle";

type GamePhase = "loading" | "ready" | "aiming" | "flying" | "completed" | "locked";

function formatPower(power: number) {
  return `${Math.round(power * 100)}%`;
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
  const swipeRef = useRef<{ start: Point2; startedAt: number } | null>(null);
  const [backend, setBackend] = useState<BackendSnapshot | null>(null);
  const [phase, setPhase] = useState<GamePhase>("loading");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [shots, setShots] = useState<ShotOutcome[]>([]);
  const [aimPreview, setAimPreview] = useState<ShotOutcome | null>(null);
  const [flight, setFlight] = useState<{ outcome: ShotOutcome; startedAt: number } | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [notice, setNotice] = useState("Zieh vom Ball aus Richtung Torwand und lass los.");
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
            : "Zieh vom Ball aus Richtung Torwand und lass los.",
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
    setAimPreview(null);
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
      setNotice(`${runScore}/6 Treffer gespeichert. ${result.run.xpEarned} XP fuer die Tagesrunde.`);
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
    swipeRef.current = {
      start: point,
      startedAt: performance.now(),
    };
    setPhase("aiming");
    setNotice(`${TARGETS[activeLane].label}: Laenge ist Kraft, Winkel ist Richtung.`);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!swipeRef.current || phase !== "aiming") {
      return;
    }

    const end = pointFromEvent(event);
    const preview = computeShotOutcome(
      {
        start: swipeRef.current.start,
        end,
        durationMs: Math.max(80, performance.now() - swipeRef.current.startedAt),
      },
      getViewport(),
      activeShotIndex,
    );

    setAimPreview(preview);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const swipe = swipeRef.current;
    swipeRef.current = null;

    if (!swipe || phase !== "aiming") {
      return;
    }

    const end = pointFromEvent(event);
    setAimPreview(null);

    if (!isMeaningfulSwipe(swipe.start, end)) {
      setPhase("ready");
      setNotice("Swipe war zu kurz. Zieh etwas laenger Richtung Torwand.");
      return;
    }

    const outcome = computeShotOutcome(
      {
        start: swipe.start,
        end,
        durationMs: Math.max(80, performance.now() - swipe.startedAt),
      },
      getViewport(),
      activeShotIndex,
    );

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
  const previewForScene = aimPreview
    ? {
        x: aimPreview.landingX,
        y: aimPreview.landingY,
        power: aimPreview.power,
      }
    : null;
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
          swipeRef.current = null;
          setAimPreview(null);
          setPhase(locked ? "locked" : "ready");
        }}
      >
        <TorwandScene
          activeLane={activeLane}
          aimPreview={previewForScene}
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
          {aimPreview ? <strong>{formatPower(aimPreview.power)}</strong> : null}
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
          <button type="button" className="primary-action" disabled={phase !== "ready"} onClick={() => setNotice("Zieh mit Finger oder Maus Richtung Ziel.")}>
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
          </section>
        ) : null}
      </aside>
    </main>
  );
}
