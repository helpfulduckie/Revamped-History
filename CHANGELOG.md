# Changelog

## 2.0.0

### Upgrading from 1.5.0

RVH's turn processing moved out of the pre hooks, which breaks hand-wired hook tabs. In each tab:

- **Input:** add `text = RevampedHistory.input(text).text;` directly below `UnifiedSettings.input`.
- **Context:** add `text = RevampedHistory.context(text).text;` directly below `UnifiedSettings.context`.
- **Output:** add `RevampedHistory.preOutput(text);` as the first line.
- **Every hook** needs exactly one `UnifiedSettings.<hook>(text)` call, above RVH's body call. RVH no longer makes that call itself.
- **Move any code that reads RVH** below `RevampedHistory.input` / `RevampedHistory.context`. Code above them now sees the state from before the turn.

The `readyToUse/` and `src/` hook files are already wired this way.

### Changed

- **Turn processing runs in the new `RevampedHistory.input` and `RevampedHistory.context` body calls.** `preInput`, `preContext` and the new `preOutput` only register RVH's settings, so they can run in any order with other scripts' pre hooks.
- **RVH no longer calls `UnifiedSettings.input/context/output` itself.** The `readyToUse/` build used to run each of them twice per hook.

### Fixed

- **Undoing the last AI response and then typing an action no longer loses the typed action.** RVH used to treat that turn as a retry: the player's entry and any `setPlayerScriptData` written for it were dropped, the undone response was kept as a retry, and the next turn appended a duplicate response with empty `scriptData`. The turn is now a `'rewind'` followed by the new action, so the undone response is saved as an alt branch and history stays aligned with AID.
- **A retry straight after an undo, rewind or redo is now a retry of the response the player landed on.** AID removes that response before the context hook runs, so RVH's history matching was one entry off: it kept the retried response and appended the new one after it, or, after a redo, failed to restore the saved branch and kept the abandoned turn's entries in its place. RVH now lines its history up first, restoring a saved branch where one matches, and then files the old response in the new one's `retries`.
- **A Continue after undoing and redoing back to an earlier timeline restores that timeline's `scriptData`.** When the undo and redo netted out to an ordinary-looking count, RVH treated the turn as a new Continue and rewrote the abandoned turn's entries to match AID's text, leaving their `scriptData` in place. It now restores the saved branch.

### Documentation

- The README is now a front page with a Getting Started walkthrough. The method reference moved to `documentation/API-Reference.md`, and a new `documentation/Guide.md` covers turns, actions and the hook lifecycle, the core pattern, what happens to `scriptData` on each kind of turn, and recipes.

## 1.5.0

### Fixed

- **Retry resolution runs only once AID's and RVH's histories line up.** After a rewind it no longer raises a spurious ambiguous signal or restores the wrong retry's `scriptData` on redo.
- **Ties between retries are decided by similarity alone**, and ambiguity is measured from the winning response.
- **Redo to a branch abandoned by a rewind past all tracking** no longer leaves ghost entries or breaks action-count alignment.
- **`getPendingAIAction().changeType` is set on every turn.**

## 1.4.0

### Added

- **Mid-adventure installs and deep rewinds.** RVH captures actions it never saw from AID's window, and reports them through `getCaptureInfo()`. `setScriptDataAt()` seeds data onto them.
- **`getFirstActionIndex()`**, the offset between history indices and action counts.

### Changed

- **Debug output is off by default**, so installs no longer create the `[RVH Debug]` and `[AID Debug]` cards. Turn it on with `Debug Mode` on the settings card.

## Earlier versions

- **Ambiguous retry resolution** (`haveAmbiguous`, `getAmbiguousIndex`, `getAmbiguousText`, `getAmbiguousScriptData`) for when RVH can't be sure which retry the player kept.
- **The first public API:** turn inspection, per-action `scriptData`, and read-only history access.
