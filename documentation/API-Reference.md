# API Reference

Every public method on the `RevampedHistory` class, grouped by what it's for. All methods are `static`: you never instantiate `RevampedHistory`, you call `RevampedHistory.<method>(...)` from your hooks.

For how to put these together, see the [Guide](./Guide.md). For install and hook wiring, see the [README](../README.md#installation).

---

## Table of Contents

- [Hook Methods](#hook-methods)
- [Turn Inspection](#turn-inspection)
- [Script Data](#script-data)
- [History Read](#history-read)
- [Captured History](#captured-history)
- [Ambiguous Retry Resolution](#ambiguous-retry-resolution)
- [Internals: the `state.rvh` Object](#internals-the-statervh-object)

---

## Hook Methods

RVH's hook methods come in three phases per hook, and each hook runs them in this order:

1. **Pre** (`preInput`, `preContext`, `preOutput`) — first line of the hook. Registers RVH's settings with UnifiedSettings and does nothing else.
2. **UnifiedSettings** — `text = UnifiedSettings.<hook>(text).text;`, which loads the settings card.
3. **Body** (`input`, `context`) — processes the turn. Must come after the UnifiedSettings call and before any of your code that reads RVH. Returns `{ text }` unchanged.
4. **Your modifier scripts.**
5. **Post** (`postInput`, `postOutput`) — last line of the hook. Records the text after every other script has changed it.

Code placed above RVH's body call sees RVH's state from before this turn was processed, so read RVH only below it.

### `RevampedHistory.preInput(text)` / `preContext(text)` / `preOutput(text)`

**Hooks:** `onInput` / `onModelContext` / `onOutput` — first line.

Register RVH's `Debug Mode` setting with UnifiedSettings. Return nothing.

### `RevampedHistory.input(text)`

**Hook:** `onInput` — after `UnifiedSettings.input`, before your own logic.

Classifies the navigation event (new action, rewind, redo, or the start; never a retry, since AID doesn't run `onInput` on one), updates `state.rvh` accordingly, and captures the raw player text and inferred action type. Returns `{ text }` unchanged.

### `RevampedHistory.postInput(text)`

**Hook:** `onInput` — after all your scriptifications, as the last line.

Commits the final player text (post-modification) to the pending player action record. Returns nothing.

### `RevampedHistory.context(text)`

**Hook:** `onModelContext` — after `UnifiedSettings.context`, before your own logic.

Prepares the AI-action slot and increments the action counter for non-retry turns. When `onInput` didn't run — the player pressed Continue or Retry — this is where RVH classifies the turn and handles any rewind or redo. On a retry it removes the AI response being retried from history and holds it as a retry of the pending response. Returns `{ text }` unchanged.

### `RevampedHistory.postOutput(text)`

**Hook:** `onOutput` — after all your own logic, as the last line.

Commits the player action and AI response pair into history. On a retry it commits only the new AI response, carrying the previous responses in its `retries`. Clears the turn's pending actions and its capture and ambiguity signals. Returns nothing.

### Minimal hook setup

The smallest working wiring, matching the shipped `readyToUse/` hook files.

```js
// === Library tab: paste readyToUse/library.js here ===
// (or src/library.js if UnifiedSettings and DuckieDebug are already present)
```

```js
// === onInput ===
const modifier = (text) => {
  RevampedHistory.preInput(text);
  text = UnifiedSettings.input(text).text;
  text = RevampedHistory.input(text).text;
  // your input logic here
  RevampedHistory.postInput(text);
  return { text };
};
modifier(text);
```

```js
// === onModelContext ===
const modifier = (text) => {
  RevampedHistory.preContext(text);
  text = UnifiedSettings.context(text).text;
  text = RevampedHistory.context(text).text;
  // your context logic here
  return { text };
};
modifier(text);
```

```js
// === onOutput ===
const modifier = (text) => {
  RevampedHistory.preOutput(text);
  text = UnifiedSettings.output(text).text;
  // your output logic here
  RevampedHistory.postOutput(text);
  return { text };
};
modifier(text);
```

---

## Turn Inspection

These methods tell you what kind of turn is in progress. Call them after `RevampedHistory.input` has run, or after `RevampedHistory.context` on a Continue or retry turn, when `onInput` doesn't run.

### `RevampedHistory.getCurrentActionType()`

Returns the player's action type for the current turn, or `'continue'` when the input hook didn't run: the player pressed Continue, or retried. A retry returns `'continue'` even when the retried response answered a `'say'` or `'do'`; the original action is the last committed entry (see [`getPendingPlayerAction()`](#revampedhistorygetpendingplayeraction)). Also returns `'continue'` if called before RVH has initialized.

| Return value | Meaning |
|---|---|
| `'do'` | Player action starting with `>` (but not `> You say`) |
| `'say'` | Player action starting with `> You say` |
| `'story'` | Narration / story entry (no `>` prefix) |
| `'start'` | The very first action of the game |
| `'continue'` | No player input; AI continuing on its own |

### `RevampedHistory.getCurrentChangeType()`

Returns what kind of navigation event triggered the current turn, or `null` if RVH hasn't processed a turn yet this hook run (for example, when called above `RevampedHistory.input`).

| Return value | Meaning |
|---|---|
| `'new'` | A fresh action (typed, or a new Continue) |
| `'retry'` | The player hit Retry on the last AI response (or undid that response and pressed Continue, which AID treats the same way). Also reported when the retry comes straight after an undo, rewind or redo; RVH lines its history up with AID's first. |
| `'rewind'` | The player undid or rewound to an earlier point in the story, then acted |
| `'redo'` | The player redid a previously rewound branch |
| `'start'` | The very first action of the game |

```js
const changeType = RevampedHistory.getCurrentChangeType();
if (changeType === 'retry') {
  // Don't trigger one-time events on a retry
} else if (changeType === 'rewind') {
  // Player rewound — adjust world state if needed
} else if (changeType === 'new' || changeType === 'start') {
  // Normal forward progression
}
```

### `RevampedHistory.getPendingPlayerAction()`

Returns a read-only snapshot of the player action currently in flight, or `null` if none is pending (on a Continue, or between turns).

```ts
{ changeType: string, actionType: string, text: string | null }
```

On a retry it returns a placeholder, `{ changeType: 'retry', actionType: 'continue', text: null }`, not the original action. AID doesn't run `onInput` on a retry, and the player's action from the original turn was committed to history then, with its `scriptData`. After `RevampedHistory.context` has removed the retried response, that action is the last entry: read it with `getEntry(-1)` and `getScriptData(-1, …)`. (When the retried response was a Continue, the last entry is whatever came before it.)

`scriptData` is intentionally excluded — use `setPlayerScriptData()` to write to it.

### `RevampedHistory.getPendingAIAction()`

Returns a read-only snapshot of the AI action currently in flight (after `RevampedHistory.context` has run), or `null` if not yet set or already committed.

```ts
{ changeType: string, actionType: string, text: string | null }
```

`scriptData` is intentionally excluded — use `setAiScriptData()` to write to it.

### `RevampedHistory.getActionCount()`

Returns RVH's own action counter — the number of actions committed so far. Increments on every new, rewind, redo, or Continue action; does **not** change on retries. Returns `0` if RVH is not yet initialized.

```js
const turn = RevampedHistory.getActionCount();
```

### `RevampedHistory.getFirstActionIndex()`

Returns the action count of `history[0]` — the offset between history array indices and action counts. `0` when tracking began at the start of the adventure and nothing has been evicted; higher after the oldest entries are evicted by `historyMaxLength`, or when RVH was added mid-story (see [Captured History](#captured-history)). Returns `0` if RVH is not initialized. See the Guide's [indices and action counts](./Guide.md#indices-and-action-counts) for how the two relate.

---

## Script Data

Each history entry carries a `scriptData` object where your script can attach its own data. Data is namespaced by script name so multiple scripts can coexist. The Guide's [scriptData lifecycle](./Guide.md#what-happens-to-scriptdata) covers what happens to it on retries, rewinds and redos.

Namespace objects are created with `Object.create(null)` (no prototype), and the namespaces `__proto__`, `constructor` and `prototype` are refused, so a misbehaving script can't pollute `Object.prototype`.

### `RevampedHistory.setPlayerScriptData(namespace, key, value)`

Write to the pending player action's `scriptData`. Call during `onInput`, after `RevampedHistory.input` and before `postInput`. Has no effect if no player action is pending — including every Continue turn, where `onInput` doesn't run. On a retry, writes go to a placeholder that is never committed, since a retry commits only the new response; see [`getPendingPlayerAction()`](#revampedhistorygetpendingplayeraction).

```js
// onInput — tag the player's action with your script's data
text = RevampedHistory.input(text).text;
RevampedHistory.setPlayerScriptData('myScript', 'mood', 'heroic');
RevampedHistory.postInput(text);
```

The data is committed with the player's entry and can later be read with `getScriptData()`.

### `RevampedHistory.setAiScriptData(namespace, key, value)`

Write to the pending AI action's `scriptData`. Call after `RevampedHistory.context` in `onModelContext`, or anywhere in `onOutput` before `postOutput`. Has no effect if no AI action is pending.

```js
// onOutput — annotate the AI response before it's committed
RevampedHistory.setAiScriptData('myScript', 'tone', 'dramatic');
RevampedHistory.postOutput(text);
```

### `RevampedHistory.getScriptData(index, namespace, key?)`

Read `scriptData` from a committed history entry.

- `index` — position in history. Supports negative indexing (`-1` = last entry, `-2` = second-to-last, etc.)
- `namespace` — your script's namespace (required; omitting it returns `undefined`)
- `key` — optional. If provided, returns the value at that key. If omitted, returns the live namespace object for your script.

The returned namespace object is a **live reference** — writing to it updates the stored entry directly. This is how a script corrects its `scriptData` after an [ambiguous retry resolution](#ambiguous-retry-resolution).

```js
// Read a specific value
const mood = RevampedHistory.getScriptData(-2, 'myScript', 'mood');

// Get the full namespace object (live reference — you can update it)
const ns = RevampedHistory.getScriptData(0, 'myScript');
ns.extraKey = 'added';
```

Returns `undefined` for any miss (uninitialized RVH, out-of-bounds index, missing namespace or key).

### `RevampedHistory.setScriptDataAt(index, namespace, key, value)`

Write `scriptData` onto a committed history entry. Supports negative indexing. Intended for seeding your script's data over entries RVH captured from AID's window (see [Captured History](#captured-history)), which arrive with empty `scriptData`.

Returns `true` on success, `false` if RVH is uninitialized, the index is out of bounds, or the namespace is refused.

```js
RevampedHistory.setScriptDataAt(-3, 'myScript', 'mood', 'neutral');
```

---

## History Read

Read-only access to RVH's committed history. Returned entries are `{ text, actionType }` snapshots — mutating them does not affect the stored history, and they don't include `scriptData` (use `getScriptData` with the entry's index).

### `RevampedHistory.getHistoryLength()`

Total number of committed entries. Returns `0` if RVH is not initialized. A turn with player input produces two entries (the player's action and the AI response); a Continue produces one.

```js
const len = RevampedHistory.getHistoryLength();
```

### `RevampedHistory.getEntry(index)`

Returns a single history entry as `{ text, actionType }`, or `null` if the index is out of bounds or RVH is uninitialized. Supports negative indexing.

```js
const last  = RevampedHistory.getEntry(-1);  // most recent (an AI response, between turns)
const first = RevampedHistory.getEntry(0);
```

### `RevampedHistory.findEntry(predicate, fromIndex?)`

Walks backwards through history starting at `fromIndex` (default: last entry) and returns `{ entry, index }` for the first entry where `predicate(entry, index)` returns truthy, or `null` if none match. Supports negative `fromIndex`. Entries passed to the predicate are `{ text, actionType }` snapshots.

```js
// Find the most recent player 'do' action
const result = RevampedHistory.findEntry(e => e.actionType === 'do');
if (result) {
  const { entry, index } = result;
  log(`Found at ${index}: ${entry.text}`);
}

// Find the most recent entry carrying your script's data
const tagged = RevampedHistory.findEntry(
  (e, i) => RevampedHistory.getScriptData(i, 'myScript') !== undefined
);

// Search only within the last 4 entries
const recent = RevampedHistory.findEntry(e => e.actionType === 'say', -4);
```

### `RevampedHistory.getEntries(start?, end?)`

Returns a slice of history as an array of `{ text, actionType }` snapshots. Same semantics as `Array.slice` — both arguments optional, negative indices supported.

```js
const all    = RevampedHistory.getEntries();       // everything
const recent = RevampedHistory.getEntries(-6);     // last 6 entries
const slice  = RevampedHistory.getEntries(2, 5);   // entries 2 through 4
```

---

## Captured History

AID's window can hold entries RVH never saw: when RVH is added to an adventure already in progress, when `state.rvh` is lost, or when a deep rewind refills the window with entries older than anything RVH tracks. Every turn, RVH copies those entries into its history with empty `scriptData` and `actionType` taken from AID (`'other'` when AID gives none), and reports what it captured so your script can seed its own data over them.

### `RevampedHistory.getCaptureInfo()`

Returns what RVH captured from AID's window this turn, or `null` if nothing was captured. Readable from `onInput` (after `RevampedHistory.input`) through `onOutput` — or from `onModelContext` (after `RevampedHistory.context`) on a Continue or retry turn, when `onInput` doesn't run. Cleared by `postOutput`.

```ts
{ count: number, fromActionIndex: number, reason: 'seed' | 'prepend' | 'rewind-past-tracking' }
```

| `reason` | Meaning |
|---|---|
| `'seed'` | History was empty (fresh install mid-story, or state loss) and was seeded from the window. |
| `'prepend'` | Older window entries were added in front of the tracked history. |
| `'rewind-past-tracking'` | A rewind landed at or before the first tracked entry. Tracking was cleared (and saved as an alt branch) and reseeded from the window — treat your per-entry data over that range as lost. |

The captured entries are always the first `count` entries of history, starting at action count `fromActionIndex`.

```js
// onInput, after RevampedHistory.input
const cap = RevampedHistory.getCaptureInfo();
if (cap) {
  for (let i = 0; i < cap.count; i++) {
    RevampedHistory.setScriptDataAt(i, 'myScript', 'mood', 'unknown');
  }
}
```

---

## Ambiguous Retry Resolution

When a player retries an AI response several times and then moves on, RVH works out which response they kept by text similarity, and promotes that response's `scriptData` to canonical (see [How RVH Detects Turns](./Guide.md#how-rvh-detects-turns)). When another candidate scores within `AMBIGUOUS_DELTA` (0.20) of the winner — most often because the player edited the kept response heavily, or the retries were near-identical — RVH can't be confident it chose correctly. It sets `state.rvh.ambiguous` and exposes it through the methods below so your script can inspect the alternatives and correct its data.

The signal is set at the start of the turn (during `RevampedHistory.input`, or `RevampedHistory.context` on a Continue) and cleared by `postOutput`. Check it in `onInput` after `RevampedHistory.input`, or in `onModelContext` after `RevampedHistory.context`.

Only AI responses can be retried, so ambiguity only ever concerns `'continue'` entries.

### `RevampedHistory.haveAmbiguous()`

Returns `true` if RVH detected an ambiguous retry resolution this turn, `false` otherwise.

```js
if (RevampedHistory.haveAmbiguous()) {
  // inspect and correct if needed
}
```

### `RevampedHistory.getAmbiguousIndex()`

Returns the history index of the entry whose `scriptData` may have been resolved wrongly, or `null` if there is no ambiguity this turn. In practice this is the last committed entry, but using this method keeps your script decoupled from RVH internals.

### `RevampedHistory.getAmbiguousText()`

Returns an array of the alternative texts that scored close enough to have been plausible. These are the texts RVH did **not** choose — the chosen text is already the canonical entry at `getAmbiguousIndex()`. Returns `[]` if there is no ambiguity this turn.

```js
const alts = RevampedHistory.getAmbiguousText();
alts.forEach((text, i) => log(`Alt ${i}: ${text.slice(0, 60)}`));
```

### `RevampedHistory.getAmbiguousScriptData(namespace, key?)`

Returns an array of `scriptData` values for the given namespace and optional key, one per alternative, in the same order as `getAmbiguousText()`. An alternative with no data for the namespace or key has `null` at its position. If `key` is omitted, returns the namespace object (or `null`) for each alternative. Returns `[]` if there is no ambiguity this turn.

```js
const altMoods = RevampedHistory.getAmbiguousScriptData('myScript', 'mood');
altMoods.forEach((mood, i) => {
  if (mood !== null) log(`Alt ${i} mood: ${mood}`);
});
```

### Correcting an ambiguous resolution

If your script can tell RVH chose the wrong entry, get the live namespace object with `getScriptData` at `getAmbiguousIndex()` and overwrite it:

```js
// onInput, after RevampedHistory.input
if (RevampedHistory.haveAmbiguous()) {
  const idx      = RevampedHistory.getAmbiguousIndex();
  const altMoods = RevampedHistory.getAmbiguousScriptData('myScript', 'mood');

  // Example: your script knows the correct mood from some other state
  const correctMood = state.myScript.lastKnownMood;
  const correctAlt  = altMoods.findIndex(m => m === correctMood);

  if (correctAlt !== -1) {
    const ns = RevampedHistory.getScriptData(idx, 'myScript');
    ns.mood = altMoods[correctAlt];
  }
}
```

Many scripts never need this: if every retry of a turn carries the same data for your namespace (as in the README's [countdown example](../README.md#getting-started)), it doesn't matter which one RVH keeps.

---

## Internals: the `state.rvh` Object

`state.rvh` is where RVH stores everything. It is created automatically on first use and persists with the rest of AID's `state`.

> **For other scripts:** use the `RevampedHistory.*` methods above rather than `state.rvh`. Reading it directly is fine for debugging, but writing to any field other than the two tuning values below can corrupt RVH's tracking.

| Field | Type | Description |
|---|---|---|
| `history` | `HistoryEntry[]` | Every recorded action, oldest first. One entry per player action or AI response. |
| `actionCount` | `number` | RVH's action counter, in step with AID's `info.actionCount` except that retries never change it. Use `getActionCount()`. |
| `firstActionIndex` | `number` | Action count of `history[0]`. Use `getFirstActionIndex()`. |
| `historyMaxLength` | `number` | Cap on `history` length; the oldest entries are evicted beyond it. Default `1000`. |
| `altHistory` | `AltBranch[]` | Timeline branches saved by rewinds, used to restore on redo. |
| `maxAltHistories` | `number` | Maximum saved branches; the oldest is evicted beyond it. Default `5`. |
| `playerAction` | `PendingAction \| null` | In-flight player action for the current turn. `null` between turns. |
| `aiAction` | `PendingAction \| null` | In-flight AI action for the current turn. `null` between turns. |
| `ambiguous` | `AmbiguousResolution \| null` | Set when RVH can't confidently tell which retry the player kept. Use `haveAmbiguous()`. |
| `capture` | `object \| null` | What RVH captured from AID's window this turn. Use `getCaptureInfo()`. |
| `expectedAidContinueDepth` | `number` | How many Continue entries should end AID's history next turn; fewer means the player retried the last response (or undid it and pressed Continue). |

`historyMaxLength` and `maxAltHistories` can be tuned by writing to them directly:

```js
state.rvh.historyMaxLength = 500;
state.rvh.maxAltHistories  = 10;
```

### `HistoryEntry`

Each entry in `state.rvh.history`. The snapshots returned by `getEntry`, `findEntry` and `getEntries` are the `{ text, actionType }` subset.

```ts
{
  text:       string,          // canonical text of this action or response
  actionType: string,          // 'do' | 'say' | 'story' | 'continue' | 'start' | 'other'
  retries:    RetryEntry[],    // AI responses retried away on this entry, oldest first
  scriptData: object,          // per-namespace script data; use getScriptData()
}
```

| `actionType` | Meaning |
|---|---|
| `'do'` | Player action starting with `>` (but not `> You say`) |
| `'say'` | Player action starting with `> You say` |
| `'story'` | Narration / story entry (no `>` prefix) |
| `'continue'` | AI response — to a player action or a Continue |
| `'start'` | The very first action of the game |
| `'other'` | A captured or backfilled entry whose type AID didn't give, or a placeholder for an action that had already left AID's window |

Captured entries otherwise take their type from AID's history, so they can be any of these values.

### `AltBranch`

Each entry in `state.rvh.altHistory`.

```ts
{
  firstTurn: number,         // action count of the branch's first entry (not an array index)
  history:   HistoryEntry[], // the tail that was trimmed when the player rewound
  forkTurn?: number,         // only when the rewind landed before all tracking: the action
                             // count where the timelines split, earlier than firstTurn
}
```

On redo, RVH considers branches whose end falls within 4 actions of AID's count and picks the one whose last entries best match AID's window. A branch with `forkTurn` keeps only tracked entries before the split and fills the untracked actions between `forkTurn` and `firstTurn` from AID's window, or with empty `'other'` placeholders once the window no longer reaches them. If no branch matches, RVH appends the redone actions from AID's window instead, with empty `scriptData`.

### `PendingAction`

`state.rvh.playerAction` and `state.rvh.aiAction` during a turn. Read them with `getPendingPlayerAction()` / `getPendingAIAction()`; write their data with `setPlayerScriptData()` / `setAiScriptData()`.

```ts
{
  changeType: string,      // 'new' | 'retry' | 'rewind' | 'redo' | 'start'
  actionType: string,      // same values as HistoryEntry.actionType
  text:       string | null,
  scriptData: object,
}
```

### `AmbiguousResolution`

`state.rvh.ambiguous` when set. Use `haveAmbiguous()` and the `getAmbiguous*()` methods.

```ts
{
  index:        number,         // history index of the ambiguous entry
  chosenAction: {               // what RVH kept as canonical
    text:       string,
    scriptData: object,
  },
  consideredAlts: {             // alternatives within AMBIGUOUS_DELTA of the winner
    text:       string,
    scriptData: object,
  }[],
}
```
