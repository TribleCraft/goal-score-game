# Goal Score Game

Ein spielbarer HTML5-Prototyp fuer ein monatliches Torwand-Qualifikationsspiel:

- statisches Frontend fuer GitHub Pages
- Three.js-3D-Torwand mit Swipe- und Maussteuerung
- sechs Schuesse pro Tagesrunde, zuerst unten, dann oben
- XP, Streaks und rein kosmetische Ball-Varianten
- Firebase Anonymous Auth + Cloud Firestore fuer Live-Scores und Bestenliste
- Offline-Demo-Modus als Fallback, falls Firebase lokal nicht erreichbar ist

## Lokal starten

```bash
npm install
npm run dev
```

Die App laeuft dann unter der von Vite ausgegebenen lokalen URL.

## Firebase konfigurieren

1. In Firebase ein Projekt anlegen.
2. In Authentication den Provider "Anonymous" aktivieren. Ohne diesen Schritt meldet die App `auth/configuration-not-found` und nutzt den Offline-Fallback.
3. In Firestore eine Datenbank anlegen.
4. Optional: `.env.example` nach `.env.local` kopieren, wenn du die eingebauten Firebase-Werte ueberschreiben willst.
5. Security Rules aus `firestore.rules` deployen.

```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

Die Regeln sind bewusst prototypisch: Sie begrenzen Datenformate, Tagesrunden und Besitzerrechte. Eine echte TV-Qualifikation braucht spaeter serverseitige Trefferberechnung, App Check und Audit-Logging.

## GitHub Pages

Der Workflow `.github/workflows/pages.yml` baut die App bei jedem Push auf `main` und deployed `dist/` zu GitHub Pages.

Im GitHub-Repository:

1. Settings -> Pages
2. Source: "GitHub Actions"
3. Push auf `main`

Vite setzt den Base-Pfad im GitHub-Actions-Build automatisch auf den Repository-Namen. Die Firebase-Web-Konfiguration ist im Client eingebaut, weil diese Werte bei Firebase-Web-Apps oeffentlich sind.

## Datenmodell

- `players/{uid}`: Profil, XP, Streak, kosmetische Auswahl
- `players/{uid}/runs/{dayKey}`: eine Tagesrunde mit sechs Schuessen
- `leaderboards/{monthKey}/entries/{uid}`: monatlicher Ranglisteneintrag

## Grenzen des Free-Prototyps

GitHub Pages kann nur statische Dateien ausliefern. Firestore kann Live-Scores speichern und realtime verteilen, aber jede reine Client-App kann manipuliert werden. Fuer eine belastbare Qualifikation ist ein Backend noetig, das jeden Schuss serverseitig bewertet und nur signierte Ergebnisse in die Rangliste schreibt.
