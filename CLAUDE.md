# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A client-side cricket scorecard overlay for OBS/vMix/Streamlabs browser sources (`https://github.com/CricketOMAN/ScoreBanner2`). Vite + TypeScript, no framework, hosted on GitHub Pages. It polls the public CricClubs `liveScoreOverlayData.do` endpoint every 5s and paints a fixed-position DOM. Everything is driven by URL query params (`matchId`, `clubId`, `theme`, `debug`, `card`, `mode`, `quiet`, `logo`); see `README.md` for the full table and `architecture.md` for the data-flow diagram.

## Commands

```bash
npm run dev            # Vite dev server on http://localhost:5173
npm run test           # vitest watch mode
npm run test:run       # single run (this is what build and CI use)
npm run test:coverage  # v8 coverage table
npx vitest run src/utils.test.ts            # one test file
npx vitest run -t "should return wicket"    # one test by name
npx tsc                # typecheck only (noEmit; strict + noUnusedLocals + noImplicitReturns)
npm run build          # tsc && test:run && vite build -> dist/ (dist is gitignored)
npm run preview        # serve the production build
```

`npm run build` fails on type errors *and* test failures, so run it before committing. CI (`.github/workflows/ci.yml`) and GitHub Pages deployment (`.github/workflows/deploy.yml`) run `npm run build` on every push to `main`. `vite.config.ts` sets `base: './'` and builds both `index.html` and `link.html`; don't change `base`.

## Architecture

Entry for `index.html` is `src/script.ts`, loaded as a module. It imports the Montserrat font CSS and `css/instructions.css` (theme CSS is imported by `theme.ts`) and starts `pollLoop()` in `src/app.ts`.

`app.ts` runs `pollLoop()`, which awaits `updateScore()` and re-arms a `setTimeout(CONFIG.REFRESH_RATE)`. It is a timeout chain, not `setInterval`, so a slow CricClubs response can't overlap the next poll. A failed fetch keeps the last rendered frame once one has painted, and shows "Error" only before the first successful render.

`updateScore()` is the mode switch. In order: no `matchId`/`debug`/`mode=replay` → show `#setup-panel` and hide `.overlay`; `mode=replay` → cycle `replayData.ts`; `debug=1..5` → static state from `mockData.ts`; otherwise fetch live.

Rendering is in `src/ui.ts`. `updateScoreboard()` picks team 1 vs team 2 fields based on `values.isSecondInningsStarted === "true"` (API booleans are strings, `isMatchEnded` is `"1"`), then writes through `setText`/`setDisplay` helpers that only touch the DOM when a value changed. `statusText()` supplies the CRR / Target tail on the score row and the Need / RRR third row in a chase, computed from the totals.

Event cards: `app.ts` keeps the previous frame and calls `detectEvents(prev, next)` (`src/events.ts`, pure, tested) after every render, then `enqueueCards()` (`src/cards.ts`) plays them one at a time over the batter/bowler slots. Hold times live in `HOLD_MS`; the exit transition length is duplicated between `cards.ts` (`TRANSITION_MS`) and the `.event-card` CSS, keep them equal.

### `dom.ts` runs `getElementById` at import time

`DOM` is a plain object of element references resolved when the module first loads. Consequences:
- Anything importing `dom.ts` (`ui.ts`, `theme.ts`, `cards.ts`) needs the real `index.html` structure present at import.
- In tests, `ui.test.ts` does `vi.mock('./dom', ...)` with a Proxy that maps property names to element IDs and looks them up lazily, after `beforeEach` has built the elements.
- Modules with state expose `reset*ForTests()` hooks (`app.ts`, `ui.ts`, `cards.ts`); call them in `beforeEach`.
- Adding a new element means adding it to `index.html`, `dom.ts`, and the `idMap` in `ui.test.ts`.

### Theming

`applyTheme()` puts a `theme-<name>` class on `<body>`; unknown names fall back to `modern-light`, and `modern`, `tel`, `ted`, `tul`, `tud` are kept as aliases in `THEME_ALIASES`. All 18 themes share one layout, `src/css/overlay-base.css`, and each `theme-*.css` is only a block of colour tokens on `.theme-<name>`. Never put layout in a theme file; change the base.

### Link Live Stream (`src/liveStream.ts` & `link.html`)

Attaches a YouTube URL to a CricClubs match via `updateLiveStreamURLFromCP.do`. CricClubs blocks this endpoint as a cross-origin subresource (CORP + WAF), so the working approach is a real top-level navigation: `window.open` in a small popup, synchronously inside the submit handler, closed after ~2s.

## Notes

- `CONFIG` (`src/config.ts`) holds the refresh rate (`5000`ms), the default club ID (`40319`, USACricketJunior), and the `?logo=` → sponsor image map (images imported from `src/assets/images/` so Vite bundles them).
- Team logo URLs from the API may be relative; `updateTeamLogos()` prefixes `https://cricclubs.com` and caches by URL so polling doesn't refetch images.
