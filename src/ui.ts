import { DOM } from './dom';
import { loadImage, getBallStyleClass } from './utils';
import { CricketAPIData } from './types';
import { parseDismissal } from './events';

const WICKET_ISLAND_HOLD_MS = 120_000;

interface LogoSlot {
    /** Last URL we attempted (successfully or not), so a bad URL is only tried once. */
    attemptedUrl: string | null;
}

const logoSlots = {
    team1: { attemptedUrl: null } as LogoSlot,
    team2: { attemptedUrl: null } as LogoSlot,
};

let lastBallState = { balls: '', overs: '', isIntl: false };
let completedOversBalls: string[] = [];
let trackedOverBalls: string[] = [];
let trackedOverIndex = -1;
let trackedInningsSecond = false;
let lastRendered12BallsJson = '';
let lastWicketSignature = '';
let wicketIslandTimer: ReturnType<typeof setTimeout> | undefined;

/** Test hook: forget cached logos and the last rendered over. */
export function resetUiStateForTests() {
    logoSlots.team1.attemptedUrl = null;
    logoSlots.team2.attemptedUrl = null;
    lastBallState = { balls: '', overs: '', isIntl: false };
    completedOversBalls = [];
    trackedOverBalls = [];
    trackedOverIndex = -1;
    trackedInningsSecond = false;
    lastRendered12BallsJson = '';
    lastWicketSignature = '';
    if (wicketIslandTimer) clearTimeout(wicketIslandTimer);
    wicketIslandTimer = undefined;
}

function getFullLogoUrl(path?: string): string {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }
    return `https://cricclubs.com${path}`;
}

/**
 * Loads one team logo into its <img> if the URL changed since the last attempt.
 * Failures (and empty URLs) are remembered so the same URL isn't retried on every poll.
 */
async function updateTeamLogo(slot: LogoSlot, url: string, target: HTMLImageElement, label: string) {
    if (slot.attemptedUrl === url) return;
    slot.attemptedUrl = url;

    if (!url) {
        target.removeAttribute('src');
        return;
    }

    try {
        const img = await loadImage(url);
        target.src = img.src;
    } catch (error) {
        console.error(`Error loading ${label} logo:`, error);
    }
}

/**
 * Updates the team logos in the DOM based on the API data.
 * Only re-fetches when a logo URL changes; a URL that failed is not retried until it changes.
 * @param data - The full API data object containing logo URLs.
 */
export async function updateTeamLogos(data: CricketAPIData) {
    await Promise.all([
        updateTeamLogo(logoSlots.team1, getFullLogoUrl(data.values.firstLogo), DOM.battingTeamLogo, 'first'),
        updateTeamLogo(logoSlots.team2, getFullLogoUrl(data.values.secondLogo), DOM.bowlingTeamLogo, 'second'),
    ]);
}

/**
 * Updates the ball-by-ball indicator in the UI.
 * @param ballsArray - Array of strings representing recent ball outcomes.
 * @param teamOvers - Current overs string (e.g. "10.2") to determine balls remaining.
 */
export function updateBallByBall(ballsArray: string[], teamOvers: string, isSecondInnings = false) {
    const isIntl = document.body.classList.contains('theme-international');
    const currentBallsJson = JSON.stringify(ballsArray);
    if (
        currentBallsJson === lastBallState.balls &&
        teamOvers === lastBallState.overs &&
        isIntl === lastBallState.isIntl
    ) {
        return;
    }
    lastBallState = { balls: currentBallsJson, overs: teamOvers, isIntl };

    DOM.ballContainer.innerHTML = '';

    ballsArray.forEach(ballOutcome => {
        const ballIndicator = document.createElement('div');
        ballIndicator.className = `ball-indicator ${getBallStyleClass(ballOutcome)}`;
        ballIndicator.textContent = ballOutcome;
        DOM.ballContainer.appendChild(ballIndicator);
    });

    const ballsRemaining = 6 - (parseInt(teamOvers.split('.')[1] || '0'));
    if (ballsRemaining < 6 || ballsArray.length <= 1) {
        for (let i = 0; i < ballsRemaining; i++) {
            const ballIndicator = document.createElement('div');
            ballIndicator.classList.add('ball-indicator');
            DOM.ballContainer.appendChild(ballIndicator);
        }
    }

    updateLast12Balls(ballsArray, teamOvers, isSecondInnings);
}

/**
 * Maintains a running window of the last 12 deliveries across overs for the International ticker.
 */
function updateLast12Balls(ballsArray: string[], teamOvers: string, isSecondInnings: boolean) {
    if (isSecondInnings !== trackedInningsSecond) {
        completedOversBalls = [];
        trackedOverBalls = [];
        trackedOverIndex = -1;
        trackedInningsSecond = isSecondInnings;
    }

    const [wholeStr, partStr] = (teamOvers || '0.0').split('.');
    const whole = parseInt(wholeStr, 10) || 0;
    const part = parseInt(partStr || '0', 10) || 0;
    // Note: when an over just completed (e.g. "11.0" with 6 balls still in `ballsArray`),
    // it belongs to the over that just finished (whole - 1); once the first ball of the new over
    // arrives ("11.1" or 1 ball at "11.0"), it belongs to `whole`.
    const effectiveOverIndex = part === 0 && ballsArray.length >= 6 && whole > 0 ? whole - 1 : whole;

    if (trackedOverIndex !== -1 && effectiveOverIndex !== trackedOverIndex) {
        if (effectiveOverIndex > trackedOverIndex && trackedOverBalls.length > 0) {
            completedOversBalls = [...completedOversBalls, ...trackedOverBalls].slice(-12);
        } else if (effectiveOverIndex < trackedOverIndex) {
            completedOversBalls = [];
        }
    }
    trackedOverIndex = effectiveOverIndex;
    trackedOverBalls = ballsArray.slice();

    const running12 = [...completedOversBalls, ...trackedOverBalls].slice(-12);
    const running12Json = JSON.stringify(running12);
    if (!DOM.last12BallsContainer || running12Json === lastRendered12BallsJson) {
        return;
    }
    lastRendered12BallsJson = running12Json;
    DOM.last12BallsContainer.innerHTML = '';

    running12.forEach(ballOutcome => {
        const el = document.createElement('div');
        el.className = `ball-indicator ${getBallStyleClass(ballOutcome)}`;
        el.textContent = ballOutcome;
        DOM.last12BallsContainer.appendChild(el);
    });
}

/**
 * Updates the text content of a DOM element only if it has changed.
 * @param element - The DOM element to update.
 * @param text - The new text content.
 */
function setText(element: HTMLElement | null, text: string) {
    if (element && element.textContent !== text) {
        element.textContent = text;
    }
}

/**
 * Updates the display style of a DOM element only if it has changed.
 * @param element - The DOM element to update.
 * @param display - The new display value (e.g. 'none', 'block', 'flex').
 */
function setDisplay(element: HTMLElement | null, display: string) {
    if (element && element.style.display !== display) {
        element.style.display = display;
    }
}

const RATE = /^\d+(\.\d+)?$/;

export interface StatusText {
    /** Tail of the score row: `CRR 7.10` in the first innings, `Target 143` in a chase. */
    inline: string;
    /** Third row, chase only: `Need 81 off 16.4 ov · RRR 4.86`. */
    line: string;
}

/**
 * The context around the score, computed here rather than using CricClubs' pre-built HTML message.
 */
export function statusText(values: CricketAPIData['values'], isSecondInnings: boolean): StatusText {
    if (!isSecondInnings) {
        const rr = values.t1RR;
        return { inline: rr && RATE.test(rr) ? `CRR ${rr}` : '', line: '' };
    }
    const target = (parseInt(values.t1Total || '0', 10) || 0) + 1;
    const need = target - (parseInt(values.t2Total || '0', 10) || 0);
    const parts: string[] = [];
    if (need > 0) {
        const oversLeft = oversRemaining(values.totalOvers, values.t2Overs);
        parts.push(oversLeft !== null ? `Need ${need} off ${oversLeft} ov` : `Need ${need}`);
    }
    if (values.RRR && RATE.test(values.RRR)) parts.push(`RRR ${values.RRR}`);
    return { inline: `Target ${target}`, line: parts.join(' · ') };
}

/** Overs left in cricket notation ("16.4"), or null when the match length isn't known. */
function oversRemaining(totalOvers: number | undefined, oversBowled: string | undefined): string | null {
    if (!totalOvers) return null;
    const [whole, part] = (oversBowled || '0').split('.');
    const bowled = (parseInt(whole, 10) || 0) * 6 + (parseInt(part || '0', 10) || 0);
    const left = Math.max(0, totalOvers * 6 - bowled);
    const balls = left % 6;
    return balls ? `${Math.floor(left / 6)}.${balls}` : `${left / 6}`;
}

/**
 * Updates the entire scoreboard UI with new data.
 * @param data - The full CricketAPIData object.
 */
export function updateScoreboard(data: CricketAPIData) {
    const { values } = data;
    const isIntl = document.body.classList.contains('theme-international');

    // Batsman Info
    setText(DOM.batsman1Name, values.batsman1Name || 'Batsman 1');
    setText(DOM.batsman2Name, values.batsman2Name || 'Batsman 2');
    if (isIntl) {
        setBatterRunsBallsIntl(DOM.batsman1RunsBalls, values.batsman1Runs || '0', values.batsman1Balls || '0');
        setBatterRunsBallsIntl(DOM.batsman2RunsBalls, values.batsman2Runs || '0', values.batsman2Balls || '0');
    } else {
        setText(DOM.batsman1RunsBalls, `${values.batsman1Runs || '0'} (${values.batsman1Balls || '0'})`);
        setText(DOM.batsman2RunsBalls, `${values.batsman2Runs || '0'} (${values.batsman2Balls || '0'})`);
    }

    // Bowler Info
    setText(DOM.bowlerName, values.bowlerName || 'Bowler Name');
    setText(DOM.bowlerWicketsRuns, `${values.bowlerWickets || '0'}-${values.bowlerRuns || '0'}`);
    setText(DOM.bowlerOvers, `${values.bowlerOvers || '0.0'}`);

    const isSecondInnings = values.isSecondInningsStarted === "true";
    const isMatchEnded = values.isMatchEnded === "1";

    // The batting side: team 2 in a chase, team 1 otherwise
    const currentTeamName = isSecondInnings ? values.t2Name : values.t1Name;
    const currentTeamCode = isSecondInnings ? values.t2Code : values.t1Code;
    const bowlingTeamName = isSecondInnings ? values.t1Name : values.t2Name;
    const bowlingTeamCode = isSecondInnings ? values.t1Code : values.t2Code;
    const currentTeamScore = isSecondInnings ? values.t2Total : values.t1Total;
    const currentTeamWickets = isSecondInnings ? values.t2Wickets : values.t1Wickets;
    const currentTeamOvers = isSecondInnings ? values.t2Overs : values.t1Overs;

    setText(DOM.teamName, (isIntl ? (currentTeamCode || currentTeamName) : currentTeamName) || 'Team 1');
    setText(DOM.bowlingTeamName, bowlingTeamCode || bowlingTeamName || '');
    setText(DOM.teamScore, currentTeamScore || '0');
    setText(DOM.teamWickets, `${isIntl ? '-' : '/'}${currentTeamWickets || '0'}`);
    setText(DOM.teamOvers, `${currentTeamOvers || '0.0'}`);
    const status = isMatchEnded ? { inline: '', line: '' } : statusText(values, isSecondInnings);
    setText(DOM.statusInline, status.inline);
    setText(DOM.statusLine, status.line);

    updateIntlChaseBox(values, isSecondInnings, isMatchEnded, isIntl);
    updateWicketIsland(values, isSecondInnings, isMatchEnded);

    setDisplay(DOM.result, isMatchEnded ? 'flex' : 'none');
    if (isMatchEnded) {
        setText(DOM.matchResult, values.result || 'Match Result');
    }

    updateBallByBall(data.balls || [], currentTeamOvers || '0.0', isSecondInnings);
}

function setBatterRunsBallsIntl(element: HTMLElement | null, runs: string, balls: string) {
    if (!element) return;
    const html = `<span class="intl-runs">${runs}</span><span class="intl-balls">${balls}</span>`;
    if (element.innerHTML !== html) {
        element.innerHTML = html;
    }
}

function updateIntlChaseBox(
    values: CricketAPIData['values'],
    isSecondInnings: boolean,
    isMatchEnded: boolean,
    isIntl: boolean
) {
    if (!DOM.intlChaseBox) return;
    if (!isIntl || !isSecondInnings || isMatchEnded) {
        setDisplay(DOM.intlChaseBox, 'none');
        return;
    }
    const target = (parseInt(values.t1Total || '0', 10) || 0) + 1;
    const need = Math.max(0, target - (parseInt(values.t2Total || '0', 10) || 0));
    // Alternate every 30 seconds between TARGET and NEED (when runs are still required)
    const showNeed = need > 0 && Math.floor(Date.now() / 30000) % 2 === 1;
    setDisplay(DOM.intlChaseBox, 'flex');
    setText(DOM.intlChaseLabel, showNeed ? 'NEED' : 'TARGET');
    setText(DOM.intlChaseValue, String(showNeed ? need : target));
}

function hideWicketIsland() {
    if (wicketIslandTimer) {
        clearTimeout(wicketIslandTimer);
        wicketIslandTimer = undefined;
    }
    if (DOM.intlWicketIsland) {
        DOM.intlWicketIsland.classList.remove('is-visible');
        DOM.intlWicketIsland.parentElement?.classList.remove('has-wicket-island');
    }
}

/**
 * Displays a single-line "LAST WICKET" island above the right side of the International bar
 * for 120 seconds whenever a wicket is recorded (and hides the bowling team's top nibble while active).
 */
function updateWicketIsland(
    values: CricketAPIData['values'],
    isSecondInnings: boolean,
    isMatchEnded: boolean
) {
    if (!DOM.intlWicketIsland) return;
    const wickets = parseInt((isSecondInnings ? values.t2Wickets : values.t1Wickets) || '0', 10) || 0;
    const lastOutName = (values.lastOutName || '').trim();

    if (isMatchEnded || wickets <= 0 || !lastOutName) {
        lastWicketSignature = '';
        hideWicketIsland();
        return;
    }

    const runs = String(values.lastOutRuns ?? '0');
    const balls = String(values.lastOutBalls ?? '0');
    const dismissal = parseDismissal(values.lastOutString);
    const signature = `${isSecondInnings ? 2 : 1}:${wickets}:${lastOutName}:${runs}:${balls}:${dismissal}`;

    if (signature === lastWicketSignature) return;
    lastWicketSignature = signature;

    const detail = [dismissal, `${runs} (${balls})`].filter(Boolean).join(' · ');
    DOM.intlWicketIsland.innerHTML = '';

    const tagEl = document.createElement('span');
    tagEl.className = 'island-tag';
    tagEl.textContent = 'LAST WICKET';

    const nameEl = document.createElement('span');
    nameEl.className = 'island-name';
    nameEl.textContent = lastOutName;

    const detailEl = document.createElement('span');
    detailEl.className = 'island-detail';
    detailEl.textContent = detail;

    DOM.intlWicketIsland.append(tagEl, nameEl, detailEl);
    DOM.intlWicketIsland.classList.add('is-visible');
    DOM.intlWicketIsland.parentElement?.classList.add('has-wicket-island');

    if (wicketIslandTimer) clearTimeout(wicketIslandTimer);
    wicketIslandTimer = setTimeout(() => {
        hideWicketIsland();
    }, WICKET_ISLAND_HOLD_MS);
}
