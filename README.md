# Revamped History

## Overview

**Revamped History (RVH)** is an AI Dungeon scripting library that maintains a richer, more reliable history than AID provides natively. It tracks every player action and AI response, survives retries and rewinds, and stores alternate-timeline branches so that redo operations can recover the correct history.

The library is a single class, `RevampedHistory`, pasted into the **Library** tab of an AID scenario. All four hook scripts call static methods on it.

---

## The `RevampedHistory` Class

All methods are `static`. You never instantiate `RevampedHistory`; you just call `RevampedHistory.<method>(...)` from your hooks.

### Hook methods

These four methods map directly onto AID's scripting hooks. Call them at the very beginning or very end of each hook, before/after any of your own logic, and pass through the return value where one is required.

---

#### `RevampedHistory.preInput(text)`

**Hook:** `onInput` — call **before** your own logic.

Classifies the navigation event (new action, retry, rewind, or redo), updates `state.rvh` accordingly, and captures the raw player text and inferred action type.

Returns nothing.

---

#### `RevampedHistory.postInput(text)`

**Hook:** `onInput` — call **after** all your modifications, as the last line.

Commits the final player text (post-modification) to the pending player action record. Returns nothing.

```js
// onInput
const modifier = (text) => {
  RevampedHistory.preInput(text);
  // your logic here — modify text if desired
  RevampedHistory.postInput(text);
  return { text };
};
modifier(text);
```

---

#### `RevampedHistory.preContext(text)`

**Hook:** `onModelContext` — call **before** your own logic.

Prepares the AI-action slot and increments the action counter for non-retry turns. Returns nothing.

```js
// onModelContext
const modifier = (text) => {
  RevampedHistory.preContext(text);
  // your context modifications here
  return { text };
};
modifier(text);
```

---

#### `RevampedHistory.postOutput(text)`

**Hook:** `onOutput` — call **after** all your own logic.

Commits the player action and AI response pair into history (or demotes the previous AI response on retry). Returns nothing.

```js
// onOutput
const modifier = (text) => {
  // your output modifications here
  RevampedHistory.postOutput(text);
  return { text };
};
modifier(text);
```

---

### Turn inspection

These methods let you query what kind of turn is currently in progress. Safe to call from any hook after `preInput` or `preContext` has fired.

---

#### `RevampedHistory.getCurrentActionType()`

Returns the player's action type for the current turn, or `'continue'` if the player pressed Continue with no input (input hook was skipped). Also returns `'continue'` if called before RVH has initialized.

| Return value | Meaning |
|---|---|
| `'do'` | Player action starting with `>` (but not `> You say`) |
| `'say'` | Player action starting with `> You say` |
| `'story'` | Narration / story entry (no `>` prefix) |
| `'continue'` | No player input; AI continuing on its own |

---

#### `RevampedHistory.getCurrentChangeType()`

Returns what kind of navigation event triggered the current turn. Returns `null` only if called before any RVH hook has run this turn.

| Return value | Meaning |
|---|---|
| `'new'` | A fresh player action |
| `'retry'` | Player hit Retry on the last AI response |
| `'rewind'` | Player rewound to an earlier point in the story |
| `'redo'` | Player redid a previously rewound branch |
| `'start'` | Very first action of the game |

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

---

#### `RevampedHistory.getPendingPlayerAction()`

Returns a read-only snapshot of the player action that is currently in-flight, or `null` if no player action is pending (e.g. on a pure continue, or between turns).

```ts
{ changeType: string, actionType: string, text: string }
```

`scriptData` is intentionally excluded — use `RevampedHistory.setPlayerScriptData()` to write to it.

---

#### `RevampedHistory.getPendingAIAction()`

Returns a read-only snapshot of the AI action that is currently in-flight (after `preContext` has fired), or `null` if not yet set or already committed.

```ts
{ changeType: string, actionType: string, text: string | null }
```

`scriptData` is intentionally excluded — use `RevampedHistory.setAiScriptData()` to write to it.

---

#### `RevampedHistory.getActionCount()`

Returns RVH's own action counter — the number of actions committed so far. Increments on every new, rewind, redo, or continue action; does **not** increment on retries. Returns `0` if RVH is not yet initialized.

```js
const turn = RevampedHistory.getActionCount();
```

---

### Script data

Each history entry carries a `scriptData` object where your mod can attach arbitrary metadata. Entries are namespaced by mod name so multiple mods can coexist safely.

---

#### `RevampedHistory.setPlayerScriptData(namespace, key, value)`

Write to the current pending player action's `scriptData`. Call during `onInput` (after `preInput`) or `postInput`. Has no effect if no player action is pending.

```js
// onInput — tag the player's action with your mod's data
RevampedHistory.preInput(text);
RevampedHistory.setPlayerScriptData('myMod', 'mood', 'heroic');
return RevampedHistory.postInput(text);
```

The data survives into the committed history entry and can later be read with `RevampedHistory.getScriptData()`.

---

#### `RevampedHistory.setAiScriptData(namespace, key, value)`

Write to the current pending AI action's `scriptData`. Call during `onOutput` (before `postOutput`). Has no effect if no AI action is pending.

```js
// onOutput — annotate the AI response before it's committed
RevampedHistory.setAiScriptData('myMod', 'tone', 'dramatic');
return RevampedHistory.postOutput(text);
```

---

#### `RevampedHistory.getScriptData(index, namespace, key?)`

Read `scriptData` from a committed history entry.

- `index` — position in history. Supports negative indexing (`-1` = last entry, `-2` = second-to-last, etc.)
- `namespace` — your mod's namespace (required; omitting it returns `undefined`)
- `key` — optional. If provided, returns the value at that key. If omitted, returns the live namespace object for your mod.

The returned namespace object is a **live reference** — writing to it updates the stored entry directly. This is the correct way for a mod to correct `scriptData` after detecting an ambiguous retry resolution (see `getAmbiguousIndex`).

```js
// Read a specific value
const mood = RevampedHistory.getScriptData(-2, 'myMod', 'mood');

// Get the full namespace object (live reference — you can update it)
const ns = RevampedHistory.getScriptData(0, 'myMod');
ns.extraKey = 'added';
```

Returns `undefined` for any miss (uninitialized RVH, out-of-bounds index, missing namespace or key).

---

### History read

These methods give read-only access to RVH's committed history. Returned entries are snapshots — mutating them does not affect the stored history.

---

#### `RevampedHistory.getHistoryLength()`

Total number of committed entries in `rvh.history`. Returns `0` if RVH is not initialized. Each full turn (player + AI) produces two entries; a pure continue produces one.

```js
const len = RevampedHistory.getHistoryLength();
```

---

#### `RevampedHistory.getEntry(index)`

Returns a single history entry as `{ text, actionType }`, or `null` if the index is out of bounds or RVH is uninitialized. Supports negative indexing.

```js
const last  = RevampedHistory.getEntry(-1);  // most recent (always an AI response)
const first = RevampedHistory.getEntry(0);
```

---

#### `RevampedHistory.findEntry(predicate, fromIndex?)`

Walks backwards through history starting at `fromIndex` (default: last entry) and returns `{ entry, index }` for the first entry where `predicate(entry, index)` returns truthy, or `null` if none match. Supports negative `fromIndex`. Entries passed to the predicate are `{ text, actionType }` snapshots.

```js
// Find the most recent player 'do' action
const result = RevampedHistory.findEntry(e => e.actionType === 'do');
if (result) {
  const { entry, index } = result;
  log(`Found at ${index}: ${entry.text}`);
}

// Search only within the last 4 entries
const recent = RevampedHistory.findEntry(e => e.actionType === 'say', -4);
```

---

#### `RevampedHistory.getEntries(start?, end?)`

Returns a slice of history entries as an array of `{ text, actionType }` snapshots. Follows the same semantics as `Array.slice` — both arguments optional, negative indices supported.

```js
// All entries
const all = RevampedHistory.getEntries();

// Last 6 entries
const recent = RevampedHistory.getEntries(-6);

// Entries 2 through 5 (exclusive)
const slice = RevampedHistory.getEntries(2, 5);
```

---

### Ambiguous retry resolution

When a player retries an AI response multiple times and then accepts one, RVH uses text similarity to determine which retry they kept and promotes its `scriptData` to canonical. In rare cases — particularly when the player edits the accepted response significantly, or assembles it from parts of multiple retries — RVH cannot determine the correct match with confidence. In these cases RVH sets `state.rvh.ambiguous` and exposes it through the following API so your mod can inspect the alternatives and apply corrections if needed.

`state.rvh.ambiguous` is set at the start of the turn (during `preInput` or `preContext`) and cleared automatically at the end of the turn (during `postOutput`). Your mod should check and correct it during `onInput` (after `preInput`) or `onModelContext` (after `preContext`).

Only AI `continue` responses can be retried, so ambiguity only ever concerns `continue` entries.

---

#### `RevampedHistory.haveAmbiguous()`

Returns `true` if RVH detected an ambiguous retry resolution this turn, `false` otherwise. Check this before calling the other ambiguous API methods.

```js
if (RevampedHistory.haveAmbiguous()) {
  // inspect and correct if needed
}
```

---

#### `RevampedHistory.getAmbiguousIndex()`

Returns the index into `rvh.history` of the entry whose `scriptData` may have been incorrectly resolved, or `null` if there is no ambiguity this turn. In practice this is always the last committed entry (`rvh.history.length - 1`), but using this method keeps your mod decoupled from RVH internals.

```js
const idx = RevampedHistory.getAmbiguousIndex();
```

---

#### `RevampedHistory.getAmbiguousText()`

Returns an array of the alternative texts that were close enough in similarity to have been plausible candidates during resolution. These are the texts RVH did **not** choose — the chosen text is already the canonical entry at `getAmbiguousIndex()`.

Returns `[]` if there is no ambiguity this turn.

```js
const alts = RevampedHistory.getAmbiguousText();
alts.forEach((text, i) => log(`Alt ${i}: ${text.slice(0, 60)}`));
```

---

#### `RevampedHistory.getAmbiguousScriptData(namespace, key?)`

Returns an array of `scriptData` values for the given namespace and optional key, one entry per alternative in the same order as `getAmbiguousText()`. Entries where the alternative has no data for the requested namespace or key have `null` at that position.

If `key` is omitted, returns the namespace object (or `null`) for each alternative.

Returns `[]` if there is no ambiguity this turn.

```js
// Check what scriptData the alternatives carry
const altMoods = RevampedHistory.getAmbiguousScriptData('myMod', 'mood');

altMoods.forEach((mood, i) => {
  if (mood !== null) log(`Alt ${i} mood: ${mood}`);
});
```

---

#### Correcting an ambiguous resolution

If your mod can determine that RVH chose the wrong entry, use `getScriptData` with the index from `getAmbiguousIndex()` to get the live namespace reference and overwrite it directly:

```js
// onInput, after preInput
if (RevampedHistory.haveAmbiguous()) {
  const idx      = RevampedHistory.getAmbiguousIndex();
  const altMoods = RevampedHistory.getAmbiguousScriptData('myMod', 'mood');
  const altTexts = RevampedHistory.getAmbiguousText();

  // Example: your mod knows the correct mood from some other state
  const correctMood = state.myMod.lastKnownMood;
  const correctAlt  = altMoods.findIndex(m => m === correctMood);

  if (correctAlt !== -1) {
    const ns = RevampedHistory.getScriptData(idx, 'myMod');
    ns.mood = altMoods[correctAlt];
  }
}
```

---

## The `state.rvh` Object

`state.rvh` is where RVH stores everything internally. It is initialized automatically on first use.

> **For other mods:** prefer the `RevampedHistory.*` methods above over direct `state.rvh` access. Direct reads are fine for one-off debugging, but writing to `state.rvh` fields (other than the tuning constants below) can corrupt internal state.

| Field | Type | Description |
|---|---|---|
| `history` | `HistoryEntry[]` | Ordered list of all recorded entries. Each turn is a (player, AI) pair. |
| `actionCount` | `number` | RVH's action counter, kept in sync with AID's `info.actionCount`. Use `RevampedHistory.getActionCount()`. |
| `historyMaxLength` | `number` | Cap on `history` length. Oldest entries evicted when exceeded. Default: `1000`. |
| `altHistory` | `AltBranch[]` | Saved timeline branches from rewinds, used to restore on redo. |
| `maxAltHistories` | `number` | Max saved branches. Oldest evicted. Default: `5`. |
| `playerAction` | `PendingAction \| null` | In-flight player action for the current turn. `null` between turns. |
| `aiAction` | `PendingAction \| null` | In-flight AI action for the current turn. `null` between turns. |
| `ambiguous` | `AmbiguousResolution \| null` | Set when RVH cannot confidently resolve which retry the player kept. `null` between turns and when resolution was unambiguous. Use `RevampedHistory.haveAmbiguous()` rather than reading this directly. |

`historyMaxLength` and `maxAltHistories` can safely be tuned by writing to them directly:

```js
state.rvh.historyMaxLength = 500;
state.rvh.maxAltHistories  = 10;
```

---

### `HistoryEntry`

Each entry in `state.rvh.history` (the shape returned by `getEntry` / `findEntry` / `getEntries` is a subset: just `{ text, actionType }`):

```ts
{
  text:       string,          // canonical text of this action or response
  actionType: string,          // 'do' | 'say' | 'story' | 'continue' | 'start'
  retries:    RetryEntry[],    // previous AI responses retried away (managed by RVH internally)
  scriptData: object,          // per-namespace mod metadata; access via RevampedHistory.getScriptData()
}
```

**`actionType` values:**

| Value | Meaning |
|---|---|
| `'do'` | Player action starting with `>` (but not `> You say`) |
| `'say'` | Player action starting with `> You say` |
| `'story'` | Narration / story entry (no `>` prefix) |
| `'continue'` | AI response — to a player action or a pure continue |
| `'start'` | The very first action of the game |

---

### `AltBranch`

Each entry in `state.rvh.altHistory`:

```ts
{
  firstTurn: number,       // index into history where this branch diverged
  history:   HistoryEntry[] // the tail that was trimmed when the player rewound
}
```

---

### `PendingAction`

`state.rvh.playerAction` and `state.rvh.aiAction` during an in-progress turn. Prefer `RevampedHistory.getPendingPlayerAction()` / `RevampedHistory.getPendingAIAction()` for reading; use `RevampedHistory.setPlayerScriptData()` / `RevampedHistory.setAiScriptData()` for writing.

```ts
{
  changeType: string,      // 'new' | 'retry' | 'rewind' | 'redo' | 'start'
  actionType: string,      // same values as HistoryEntry.actionType
  text:       string | null,
  scriptData: object,      // write here via RevampedHistory.set*ScriptData() before output fires
}
```

---

### `AmbiguousResolution`

`state.rvh.ambiguous` when set. Use the `RevampedHistory.haveAmbiguous()` / `getAmbiguous*()` methods rather than reading this directly.

```ts
{
  index:        number,         // index into rvh.history of the ambiguous entry
  chosenAction: {               // what RVH selected as the canonical entry
    text:       string,
    scriptData: object,
  },
  consideredAlts: {             // alternatives that scored within AMBIGUOUS_DELTA of the winner
    text:       string,
    scriptData: object,
  }[],
}
```

---

## How Retry Works

When a player hits **Retry**, AID removes the last AI response from its own history and re-runs the model. RVH detects this by comparing action counts: AID's count equals RVH's count (net-zeroed: decremented when the output was removed, incremented again before input fires), instead of being one ahead as it would for a new action.

Rather than discarding the previous AI response, RVH preserves it inside the entry's `retries` array:

1. **`preInput`** — classifies `changeType` as `'retry'`. Does **not** increment `actionCount`.
2. **`preContext`** — sees the pending `playerAction`, does **not** increment `actionCount`.
3. **`postOutput`** — calls `pushRetry`: the current canonical AI response is demoted into `retries[]`, and the new AI text becomes the new canonical response.

The result is that `state.rvh.history` always holds one entry per player turn (plus one per AI response), and `entry.retries` is an ordered log of every discarded AI response for that turn, oldest first.

When the player stops retrying and submits a new action, RVH uses bigram Jaccard similarity to check whether the accepted AI response matches a stored retry rather than the current canonical. If it does, that retry is promoted to canonical along with its `scriptData`. If the match is ambiguous — scores are too close to distinguish confidently — `state.rvh.ambiguous` is set so your mod can inspect and correct the result.

---

## Minimal Hook Setup

```js
// === Library tab: paste full RevampedHistory class here ===

// === onInput ===
const modifier = (text) => {
  RevampedHistory.preInput(text);
  RevampedHistory.postInput(text);
  return { text };
};
modifier(text);

// === onModelContext ===
const modifier = (text) => {
  RevampedHistory.preContext(text);
  return { text };
};
modifier(text);

// === onOutput ===
const modifier = (text) => {
  RevampedHistory.postOutput(text);
  return { text };
};
modifier(text);
```

---

## Notes

- `state.rvh` persists across sessions as part of AID's `state` object.
- RVH classifies rewinding as any event where AID's action count drops below RVH's. The trimmed tail is saved as an alt branch and restored automatically if the player redoes back to it.
- Similarity matching uses bigram Jaccard (threshold 0.60). Minor edits to history entries (AID's own text corrections or player edits) are detected and synced automatically via a `freshenText` pass that runs at the top of every input hook. Older entries (more than one round back) have their text updated but their `scriptData` is never altered by `freshenText` — only the most recent round's entries are eligible for retry promotion.
- Namespace buckets created by `setPlayerScriptData` / `setAiScriptData` use `Object.create(null)` (no prototype), and the names `__proto__`, `constructor`, and `prototype` are blocked. This prevents a misbehaving mod from polluting `Object.prototype`.