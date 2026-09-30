# Revamped History (RVH)

> A longer, retry-aware story history for AI Dungeon scripts, with room for your script's data on every action

by helpfulduckie (aka Aness)

---

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Getting Started](#getting-started)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Credits](#credits)

---

## Overview

Revamped History is a library for AI Dungeon script authors. It keeps its own record of the story in `state`, alongside AID's, and fixes three things that make turn-based scripting hard:

- **AID's `history` holds only the last 100 actions.** With short turns and a large context, that's less than the model sees. RVH keeps up to 1000 (configurable).
- **AID's `info.actionCount` can't tell a retry from a new turn.** A retry adds one to it before `onModelContext` and takes it back after `onOutput`, so while a retry's hooks run it reads the same as a new Continue, and anything a script does "once per turn" happens again on every retry. RVH classifies every turn as new, retry, rewind or redo, and keeps a count that retries don't move.
- **AID gives scripts nowhere to attach data to a single action.** RVH gives every entry a `scriptData` object, namespaced per script, that stays with the entry through retries, rewinds and redos.

### Features

- **Turn classification** — `new`, `retry`, `rewind`, `redo` or `start`, available from the start of every turn.
- **Per-action script data** that moves with the history: retried responses keep theirs, rewound entries are saved and restored on redo, and the response the player keeps after retrying brings its data with it.
- **Retry memory** — every retried response is kept, not discarded, and RVH works out which one the player kept.
- **Rewind and redo** — rewound branches are saved (five by default) and restored when the player redoes.
- **Mid-adventure installs** — RVH fills in the actions it missed from AID's window and tells your script which entries those are.
- **Plays well with others** — per-script namespaces, a read-only history API, and settings and debug output through UnifiedSettings and DuckieDebug.

### Who it's for

RVH is for people writing AI Dungeon scripts. Players and scenario authors get it bundled inside scripts that use it: [World Time Generator](https://github.com/helpfulduckie/World-Time-Generator-3) is built on RVH, and uses it to hold its clock steady on retries and wind it back on rewinds.

---

## Installation

RVH needs two other libraries at runtime: **UnifiedSettings**, for its settings card, and **DuckieDebug**, for debug output. The release comes in two builds:

| Folder | Library tab contains | Use when |
|---|---|---|
| `readyToUse/` | UnifiedSettings, DuckieDebug and RevampedHistory | You're starting a scenario from scratch, or no other script in it already includes UnifiedSettings and DuckieDebug. |
| `src/` | RevampedHistory only | The scenario already has UnifiedSettings and DuckieDebug, for example from another script. |

> Don't mix files from the two folders. Each folder's `library.js`, `input.js`, `context.js` and `output.js` belong together.

### Install steps

1. Open your scenario on [AI Dungeon](https://aidungeon.com/) in a desktop browser, go to **Details**, scroll to **Scripting**, turn on **Scripts Enabled** and click **Edit Scripts**.
2. Paste each file from the folder you chose into the matching tab:

| Script Tab | File |
|---|---|
| Library | `library.js` |
| Input | `input.js` |
| Context | `context.js` |
| Output | `output.js` |

3. With `src/`, add the `UnifiedSettings.<hook>(text)` call to each hook where the comment marks it, unless another script's hooks already make it. There should be exactly one per hook.
4. Save.

Your own code goes in the same Library, Input, Context and Output tabs, at the places the comments mark.

### Where your code goes

Each hook tab runs in this order. RVH processes the turn in its **body** call, so any code that reads RVH must come after it:

```js
// onInput
const modifier = (text) => {
  RevampedHistory.preInput(text);             // 1. pre: registers RVH's settings
  text = UnifiedSettings.input(text).text;    // 2. loads the settings card
  text = RevampedHistory.input(text).text;    // 3. body: RVH processes the turn
  // 4. your code — RVH's view of this turn is ready here
  RevampedHistory.postInput(text);            // 5. post: records the final text
  return { text };
};
modifier(text);
```

`onModelContext` has the same shape with `preContext`, `UnifiedSettings.context` and `RevampedHistory.context`, and no post call. `onOutput` has `preOutput`, `UnifiedSettings.output`, your code, then `RevampedHistory.postOutput` last. The [API Reference](./documentation/API-Reference.md#minimal-hook-setup) has all three tabs.

### Debug cards

RVH's debug output is off by default. To turn it on, set `Debug Mode` under RevampedHistory on the UnifiedSettings card to `1` (errors) or `2` (everything). The card is titled `Unified Settings` in RVH's own builds; a script may rename it (WTG's is `Configure WTG`). With debug on, RVH writes to the shared `Duckie Debug Data` card and keeps two more up to date: `[RVH Debug]`, RVH's history with retries and scriptData, and `[AID Debug]`, AID's own history for comparison.

---

## Getting Started

This section builds a small script: a bomb that goes off after ten AI responses. It's the kind of mechanic RVH exists for, a number that should tick once per turn.

### The version without RVH

```js
// Library tab
function bombOutput(text) {
  if (state.bombTurnsLeft === undefined) state.bombTurnsLeft = 10;
  if (state.bombTurnsLeft <= 0) return { text };
  state.bombTurnsLeft--;
  text += state.bombTurnsLeft > 0
    ? `\n\n[The bomb will go off in ${state.bombTurnsLeft} turns.]`
    : '\n\n[BOOM. The bomb goes off.]';
  return { text };
}
```

This works until the player retries. AID runs `onOutput` again for every retry, so the fuse burns down once per retry, not once per turn. Rewinding only makes this worse, leaving your player's bomb at whatever state it was in rather than rewinding with their narrative. 

### The version with RVH

Store the count on each AI response instead of in `state`, and read it back from the latest response that has one:

```js
// Library tab, after the RevampedHistory library

const BOMB_FUSE = 10;

// Latest value of namespace.key on any committed entry, or fallback if none has it.
function lastScriptValue(namespace, key, fallback) {
  const found = RevampedHistory.findEntry(
    (entry, i) => RevampedHistory.getScriptData(i, namespace, key) !== undefined
  );
  return found ? RevampedHistory.getScriptData(found.index, namespace, key) : fallback;
}

function bombOutput(text) {
  const before = lastScriptValue('bomb', 'turnsLeft', BOMB_FUSE);
  if (before <= 0) return { text };            // already gone off
  const turnsLeft = before - 1;
  RevampedHistory.setAiScriptData('bomb', 'turnsLeft', turnsLeft);
  text += turnsLeft > 0
    ? `\n\n[The bomb will go off in ${turnsLeft} turns.]`
    : '\n\n[BOOM. The bomb goes off.]';
  return { text };
}
```

```js
// Output tab
const modifier = (text) => {
  RevampedHistory.preOutput(text);
  text = UnifiedSettings.output(text).text;
  text = bombOutput(text).text;
  RevampedHistory.postOutput(text);
  return { text };
};
modifier(text);
```

### What each version does

| The player... | Without RVH | With RVH |
|---|---|---|
| Takes a turn | 9 | 9 |
| Takes another turn | 8 | 8 |
| Retries that response three times | 5 | 8 |
| Takes another turn | 4 | 7 |
| Rewinds back to the turn the count down started and takes another turn | 3 | 9 |
| Undoes the rewind and then retries | 2 | 7 | 

It works because RVH moves the stored values along with the history:

- **On a retry,** RVH removes the retried response from history before your code runs, so `lastScriptValue` finds the previous turn's count, and the new response gets the same number the retried one had.
- **On a rewind,** the rewound responses are gone from history, and their counts with them.
- **On a redo,** RVH restores the rewound responses with their counts.
- **When the script is added mid-adventure,** no entry has a count yet, so the fuse starts at `BOMB_FUSE`.

The same shape works for a hunger meter, a passive clock, or anything else that should change once per turn. The [Guide](./documentation/Guide.md) covers those, events that should happen only once, and what happens to your data in every case.

---

## Troubleshooting

### `getCurrentChangeType()` returns `null`, or RVH seems a turn behind

RVH processes the turn in `RevampedHistory.input` (or `RevampedHistory.context` when the player pressed Continue or Retry, since AID doesn't run `onInput` for those); anything that runs before that sees the state from before the turn. 

Check where RVH is relative to your script and move your code below RVH, as in [Where your code goes](#where-your-code-goes).

### My counter still changes on a retry

It's probably kept in `state`. Keep it in `scriptData` on the turn's AI response and read it back from history, as in [Getting Started](#getting-started).

### My script's data disappeared

Some events leave entries without your data: a redo RVH had no saved branch for, a rewind past everything RVH tracked, a mid-adventure install, or old entries dropped at the 1000-entry cap. The Guide's [What Happens to scriptData](./documentation/Guide.md#what-happens-to-scriptdata) lists each one. Read with a fallback, and use [`getCaptureInfo()`](./documentation/API-Reference.md#revampedhistorygetcaptureinfo) to reseed data if your script needs it on old entries.

### I read the wrong entry

History indices aren't action counts, and positive indices shift when old entries are dropped. Use negative indices, `findEntry`, or a marker in `scriptData`. See [Indices and Action Counts](./documentation/Guide.md#indices-and-action-counts).

### Changing `Debug Mode` does nothing

Check that each hook calls `UnifiedSettings.<hook>(text)`, above RVH's body call. Without it RVH can't read its settings and stays at the default, off.

### RVH kept the wrong retry's data

When the retries are too similar to tell apart, RVH flags the turn so your script can correct it. See [Ambiguous Retry Resolution](./documentation/API-Reference.md#ambiguous-retry-resolution).

---

## Documentation

- **[Guide](./documentation/Guide.md)** — the core pattern, what happens to your data on each kind of turn, recipes, and how RVH detects turns.
- **[API Reference](./documentation/API-Reference.md)** — every method, and the internals of `state.rvh`.
- **[Changelog](./CHANGELOG.md)** — what changed in each version, including upgrading to 2.0.0.

---

## Credits

**Revamped History** by helpfulduckie (aka Aness) — 2026

**Built on**
- UnifiedSettings and DuckieDebug by helpfulduckie

**License:** MIT — see the [LICENSE](./LICENSE) file.
