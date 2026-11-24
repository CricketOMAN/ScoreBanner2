/**
 * Application orchestration: the poll loop and the mode switch in updateScore().
 * Kept separate from script.ts (the entry point with side effects) so it can be unit-tested.
 */
import { mock_1stInnings, mock_2ndInnings, mock_matchEnded, mock_toss, mock_noTeamImage } from './mockData';
import { sampleReplayData } from './replayData';
import { CONFIG } from './config';
import { DOM } from './dom';
import { getQueryParams } from './utils';
import { applyTheme, updateLogo } from './theme';
import { fetchScoreData } from './api';
import { updateTeamLogos, updateScoreboard, showSampleWicketIsland } from './ui';
import { CricketAPIData } from './types';
import { detectEvents } from './events';
import { enqueueCards, showSampleCard } from './cards';

let replayIndex = 0;
/** True once the overlay has painted at least one successful frame of live/mock data. */
let hasRenderedScore = false;
/** The previous frame, so events (wicket, fifty, boundary, partnership) can be derived from the diff. */
let lastData: CricketAPIData | null = null;
let sampleCardShown = false;

/** Test hook: forget replay position, last frame and whether a frame has rendered. */
export function resetAppStateForTests() {
    replayIndex = 0;
    hasRenderedScore = false;
    lastData = null;
    sampleCardShown = false;
}

/** Paint a frame and fire any cards its changes call for. */
function renderFrame(data: CricketAPIData, quiet: boolean) {
    updateScoreboard(data);
    if (!quiet) enqueueCards(detectEvents(lastData, data));
    lastData = data;
}

/**
 * Main update function that fetches data (or uses mock data) and updates the UI.
 * Handles theme application, logging, and polling logic.
 */
export async function updateScore() {
    const params = getQueryParams();
    const setupPanelEl = document.getElementById('setup-panel');
    const overlayEl = document.querySelector('.overlay') as HTMLElement | null;

    // Show setup panel if no match context is provided
    if (!params.matchId && !params.debug && params.mode !== 'replay') {
        if (setupPanelEl) setupPanelEl.classList.remove('hidden');
        if (overlayEl) overlayEl.style.display = 'none';
        return;
    }

    if (setupPanelEl) setupPanelEl.classList.add('hidden');
    if (overlayEl) overlayEl.style.display = '';

    applyTheme(params.theme);
    updateLogo(params.logo);

    if (params.mode === 'replay') {
        const data = sampleReplayData[replayIndex] as unknown as CricketAPIData;
        renderFrame(data, params.quiet);
        replayIndex = (replayIndex + 1) % sampleReplayData.length;
        return;
    }

    try {
        let data: CricketAPIData;
        if (params.debug) {
            // Mock Data Logic
            switch (params.debug) {
                case '2':
                    data = mock_2ndInnings as unknown as CricketAPIData;
                    break;
                case '3':
                    data = mock_matchEnded as unknown as CricketAPIData;
                    break;
                case '4':
                    data = mock_toss as unknown as CricketAPIData;
                    break;
                case '5':
                    data = mock_noTeamImage as unknown as CricketAPIData;
                    break;
                case '1':
                case 'true':
                default:
                    data = mock_1stInnings as unknown as CricketAPIData;
                    break;
            }
            console.log(`Using mock data: ${params.debug}`);
            if (params.card && !sampleCardShown) {
                sampleCardShown = true;
                if (params.card === 'island') {
                    showSampleWicketIsland();
                } else {
                    showSampleCard(params.card);
                }
            }
        } else {
            const apiUrl = `https://cricclubs.com/liveScoreOverlayData.do?clubId=${params.clubId}&matchId=${params.matchId}`;
            data = await fetchScoreData(apiUrl);
        }

        await updateTeamLogos(data);
        renderFrame(data, params.quiet);
        hasRenderedScore = true;

    } catch (error) {
        console.error('Error fetching score data:', error);
        // Once we've shown real data, keep the last good frame on screen: a single
        // dropped poll mid-broadcast should not flash "Error" at viewers. Before the
        // first successful render there's nothing to keep, so surface the problem
        // (most likely a wrong matchId/clubId) to whoever is setting up the source.
        if (!hasRenderedScore) {
            DOM.teamName.textContent = 'Error';
        }
    }
}

/**
 * Polls with a fixed gap *after* each update finishes, so a slow response can't
 * overlap with the next poll and paint stale data over fresher data.
 */
export async function pollLoop() {
    try {
        await updateScore();
    } catch (error) {
        console.error('Unexpected error in update loop:', error);
    }
    setTimeout(pollLoop, CONFIG.REFRESH_RATE);
}
