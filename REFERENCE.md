# Revamped History — Reference

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

Returns nothing. The hook must still `return { text }` on its own after any modifications.

```js
// onInput
const modifier = (text) => {
  RevampedHistory.preInput(text);
  // your logic here — modify text if desired
  return RevampedHistory.postInput(text);
};
modifier(text);
```

---

#### `RevampedHistory.postInput(text)`

**Hook:** `onInput` — call **after** all your modifications, as the last line.

Commits the final player text (post-modification) to the pending player action record.

```js
return RevampedHistory.postInput(text);  // always the last line of your input modifier
```

---

#### `RevampedHistory.preContext(text)`

**Hook:** `onModelContext` — call **before** your own logic.

Prepares the AI-action slot and increments the action counter for non-retry turns. Pass through its return value.

```js
// onModelContext
const modifier = (text) => {
  // your context modifications here
  return RevampedHistory.preContext(text);
};
modifier(text);
```

---

#### `RevampedHistory.postOutput(text)`

**Hook:** `onOutput` — call **after** all your own logic.

Commits the player action and AI response pair into history (or demotes the previous AI response on retry). Pass through its return value.

```js
// onOutput
const modifier = (text) => {
  // your output modifications here
  return RevampedHistory.postOutput(text);
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
const last  = RevampedHistory.getEntry(-1);  // most recent (usually an AI response)
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
| `'continue'` | AI response to a player action |
| `'start'` | The very first action of the game |

---

### `AltBranch`

Each entry in `state.rvh.altHistory`:

```ts
{
  firstTurn: number,      // index into history where this branch diverged
  history:   HistoryEntry[] // the tail that was trimmed when the player rewound
}
```

---

### `PendingAction`

`state.rvh.playerAction` and `state.rvh.aiAction` during an in-progress turn. Prefer `RevampedHistory.getPendingPlayerAction()` / `RevampedHistory.getPendingAIAction()` for reading; use `RevampedHistory.setPlayerScriptData()` / `RevampedHistory.setAiScriptData()` for writing.

```ts
{
  changeType: string,     // 'new' | 'retry' | 'rewind' | 'redo' | 'start'
  actionType: string,     // same values as HistoryEntry.actionType
  text:       string | null,
  scriptData: object,     // write here via RevampedHistory.set*ScriptData() before output fires
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

---

## Minimal Hook Setup

```js
// === Library tab: paste full RevampedHistory class here ===

// === onInput ===
const modifier = (text) => {
  RevampedHistory.preInput(text);
  return RevampedHistory.postInput(text);
};
modifier(text);

// === onModelContext ===
const modifier = (text) => {
  return RevampedHistory.preContext(text);
};
modifier(text);

// === onOutput ===
const modifier = (text) => {
  return RevampedHistory.postOutput(text);
};
modifier(text);
```

---

## Notes

- `state.rvh` persists across sessions as part of AID's `state` object.
- RVH classifies rewinding as any event where AID's action count drops below RVH's. The trimmed tail is saved as an alt branch and restored automatically if the player redoes back to it.
- Similarity matching uses bigram Jaccard (threshold 0.60). Minor edits to history entries (AID's own text corrections) are detected and synced automatically via a `freshenText` pass that runs at the top of every input hook.
- Namespace buckets created by `setPlayerScriptData` / `setAiScriptData` use `Object.create(null)` (no prototype), and the names `__proto__`, `constructor`, and `prototype` are blocked. This prevents a misbehaving mod from polluting `Object.prototype`.
