# Guide

How to build a script on Revamped History: the one pattern most scripts need, what happens to your data as the player retries, rewinds and redoes, and recipes for the common cases. For the method-by-method details, see the [API Reference](./API-Reference.md).

---

## Table of Contents

- [Turns, Actions and the Hook Lifecycle](#turns-actions-and-the-hook-lifecycle)
	- [Actions and turns](#actions-and-turns)
	- [Which hooks run, and what `info.actionCount` reads](#which-hooks-run-and-what-infoactioncount-reads)
	- [What's in `history` while the hooks run](#whats-in-history-while-the-hooks-run)
	- [What RVH adds](#what-rvh-adds)
- [The Core Pattern: Keep State on the Entries](#the-core-pattern-keep-state-on-the-entries)
- [What Happens to scriptData](#what-happens-to-scriptdata)
- [Recipes](#recipes)
	- [I want a number that ticks every turn but holds still on retry](#i-want-a-number-that-ticks-every-turn-but-holds-still-on-retry)
	- [I want an event to happen once, even if the player retries](#i-want-an-event-to-happen-once-even-if-the-player-retries)
	- [I want to tag the player's action](#i-want-to-tag-the-players-action)
	- [I want my script to work when added mid-adventure](#i-want-my-script-to-work-when-added-mid-adventure)
	- [I want to handle Continue and Retry turns](#i-want-to-handle-continue-and-retry-turns)
	- [I want to remember a specific entry across turns](#i-want-to-remember-a-specific-entry-across-turns)
	- [I want to fix RVH's pick after an ambiguous retry](#i-want-to-fix-rvhs-pick-after-an-ambiguous-retry)
- [Indices and Action Counts](#indices-and-action-counts)
- [Keeping scriptData Small](#keeping-scriptdata-small)
- [How RVH Detects Turns](#how-rvh-detects-turns)
- [Known Limitations](#known-limitations)

---

## Turns, Actions and the Hook Lifecycle

**AID's scripting environment counts actions, not turns, and the two are easy to confuse.** Players, and most of the AID community, say "turn" for one round trip: you act, the AI responds. `info.actionCount` counts something smaller, and it moves in ways that aren't obvious from inside a hook. This section sets out what AID actually does on each kind of turn, since everything RVH does is built on it.

### Actions and turns

- **An action** is one entry in AID's `history`: either something the player typed (a Do, Say or Story) or one AI response. `info.actionCount` counts actions, and so does RVH's `getActionCount()`.
- **A turn** is the player-facing round trip. A typed turn is the player's action plus the AI's response: **two actions**. A Continue is just the AI's response: **one action**. A retry replaces an action rather than adding one: **no net change**.

So ten typed turns are twenty actions, and a script that treats `info.actionCount` as a turn counter runs twice as fast as the player expects. The rest of RVH's documentation uses the two words this way. (Two field names inside `state.rvh`, `AltBranch.firstTurn` and `forkTurn`, predate this convention: both hold action counts.)

### Which hooks run, and what `info.actionCount` reads

AID changes `info.actionCount` at fixed points in the turn, between the hooks. This table shows each change; `N` is the count before the turn starts.

| The player... | Hooks that run | Before `onInput` | Before `onModelContext` | After `onOutput` | Net |
|---|---|---|---|---|---|
| Starts the adventure | input, context, output | — | — | **+1** | `+1` |
| Types a Do, Say or Story | input, context, output | **+1** | **+1** | — | `+2` |
| Presses Continue | context, output | (no `onInput`) | **+1** | — | `+1` |
| Presses Retry | context, output | (no `onInput`) | **+1** | **−1** | `0` |
| Flips between retried responses | none | | | | `0` |
| Undoes or rewinds | none | | | | `−1` per action removed |
| Redoes | none | | | | `+1` per action restored |

So during a typed turn's hooks the count reads `N + 1` in `onInput` and `N + 2` in `onModelContext` and `onOutput`; during a Continue's or a retry's, it reads `N + 1`. The start turn is the odd one out: every hook reads `0`, and the one increment comes after `onOutput`, even though the opening and the first response are two entries.

The rows that trip people up:

- **A retry adds one before `onModelContext` and takes it back after `onOutput`.** AID removes the retried response without changing the count, adds one for the new response as it would for any response, and then subtracts one once `onOutput` returns. So while a retry's hooks run, the count reads exactly what a new Continue's would. Inside `onModelContext` and `onOutput` there's no way to tell the two apart from `info.actionCount`, and a script that remembers the count it saw during a retry reads the same number again in `onInput` on the next typed turn, as if no action had happened.
- **A retry never runs `onInput`,** even when the response being retried answered a typed action. The player's action isn't re-entered; only the response is regenerated.
- **Undo, rewind, redo and flipping between retries run no hooks at all.** A script only finds out on the next turn that does run hooks, by which point the count has already moved.

### What's in `history` while the hooks run

AID adds the new entries to `history` partway through the turn, not at the start:

| The player... | During `onInput` | During `onModelContext` | During `onOutput` |
|---|---|---|---|
| Starts the adventure | empty | see below | the opening, but not the first response |
| Types a Do, Say or Story | not yet the typed action | see below | the typed action, but not the response |
| Presses Continue | (doesn't run) | not yet the response | not yet the response |
| Presses Retry | (doesn't run) | the retried response is already gone | the retried response is already gone; not yet the new one |

The response being generated is never in `history` during its own hooks. AID adds it after `onOutput` returns, with whatever text `onOutput` returned. A typed action is likewise recorded with the text `onInput` returned.

**Whether the typed action (or the opening) is already in `history` during `onModelContext` is unsettled.** Some recent live measurements found it there, as the last entry; the long-standing understanding, which RVH's test environment follows, is that it arrives after `onModelContext`. Don't write context-hook code that depends on either answer: check the last entry's `type` rather than assuming what it is.

### What RVH adds

RVH reads the same signals at the start of each turn and turns them into something steadier:

- **A classification for every turn,** from `getCurrentChangeType()`: `'start'`, `'new'`, `'retry'`, `'rewind'` or `'redo'`. RVH works this out in `RevampedHistory.input` on a typed turn, and in `RevampedHistory.context` on a Continue or retry, since `onInput` doesn't run for those. Undo and redo are reported on the next turn that runs hooks, as `'rewind'` or `'redo'`, unless that turn is a retry: RVH first lines its history up with AID's, then reports `'retry'` for the response being regenerated. (Undoing just the last response and pressing Continue is reported as `'retry'` too: to AID and to RVH it is the same as retrying that response.)
- **A count that retries don't move.** `getActionCount()` counts actions the same way `info.actionCount` does, rising in `RevampedHistory.input` and `RevampedHistory.context` as AID's does, but on a retry it doesn't move at all: not during the hooks, and not afterwards.
- **A history that already reflects the retry.** After `RevampedHistory.context`, the retried response has been removed from RVH's history too, and it's kept in the new response's `retries`.

`getActionCount()` still counts actions, not turns. For "how many turns has the player taken", count the player's entries, or keep your own counter in `scriptData` as in [the core pattern](#the-core-pattern-keep-state-on-the-entries).

---

## The Core Pattern: Keep State on the Entries

**Store your script's per-turn state in `scriptData` on the entry for that turn, and read the current value back from the latest entry that has it.** Don't keep a running total in `state`.

A running total in `state` only ever moves forward. AID runs your hooks again on every retry, so a counter in `state` ticks once per retry, and nothing winds it back when the player rewinds. State kept on the entries moves with the history instead:

- **Retry:** RVH removes the retried response from history before your code runs, so the latest value you find is the one from before that response, and you compute the same result again.
- **Rewind:** the entries after the rewind point are gone, so the latest value is the one from the turn the player rewound to.
- **Redo:** RVH restores the rewound entries with their data, so the latest value comes back too.

This is how [World Time Generator](https://github.com/helpfulduckie/World-Time-Generator-3) keeps its clock right: it stamps the time onto entries and recovers it from the latest stamp after a rewind or retry.

A small helper covers the read side for most scripts:

```js
// Latest value of namespace.key on any committed entry, or fallback if none has it.
function lastScriptValue(namespace, key, fallback) {
  const found = RevampedHistory.findEntry(
    (entry, i) => RevampedHistory.getScriptData(i, namespace, key) !== undefined
  );
  return found ? RevampedHistory.getScriptData(found.index, namespace, key) : fallback;
}
```

The README's [bomb countdown](../README.md#getting-started) is this pattern in full.

---

## What Happens to scriptData

What RVH does with the data on each entry as the player plays. "Pending" data is what you wrote with `setPlayerScriptData` / `setAiScriptData` this turn; it becomes part of history at `postOutput`.

| Event | What happens |
|---|---|
| **New turn** | The player's action and the AI response are committed with the pending data you set on each. |
| **Retry** | The retried AI response, with its data, moves into the new response's `retries`. The new response starts with only the data you set this turn. The player's entry from the original player input turn is kept as it was. |
| **Next turn after retries** | RVH works out which AI response the player kept and promotes that response's data to the entry. If it can't be sure, it flags the turn as [ambiguous](./API-Reference.md#ambiguous-retry-resolution). |
| **Player edits an earlier entry** | The entry's text is updated; its data is kept. In the most recent AI response, if the edit makes it closer to one of its retries than to the current text, that retry is promoted with its data, just as when RVH works out which retry was kept. |
| **Rewind** | The entries after the rewind point are removed from history and saved, with their data, as an alt branch (up to `maxAltHistories`, default 5). |
| **Redo** | If a saved branch matches, it is restored with its data. If none matches, the redone actions are copied from AID's window with empty data. |
| **Rewind past everything RVH tracked** | All tracked entries are saved as an alt branch and history is rebuilt from AID's window with empty data. [`getCaptureInfo()`](./API-Reference.md#revampedhistorygetcaptureinfo) reports `'rewind-past-tracking'`. |
| **Mid-adventure install, or `state.rvh` lost** | Entries RVH never saw are copied from AID's window with empty data. `getCaptureInfo()` reports `'seed'` or `'prepend'`. |
| **History reaches `historyMaxLength`** (default 1000) | The oldest entry, and its data, is dropped. |

Your code should expect any entry to lack your data: captured entries, backfilled entries, and entries from before your script was installed all start empty.

---

## Recipes

### I want a number that ticks every turn but holds still on retry

A countdown, a hunger meter or a clock. Compute the new value from the last stored one and store it on the AI response, in `onOutput`:

```js
// Library tab. A passive clock: each AI response advances time by its length.
function clockOutput(text) {
  const minutes = lastScriptValue('clock', 'minutes', 0) + Math.ceil(text.length / 100);
  RevampedHistory.setAiScriptData('clock', 'minutes', minutes);
  return { text };
}

// Output tab, between UnifiedSettings.output and RevampedHistory.postOutput:
text = clockOutput(text).text;
```

A hunger meter is the same shape with `lastScriptValue('hunger', 'fullness', 100) - 1`. Store the value on the AI response rather than the player's action: every turn has an AI response, including Continue turns, and retries replace exactly that entry.

To use the value in `onModelContext` (to tell the AI Storyteller about it), call `lastScriptValue` after `RevampedHistory.context`. The retried response has already been removed at that point, so you get the value as of the end of the previous turn, on a retry as on any other turn.

### I want an event to happen once, even if the player retries

Record that the event happened on the entry where it happened, and check history for that record instead of a flag in `state`:

```js
// Library tab
function doorOutput(text) {
  const alreadyOpened = lastScriptValue('door', 'opened', false);
  if (!alreadyOpened && RevampedHistory.getActionCount() >= 20) {
    text += '\n\nWith a groan, the vault door swings open.';
    RevampedHistory.setAiScriptData('door', 'opened', true);
  }
  return { text };
}
```

On a retry, the response that opened the door is removed before this runs, so the door opens again in the new response, which is what the player should see, since the old one was thrown away. After a rewind to before the door opened, it can open again. With `state.doorOpened = true`, the retried response would never mention the door, and a rewind couldn't undo it.

If you only need to skip work on a retry, and don't need rewinds to undo anything, `RevampedHistory.getCurrentChangeType() !== 'retry'` is enough.

### I want to tag the player's action

**Do it in `onInput`, after `RevampedHistory.input`.** `onInput` runs once per typed action, so there's no ambiguity about which action you're looking at:

```js
text = RevampedHistory.input(text).text;
if (RevampedHistory.getCurrentActionType() === 'say') {
  RevampedHistory.setPlayerScriptData('myScript', 'spoke', true);
}
```

**If you need to know the player's action in `onModelContext` or `onOutput`, check for a retry first.** On a retry, `onInput` doesn't run, and `getCurrentActionType()` returns `'continue'` even when the response being retried answered a `'say'`. The player's action is still there: it was committed on the original turn, and once `RevampedHistory.context` has removed the retried response, it's the last entry in history. So on a retry, look at that entry instead:

```js
// onModelContext after RevampedHistory.context, or onOutput
function currentPlayerActionType() {
  if (RevampedHistory.getCurrentChangeType() === 'retry') {
    // The retried response is gone; the last entry is what it answered.
    return RevampedHistory.getEntry(-1)?.actionType ?? 'continue';
  }
  return RevampedHistory.getCurrentActionType();
}
```

If the response being retried was itself a Continue, the last entry is the AI response before it, so this returns `'continue'`, which is correct.

In these hooks, store what you decide on the AI response with `setAiScriptData`. Data written with `setPlayerScriptData` during a retry isn't kept, because a retry commits only the new response.

### I want my script to work when added mid-adventure

Give every read a sensible fallback (as `lastScriptValue` does), and, if your script needs data on older entries, seed it when RVH captures them:

```js
// onInput after RevampedHistory.input, or onModelContext after RevampedHistory.context
const cap = RevampedHistory.getCaptureInfo();
if (cap) {
  for (let i = 0; i < cap.count; i++) {
    RevampedHistory.setScriptDataAt(i, 'myScript', 'mood', 'neutral');
  }
}
```

`'rewind-past-tracking'` means your data over the captured range is gone, not merely missing, so rebuild whatever your script derived from it.

### I want to handle Continue and Retry turns

When the player presses Continue or Retry, AID doesn't run `onInput`. For your script that means:

- Everything RVH does in `input` happens in `RevampedHistory.context` instead, so read RVH after that call.
- `getCurrentActionType()` returns `'continue'`, even on a retry of a response to a `'say'` or `'do'`, and `setPlayerScriptData` does nothing. Use `setAiScriptData`.
- `getPendingPlayerAction()` is `null` on a Continue. On a retry it's a placeholder, `{ changeType: 'retry', actionType: 'continue', text: null }`; the player's original action is the last committed entry once `RevampedHistory.context` has run.

Code that runs in `onOutput` and stores on the AI response, like the recipes above, needs no special case.

### I want to remember a specific entry across turns

Don't store its array index: indices shift when old entries are evicted or captured ones are added in front (see [Indices and Action Counts](#indices-and-action-counts)). Store a marker in the entry's `scriptData` and find it again with `findEntry`:

```js
RevampedHistory.setAiScriptData('quest', 'id', 'dragon-hunt');
// later
const found = RevampedHistory.findEntry(
  (e, i) => RevampedHistory.getScriptData(i, 'quest', 'id') === 'dragon-hunt'
);
```

### I want to fix RVH's pick after an ambiguous retry

Only needed when different retries of the same turn carry different data for your script, and your script has some other way to know which one the player kept. See [Correcting an ambiguous resolution](./API-Reference.md#correcting-an-ambiguous-resolution).

---

## Indices and Action Counts

**History indices and action counts are different numbers.** Mix them up and you'll read the wrong entry.

- **An index** is a position in RVH's history array: `0` is the oldest entry RVH holds, `-1` the newest. `getEntry`, `getScriptData`, `setScriptDataAt`, `findEntry` and `getEntries` all take indices.
- **An action count** counts actions over the whole adventure. `getActionCount()` is how many have been committed: a turn with player input adds two (the player's action and the AI response), a Continue adds one, and a retry adds none. See [Actions and turns](#actions-and-turns).

**The two differ by an offset, and the offset changes.** `getFirstActionIndex()` is the offset: it grows when the oldest entries are evicted at `historyMaxLength`, and it's already above zero when RVH was added mid-adventure. Because of that, the same entry's positive index can change from one turn to the next, while negative indices (counted from the newest entry) stay put.

**The adventure's first turn is the exception.** The start action and the first AI response are two entries under one action count, so while that start entry is still at `history[0]`, indices run one ahead of counts.

In practice: use negative indices for "the last few entries", `findEntry` for "the latest entry with X", and a marker in `scriptData` for "that particular entry". Use `getActionCount()` for "how far into the adventure are we".

---

## Keeping scriptData Small

Everything in `scriptData` is saved in AID's `state`, and it adds up: up to 1000 entries, plus copies on every retry of a response, plus up to five saved alt branches. Store numbers, flags and short strings. Don't copy the entry's text or large objects into it; read the text with `getEntry` when you need it.

---

## How RVH Detects Turns

Background for when you want to know why RVH made a decision. None of this is needed to use it.

### New action, retry, rewind, redo

RVH compares AID's `info.actionCount` with its own count:

- **Lower** than RVH's: a rewind.
- **More than one higher:** a redo (the player undid a rewind).
- **Equal:** the player undid one action (the last AI response) and then acted. AID never runs `onInput` on a retry, so a typed action with equal counts is a rewind of one action followed by a new one: the undone response is saved as an alt branch, and the typed action and its response are committed as usual with their `scriptData`.
- **One higher:** presumed a new action.

The presumption is checked against the text. RVH compares the last 10 entries of both histories using word-bigram Jaccard similarity (a match needs 0.60), stopping after more than 2 mismatches in a row. At least 70% of the compared entries must match; otherwise the turn is treated as a redo onto a different history. Entries whose text differs from AID's (edited by the player, or by AID's own text corrections) have their text refreshed to match.

### Retries

When a player hits **Retry**, AID removes the last AI response from its history and runs the model again, without running `onInput`. The action counts alone can't tell that from a new Continue, so RVH checks the end of AID's history instead: after each turn it records how many Continue entries AID's history should end with next turn, and a retry, having removed one, leaves fewer. Undoing one response and then pressing Continue leaves fewer too, so RVH handles it the same way. RVH also confirms that AID's history matches its own without the retried response; if it doesn't, the player undid, rewound or redid before retrying, and RVH first trims or restores its history to match (see [Rewinds and redos](#rewinds-and-redos)). RVH keeps the removed response:

1. **`RevampedHistory.context`** classifies the turn as `'retry'` and doesn't advance the action count. It removes the response being retried from history and holds it, with any earlier retries, on the pending AI action.
2. **`RevampedHistory.postOutput`** commits the new response as canonical, with the previous ones in its `retries`, oldest first. The player's action from the original turn is left as it was.

### Which retry the player kept

AID runs no hooks while the player flips between retries, so RVH learns which response they kept only on the next turn, from AID's last history entry. It scores the canonical response and every retry against that entry. The highest score wins and the canonical wins ties; a winning retry is promoted to canonical with its `scriptData`. If any other candidate scores within 0.20 of the winner, RVH flags the turn as [ambiguous](./API-Reference.md#ambiguous-retry-resolution). `scriptData` never breaks a tie.

This comparison only means something once AID's last entry and RVH's are the same action, so RVH runs it before refreshing edited text on a new action or Continue, after restoring history on a rewind or redo, and never on a retry.

### Rewinds and redos

A rewind trims the entries after the rewind point into a saved alt branch. A redo looks for a saved branch that ends near AID's new count and whose last entries match AID's window, and restores it. If none matches, RVH copies the redone actions from AID's window instead. Undo and redo can net out so that the counts look like an ordinary turn; when AID's newest entry doesn't match RVH's, RVH checks the saved branches before trusting the counts.

When the first turn after an undo, rewind or redo is a retry, AID has already removed the response being retried, so its window is one entry short of the timeline the player landed on. RVH allows for that when matching branches, and once its history is lined up, treats the turn as a retry of its last response. A rewind that goes back past everything RVH tracked clears its history, saves it as a branch, and rebuilds from AID's window; redoing to that branch later restores what it can and fills the gap from the window.

---

## Known Limitations

Cases RVH handles imperfectly, or where it depends on something about AID that isn't settled. None of them loses data in ordinary play; they come up after unusual navigation.

- **A retry straight after a redo RVH has no saved branch for, or after a rewind past everything RVH tracked.** RVH handles the turn as a redo or rewind followed by a new Continue: the retried response stays in its history and the new response is added after it, instead of replacing it. RVH keeps branches from the last five rewinds (`maxAltHistories`), so this mostly takes a long run of rewinds, a rewind all the way back past where RVH started tracking, or heavy edits to the redone entries so that no branch matches them.
- **Undoing the last response and pressing Continue counts as a retry.** The undone response goes into the new response's `retries`, where it's treated like any other retried response, rather than being saved as a branch the player could redo to. AID itself doesn't distinguish the two either.
- **Rewinding past the adventure's opening.** The next action is treated as a fresh start, and the original opening and first response stay at the front of RVH's history ahead of the new ones.
- **Heavy edits to several recent entries at once.** RVH matches its history to AID's by text, and needs 7 of the last 10 entries to still match, with no more than two mismatches in a row. If the player rewrites more than that before their next action (three consecutive entries is enough), RVH reports the turn as `'redo'` rather than `'new'`, though it still refreshes the edited text.
- **Which retry the player kept is a best guess.** RVH compares text, so when the retries are near-identical or the kept one was heavily edited, it can pick the wrong one. It flags those turns; see [Ambiguous Retry Resolution](./API-Reference.md#ambiguous-retry-resolution).
- **Whether the typed action is in `history` during `onModelContext` is unsettled.** See [What's in `history` while the hooks run](#whats-in-history-while-the-hooks-run). RVH's own handling doesn't depend on it, but context-hook code in your script might.
