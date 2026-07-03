// ============================================================
// ============= RevampedHistory - 1.2.2 - library ============
// ============================================================
// - RevampedHistory@1.2.2
// ============================================================
// Paste this ONLY into the library tab in AI Dungeon scripting
// ============================================================

class RevampedHistory {
  static #lib = (() => {
    const DEBUG_CARD_TYPE = 'zz_Debug';
    
    function updateDebugCard() {
      const history = state.rvh?.history;
      if (!history) return;
    
      const lines = history.map((entry, i) => {
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
        ? `count: ${history.length} | actions: ${state.rvh.actionCount}\n\n${lines.join('\n')}`
        : `(empty) | actions: ${state.rvh.actionCount}`;
    
      getOrCreateCard('[RVH Debug]',
        {
          description: body,
          type: DEBUG_CARD_TYPE
        }
      )
    }
    
    
    function updateAidDebugCard() {
      if (!history) return;
    
      const lines = history.map((entry, i) => {
        const preview = (entry.text ?? '').slice(0, 80).replace(/\n/g, ' ');
        return `[${i}] ${entry.type ?? entry.actionType ?? '?'}: "${preview}"`;
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
    
    
    function updateHistoryDebugCards() {
      if (DuckieDebug.getLevel() > DuckieDebug.duckieDebugMode.OFF) {
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
    
      // aidCount === rvhCount → presumed retry (AID net-zeroed: -1 after output, +1 before input)
      // aidCount === rvhCount + 1 → presumed new action
      const presumed = aidCount === rvhCount ? 'retry' : 'new';
    
      // For retry, AID removed the last AI response from its history, so we skip our last entry.
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
    
    
    
    // --- history ops ---
    
    
    
    const AMBIGUOUS_DELTA = 0.20;
    
    function pushAction(state, text, actionType, scriptData = {}) {
      state.rvh.history.push({ text, actionType, retries: [], scriptData });
      if (state.rvh.history.length > state.rvh.historyMaxLength) {
        state.rvh.history.shift();
      }
    }
    
    
    function trimToIndex(state, index) {
      return state.rvh.history.splice(index);
    }
    
    function saveAltHistory(state, firstTurn, tail) {
      state.rvh.altHistory.unshift({ firstTurn, history: tail });
      if (state.rvh.altHistory.length > state.rvh.maxAltHistories) {
        state.rvh.altHistory.pop();
      }
    }
    
    function restoreAltHistory(state, aidCount, aidHistory) {
      let bestBranch = null;
      let bestScore = -1;
    
      for (const branch of state.rvh.altHistory) {
        const branchEndCount = branch.firstTurn + branch.history.length;
        if (Math.abs(branchEndCount - aidCount) > 4) continue;
    
        const result = findHistoryMatch(aidHistory, branch.history, 0, 5, SIMILARITY_THRESHOLD);
        if (result.confident && result.matchedCount > bestScore) {
          bestScore = result.matchedCount;
          bestBranch = branch;
        }
      }
    
      if (!bestBranch) return false;
    
      state.rvh.history = state.rvh.history.slice(0, bestBranch.firstTurn).concat(bestBranch.history);
      state.rvh.actionCount = bestBranch.firstTurn + bestBranch.history.length;
      state.rvh.altHistory = state.rvh.altHistory.filter(b => b !== bestBranch);
      return true;
    }
    
    // When the player stops retrying, AID's history reveals which response they picked.
    // If it matches a stored retry rather than the current winner, swap it in.
    // Sets rvh.ambiguous if the match is low-confidence (scores within AMBIGUOUS_DELTA of each other).
    // Prioritizes the canonical entry, then retries with scriptData, as tiebreakers.
    function resolveRetryWinner(state, aidHistory) {
      const last = state.rvh.history[state.rvh.history.length - 1];
      if (!last || last.retries.length === 0) return;
    
      const aidLast = aidHistory[aidHistory.length - 1];
      if (!aidLast) return;
    
      // Score canonical and all retries
      const canonicalSim = jaccardSimilarity(aidLast.text, last.text);
    
      const retrySims = last.retries.map((r, i) => ({
        index: i,
        sim: jaccardSimilarity(aidLast.text, r.text),
        hasScriptData: r.scriptData && Object.keys(r.scriptData).length > 0,
      }));
    
      // Find the best retry score
      const bestRetry = retrySims.reduce((best, r) => r.sim > best.sim ? r : best, retrySims[0]);
    
      // Canonical wins unless a retry beats it clearly
      if (bestRetry.sim <= canonicalSim) {
        // Canonical is best or tied — check for ambiguity among close competitors
        const considered = retrySims.filter(r => r.sim >= bestRetry.sim - AMBIGUOUS_DELTA);
        if (considered.length > 0 && bestRetry.sim >= canonicalSim - AMBIGUOUS_DELTA) {
          state.rvh.ambiguous = {
            index: state.rvh.history.length - 1,
            chosenAction: { text: last.text, scriptData: last.scriptData },
            consideredAlts: considered.map(r => ({
              text: last.retries[r.index].text,
              scriptData: last.retries[r.index].scriptData,
            })),
          };
        }
        return;
      }
    
      // A retry beats canonical — find the best among close competitors,
      // preferring retries with scriptData as tiebreaker
      const candidates = retrySims.filter(r => r.sim >= bestRetry.sim - AMBIGUOUS_DELTA);
      const winner = candidates.reduce((best, r) => {
        if (r.sim > best.sim) return r;
        if (r.sim === best.sim && r.hasScriptData && !best.hasScriptData) return r;
        return best;
      }, candidates[0]);
    
      // Flag ambiguity if canonical or other retries were close
      const otherCandidates = [
        { text: last.text, scriptData: last.scriptData, sim: canonicalSim },
        ...retrySims
          .filter(r => r.index !== winner.index && r.sim >= bestRetry.sim - AMBIGUOUS_DELTA)
          .map(r => ({ text: last.retries[r.index].text, scriptData: last.retries[r.index].scriptData, sim: r.sim })),
      ].filter(c => c.sim >= bestRetry.sim - AMBIGUOUS_DELTA);
    
      if (otherCandidates.length > 0) {
        DuckieDebug.duckieDebug("Ambiguous Action Found", DuckieDebug.duckieDebugMode.ERROR);
        state.rvh.ambiguous = {
          index: state.rvh.history.length - 1,
          chosenAction: { text: last.retries[winner.index].text, scriptData: last.retries[winner.index].scriptData },
          consideredAlts: otherCandidates.map(c => ({ text: c.text, scriptData: c.scriptData })),
        };
      }
    
      // Promote the winner
      const promoted = last.retries.splice(winner.index, 1)[0];
      last.retries.push({ text: last.text, actionType: last.actionType, scriptData: last.scriptData });
      last.text = promoted.text;
      last.actionType = promoted.actionType;
      last.scriptData = promoted.scriptData;
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
    
        if (bestRetryIdx !== -1) {
          const winner = entry.retries.splice(bestRetryIdx, 1)[0];
          entry.retries.push({ text: entry.text, actionType: entry.actionType, scriptData: entry.scriptData });
          entry.actionType = winner.actionType;
          entry.scriptData = winner.scriptData;
        }
    
        entry.text = newText;
      }
    }
    
    function backfillFromAidHistory(state, aidHistory, fromIdx) {
      for (let i = fromIdx; i < aidHistory.length; i++) {
        const entry = aidHistory[i];
        if (entry) pushAction(state, entry.text, entry.type, {});
      }
    }
    
    
    
    // --- init ---
    
    function rvhEnsureInit(state) {
      if (state.rvh) return;
      state.rvh = {
        history: [],
        actionCount: 0,
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
      return unionCount === 0 ? 0 : intersectionCount / unionCount;
    }
    return { updateDebugCard, updateAidDebugCard, getOrCreateCard, getStoryCardEntryByTitle, updateHistoryDebugCards, inferActionType, findHistoryMatch, classifyStateChange, trailingContinueCount, pushAction, trimToIndex, saveAltHistory, restoreAltHistory, resolveRetryWinner, freshenText, backfillFromAidHistory, rvhEnsureInit, computeBigrams, jaccardSimilarity, DEBUG_CARD_TYPE, MATCH_CONFIDENCE_RATIO, LOOKBACK_WINDOW, MAX_CONSECUTIVE_MISMATCHES, AID_HISTORY_CAP, AMBIGUOUS_DELTA, SIMILARITY_THRESHOLD };
  })();

  static preInput(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
    const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
    RevampedHistory.#lib.resolveRetryWinner(state, history);
    RevampedHistory.#lib.freshenText(state, edits);
  
    if (changeType === 'rewind') {
      const divergeIdx = info.actionCount - 1;
      const tail = RevampedHistory.#lib.trimToIndex(state, divergeIdx);
      RevampedHistory.#lib.saveAltHistory(state, divergeIdx, tail);
      state.rvh.actionCount = divergeIdx;
      state.rvh.actionCount++;
    } else if (changeType === 'redo') {
      const restored = RevampedHistory.#lib.restoreAltHistory(state, info.actionCount - 1, history);
      if (!restored) {
        state.rvh.actionCount = info.actionCount - 1;
      }
      state.rvh.actionCount++;
    } else if (changeType === 'new') {
      state.rvh.actionCount++;
    }
  
    let actionType = RevampedHistory.#lib.inferActionType(text);
    if (changeType === 'start') {
      actionType = 'start';
    }
    state.rvh.playerAction = { changeType, actionType, text, scriptData: {} };
  }

  static popRetryAiEntry(state) {
    const popped = state.rvh.history.pop();
    state.rvh.aiAction = {
      actionType: popped.actionType,
      text:       null,
      scriptData: {},
      retries:    [...popped.retries, { text: popped.text, actionType: popped.actionType, scriptData: popped.scriptData }],
    };
  }

  static preContext(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
    state.rvh.aiAction = { actionType: 'continue', text: null, scriptData: {} };
  
    if (state.rvh.playerAction) {
      if (state.rvh.playerAction.changeType !== 'retry') {
        DuckieDebug.duckieDebug("Player Action", 2);
        state.rvh.actionCount++;
      } else {
        RevampedHistory.popRetryAiEntry(state);
      }
    } else {
  
      const aidCount = info.actionCount;
      const rvhCount = state.rvh.actionCount;
  
     if (aidCount < rvhCount || aidCount > rvhCount + 1) {
        const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
        RevampedHistory.#lib.resolveRetryWinner(state, history);
        RevampedHistory.#lib.freshenText(state, edits);
        state.rvh.aiAction.changeType = changeType;
  
        if (changeType === 'rewind') {
          const divergeIdx = aidCount - 1;
          const tail = RevampedHistory.#lib.trimToIndex(state, divergeIdx);
          RevampedHistory.#lib.saveAltHistory(state, divergeIdx, tail);
          state.rvh.actionCount = divergeIdx;
        } else if (changeType === 'redo') {
          const restored = RevampedHistory.#lib.restoreAltHistory(state, aidCount - 1, history);
          if (!restored) {
            RevampedHistory.#lib.backfillFromAidHistory(state, history, state.rvh.history.length);
            state.rvh.actionCount = aidCount - 1;
          }
        }
        state.rvh.actionCount++;
      } else {
        let aidTrailing = 0;
        for (let i = history.length - 1; i >= 0; i--) {
          if (history[i].type !== 'continue') break;
          aidTrailing++;
        }
        if (aidTrailing < state.rvh.expectedAidContinueDepth) {
          RevampedHistory.popRetryAiEntry(state);
          state.rvh.playerAction = { changeType: 'retry', actionType: 'continue', text: null, scriptData: {} };
        } else {
          const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
          RevampedHistory.#lib.resolveRetryWinner(state, history);
          RevampedHistory.#lib.freshenText(state, edits);
          state.rvh.aiAction.changeType = changeType;
          state.rvh.actionCount++;
        }
      }
    }
  }

  static postInput(text) {
    state.rvh.playerAction.text = text;
  }

  static postOutput(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
    const playerAction = state.rvh.playerAction;
    const aiAction     = state.rvh.aiAction;
  
    if (!playerAction) {
      if (aiAction) {
        aiAction.text = text;
        RevampedHistory.#lib.pushAction(state, aiAction.text, aiAction.actionType, aiAction.scriptData);
        state.rvh.aiAction = null;
      }
      state.rvh.ambiguous = null;
      state.rvh.expectedAidContinueDepth = Math.min(RevampedHistory.#lib.trailingContinueCount(history) + 1, RevampedHistory.#lib.AID_HISTORY_CAP);
      RevampedHistory.#lib.updateHistoryDebugCards();
    } else {
      aiAction.text = text;
  
      if (playerAction.changeType === 'retry') {
        state.rvh.history.push({ text: aiAction.text, actionType: aiAction.actionType, scriptData: aiAction.scriptData, retries: aiAction.retries });
        if (state.rvh.history.length > state.rvh.historyMaxLength) state.rvh.history.shift();
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
  
      state.rvh.expectedAidContinueDepth = Math.min(RevampedHistory.#lib.trailingContinueCount(history) + 1, RevampedHistory.#lib.AID_HISTORY_CAP);
      RevampedHistory.#lib.updateHistoryDebugCards();
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

  static getHistoryLength() {
    return state.rvh?.history?.length ?? 0;
  }

  static getActionCount() {
    return state.rvh?.actionCount ?? 0;
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
