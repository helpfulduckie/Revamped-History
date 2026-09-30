// ============================================================
// ============= RevampedHistory - 2.0.0 - library ============
// ============================================================
// - RevampedHistory@2.0.0
// ============================================================
// Paste this ONLY into the library tab in AI Dungeon scripting
// ============================================================

class RevampedHistory {
  static #lib = (() => {
    const DEBUG_CARD_TYPE = 'zz_Debug';
    
    // RVH's DuckieDebug instance. Instances last one hook run, so each hook phase
    // makes its own: the pre phase registers the setting, the body/post phase
    // applies the level.
    function rvhDebug() {
      return new DuckieDebug({ modName: 'RevampedHistory', defaultLevel: RVH_DEBUG_DEFAULT_LEVEL });
    }
    
    function updateDebugCard() {
      const rvhHistory = state.rvh?.history;
      if (!rvhHistory) return;
    
      const lines = rvhHistory.map((entry, i) => {
        const retryCount = entry.retries?.length ?? 0;
        const preview = entry.text.slice(0, 80).replace(/\n/g, ' ');
        let line = `[${i}] ${entry.actionType}: "${preview}"`;
        if (retryCount > 0) {
          line += ` (${retryCount} retr${retryCount === 1 ? 'y' : 'ies'})`;
          for (const [ri, r] of entry.retries.entries()) {
            const rPreview = r.text.slice(0, 60).replace(/\n/g, ' ');
            line += `\n  retry[${ri}] ${r.actionType}: "${rPreview}"`;
          }
        }
        if (entry.scriptData && Object.keys(entry.scriptData).length > 0) {
          line += `\n  scriptData: ${JSON.stringify(entry.scriptData)}`;
        }
        return line;
      });
    
      const body = lines.length
        ? `count: ${rvhHistory.length} | actions: ${state.rvh.actionCount}\n\n${lines.join('\n')}`
        : `(empty) | actions: ${state.rvh.actionCount}`;
    
      getOrCreateCard('[RVH Debug]',
        {
          description: body,
          type: DEBUG_CARD_TYPE
        }
      )
    }
    
    function updateAidDebugCard() {
      const lines = history.map((entry, i) => {
        const preview = (entry.text ?? '').slice(0, 80).replace(/\n/g, ' ');
        return `[${i}] ${entry.type ?? '?'}: "${preview}"`;
      });
    
      const body = lines.length
        ? `count: ${history.length} | actions: ${info.actionCount}\n\n${lines.join('\n')}`
        : `(empty) | actions: ${info.actionCount}`;
    
      getOrCreateCard('[AID Debug]', { description: body, type: DEBUG_CARD_TYPE });
    }
    
    /**
     * Returns an existing storycard by title, creating and initializing it if absent.
     *
     * @param {string} title - The card title to find or create.
     * @param {Object} defaults - Fields to set on the card when first created.
     *   All fields are optional; unspecified fields are left at addStoryCard() defaults.
     * @param {function(Object): void} [onRepair] - Optional callback invoked on every
     *   call (create or find) for post-creation or repair logic. Receives the card.
     * @returns {Object|null} The storycard, or null if creation failed.
     */
    function getOrCreateCard(title, defaults = {}, onRepair = null) {
      let card = getStoryCardEntryByTitle(title);
      if (!card) {
        addStoryCard(title);
        card = getStoryCardEntryByTitle(title);
      }
      if (card) {
        Object.assign(card, defaults);
      }
      if (card && onRepair) onRepair(card);
      return card;
    }
    
    function getStoryCardEntryByTitle(title) {
      const card = storyCards.find(c => c.title === title);
      return card ? card : null;
    }
    
    function updateHistoryDebugCards(dbg) {
      if (dbg.getLevel() > DuckieDebug.duckieDebugMode.OFF) {
        updateDebugCard();
        updateAidDebugCard();
      }
    }
    
    
    
    // --- classify ---
    
    const MATCH_CONFIDENCE_RATIO = 0.70;
    const LOOKBACK_WINDOW = 10;
    const MAX_CONSECUTIVE_MISMATCHES = 2; 
    const AID_HISTORY_CAP = 100;
    
    function inferActionType(text) {
      if (text.startsWith('> You say')) return 'say';
      if (text.startsWith('>'))         return 'do';
      return 'story';
    }
    
    // Walks backwards through both histories and counts matching entries via Jaccard similarity.
    // rvhOffset skips that many entries from the end of rvhHistory before comparing
    // (used for retry detection where AID has already removed the last AI response).
    function findHistoryMatch(aidHistory, rvhHistory, rvhOffset, window, threshold) {
      const limit = Math.min(
        window,
        aidHistory.length,
        Math.max(0, rvhHistory.length - rvhOffset)
      );
      const edits = [];
      let matchedCount = 0;
      let consecutiveMismatches = 0;
    
      for (let i = 0; i < limit; i++) {
        const aidEntry = aidHistory[aidHistory.length - 1 - i];
        const rvhEntry = rvhHistory[rvhHistory.length - 1 - rvhOffset - i];
        const sim = jaccardSimilarity(aidEntry.text, rvhEntry.text);
    
        if (sim >= threshold) {
          matchedCount++;
          consecutiveMismatches = 0;
          if (sim < 0.95) {
            edits.push({ rvhIdx: rvhHistory.length - 1 - rvhOffset - i, newText: aidEntry.text });
          }
        } else {
          consecutiveMismatches++;
          edits.push({ rvhIdx: rvhHistory.length - 1 - rvhOffset - i, newText: aidEntry.text });
          if (consecutiveMismatches > MAX_CONSECUTIVE_MISMATCHES) break;
        }
      }
    
      const needed = Math.ceil(limit * MATCH_CONFIDENCE_RATIO);
      return { matchedCount, edits, confident: limit === 0 || matchedCount >= needed };
    }
    
    // Classifies the current state change at the beginning of the input hook.
    // At this point AID has already incremented info.actionCount once (before input fires).
    function classifyStateChange(info, state, aidHistory) {
      if(info.actionCount === 0) return { changeType: 'start', edits: [] };
    
      const aidCount = info.actionCount;
      const rvhCount = state.rvh.actionCount;
    
      if (aidCount < rvhCount) return { changeType: 'rewind', edits: [] };
      if (aidCount > rvhCount + 1) return { changeType: 'redo', edits: [] };
    
      // aidCount === rvhCount + 1 → presumed new action
      // aidCount === rvhCount → presumed 'retry': AID's history is one action short of
      // ours. A real retry never reaches the input hook, so the input hook treats this
      // as an undo of one action followed by a new one (a rewind). The context hook
      // detects Continue-retries itself (expectedAidContinueDepth) before calling here.
      const presumed = aidCount === rvhCount ? 'retry' : 'new';
    
      // AID's history lacks our last entry, so we skip it when comparing.
      const rvhOffset = presumed === 'retry' ? 1 : 0;
      const result = findHistoryMatch(
        aidHistory, state.rvh.history, rvhOffset, LOOKBACK_WINDOW, SIMILARITY_THRESHOLD
      );
    
      if (!result.confident) return { changeType: 'redo', edits: result.edits };
      return { changeType: presumed, edits: result.edits };
    }
    
    function trailingContinueCount(aidHistory) {
      let count = 0;
      for (let i = aidHistory.length - 1; i >= 0; i--) {
        if (aidHistory[i].type !== 'continue') break;
        count++;
      }
      return count;
    }
    
    
    
    // =========================================
    // constants - Build-overridable constants for RevampedHistory.
    // Declared at file scope so patchwork-press fileOverrides can rewrite them
    // per bundle; see WTG's src/core/constants.js for the same pattern.
    // =========================================
    
    // Debug verbosity RVH's own DuckieDebug instance starts at: 0 OFF / 1 ERROR / 2 INFORM.
    // Defaults to OFF so a mod-agnostic dependency never writes debug story cards into a
    // player's scenario uninvited. Bundles that want RVH's logs override this to 1 or 2.
    // Numeric, not a string: DuckieDebug's applyLevel() treats a non-number as a boolean,
    // and the string '0' is truthy — which would read as level 2.
    const RVH_DEBUG_DEFAULT_LEVEL = 0;
    
    
    
    // --- history ops ---
    
    const AMBIGUOUS_DELTA = 0.20;
    
    function pushAction(state, text, actionType, scriptData = {}, retries = []) {
      state.rvh.history.push({ text, actionType, retries, scriptData });
      if (state.rvh.history.length > state.rvh.historyMaxLength) {
        const evicted = state.rvh.history.shift();
        // The start turn commits two entries under a single action count (see
        // startEntryBonus); evicting the start entry itself costs no counts.
        if (evicted.actionType !== 'start') state.rvh.firstActionIndex++;
      }
    }
    
    // The game-start turn produces two history entries (the start action and the
    // first AI response) but only one actionCount tick. While the start entry is
    // still at the base of rvh.history, count→index conversion is shifted by one.
    function startEntryBonus(state) {
      return state.rvh.history[0]?.actionType === 'start' ? 1 : 0;
    }
    
    // Convert an action-count index into an array index of state.rvh.history.
    function countToIndex(state, count) {
      return count - state.rvh.firstActionIndex + startEntryBonus(state);
    }
    
    function trimToIndex(state, index) {
      return state.rvh.history.splice(index);
    }
    
    // forkTurn is set only when the timeline split before the branch's first entry
    // (a rewind past all tracking): the actions between forkTurn and firstTurn were
    // never tracked on the branch's timeline.
    function saveAltHistory(state, firstTurn, tail, forkTurn) {
      const branch = { firstTurn, history: tail };
      if (forkTurn !== undefined && forkTurn < firstTurn) branch.forkTurn = forkTurn;
      state.rvh.altHistory.unshift(branch);
      if (state.rvh.altHistory.length > state.rvh.maxAltHistories) {
        state.rvh.altHistory.pop();
      }
    }
    
    // Matches AID's window against each saved branch's tail. When the first hooked
    // turn after a redo is a retry, AID has already removed the branch's last
    // response, so a branch that doesn't match as-is is tried again with its last
    // entry skipped; the caller then treats the turn as a retry of that entry.
    function restoreAltHistory(state, aidCount, aidHistory) {
      let bestBranch = null;
    
      for (const offset of [0, 1]) {
        let bestScore = -1;
        for (const branch of state.rvh.altHistory) {
          const branchEndCount = branch.firstTurn + branch.history.length;
          if (Math.abs(branchEndCount - aidCount) > 4) continue;
          if (offset > 0 && branch.history.length <= offset) continue;
    
          const result = findHistoryMatch(aidHistory, branch.history, offset, 5, SIMILARITY_THRESHOLD);
          // With an offset, an empty comparison proves nothing, so require a real match.
          if (result.confident && (offset === 0 || result.matchedCount > 0) && result.matchedCount > bestScore) {
            bestScore = result.matchedCount;
            bestBranch = branch;
          }
        }
        if (bestBranch) break;
      }
    
      if (!bestBranch) return false;
    
      if (bestBranch.forkTurn !== undefined) {
        restoreForkedBranch(state, bestBranch, aidCount, aidHistory);
      } else {
        // firstTurn is an action count; convert to an array index via the offset.
        const attachAt = countToIndex(state, bestBranch.firstTurn);
        if (attachAt < 0) return false; // branch predates the tracked range; cannot reattach
        state.rvh.history = state.rvh.history.slice(0, attachAt).concat(bestBranch.history);
      }
      state.rvh.actionCount = bestBranch.firstTurn + bestBranch.history.length;
      state.rvh.altHistory = state.rvh.altHistory.filter(b => b !== bestBranch);
      return true;
    }
    
    // Restores a branch saved by a rewind past all tracking. Everything tracked from
    // forkTurn on belongs to the abandoned timeline, however many turns the player
    // took there, so only entries before the fork are kept. The actions between the
    // fork and the branch's first entry were never tracked on the branch's timeline:
    // they are filled from the AID window where it still reaches them, and otherwise
    // with empty placeholders, as backfillFromAidHistory does.
    // committedCount is the count of actions AID has committed; AID's last window
    // entry is action committedCount - 1.
    function restoreForkedBranch(state, branch, committedCount, aidHistory) {
      const keepTo = countToIndex(state, branch.forkTurn);
      const kept = keepTo > 0 ? state.rvh.history.slice(0, keepTo) : [];
    
      const gap = [];
      for (let count = branch.forkTurn; count < branch.firstTurn; count++) {
        const entry = aidHistory[aidHistory.length - (committedCount - count)];
        gap.push({ text: entry?.text ?? '', actionType: entry?.type ?? 'other', retries: [], scriptData: {} });
      }
    
      state.rvh.history = kept.concat(gap, branch.history);
      if (kept.length === 0) state.rvh.firstActionIndex = branch.forkTurn;
    }
    
    // Applies a rewind or redo to RVH's history, for whichever hook discovers it
    // (input, or context when the player pressed Continue). aidCount is
    // info.actionCount, which AID has already pre-incremented for the pending action.
    // Rewind trims the tracked tail into an alt branch, or clears all tracking when
    // the rewind lands at or before the first tracked entry. Redo restores a matching
    // alt branch, or else seeds and backfills from the AID window. Once the histories
    // line up, resolves which retry the player kept, unless resolveWinner is false
    // (the context hook resolves it itself, after checking whether the turn is a retry).
    // Leaves actionCount at the committed count; the caller adds the pending action.
    // Returns true when a rewind cleared all tracking (capture reason 'rewind-past-tracking').
    function applyRewindOrRedo(state, aidHistory, changeType, aidCount, dbg = null, resolveWinner = true) {
      const committedCount = aidCount - 1;
      let rewoundPastTracking = false;
    
      if (changeType === 'rewind') {
        const trimAt = countToIndex(state, committedCount);
        if (trimAt > 0) {
          saveAltHistory(state, committedCount, trimToIndex(state, trimAt));
        } else {
          const tail = state.rvh.history.splice(0);
          if (tail.length > 0) saveAltHistory(state, state.rvh.firstActionIndex, tail, committedCount);
          state.rvh.firstActionIndex = committedCount;
          rewoundPastTracking = true;
        }
        state.rvh.actionCount = committedCount;
      } else if (changeType === 'redo') {
        if (!restoreAltHistory(state, committedCount, aidHistory)) {
          // Seed first if nothing is tracked, then append the redone tail.
          if (state.rvh.history.length === 0) captureUntrackedFromWindow(state, aidHistory, committedCount);
          backfillFromAidHistory(state, aidHistory, committedCount);
          state.rvh.actionCount = committedCount;
        }
      } else {
        return false;
      }
    
      if (resolveWinner) resolveRetryWinner(state, aidHistory, dbg);
      return rewoundPastTracking;
    }
    
    // After rewind/redo surgery on a turn with no input hook, our last entry should
    // be AID's last. If AID's last matches our second-to-last instead, AID has
    // already removed our last entry: the player undid, rewound or redid, and then
    // retried the response that is now last.
    function isRetryAfterNavigation(state, aidHistory) {
      const ours = state.rvh.history;
      const aidLast = aidHistory[aidHistory.length - 1];
      if (!aidLast || ours.length < 2) return false;
      if (ours[ours.length - 1].actionType !== 'continue') return false;
      if (jaccardSimilarity(aidLast.text, ours[ours.length - 1].text) >= SIMILARITY_THRESHOLD) return false;
      return jaccardSimilarity(aidLast.text, ours[ours.length - 2].text) >= SIMILARITY_THRESHOLD;
    }
    
    // Swaps entry.retries[retryIdx] in as the entry's canonical text, actionType and
    // scriptData; the old canonical moves to the end of retries.
    function promoteRetry(entry, retryIdx) {
      const promoted = entry.retries.splice(retryIdx, 1)[0];
      entry.retries.push({ text: entry.text, actionType: entry.actionType, scriptData: entry.scriptData });
      entry.text = promoted.text;
      entry.actionType = promoted.actionType;
      entry.scriptData = promoted.scriptData;
    }
    
    // When the player stops retrying, AID's history reveals which response they kept
    // (AID runs no hooks when the player flips between retries). The canonical and
    // every retry are scored against AID's last entry; the highest score wins, with
    // the canonical winning ties, and a winning retry is promoted. Any other candidate
    // within AMBIGUOUS_DELTA of the winner sets rvh.ambiguous so mods can correct
    // their scriptData.
    // Callers must only run this when AID's last entry and rvh's last entry are the
    // same action: after rewind/redo handling, and never on a retry turn.
    function resolveRetryWinner(state, aidHistory, dbg = null) {
      const last = state.rvh.history[state.rvh.history.length - 1];
      if (!last || last.retries.length === 0) return;
    
      const aidLast = aidHistory[aidHistory.length - 1];
      if (!aidLast) return;
    
      const candidates = [
        { retryIdx: -1, entry: last, sim: jaccardSimilarity(aidLast.text, last.text) },
        ...last.retries.map((r, i) => ({ retryIdx: i, entry: r, sim: jaccardSimilarity(aidLast.text, r.text) })),
      ];
      const winner = candidates.reduce((best, c) => c.sim > best.sim ? c : best);
      const alts = candidates.filter(c => c !== winner && c.sim >= winner.sim - AMBIGUOUS_DELTA);
    
      if (alts.length > 0) {
        dbg?.inform('Ambiguous retry resolution');
        state.rvh.ambiguous = {
          index: state.rvh.history.length - 1,
          chosenAction: { text: winner.entry.text, scriptData: winner.entry.scriptData },
          consideredAlts: alts.map(c => ({ text: c.entry.text, scriptData: c.entry.scriptData })),
        };
      }
    
      if (winner.retryIdx !== -1) promoteRetry(last, winner.retryIdx);
    }
    
    function freshenText(state, edits) {
      const last = state.rvh.history.length - 1;
      const secondLast = state.rvh.history.length - 2;
      const safeSwapFrom = (secondLast >= 0 && state.rvh.history[secondLast].actionType !== 'continue')
        ? secondLast
        : last;
    
      for (const { rvhIdx, newText } of edits) {
        const entry = state.rvh.history[rvhIdx];
        if (!entry) continue;
    
        if (rvhIdx < safeSwapFrom) {
          // Older entry: update text only, never promote a retry
          entry.text = newText;
          continue;
        }
    
        // Recent entry: allow retry promotion as before
        let bestSim = jaccardSimilarity(newText, entry.text);
        let bestRetryIdx = -1;
    
        for (let i = 0; i < entry.retries.length; i++) {
          const sim = jaccardSimilarity(newText, entry.retries[i].text);
          if (sim > bestSim) {
            bestSim = sim;
            bestRetryIdx = i;
          }
        }
    
        if (bestRetryIdx !== -1) promoteRetry(entry, bestRetryIdx);
    
        entry.text = newText;
      }
    }
    
    // Appends actions committed in AID but missing from the tracked tail (redo
    // beyond any saved branch). The count of missing actions is derived from the
    // at-rest invariant committedCount === firstActionIndex + length - startBonus;
    // entries that already fell out of the AID window get an empty placeholder so
    // count alignment holds.
    function backfillFromAidHistory(state, aidHistory, committedCount) {
      if (state.rvh.history.length === 0) {
        // Nothing tracked: alignment is the window start (capture normally seeds
        // before backfill runs, so this is a fallback for an empty window).
        state.rvh.firstActionIndex = Math.max(0, committedCount - aidHistory.length);
      }
      const tracked = state.rvh.firstActionIndex + state.rvh.history.length - startEntryBonus(state);
      const missing = committedCount - tracked;
      if (missing <= 0) return;
    
      for (let j = aidHistory.length - missing; j < aidHistory.length; j++) {
        const entry = j >= 0 ? aidHistory[j] : null;
        if (entry) pushAction(state, entry.text, entry.type, {});
        else pushAction(state, '', 'other', {});
      }
    }
    
    // Captures AID-window entries that predate tracking: seeds an empty history
    // (mid-story install, state loss, rewind past tracking) and prepends older
    // entries the window reveals in front of tracking (window refill after a deep
    // rewind). Sizing is content-free — the window's tail is assumed to be the
    // entries we already track (phaseAdjust corrects for entries AID holds or has
    // popped that we haven't committed yet); anything beyond that at the front is
    // untracked. Sets state.rvh.capture so other mods can seed their own
    // scriptData over the captured range. Does not touch actionCount — counter
    // choreography stays with the hooks.
    function captureUntrackedFromWindow(state, aidHistory, committedCount, phaseAdjust = 0, reason) {
      if (committedCount <= 0 || aidHistory.length === 0) return;
    
      const ourLen = state.rvh.history.length;
      const extra  = aidHistory.length - (ourLen + phaseAdjust);
      if (extra <= 0) return;
    
      // Clamp to the cap: only capture what fits in front, preferring the newest.
      const take = Math.min(extra, state.rvh.historyMaxLength - ourLen);
      if (take <= 0) return;
    
      const captured = [];
      for (let j = extra - take; j < extra; j++) {
        const entry = aidHistory[j];
        captured.push({ text: entry?.text || '', actionType: entry?.type || 'other', retries: [], scriptData: {} });
      }
      // If the window still reaches back to the very start of the adventure, the
      // start entry rides along and contributes no action count (see startEntryBonus).
      const capturedBonus = captured[0].actionType === 'start' ? 1 : 0;
    
      state.rvh.history.unshift(...captured);
      state.rvh.firstActionIndex = ourLen === 0
        ? Math.max(0, committedCount - take + capturedBonus)
        : Math.max(0, state.rvh.firstActionIndex - take + capturedBonus);
    
      state.rvh.capture = {
        count:           take,
        fromActionIndex: state.rvh.firstActionIndex,
        reason:          reason || (ourLen === 0 ? 'seed' : 'prepend'),
      };
    }
    
    
    
    // --- init ---
    
    function rvhEnsureInit(state) {
      if (state.rvh) {
        if (state.rvh.firstActionIndex === undefined) {
          // Session predates firstActionIndex. At rest (between turns) the invariant
          // actionCount === firstActionIndex + history.length - startEntryBonus holds
          // (the start turn commits two entries under one count), so derive it.
          const bonus = state.rvh.history[0]?.actionType === 'start' ? 1 : 0;
          state.rvh.firstActionIndex = Math.max(0, state.rvh.actionCount - (state.rvh.history.length - bonus));
        }
        return;
      }
      state.rvh = {
        history: [],
        actionCount: 0,
        firstActionIndex: 0,
        historyMaxLength: 1000,
        altHistory: [],
        maxAltHistories: 5,
        playerAction: null,
        aiAction: null,
        expectedAidContinueDepth: 0,
      };
    }
    
    
    
    //--- similarity ---
    
    const SIMILARITY_THRESHOLD = 0.60;
    
    function computeBigrams(text) {
      const words = (text || '').toLowerCase().match(/\b\w+\b/g) || [];
      const bigrams = new Set();
      for (let i = 0; i < words.length - 1; i++) {
        bigrams.add(`${words[i]} ${words[i + 1]}`);
      }
      return bigrams;
    }
    
    function jaccardSimilarity(text1, text2) {
      if (!text1 && !text2) return 1.0;
      const set1 = computeBigrams(text1);
      const set2 = computeBigrams(text2);
      if (set1.size === 0 && set2.size === 0) return 1.0;
      let intersectionCount = 0;
      for (const b of set1) {
        if (set2.has(b)) intersectionCount++;
      }
      const unionCount = set1.size + set2.size - intersectionCount;
      return intersectionCount / unionCount;
    }
    return { rvhDebug, updateDebugCard, updateAidDebugCard, getOrCreateCard, getStoryCardEntryByTitle, updateHistoryDebugCards, inferActionType, findHistoryMatch, classifyStateChange, trailingContinueCount, pushAction, startEntryBonus, countToIndex, trimToIndex, saveAltHistory, restoreAltHistory, restoreForkedBranch, applyRewindOrRedo, isRetryAfterNavigation, promoteRetry, resolveRetryWinner, freshenText, backfillFromAidHistory, captureUntrackedFromWindow, rvhEnsureInit, computeBigrams, jaccardSimilarity, DEBUG_CARD_TYPE, MATCH_CONFIDENCE_RATIO, LOOKBACK_WINDOW, MAX_CONSECUTIVE_MISMATCHES, AID_HISTORY_CAP, RVH_DEBUG_DEFAULT_LEVEL, AMBIGUOUS_DELTA, SIMILARITY_THRESHOLD };
  })();

  static input(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
  
    const dbg = RevampedHistory.#lib.rvhDebug();
    dbg.applyLevel('Input');
  
    state.rvh.capture   = null; // new turn — clear last turn's capture and ambiguity signals
    state.rvh.ambiguous = null;
  
    let { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
    // AID never runs onInput on a retry, so equal counts here mean the player undid
    // one action (the last AI response) and then typed a new one. The classifier's
    // edits already skip our last entry, which is the one to trim, so they still apply.
    if (changeType === 'retry') changeType = 'rewind';
    // Retry winner resolution compares AID's last entry with ours, so it only runs
    // once the two line up: here for a new action (before RevampedHistory.#lib.freshenText rewrites the
    // text it scores against), inside RevampedHistory.#lib.applyRewindOrRedo for rewind/redo.
    if (changeType === 'new') RevampedHistory.#lib.resolveRetryWinner(state, history, dbg);
    RevampedHistory.#lib.freshenText(state, edits);
  
    // Actions committed so far (AID pre-increments actionCount for the pending action).
    const committedCount = info.actionCount - 1;
    const rewoundPastTracking = RevampedHistory.#lib.applyRewindOrRedo(state, history, changeType, info.actionCount, dbg);
    if (changeType === 'new' || changeType === 'rewind' || changeType === 'redo') state.rvh.actionCount++;
  
    if (changeType !== 'start') {
      RevampedHistory.#lib.captureUntrackedFromWindow(state, history, committedCount, 0,
        rewoundPastTracking ? 'rewind-past-tracking' : undefined);
    }
  
    let actionType = RevampedHistory.#lib.inferActionType(text);
    if (changeType === 'start') {
      actionType = 'start';
    }
    state.rvh.playerAction = { changeType, actionType, text, scriptData: {} };
  
    return { text };
  }

  static popRetryAiEntry(state) {
    const popped = state.rvh.history.pop();
    state.rvh.aiAction = {
      changeType: 'retry',
      actionType: popped.actionType,
      text:       null,
      scriptData: {},
      retries:    [...popped.retries, { text: popped.text, actionType: popped.actionType, scriptData: popped.scriptData }],
    };
  }

  static context(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
  
    const dbg = RevampedHistory.#lib.rvhDebug();
    dbg.applyLevel('Context');
  
    state.rvh.aiAction = { actionType: 'continue', text: null, scriptData: {} };
  
    if (state.rvh.playerAction) {
      // The RevampedHistory.input hook never classifies a retry (AID runs no RevampedHistory.input hook on one).
      state.rvh.aiAction.changeType = state.rvh.playerAction.changeType;
      dbg.inform("Player Action");
      state.rvh.actionCount++;
    } else {
      // Input hook didn't run this turn, so any capture or ambiguity signal is stale.
      state.rvh.capture   = null;
      state.rvh.ambiguous = null;
  
      const aidCount = info.actionCount;
      const rvhCount = state.rvh.actionCount;
  
      // Actions committed so far (AID pre-increments actionCount for the pending action).
      const committedCount = aidCount - 1;
      let rewoundPastTracking = false;
      let changeType = null;
  
      // Undo, rewind and redo run no hooks, and they can net out so that the counts
      // still line up, so each count-based guess is confirmed against the text.
      const countsLineUp = aidCount === rvhCount + 1 || aidCount === rvhCount;
      const retryShaped  = RevampedHistory.#lib.trailingContinueCount(history) < state.rvh.expectedAidContinueDepth;
  
      // After history surgery: a retry if AID has already dropped our last entry,
      // otherwise settle the timeline change as a normal turn.
      const settleAfterNavigation = (navType) => {
        if (RevampedHistory.#lib.isRetryAfterNavigation(state, history)) return 'retry';
        RevampedHistory.#lib.resolveRetryWinner(state, history, dbg);
        RevampedHistory.#lib.freshenText(state, RevampedHistory.#lib.findHistoryMatch(history, state.rvh.history, 0, RevampedHistory.#lib.LOOKBACK_WINDOW, RevampedHistory.#lib.SIMILARITY_THRESHOLD).edits);
        return navType;
      };
      // The count-based guesses tolerate an edited entry or two, which also lets
      // through a timeline the player redid onto. When the newest compared pair
      // disagrees, a saved branch that matches AID's window takes precedence.
      const newestPairMatches = (rvhOffset) => {
        const aidLast = history[history.length - 1];
        const ours = state.rvh.history[state.rvh.history.length - 1 - rvhOffset];
        return !!aidLast && !!ours && RevampedHistory.#lib.jaccardSimilarity(aidLast.text, ours.text) >= RevampedHistory.#lib.SIMILARITY_THRESHOLD;
      };
  
      if (countsLineUp && retryShaped &&
          RevampedHistory.#lib.findHistoryMatch(history, state.rvh.history, 1, RevampedHistory.#lib.LOOKBACK_WINDOW, RevampedHistory.#lib.SIMILARITY_THRESHOLD).confident) {
        // A retry, or an undo of the last response followed by Continue: AID's
        // history is ours without our last entry.
        changeType = !newestPairMatches(1) && RevampedHistory.#lib.restoreAltHistory(state, committedCount, history)
          ? settleAfterNavigation('redo')
          : 'retry';
      } else if (countsLineUp && !retryShaped) {
        const classified = RevampedHistory.#lib.classifyStateChange(info, state, history);
        if (classified.changeType === 'new' && !newestPairMatches(0) && RevampedHistory.#lib.restoreAltHistory(state, committedCount, history)) {
          changeType = settleAfterNavigation('redo');
        } else if (classified.changeType !== 'redo') {
          if (classified.changeType === 'new') RevampedHistory.#lib.resolveRetryWinner(state, history, dbg);
          RevampedHistory.#lib.freshenText(state, classified.edits);
          changeType = classified.changeType;
        }
        // 'redo' (our history doesn't match AID's): handled as a timeline change below.
      }
  
      if (!changeType) {
        // The timeline moved since the last turn (undo, rewind or redo), and this
        // turn may also be a retry of the response the player landed on.
        const navType = committedCount < rvhCount ? 'rewind' : 'redo';
        rewoundPastTracking = RevampedHistory.#lib.applyRewindOrRedo(state, history, navType, aidCount, dbg, false);
        changeType = rewoundPastTracking ? navType : settleAfterNavigation(navType);
        if (rewoundPastTracking) RevampedHistory.#lib.resolveRetryWinner(state, history, dbg);
      }
  
      if (changeType === 'retry') {
        RevampedHistory.popRetryAiEntry(state);
        state.rvh.playerAction = { changeType: 'retry', actionType: 'continue', text: null, scriptData: {} };
      } else {
        state.rvh.aiAction.changeType = changeType;
        state.rvh.actionCount++;
      }
  
      RevampedHistory.#lib.captureUntrackedFromWindow(state, history, committedCount, 0,
        rewoundPastTracking ? 'rewind-past-tracking' : undefined);
    }
  
    return { text };
  }

  static preInput(_text) {
    RevampedHistory.#lib.rvhDebug().preHook();
  }

  static preContext(_text) {
    RevampedHistory.#lib.rvhDebug().preHook();
  }

  static preOutput(_text) {
    RevampedHistory.#lib.rvhDebug().preHook();
  }

  static postInput(text) {
    state.rvh.playerAction.text = text;
  }

  static postOutput(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
  
    const dbg = RevampedHistory.#lib.rvhDebug();
    dbg.applyLevel('Output');
  
    const playerAction = state.rvh.playerAction;
    const aiAction     = state.rvh.aiAction;
  
    if (!playerAction) {
      if (aiAction) {
        aiAction.text = text;
        RevampedHistory.#lib.pushAction(state, aiAction.text, aiAction.actionType, aiAction.scriptData, aiAction.retries || []);
        state.rvh.aiAction = null;
      }
      state.rvh.ambiguous = null;
      state.rvh.capture   = null;
      state.rvh.expectedAidContinueDepth = Math.min(RevampedHistory.#lib.trailingContinueCount(history) + 1, RevampedHistory.#lib.AID_HISTORY_CAP);
      RevampedHistory.#lib.updateHistoryDebugCards(dbg);
    } else {
      aiAction.text = text;
  
      if (playerAction.changeType === 'retry') {
        RevampedHistory.#lib.pushAction(state, aiAction.text, aiAction.actionType, aiAction.scriptData, aiAction.retries);
      } else {
        const lastEntry = history[history.length - 1];
        if (lastEntry && lastEntry.type && lastEntry.type !== playerAction.actionType) {
          playerAction.actionType = lastEntry.type;
        }
        RevampedHistory.#lib.pushAction(state, playerAction.text, playerAction.actionType, playerAction.scriptData);
        RevampedHistory.#lib.pushAction(state, aiAction.text,     aiAction.actionType,     aiAction.scriptData);
      }
  
      state.rvh.playerAction = null;
      state.rvh.aiAction     = null;
      state.rvh.ambiguous    = null;
      state.rvh.capture      = null;
  
      state.rvh.expectedAidContinueDepth = Math.min(RevampedHistory.#lib.trailingContinueCount(history) + 1, RevampedHistory.#lib.AID_HISTORY_CAP);
      RevampedHistory.#lib.updateHistoryDebugCards(dbg);
    }
  }

  static getPendingPlayerAction() {
    const pa = state.rvh?.playerAction;
    if (!pa) return null;
    return { changeType: pa.changeType, actionType: pa.actionType, text: pa.text };
    // scriptData intentionally excluded from snapshot — use RevampedHistory.setPlayerScriptData to write
  }

  static getPendingAIAction() {
    const aa = state.rvh?.aiAction;
    if (!aa) return null;
    return { changeType: aa.changeType, actionType: aa.actionType, text: aa.text };
    // scriptData intentionally excluded from snapshot — use RevampedHistory.setAiScriptData to write
  }

  static getCurrentActionType() {
    return state.rvh?.playerAction ? state.rvh.playerAction.actionType : 'continue';
  }

  static getCurrentChangeType() {
    if (state.rvh?.playerAction) return state.rvh.playerAction.changeType;
    if (state.rvh?.aiAction)     return state.rvh.aiAction.changeType;
    return null;
  }

  static setPlayerScriptData(namespace, key, value) {
    if (!state.rvh?.playerAction?.scriptData) return;
    if (namespace === '__proto__' || namespace === 'constructor' || namespace === 'prototype') return;
    const sd = state.rvh.playerAction.scriptData;
    if (!Object.prototype.hasOwnProperty.call(sd, namespace)) sd[namespace] = Object.create(null);
    sd[namespace][key] = value;
  }

  static setAiScriptData(namespace, key, value) {
    if (!state.rvh?.aiAction?.scriptData) return;
    if (namespace === '__proto__' || namespace === 'constructor' || namespace === 'prototype') return;
    const sd = state.rvh.aiAction.scriptData;
    if (!Object.prototype.hasOwnProperty.call(sd, namespace)) sd[namespace] = Object.create(null);
    sd[namespace][key] = value;
  }

  static getScriptData(index, namespace, key) {
    if (namespace === undefined) return undefined;
    const hist = state.rvh?.history;
    if (!hist) return undefined;
    const resolved = index < 0 ? hist.length + index : index;
    const entry = hist[resolved];
    if (!entry?.scriptData) return undefined;
    return key !== undefined ? entry.scriptData[namespace]?.[key] : entry.scriptData[namespace];
  }

  static setScriptDataAt(index, namespace, key, value) {
    if (namespace === '__proto__' || namespace === 'constructor' || namespace === 'prototype') return false;
    const hist = state.rvh?.history;
    if (!hist) return false;
    const resolved = index < 0 ? hist.length + index : index;
    const entry = hist[resolved];
    if (!entry) return false;
    if (!entry.scriptData) entry.scriptData = {};
    if (!Object.prototype.hasOwnProperty.call(entry.scriptData, namespace)) entry.scriptData[namespace] = Object.create(null);
    entry.scriptData[namespace][key] = value;
    return true;
  }

  static getHistoryLength() {
    return state.rvh?.history?.length ?? 0;
  }

  static getActionCount() {
    return state.rvh?.actionCount ?? 0;
  }

  static getFirstActionIndex() {
    return state.rvh?.firstActionIndex ?? 0;
  }

  static getCaptureInfo() {
    const c = state.rvh?.capture;
    return c ? { count: c.count, fromActionIndex: c.fromActionIndex, reason: c.reason } : null;
  }

  static _entrySnapshot(e) {
    return { text: e.text, actionType: e.actionType };
  }

  static getEntry(index) {
    const hist = state.rvh?.history;
    if (!hist) return null;
    const resolved = index < 0 ? hist.length + index : index;
    const e = hist[resolved];
    return e ? RevampedHistory._entrySnapshot(e) : null;
  }

  static findEntry(predicate, fromIndex) {
    const hist = state.rvh?.history;
    if (!hist) return null;
    const start = fromIndex !== undefined
      ? (fromIndex < 0 ? hist.length + fromIndex : fromIndex)
      : hist.length - 1;
    for (let i = start; i >= 0; i--) {
      const snap = RevampedHistory._entrySnapshot(hist[i]);
      if (predicate(snap, i)) return { entry: snap, index: i };
    }
    return null;
  }

  static getEntries(start, end) {
    const hist = state.rvh?.history;
    if (!hist) return [];
    return hist.slice(start, end).map(RevampedHistory._entrySnapshot);
  }

  static haveAmbiguous() {
    return !!state.rvh?.ambiguous;
  }

  static getAmbiguousIndex() {
    return state.rvh?.ambiguous?.index ?? null;
  }

  static getAmbiguousText() {
    return state.rvh?.ambiguous?.consideredAlts.map(a => a.text) ?? [];
  }

  static getAmbiguousScriptData(namespace, key) {
    const alts = state.rvh?.ambiguous?.consideredAlts;
    if (!alts) return [];
    return alts.map(a => {
      if (!a.scriptData) return null;
      const ns = a.scriptData[namespace];
      if (!ns) return null;
      return key !== undefined ? (ns[key] ?? null) : ns;
    });
  }
}
