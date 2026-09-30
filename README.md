# Revamped History

## Overview

**Revamped History (RVH)** is an AI Dungeon scripting library that maintains a richer, more reliable history than AID provides natively. It tracks every player action and AI response, survives retries and rewinds, and stores alternate-timeline branches so that redo operations can recover the correct history.

The library is a class, `RevampedHistory`, pasted into the **Library** tab of an AID scenario. The three hook scripts call static methods on it. It is also the history layer inside WTG and other mods, which bundle it as a dependency.

---

## Installing

RVH depends on two other libraries, `UnifiedSettings` and `DuckieDebug`, which it calls as globals. The release ships two sets of files:

| Folder | Library tab contains | Use when |
|---|---|---|
| `readyToUse/` | `UnifiedSettings`, `DuckieDebug` and `RevampedHistory` | You want RVH on its own, or your other mods don't already include the two dependencies. Paste each file into the matching tab. |
| `src/` | `RevampedHistory` only | Your scenario already includes `UnifiedSettings` and `DuckieDebug` (for example through another mod's bundle). Paste the class alongside them, and make sure each hook calls `UnifiedSettings.<hook>(text)` above RevampedHistory's body call — the `src/` hook files mark the spot. |

Each folder's `input.js`, `context.js` and `output.js` show where the RVH calls go and where your own modifier code goes.

### Debug cards

RVH's debug level defaults to OFF (0), so it writes nothing into a player's story cards. Raise it by setting RevampedHistory's `Debug Mode` on the UnifiedSettings card to 1 (ERROR) or 2 (INFORM); a bundle can change the default at build time by overriding `RVH_DEBUG_DEFAULT_LEVEL`. Above OFF, RVH logs to DuckieDebug's shared `Duckie Debug Data` card, and `postOutput` refreshes two more story cards of type `zz_Debug`: `[RVH Debug]` lists RVH's history with retries and scriptData, and `[AID Debug]` lists AID's own history window for comparison.

---

## The `RevampedHistory` Class

All methods are `static`. You never instantiate `RevampedHistory`; you just call `RevampedHistory.<method>(...)` from your hooks.

### Hook methods

RVH's hook methods come in three phases per hook, and each hook runs them in this order:

1. **Pre** (`preInput`, `preContext`, `preOutput`) — first line of the hook. Registers RVH's settings with UnifiedSettings and does nothing else.
2. **UnifiedSettings** — `text = UnifiedSettings.<hook>(text).text;`, which loads the settings card.
3. **Body** (`input`, `context`) — processes the turn. Must come after the UnifiedSettings call and before any of your code that reads RVH. Returns `{ text }` unchanged.
4. **Your modifier scripts.**
5. **Post** (`postInput`, `postOutput`) — last line of the hook. Records the text after every other script has changed it.

Code placed above RVH's body call sees RVH's state from before this turn was processed, so read RVH only below it.

> **Changed in 2.0.0:** `preInput` and `preContext` used to process the turn and called UnifiedSettings themselves. That work moved to `input` and `context`, and the pre methods now only register settings. Hand-wired hooks need the new body calls added (see [Minimal Hook Setup](#minimal-hook-setup)).

---

#### `RevampedHistory.preInput(text)` / `preContext(text)` / `preOutput(text)`

**Hooks:** `onInput` / `onModelContext` / `onOutput` — first line.

Register RVH's `Debug Mode` setting with UnifiedSettings. Return nothing.

---

#### `RevampedHistory.input(text)`

**Hook:** `onInput` — after `UnifiedSettings.input`, before your own logic.

Classifies the navigation event (new action, retry, rewind, or redo), updates `state.rvh` accordingly, and captures the raw player text and inferred action type. Returns `{ text }` unchanged.

---

#### `RevampedHistory.postInput(text)`

**Hook:** `onInput` — call **after** all your modifications, as the last line.

Commits the final player text (post-modification) to the pending player action record. Returns nothing.

---

#### `RevampedHistory.context(text)`

**Hook:** `onModelContext` — after `UnifiedSettings.context`, before your own logic.

Prepares the AI-action slot and increments the action counter for non-retry turns. On a retry it removes the AI response being retried from history and holds it as a retry of the pending response. When the player pressed Continue (so `onInput` never ran), this is where RVH classifies the turn — including a retry of a Continue — and handles any rewind or redo. Returns `{ text }` unchanged.

---

#### `RevampedHistory.postOutput(text)`

**Hook:** `onOutput` — call **after** all your own logic, as the last line.

Commits the player action and AI response pair into history. On a retry it commits only the new AI response, carrying the previous responses in its `retries`. Clears the turn's pending actions and its capture and ambiguity signals. Returns nothing.

---

### Turn inspection

These methods let you query what kind of turn is currently in progress. Safe to call from any hook after `input` or `context` has run.

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

Returns a read-only snapshot of the AI action that is currently in-flight (after `context` has run), or `null` if not yet set or already committed.

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

#### `RevampedHistory.getFirstActionIndex()`

Returns the action count of `history[0]` — the offset between history array indices and action counts. `0` when tracking began at the start of the adventure and nothing has been evicted; higher after the oldest entries are evicted by `historyMaxLength`, or when RVH was added mid-story (see [Captured history](#captured-history)). Returns `0` if RVH is not initialized.

---

### Script data

Each history entry carries a `scriptData` object where your mod can attach arbitrary metadata. Entries are namespaced by mod name so multiple mods can coexist safely.

---

#### `RevampedHistory.setPlayerScriptData(namespace, key, value)`

Write to the current pending player action's `scriptData`. Call during `onInput`, after `RevampedHistory.input` and before `postInput`. Has no effect if no player action is pending.

```js
// onInput — tag the player's action with your mod's data
text = RevampedHistory.input(text).text;
RevampedHistory.setPlayerScriptData('myMod', 'mood', 'heroic');
RevampedHistory.postInput(text);
```

The data survives into the committed history entry and can later be read with `RevampedHistory.getScriptData()`.

---

#### `RevampedHistory.setAiScriptData(namespace, key, value)`

Write to the current pending AI action's `scriptData`. Call during `onOutput` (before `postOutput`). Has no effect if no AI action is pending.

```js
// onOutput — annotate the AI response before it's committed
RevampedHistory.setAiScriptData('myMod', 'tone', 'dramatic');
RevampedHistory.postOutput(text);
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

#### `RevampedHistory.setScriptDataAt(index, namespace, key, value)`

Write `scriptData` onto a committed history entry. Supports negative indexing. Intended for seeding your mod's data over entries RVH captured from AID's window (see [Captured history](#captured-history)), which arrive with empty `scriptData`.

Returns `true` on success, `false` if RVH is uninitialized, the index is out of bounds, or the namespace is blocked (`__proto__`, `constructor`, `prototype`).

```js
RevampedHistory.setScriptDataAt(-3, 'myMod', 'mood', 'neutral');
```

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

### Captured history

AID's window can hold entries RVH never saw: when RVH is added to an adventure already in progress, when `state.rvh` is lost, or when a deep rewind refills the window with entries older than anything RVH tracks. Every turn, RVH copies those entries into its history with empty `scriptData` and `actionType` taken from AID (`'other'` when AID gives none), and reports what it captured so your mod can seed its own data over them.

---

#### `RevampedHistory.getCaptureInfo()`

Returns what RVH captured from AID's window this turn, or `null` if nothing was captured. Readable from `onInput` (after `RevampedHistory.input`) through `onOutput` — or from `onModelContext` (after `RevampedHistory.context`) on a Continue turn, when `onInput` doesn't run. Cleared by `postOutput`.

```ts
{ count: number, fromActionIndex: number, reason: 'seed' | 'prepend' | 'rewind-past-tracking' }
```

| `reason` | Meaning |
|---|---|
| `'seed'` | History was empty (fresh install mid-story, or state loss) and was seeded from the window. |
| `'prepend'` | Older window entries were added in front of the tracked history. |
| `'rewind-past-tracking'` | A rewind landed at or before the first tracked entry. Tracking was cleared (and saved as an alt branch) and reseeded from the window — treat your per-entry data over that range as lost. |

The captured entries are the first `count` entries of history, starting at action count `fromActionIndex`.

```js
// onInput, after RevampedHistory.input
const cap = RevampedHistory.getCaptureInfo();
if (cap) {
  for (let i = 0; i < cap.count; i++) {
    RevampedHistory.setScriptDataAt(i, 'myMod', 'mood', 'unknown');
  }
}
```

---

### Ambiguous retry resolution

When a player retries an AI response multiple times and then accepts one, RVH uses text similarity to determine which retry they kept and promotes its `scriptData` to canonical. When another candidate scores within `AMBIGUOUS_DELTA` (0.20) of the winner — most often because the player edited the accepted response heavily, or the retries were near-identical — RVH cannot be confident it chose correctly. In these cases RVH sets `state.rvh.ambiguous` and exposes it through the following API so your mod can inspect the alternatives and apply corrections if needed.

`state.rvh.ambiguous` is set at the start of the turn (during `input`, or `context` on a Continue) and cleared automatically at the end of the turn (during `postOutput`). Your mod should check and correct it during `onInput` (after `RevampedHistory.input`) or `onModelContext` (after `RevampedHistory.context`).

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
// onInput, after RevampedHistory.input
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
| `actionCount` | `number` | RVH's action counter, kept in sync with AID's `info.actionCount` except that retries never change it. Use `RevampedHistory.getActionCount()`. |
| `firstActionIndex` | `number` | Action count of `history[0]`. Use `RevampedHistory.getFirstActionIndex()`. |
| `historyMaxLength` | `number` | Cap on `history` length. Oldest entries evicted when exceeded. Default: `1000`. |
| `altHistory` | `AltBranch[]` | Saved timeline branches from rewinds, used to restore on redo. |
| `maxAltHistories` | `number` | Max saved branches. Oldest evicted. Default: `5`. |
| `playerAction` | `PendingAction \| null` | In-flight player action for the current turn. `null` between turns. |
| `aiAction` | `PendingAction \| null` | In-flight AI action for the current turn. `null` between turns. |
| `ambiguous` | `AmbiguousResolution \| null` | Set when RVH cannot confidently resolve which retry the player kept. `null` between turns and when resolution was unambiguous. Use `RevampedHistory.haveAmbiguous()` rather than reading this directly. |
| `capture` | `object \| null` | What RVH captured from AID's window this turn. `null` between turns. Use `RevampedHistory.getCaptureInfo()`. |
| `expectedAidContinueDepth` | `number` | Internal. How many trailing Continue entries AID's history should hold next turn; a shorter run means the player retried a Continue. |

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
  actionType: string,          // 'do' | 'say' | 'story' | 'continue' | 'start' | 'other'
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
| `'other'` | A captured or backfilled entry whose type AID didn't give, or a placeholder for an action that had already left AID's window |

Captured entries otherwise take their type from AID's history, so they can be any of the values above.

---

### `AltBranch`

Each entry in `state.rvh.altHistory`:

```ts
{
  firstTurn: number,        // action count of the branch's first entry (not an array index)
  history:   HistoryEntry[], // the tail that was trimmed when the player rewound
  forkTurn?: number,        // only when the rewind landed before all tracking: the action
                            // count where the timelines split, earlier than firstTurn
}
```

On redo, RVH considers branches whose end falls within 4 actions of AID's count and picks the one whose last entries best match AID's window. A branch with `forkTurn` keeps only tracked entries before the split and fills the untracked actions between `forkTurn` and `firstTurn` from AID's window, or with empty `'other'` placeholders once the window no longer reaches them. If no branch matches, RVH appends the redone actions from AID's window instead.

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

1. **`input`** — classifies `changeType` as `'retry'`. Does **not** increment `actionCount`.
2. **`context`** — sees the pending retry and does **not** increment `actionCount`. It removes the AI response being retried from history and holds it, with any earlier retries, on the pending AI action.
3. **`postOutput`** — commits the new AI text as the canonical response, with the previous responses in its `retries[]`.

The result is that every entry in `state.rvh.history` is one action — a player action or an AI response — and `entry.retries` is an ordered log of every AI response retried away on that entry, oldest first.

A retry of a pure Continue never runs `onInput`, and the action counts alone can't tell it from a new Continue. RVH instead records after each turn how many Continue entries end AID's history (`expectedAidContinueDepth`); if the next turn finds fewer, `context` treats it as a retry.

AID runs no hooks while the player flips between retries, so RVH learns which response they kept only on the next turn, from AID's last history entry. It scores the canonical response and every retry against that entry with bigram Jaccard similarity; the highest score wins, the canonical wins ties, and a winning retry is promoted to canonical along with its `scriptData`. If any other candidate scores within `AMBIGUOUS_DELTA` (0.20) of the winner, `state.rvh.ambiguous` is set so your mod can inspect and correct the result. `scriptData` never breaks a tie.

The comparison only means something once AID's last entry and RVH's are the same action, so RVH runs it on a new action or new Continue before refreshing any edited text, after restoring history on a rewind or redo, and never on a retry.

---

## Minimal Hook Setup

The smallest working wiring, matching the shipped `readyToUse/` hook files. Other mods that bundle UnifiedSettings already make the `UnifiedSettings.<hook>` calls; keep exactly one per hook, above RevampedHistory's body call.

```js
// === Library tab: paste readyToUse/library.js here ===
// (or src/library.js if UnifiedSettings and DuckieDebug are already present — see Installing)

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

// === onModelContext ===
const modifier = (text) => {
  RevampedHistory.preContext(text);
  text = UnifiedSettings.context(text).text;
  text = RevampedHistory.context(text).text;
  // your context logic here
  return { text };
};
modifier(text);

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

## Notes

- `state.rvh` persists across sessions as part of AID's `state` object.
- RVH classifies rewinding as any event where AID's action count drops below RVH's. The trimmed tail is saved as an alt branch and restored automatically if the player redoes back to it.
- RVH tells a new action or retry from a redo by comparing the last 10 entries of both histories with bigram Jaccard similarity (threshold 0.60), stopping after more than 2 mismatches in a row. At least 70% of the compared entries must match; otherwise the turn is treated as a redo onto a different history.
- Edits to history entries (AID's own text corrections or player edits) found during that comparison are synced by a `freshenText` pass right after the turn is classified, in `input` or, on a Continue, in `context`. Older entries (more than one round back) have their text updated but their `scriptData` is never altered by `freshenText` — only the most recent round's entries are eligible for retry promotion.
- Namespace buckets created by `setPlayerScriptData` / `setAiScriptData` use `Object.create(null)` (no prototype), and the names `__proto__`, `constructor`, and `prototype` are blocked. This prevents a misbehaving mod from polluting `Object.prototype`.