# Cricket Scorecard Overlay

A lightweight, responsive cricket scorecard overlay designed for live streaming (OBS, vMix, Streamlabs). It fetches real-time match data from the **CricClubs** API or runs in debug/replay mode with mock data.

## Features
- **Real-Time Updates**: Polls the CricClubs API automatically every 5 seconds for live scores.
- **18 Themes**: One clean broadcast layout with colour palettes for `orange`, core palettes (`classic`, `modern-light`, `modern-dark`, `neon`), every IPL franchise, and the Topguns set. See [Available Themes](#available-themes) below.
- **Event Cards**: Automatic cards for Wickets, Fifties/Hundreds, Boundaries (4/6), and 50/100 Partnerships derived from consecutive poll diffs.
- **Setup Panel & Short.io Integration**: Visit the site with no parameters to build your overlay URL, toggle any URL parameter via checkboxes, and update existing Short.io short links in one click.
- **Link Live Stream (`link.html`)**: Dedicated utility page to attach a YouTube live stream link to a CricClubs match.
- **Self-Hosted Fonts**: Uses **Montserrat** (bundled) for consistent rendering across all devices without external font requests.
- **Developer Experience**: Built with **Vite** and **TypeScript**, tested with **Vitest**, and deployed automatically to **GitHub Pages**.

---

## Quick Start

### 1. Install & Run Locally
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```
The server usually starts at `http://localhost:5173`.

Visiting the app with no `matchId` shows the Setup Panel (`#setup-panel`): a live URL builder with Club ID presets (`USACricketJunior` `40319` and `GPCL` `48`), theme buttons, an interactive **All URL parameters** table, and Short.io link updater buttons.

### 2. Add to OBS
1. Add a **Browser Source** in OBS.
2. Set the URL to `https://cricketoman.github.io/ScoreBanner2/` with your query parameters (or your Short.io short link).
3. Set Width: `1920`, Height: `1080` (transparent canvas).

---

## Configuration (URL Parameters)

Control the behavior and look of the overlay using URL parameters:

| Parameter | Required? | Description | Example |
| :--- | :--- | :--- | :--- |
| `matchId` | **Yes** | The unique Match ID from CricClubs. | `?matchId=2169` |
| `clubId` | No | The Club ID (Default: `40319`, USACricketJunior). | `?clubId=48` |
| `theme` | No | One of the themes listed below (default in Setup Panel: `orange`; fallback: `modern-light`). | `?theme=orange` |
| `logo` | No | Displays specific sponsor logos (`1` or `2`). | `?logo=1` |
| `debug` | No | Use mock data (`1`–`5`) instead of the live API. | `?debug=1` |
| `card` | No | Holds a sample event card on screen in debug mode (`wicket`, `milestone`, `partnership`, `boundary`). | `?debug=1&card=wicket` |
| `mode` | No | Special modes like `replay`. | `?mode=replay` |
| `quiet` | No | Turns off the event cards and shows only the bar. | `?quiet=1` |

### Event Cards
The bar stays constant; moments earn a card that slides in over the batter and bowler slots, holds, and leaves. Cards are derived by diffing one poll against the previous one:

| Card | Trigger | Holds |
| :--- | :--- | :--- |
| Wicket | Batting side's wicket count rises | 8s |
| Fifty / Hundred | A batter crosses 50 or 100 | 8s |
| Four / Six | The newest ball is a boundary | 2s |
| 50 / 100 partnership | The current stand crosses 50 or 100 | 6s |

Cards queue and play one at a time; a wicket suppresses the boundary flash on the same ball. `?quiet=1` disables them. In debug mode, `&card=wicket` (or `milestone`, `partnership`, `boundary`) holds a sample card so you can position it in OBS.

### Debug Modes
Test layouts without a live match:
- `?debug=1`: 1st Innings (Standard)
- `?debug=2`: 2nd Innings (Chasing)
- `?debug=3`: Match Ended
- `?debug=4`: Pre-match / Toss
- `?debug=5`: No Team Logos

### Available Themes
Every theme shares the same layout (`src/css/overlay-base.css`); a theme is a palette of colour tokens.
- **Core**: `orange`, `classic` (cream/navy), `modern-light` (`modern` alias), `modern-dark`, `neon`
- **IPL Franchises**: `kkr`, `rcb`, `mi`, `csk`, `dc`, `rr`, `srh`, `pbks`, `gt`, `lsg`
- **Topguns**: `topguns-light`, `topguns-dark` (legacy `tel`/`ted`/`tul`/`tud` names still work as aliases)

---

## Link Live Stream (`link.html`)

Visit `/link.html` (`https://cricketoman.github.io/ScoreBanner2/link.html`) to attach a YouTube live stream URL to a CricClubs match: enter the Club ID, Match ID, and YouTube URL, then click **Link Stream**.

---

## Deployment

Pushes to `main` automatically run `npm run build` (TypeScript check, Vitest unit tests, and Vite production build) and deploy `dist/` to **GitHub Pages** via `.github/workflows/deploy.yml`.

---

## Development Commands

```bash
# Run unit tests (watch mode)
npm run test

# Run unit tests once (used in the build)
npm run test:run

# Build for production (outputs to /dist)
npm run build

# Preview the production build locally
npm run preview
```

See [architecture.md](architecture.md) for a deeper look at the project structure and data flow.
