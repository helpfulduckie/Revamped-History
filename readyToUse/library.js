// ============================================================
// ===== RevampedHistory (ready to use) - 1.5.0 - library =====
// ============================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@2.0.0
// - RevampedHistory@1.5.0
// ============================================================
// Paste this ONLY into the library tab in AI Dungeon scripting
// ============================================================

class UnifiedSettings {
  static #lib = (() => {
    // In the AID built class, extractAllFunctions() skips these non-function lines;
    // a companion state file provides the same names in #lib and rewriteLibCalls()
    // rewrites all references to use #lib.name inside the class body.
    let _registry = {};
    // Shape: {
    //    [modName]: {
    //      description,
    //      card,
    //      field,     // 'entry' | 'description' | '' (empty = inherit default)
    //      position,  // 1–9 (decimals OK); render order on card; default 5; insertion order breaks ties
    //      groups: {
    //        [groupName]: {
    //          description,
    //          card,
    //          field,     // overrides mod field; '' = inherit
    //          position,  // 1–9 (decimals OK); render order within mod; default 5
    //          settings: [
    //            {internalKey, key, defaultValue, description, valueType}
    //          ]
    //        }
    //      }
    //    }
    //  }
    
    const _defaultCard  = "Unified Settings";
    const _defaultGroup = "main";
    const _defaultField = "entry";
    
    // ===========================================================================
    // CORE UTILITIES
    // ===========================================================================
    
    /**
     * Normalizes a raw value string against the canonical default for that setting.
     * Type is inferred from the default value:
     *   "true"/"false"      → boolean (synonyms accepted; normalised to "true"/"false")
     *   parseable as float  → numeric (preserved as-is if valid, else null)
     *   anything else       → string  (trimmed; always succeeds)
     * Returns null when the raw value is invalid for the inferred type.
     * @param {string} rawValue
     * @param {string} defaultValue
     * @returns {string|null}
     */
    function _normalizeValue(rawValue, defaultValue) {
      const raw = (rawValue ?? '').trim();
      const def = (defaultValue ?? '').trim();
    
      if (/^\[[\s\S]*\]$/.test(def)) {
        const parsed = _parseArray(raw);
        if (parsed === null) return null;
        return _serializeArray(parsed);
      }
    
      if (/^(true|false)$/i.test(def)) {
        if (/^(true|yes|on|t|1|enable|enabled)$/i.test(raw))    return 'true';
        if (/^(false|no|off|f|0|disable|disabled)$/i.test(raw)) return 'false';
        return null;
      }
    
      const defFloat = parseFloat(def);
      if (!isNaN(defFloat) && isFinite(defFloat)) {
        const n = parseFloat(raw);
        if (!isNaN(n) && isFinite(n)) return raw;
        return null;
      }
    
      // Backtick-wrapped string: strip the delimiters and preserve interior content.
      if (raw[0] === '`' && raw[raw.length - 1] === '`' && raw.length >= 2) {
        return raw.slice(1, -1);
      }
    
      return raw;
    }
    
    /**
     * Parses an array literal string into an array of strings.
     * Syntax: [ item1, "item, with comma", `item with "quote"` ]
     * Backtick-quoted items may contain double-quotes.
     * Double-quoted items may contain commas and brackets.
     * Unquoted items are trimmed.
     * Returns null on malformed input.
     * @param {string} raw
     * @returns {string[]|null}
     */
    function _parseArray(raw) {
      const s = (raw || '').trim();
      if (s[0] !== '[' || s[s.length - 1] !== ']') return null;
      const inner = s.slice(1, -1);
      if (inner.trim() === '') return [];
    
      const result = [];
      let i = 0;
    
      while (i <= inner.length) {
        // skip whitespace
        while (i < inner.length && /\s/.test(inner[i])) i++;
        if (i >= inner.length) break;
    
        const ch = inner[i];
        if (ch === '`') {
      // backtick-quoted: read until closing `
          i++;
          const start = i;
          while (i < inner.length && inner[i] !== '`') i++;
      if (i >= inner.length) return null; // unclosed
      result.push(inner.slice(start, i));
      i++; // consume closing `
        } else if (ch === '"') {
          // double-quoted: read until closing "
          i++;
          const start = i;
          while (i < inner.length && inner[i] !== '"') i++;
          if (i >= inner.length) return null; // unclosed
          result.push(inner.slice(start, i));
          i++; // consume closing "
        } else {
          // unquoted: read until comma
          const start = i;
          while (i < inner.length && inner[i] !== ',') i++;
          result.push(inner.slice(start, i).trim());
        }
    
        // after item: skip whitespace, then expect comma or end
        while (i < inner.length && /\s/.test(inner[i])) i++;
        if (i >= inner.length) break;
        if (inner[i] !== ',') return null; // unexpected character
        i++; // consume comma
      }
    
      return result;
    }
    
    /**
     * Serializes a string array to canonical array literal form.
     * Items containing newlines or " are backtick-quoted.
     * Items containing , [ or ] are double-quoted.
     * Other items are written bare.
     * @param {string[]} arr
     * @returns {string}
     */
    function _serializeArray(arr) {
      const parts = arr.map(function(item) {
        if (item.indexOf('\n') !== -1 || item.indexOf('"') !== -1)       return '`' + item + '`';
        if (item.indexOf(',') !== -1 || item.indexOf('[') !== -1 || item.indexOf(']') !== -1) return '"' + item + '"';
        return item;
      });
      return '[' + parts.join(', ') + ']';
    }
    
    // Strips a string to lowercase alpha only for fuzzy title comparison.
    function _simplify(s) {
      return (s || '').toLowerCase().replace(/[^a-z]+/g, '');
    }
    
    /**
     * Bargain-bin Levenshtein — adapted from Inner Self Config.get().
     * Returns true when current and target differ by at most maxMistakes
     * insertions, deletions, or substitutions (on the simplified strings).
     * @param {string} current   Simplified card title to test
     * @param {string} target    Simplified target title
     * @param {number} maxMistakes
     * @returns {boolean}
     */
    function _fuzzyMatchTitle(current, target, maxMistakes) {
      if (maxMistakes === undefined) maxMistakes = 2;
      let mistakes = 0;
      let t = 0;
      let c = 0;
      while (t < target.length && c < current.length) {
        if (current[c] === target[t]) {
          t++; c++;
          continue;
        }
        if (maxMistakes <= mistakes) return false;
        mistakes++;
        if      (current[c + 1] === target[t]) c++;
        else if (current[c] === target[t + 1]) t++;
        else { t++; c++; }
      }
      mistakes += (target.length - t) + (current.length - c);
      return mistakes <= maxMistakes;
    }
    
    /**
     * Finds a storycard whose title fuzzy-matches the given title.
     * Returns the card object or null if not found.
     * @param {string} title
     * @returns {Object|null}
     */
    function _fuzzyFindCard(title) {
      const target = _simplify(title);
      for (let i = 0; i < storyCards.length; i++) {
        const card = storyCards[i];
        if (!card || typeof card.title !== 'string') continue;
        if (_fuzzyMatchTitle(_simplify(card.title), target)) return card;
      }
      return null;
    }
    
    /**
     * Parses `> Key: Value` (and plain `Key: Value`) lines from card entry text.
     * First occurrence of each key wins (deduplicates).
     * Values that start with `[` but have no matching `]` on the same line are
     * continued across subsequent lines until the bracket is closed.
     * @param {string} entryText
     * @returns {Object} Plain key→rawValue map
     */
    function _parseCardEntry(entryText) {
      const parsed = {};
      const lines = (entryText || '').split('\n');
      let i = 0;
      while (i < lines.length) {
        const stripped = lines[i].replace(/^>\s*/, '');
        i++;
        const colon = stripped.indexOf(':');
        if (colon === -1) continue;
        const key = stripped.slice(0, colon).trim();
        let val = stripped.slice(colon + 1).trim();
        if (!key) continue;
    
        // Consume continuation lines for multi-line values.
        if (val[0] === '[') {
          // Array: keep reading until the closing ] appears.
          while (val.indexOf(']') === -1 && i < lines.length) {
            val += '\n' + lines[i];
            i++;
          }
        } else if (val[0] === '`') {
      // Backtick string: keep reading until a second ` appears.
          while (val.indexOf('`', 1) === -1 && i < lines.length) {
        val += '\n' + lines[i];
        i++;
      }
    }

    if (!(key in parsed)) parsed[key] = val;
  }
  return parsed;
}

/**
 * Parses a card field into sections keyed by mod name and group name.
 * Section boundaries are `- ModName` and `-- GroupName` header lines.
 * The `|` separator splits the name from an optional description.
 * Old-format cards using ` - ` as separator are also handled.
 * @param {string} entryText
 * @returns {Object} { [modName]: { [groupName]: { [key]: rawValue } } }
 */

function _parseCardSections(entryText) {
  const sections = {};
  let currentMod = null;
  let currentGroup = _defaultGroup;
  const lines = (entryText || '').split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]; i++;
    if (/^-(?!-)\s/.test(line)) {
      const rest = line.slice(line.indexOf(' ') + 1).trim();
      const sep = rest.indexOf(' | ');
      currentMod = sep !== -1 ? rest.slice(0, sep) : rest;
      currentGroup = _defaultGroup;
      if (!sections[currentMod]) sections[currentMod] = {};
      if (!sections[currentMod][currentGroup]) sections[currentMod][currentGroup] = {};
      continue;
    }
    if (/^--\s/.test(line)) {
      if (!currentMod) continue;
      const rest = line.slice(line.indexOf(' ') + 1).trim();
      const sep = rest.indexOf(' | ');
      currentGroup = sep !== -1 ? rest.slice(0, sep) : rest;
      if (!sections[currentMod][currentGroup]) sections[currentMod][currentGroup] = {};
      continue;
    }
    if (currentMod === null) continue;
    const stripped = line.replace(/^>\s*/, '');
    const colon = stripped.indexOf(':');
    if (colon === -1) continue;
    const key = stripped.slice(0, colon).trim();
    let val = stripped.slice(colon + 1).trim();
    if (!key) continue;
    if (val[0] === '[') {
      while (val.indexOf(']') === -1 && i < lines.length) { val += '\n' + lines[i]; i++; }
    } else if (val[0] === '`') {
          while (val.indexOf('`', 1) === -1 && i < lines.length) { val += '\n' + lines[i]; i++; }
    }
    const target = sections[currentMod][currentGroup];
    if (!(key in target)) target[key] = val;
  }
  return sections;
}

// Returns the string with all regex special characters escaped.

function _escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns the effective card title for a given mod+group pair.

function _effectiveCard(modName, groupName) {
  const modData   = _registry[modName];
  const groupData = modData && modData.groups && modData.groups[groupName];
  return (groupData && groupData.card) || (modData && modData.card) || _defaultCard;
}

// Returns the effective card field ('entry' or 'description') for a given mod+group pair.

function _effectiveField(modName, groupName) {
  const modData   = _registry[modName];
  const groupData = modData && modData.groups && modData.groups[groupName];
  return (groupData && groupData.field) || (modData && modData.field) || _defaultField;
}

// ===========================================================================
// STATE CACHE HELPERS
// ===========================================================================

function _ensureState() {
  if (!state.unifiedSettings || typeof state.unifiedSettings !== 'object') {
    state.unifiedSettings = {};
  }
  return state.unifiedSettings;
}

function _getCached(modName, groupName, internalKey) {
  const us = _ensureState();
  return (us[modName] && us[modName][groupName]) ? us[modName][groupName][internalKey] : undefined;
}

function _setCached(modName, groupName, internalKey, value) {
  const us = _ensureState();
  if (!us[modName])            us[modName] = {};
  if (!us[modName][groupName]) us[modName][groupName] = {};
  us[modName][groupName][internalKey] = value;
}

// ===========================================================================
// REGISTRY STATE ACCUMULATION
// ===========================================================================

/**
 * Merges state.unifiedSettings._registry into the module-level _registry.
 * Called at the top of ensureSettingCardsExist so registrations from prior
 * hooks (which reset the module-level _registry on re-evaluation) are
 * restored. Existing _registry entries are not overwritten.
 */

function _mergeStateRegistryIntoLocal() {
  const us = _ensureState();
  const sr = us._registry;
  if (!sr || typeof sr !== 'object') return;
  for (const modName of Object.keys(sr)) {
    const sm = sr[modName];
    if (!_registry[modName]) {
      _registry[modName] = {
        description: sm.description || '',
        card:        sm.card        || _defaultCard,
        field:       sm.field       || '',
        position:    typeof sm.position === 'number' ? sm.position : 5,
        groups:      {},
      };
    }
    const lm = _registry[modName];
    const sg = sm.groups || {};
    for (const groupName of Object.keys(sg)) {
      const sgroup = sg[groupName];
      if (!lm.groups[groupName]) {
        lm.groups[groupName] = {
          description: sgroup.description || '',
          card:        sgroup.card        || null,
          field:       sgroup.field       || '',
          position:    typeof sgroup.position === 'number' ? sgroup.position : 5,
          settings:    [],
        };
      }
      const lgroup = lm.groups[groupName];
      for (const setting of (sgroup.settings || [])) {
        if (!lgroup.settings.find(function(s) { return s.internalKey === setting.internalKey; })) {
          lgroup.settings.push({
            internalKey:  setting.internalKey,
            key:          setting.key,
            defaultValue: setting.defaultValue,
            description:  setting.description  || '',
            valueType:    setting.valueType     || null,
          });
        }
      }
    }
  }
}

/**
 * Serializes the current module-level _registry into state.unifiedSettings._registry.
 * Called after _mergeStateRegistryIntoLocal so this hook's new registrations
 * are persisted for future hooks.
 */

function _saveLocalRegistryToState() {
  const us = _ensureState();
  us._registry = JSON.parse(JSON.stringify(_registry));
}

// ===========================================================================
// CARD RENDERING
// ===========================================================================

/**
 * Builds the canonical text for the given card title and field.
 * Iterates the registry in insertion order; only includes mods/groups whose
 * effective card matches cardTitle AND effective field matches field.
 * Values are drawn from the state cache, falling back to the registered default.
 * @param {string} cardTitle
 * @param {string} [field]  'entry' or 'description'; defaults to _defaultField
 * @returns {string}
 */

function _renderCardField(cardTitle, field) {
  if (!field) field = _defaultField;
  const lines = [];

  // Build sorted mod entries.
  const modEntries = Object.keys(_registry)
    .map(function(modName, idx) { return { kind: 'mod', modName: modName, idx: idx }; })
    .filter(function(e) {
      return Object.keys(_registry[e.modName].groups).some(function(g) {
        return _effectiveCard(e.modName, g) === cardTitle &&
               _effectiveField(e.modName, g) === field &&
               _registry[e.modName].groups[g].settings.length > 0;
      });
    })
    .map(function(e) {
      const pos = _registry[e.modName].position !== undefined ? _registry[e.modName].position : 5;
      return { kind: 'mod', modName: e.modName, idx: e.idx, position: pos };
    });

  // Build sorted text block entries from state.
  // State shape: _textblocks[cardTitle][field][modName][key] = { text, position }
  const us = _ensureState();
  const tbState = us._textblocks;
  const byMod = (tbState && tbState[cardTitle] && tbState[cardTitle][field]) || {};
  const rawBlocks = [];
  for (const modName of Object.keys(byMod)) {
    for (const key of Object.keys(byMod[modName])) {
      rawBlocks.push(byMod[modName][key]);
    }
  }
  const textEntries = rawBlocks.map(function(b, idx) {
    return { kind: 'text', text: b.text, idx: modEntries.length + idx, position: typeof b.position === 'number' ? b.position : 5 };
  });

  // Merge and sort by position then insertion index.
  const allEntries = modEntries.concat(textEntries).sort(function(a, b) {
    return a.position !== b.position ? a.position - b.position : a.idx - b.idx;
  });

  for (let ei = 0; ei < allEntries.length; ei++) {
    const entry = allEntries[ei];
    if (ei > 0) { lines.push(''); lines.push(''); }

    if (entry.kind === 'text') {
      lines.push(entry.text);
      continue;
    }

    const modName = entry.modName;
    const modData = _registry[modName];

    const relevantGroups = Object.keys(modData.groups)
      .map(function(groupName, idx) { return { groupName: groupName, idx: idx }; })
      .filter(function(e) {
        return _effectiveCard(modName, e.groupName) === cardTitle &&
               _effectiveField(modName, e.groupName) === field &&
               modData.groups[e.groupName].settings.length > 0;
      })
      .sort(function(a, b) {
        const pa = modData.groups[a.groupName].position !== undefined ? modData.groups[a.groupName].position : 5;
        const pb = modData.groups[b.groupName].position !== undefined ? modData.groups[b.groupName].position : 5;
        return pa !== pb ? pa - pb : a.idx - b.idx;
      })
      .map(function(e) { return e.groupName; });

    lines.push('- ' + modName + (modData.description ? ' | ' + modData.description : ''));

    for (let gi = 0; gi < relevantGroups.length; gi++) {
      const groupName = relevantGroups[gi];
      const groupData = modData.groups[groupName];

      if (gi > 0) lines.push('');

      if (groupName !== _defaultGroup) {
        lines.push('-- ' + groupName + (groupData.description ? ' | ' + groupData.description : ''));
      }

      for (let si = 0; si < groupData.settings.length; si++) {
        const setting = groupData.settings[si];
        if (setting.description) lines.push(setting.description);
        const value = _getCached(modName, groupName, setting.internalKey);
        const display = value !== undefined ? value : setting.defaultValue;
        const rendered = (display.indexOf('\n') !== -1 && display[0] !== '[') ? '`' + display + '`' : display;
            lines.push('> ' + setting.key + ': ' + rendered);
          }
        }
      }
      return lines.join('\n');
    }
    return { _normalizeValue, _parseArray, _serializeArray, _simplify, _fuzzyMatchTitle, _fuzzyFindCard, _parseCardEntry, _parseCardSections, _escapeRegex, _effectiveCard, _effectiveField, _ensureState, _getCached, _setCached, _mergeStateRegistryIntoLocal, _saveLocalRegistryToState, _renderCardField, _registry, _defaultCard, _defaultGroup, _defaultField };
  })();

  static input(text) {
    UnifiedSettings.ensureSettingCardsExist();
    return { text };
  }

  static context(text) {
    UnifiedSettings.ensureSettingCardsExist();
    return {text};
  }

  static output(text) {
    UnifiedSettings.ensureSettingCardsExist();
    return { text };
  }

  static defineMod(modName, description, card, field, position) {
    if (!UnifiedSettings.#lib._registry[modName]) {
      UnifiedSettings.#lib._registry[modName] = {
        description: description || '',
        card:        card || UnifiedSettings.#lib._defaultCard,
        field:       field || '',
        position:    typeof position === 'number' ? position : 5,
        groups:      {},
      };
    } else {
      if (description !== undefined)        UnifiedSettings.#lib._registry[modName].description = description;
      if (card        !== undefined)        UnifiedSettings.#lib._registry[modName].card        = card;
      if (field       !== undefined)        UnifiedSettings.#lib._registry[modName].field       = field;
      if (typeof position === 'number')     UnifiedSettings.#lib._registry[modName].position    = position;
    }
  }

  static defineGroup(modName, groupName, description, card, field, position) {
    if (!UnifiedSettings.#lib._registry[modName]) UnifiedSettings.defineMod(modName, '', UnifiedSettings.#lib._defaultCard);
    const groups = UnifiedSettings.#lib._registry[modName].groups;
    if (!groups[groupName]) {
      groups[groupName] = {
        description: description || '',
        card:        card || null,
        field:       field || '',
        position:    typeof position === 'number' ? position : 5,
        settings:    [],
      };
    } else {
      if (description !== undefined)    groups[groupName].description = description;
      if (card        !== undefined)    groups[groupName].card        = card;
      if (field       !== undefined)    groups[groupName].field       = field;
      if (typeof position === 'number') groups[groupName].position    = position;
    }
  }

  static defineSettings(settingObj) {
    if (!settingObj || !settingObj.modName || !settingObj.setting) return;
    const modName   = settingObj.modName;
    const groupName = settingObj.group || UnifiedSettings.#lib._defaultGroup;
    const card      = settingObj.card  || null;
    const field     = settingObj.field || null;
  
    if (!UnifiedSettings.#lib._registry[modName]) UnifiedSettings.defineMod(modName, '', card || UnifiedSettings.#lib._defaultCard);
    if (!UnifiedSettings.#lib._registry[modName].groups[groupName]) UnifiedSettings.defineGroup(modName, groupName, '', card, field);
  
    const groupSettings = UnifiedSettings.#lib._registry[modName].groups[groupName].settings;
    for (const internalKey of Object.keys(settingObj.setting)) {
      const def = settingObj.setting[internalKey];
      if (!groupSettings.find(function(s) { return s.internalKey === internalKey; })) {
        groupSettings.push({
          internalKey:  internalKey,
          key:          def.key,
          defaultValue: String(def.defaultValue != null ? def.defaultValue : ''),
          description:  def.description || '',
          valueType:    def.valueType   || null,
        });
      }
    }
  }

  static ensureSettingCardsExist() {
    // Restore registrations from prior hooks (module-level UnifiedSettings.#lib._registry resets each hook).
    UnifiedSettings.#lib._mergeStateRegistryIntoLocal();
  
    // Collect unique card titles and the set of fields used on each card.
    const cardFields = {}; // cardTitle → Set of field strings
    for (const modName of Object.keys(UnifiedSettings.#lib._registry)) {
      for (const groupName of Object.keys(UnifiedSettings.#lib._registry[modName].groups)) {
        if (UnifiedSettings.#lib._registry[modName].groups[groupName].settings.length > 0) {
          const cardTitle = UnifiedSettings.#lib._effectiveCard(modName, groupName);
          const field     = UnifiedSettings.#lib._effectiveField(modName, groupName);
          if (!cardFields[cardTitle]) cardFields[cardTitle] = new Set();
          cardFields[cardTitle].add(field);
        }
      }
    }
  
    // Also include fields that have text blocks but no settings registrations,
    // so text-only fields are rendered even when no settings exist for them.
    const usForTB = UnifiedSettings.#lib._ensureState();
    if (usForTB._textblocks) {
      for (const cardTitle of Object.keys(usForTB._textblocks)) {
        for (const field of Object.keys(usForTB._textblocks[cardTitle])) {
          if (!cardFields[cardTitle]) cardFields[cardTitle] = new Set();
          cardFields[cardTitle].add(field);
        }
      }
    }
  
    // Persist complete registry to state so future hooks (which re-evaluate the
    // module) can restore all registrations via UnifiedSettings.#lib._mergeStateRegistryIntoLocal.
    UnifiedSettings.#lib._saveLocalRegistryToState();
  
    // Track every card+field we have ever managed so removals still trigger a
    // re-render (clearing stale content) even when the registry is now empty
    // for that card.
    const usForManaged = UnifiedSettings.#lib._ensureState();
    if (!usForManaged._managedCards) usForManaged._managedCards = {};
    for (const ct of Object.keys(cardFields)) {
      if (!usForManaged._managedCards[ct]) usForManaged._managedCards[ct] = [];
      for (const f of cardFields[ct]) {
        if (usForManaged._managedCards[ct].indexOf(f) === -1) usForManaged._managedCards[ct].push(f);
      }
    }
    for (const ct of Object.keys(usForManaged._managedCards)) {
      if (!cardFields[ct]) cardFields[ct] = new Set();
      for (const f of usForManaged._managedCards[ct]) cardFields[ct].add(f);
    }
  
    for (const cardTitle of Object.keys(cardFields)) {
      const fields = cardFields[cardTitle];
      let card = UnifiedSettings.#lib._fuzzyFindCard(cardTitle);
      const us = UnifiedSettings.#lib._ensureState();
      const byMod = (us._cardkeys && us._cardkeys[cardTitle]) || {};
      const cardKeys = Object.keys(byMod).map(function(m) { return byMod[m]; }).filter(Boolean).join(', ');
  
      if (!card) {
        addStoryCard(cardTitle);
        card = storyCards[storyCards.length - 1];
        if (card) {
          card.type = 'zz_Settings';
          card.keys = cardKeys;
          for (const field of fields) {
            card[field] = UnifiedSettings.#lib._renderCardField(cardTitle, field);
          }
        }
        continue;
      }
  
      // Parse each field and sync valid values into the state cache.
      for (const field of fields) {
        const cardText = card[field] || '';
        const sections   = UnifiedSettings.#lib._parseCardSections(cardText);
        const flatParsed = UnifiedSettings.#lib._parseCardEntry(cardText);
        for (const modName of Object.keys(UnifiedSettings.#lib._registry)) {
          const modData = UnifiedSettings.#lib._registry[modName];
          for (const groupName of Object.keys(modData.groups)) {
            if (UnifiedSettings.#lib._effectiveCard(modName, groupName) !== cardTitle) continue;
            if (UnifiedSettings.#lib._effectiveField(modName, groupName) !== field) continue;
            const groupData = modData.groups[groupName];
            const scopedParsed = (sections[modName] && sections[modName][groupName]) || {};
            for (let si = 0; si < groupData.settings.length; si++) {
              const setting  = groupData.settings[si];
              const rawValue = scopedParsed[setting.key] !== undefined
                ? scopedParsed[setting.key]
                : flatParsed[setting.key];
              if (rawValue !== undefined) {
                const normalized = UnifiedSettings.#lib._normalizeValue(rawValue, setting.defaultValue);
                if (normalized !== null) {
                  UnifiedSettings.#lib._setCached(modName, groupName, setting.internalKey, normalized);
                }
                // Invalid value: keep whatever is already in the cache (last-known-good).
              }
            }
          }
        }
        card[field] = UnifiedSettings.#lib._renderCardField(cardTitle, field);
      }
  
      card.keys = cardKeys;
  
      // Delete the card if it is now completely empty (no settings, no text
      // blocks, no keys). Also purge it from _managedCards so future hook calls
      // do not attempt to re-create it.
      const allFieldsEmpty = Array.from(fields).every(function(f) { return !card[f]; });
      if (allFieldsEmpty && !cardKeys) {
        const idx = storyCards.indexOf(card);
        if (idx !== -1) storyCards.splice(idx, 1);
        delete usForManaged._managedCards[cardTitle];
      }
    }
  }

  static getSetting(modName, groupName, internalKey) {
    const cached = UnifiedSettings.#lib._getCached(modName, groupName, internalKey);
    if (cached !== undefined) return cached;
    const groups = UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups;
    const setting = groups && groups[groupName] && groups[groupName].settings.find(function(s) {
      return s.internalKey === internalKey;
    });
    return setting ? setting.defaultValue : null;
  }

  static setSetting(modName, groupName, internalKey, rawValue) {
    const groups  = UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups;
    const setting = groups && groups[groupName] && groups[groupName].settings.find(function(s) {
      return s.internalKey === internalKey;
    });
    if (!setting) return;
  
    const normalized = UnifiedSettings.#lib._normalizeValue(String(rawValue != null ? rawValue : ''), setting.defaultValue);
    const value = normalized !== null ? normalized : String(rawValue != null ? rawValue : '');
    UnifiedSettings.#lib._setCached(modName, groupName, internalKey, value);
  
    const card = UnifiedSettings.#lib._fuzzyFindCard(UnifiedSettings.#lib._effectiveCard(modName, groupName));
    if (!card) return;
  
    const field = UnifiedSettings.#lib._effectiveField(modName, groupName);
    card[field] = UnifiedSettings.#lib._renderCardField(UnifiedSettings.#lib._effectiveCard(modName, groupName), field);
  }

  static resetSetting(modName, groupName, internalKey) {
    const groups  = UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups;
    const setting = groups && groups[groupName] && groups[groupName].settings.find(function(s) {
      return s.internalKey === internalKey;
    });
    if (!setting) return;
    UnifiedSettings.setSetting(modName, groupName, internalKey, setting.defaultValue);
  }

  static getSettingArray(modName, groupName, internalKey) {
    const raw = UnifiedSettings.getSetting(modName, groupName, internalKey);
    if (raw === null) return null;
    return UnifiedSettings.#lib._parseArray(raw);
  }

  static getModSetting(modName, internalKey) {
    return UnifiedSettings.getSetting(modName, UnifiedSettings.#lib._defaultGroup, internalKey);
  }

  static getModSettingArray(modName, internalKey) {
    return UnifiedSettings.getSettingArray(modName, UnifiedSettings.#lib._defaultGroup, internalKey);
  }

  static setModSetting(modName, internalKey, rawValue) {
    UnifiedSettings.setSetting(modName, UnifiedSettings.#lib._defaultGroup, internalKey, rawValue);
  }

  static resetModSetting(modName, internalKey) {
    UnifiedSettings.resetSetting(modName, UnifiedSettings.#lib._defaultGroup, internalKey);
  }

  static defineText(obj) {
    if (!obj || !obj.modName || !obj.key || obj.text == null) return;
    const cardTitle = obj.card || UnifiedSettings.#lib._defaultCard;
    const field     = obj.field     || UnifiedSettings.#lib._defaultField;
    const position  = typeof obj.position === 'number' ? obj.position : 5;
    const us = UnifiedSettings.#lib._ensureState();
    if (!us._textblocks)                                          us._textblocks = {};
    if (!us._textblocks[cardTitle])                               us._textblocks[cardTitle] = {};
    if (!us._textblocks[cardTitle][field])                        us._textblocks[cardTitle][field] = {};
    if (!us._textblocks[cardTitle][field][obj.modName])           us._textblocks[cardTitle][field][obj.modName] = {};
    us._textblocks[cardTitle][field][obj.modName][obj.key] = { text: obj.text, position: position };
  }

  static removeText(modName, key) {
    const us = UnifiedSettings.#lib._ensureState();
    if (!us._textblocks) return;
    for (const cardTitle of Object.keys(us._textblocks)) {
      for (const field of Object.keys(us._textblocks[cardTitle])) {
        const byMod = us._textblocks[cardTitle][field];
        if (byMod[modName]) {
          delete byMod[modName][key];
        }
      }
    }
  }

  static defineCardKeys(modName, cardTitle, text) {
    const us = UnifiedSettings.#lib._ensureState();
    if (!us._cardkeys)              us._cardkeys = {};
    if (!us._cardkeys[cardTitle])   us._cardkeys[cardTitle] = {};
    us._cardkeys[cardTitle][modName] = text;
  }

  static removeCardKeys(modName, cardTitle) {
    const us = UnifiedSettings.#lib._ensureState();
    if (us._cardkeys && us._cardkeys[cardTitle]) {
      delete us._cardkeys[cardTitle][modName];
    }
  }

  static removeSetting(modName, groupName, internalKey) {
    const groups = UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups;
    const settings = groups && groups[groupName] && groups[groupName].settings;
    if (settings) {
      const idx = settings.findIndex(function(s) { return s.internalKey === internalKey; });
      if (idx !== -1) settings.splice(idx, 1);
    }
    const us = UnifiedSettings.#lib._ensureState();
    const sr = us._registry;
    const sgroups = sr && sr[modName] && sr[modName].groups;
    const ssettings = sgroups && sgroups[groupName] && sgroups[groupName].settings;
    if (ssettings) {
      const idx = ssettings.findIndex(function(s) { return s.internalKey === internalKey; });
      if (idx !== -1) ssettings.splice(idx, 1);
    }
  }

  static removeGroup(modName, groupName) {
    if (UnifiedSettings.#lib._registry[modName] && UnifiedSettings.#lib._registry[modName].groups) {
      delete UnifiedSettings.#lib._registry[modName].groups[groupName];
    }
    const us = UnifiedSettings.#lib._ensureState();
    const sr = us._registry;
    if (sr && sr[modName] && sr[modName].groups) {
      delete sr[modName].groups[groupName];
    }
  }

  static removeMod(modName) {
    delete UnifiedSettings.#lib._registry[modName];
    const us = UnifiedSettings.#lib._ensureState();
    const sr = us._registry;
    if (sr) delete sr[modName];
  }
}

class DuckieDebug {
  static duckieDebugMode = { OFF: 0, ERROR: 1, INFORM: 2 };

  // Turn headers already written this hook run, keyed `${actionCount}|${modifierName}`.
  // Module scope resets every hook in AID, so this only dedupes across
  // instances within a single hook run.
  static #headersWritten = {};

  #level = 0;

  /**
   * @param {Object} config
   * @param {string} config.modName        Required. UnifiedSettings namespace and default line tag.
   * @param {string} [config.modDescription] Description shown for the mod on the settings card.
   *                                        Omit if your mod already calls UnifiedSettings.defineMod itself.
   * @param {string} [config.settingKey]   Display key on the settings card. Default 'Debug Mode'.
   * @param {string} [config.settingName]  Internal UnifiedSettings key. Default 'debugMode'.
   * @param {number} [config.defaultLevel] 0 OFF / 1 ERROR / 2 INFORM. Default 1.
   * @param {string} [config.cardTitle]    Debug output card. Default 'Duckie Debug Data' (shared).
   * @param {string} [config.cardType]     Default 'zz_Debug'.
   * @param {string} [config.tag]          Line prefix, rendered as `[tag] msg`. Default modName.
   * @param {number} [config.menuOrder]    UnifiedSettings menu position. Default 9.
   * @param {number} [config.maxLines]     Card entry line cap; oldest lines trimmed. Default 200.
   */
  constructor(config) {
    if (!config || !config.modName) {
      throw new Error('DuckieDebug: config.modName is required');
    }
    this.modName        = config.modName;
    this.modDescription = config.modDescription;
    this.settingKey   = config.settingKey   ?? 'Debug Mode';
    this.settingName  = config.settingName  ?? 'debugMode';
    this.defaultLevel = config.defaultLevel ?? DuckieDebug.duckieDebugMode.ERROR;
    this.cardTitle    = config.cardTitle    ?? 'Duckie Debug Data';
    this.cardType     = config.cardType     ?? 'zz_Debug';
    this.tag          = config.tag          ?? config.modName;
    this.menuOrder    = config.menuOrder    ?? 9;
    this.maxLines     = config.maxLines     ?? 200;
  }

  /**
   * Register this instance's setting with UnifiedSettings. Call in the
   * pre-hook phase, before UnifiedSettings.input/context/output runs.
   * Safe to call every hook — UnifiedSettings registration is idempotent.
   */
  preHook() {
    UnifiedSettings.defineMod(this.modName, this.modDescription, undefined, 'description', this.menuOrder);
    UnifiedSettings.defineSettings({
      modName: this.modName,
      setting: {
        [this.settingName]: { key: this.settingKey, defaultValue: this.defaultLevel, valueType: 'num' },
      },
    });
  }

  /**
   * The active debug level for this mod (0 = off, 1 = errors, 2 = all).
   * Falls back to defaultLevel when UnifiedSettings has no value yet.
   */
  getLevel() {
    // UnifiedSettings may return the value as a string (raw card text).
    const raw = UnifiedSettings.getModSetting(this.modName, this.settingName);
    const level = typeof raw === 'number' ? raw : parseFloat(raw);
    return Number.isFinite(level) ? level : this.defaultLevel;
  }

  /**
   * Set the debug level for this hook run and emit the shared turn header.
   * Call once at the start of each hook, after UnifiedSettings has run.
   * The header is written once per hook run no matter how many instances
   * share a card.
   *
   * @param {'Input'|'Context'|'Output'} modifierName
   * @param {number} [level]  Defaults to the UnifiedSettings value.
   */
  applyLevel(modifierName, level = this.getLevel()) {
    this.#level = typeof level === 'number' ? level : (level ? 2 : 0);
    if (this.#level === 0) return;
    const headerKey = `${info.actionCount}|${modifierName}|${this.cardTitle}`;
    if (DuckieDebug.#headersWritten[headerKey]) return;
    DuckieDebug.#headersWritten[headerKey] = true;
    this.#write(`Turn ${info.actionCount} - ${modifierName}`);
  }

  /**
   * Log a debug message at the given level (defaults to INFORM).
   *
   * Skipped entirely when debug is off or the message level exceeds the
   * active level. When active, the message is written to:
   *   1. The AID built-in console via log() — always available, even on crash.
   *   2. This instance's debug story card — easier to read and copy out.
   *
   * @param {string} msg
   * @param {number} [level=duckieDebugMode.INFORM]
   */
  debug(msg, level = DuckieDebug.duckieDebugMode.INFORM) {
    if (this.#level === 0 || level > this.#level) return;
    this.#write(`[${this.tag}] ${msg}`);
  }

  /** Sugar for debug(msg, ERROR). */
  error(msg)  { this.debug(msg, DuckieDebug.duckieDebugMode.ERROR); }

  /** Sugar for debug(msg, INFORM). */
  inform(msg) { this.debug(msg, DuckieDebug.duckieDebugMode.INFORM); }

  #write(line) {
    // 1. Built-in AID console (stable fallback)
    log(line);

    // 2. Debug story card (convenient to read)
    let card = storyCards.find(c => c.title === this.cardTitle);
    if (!card) {
      addStoryCard(this.cardTitle);
      card = storyCards[storyCards.length - 1];
      if (card) {
        card.type        = this.cardType;
        card.keys        = '';
        card.description = 'duckie debug output — set Debug Mode to 0 in Settings to hide';
      }
    }
    if (card) {
      const lines = card.entry ? card.entry.split('\n') : [];
      lines.push(line);
      if (lines.length > this.maxLines) lines.splice(0, lines.length - this.maxLines);
      card.entry = lines.join('\n');
    }
  }
}

class RevampedHistory {
  static #lib = (() => {
    const DEBUG_CARD_TYPE = 'zz_Debug';
    
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
    // line up, resolves which retry the player kept. Leaves actionCount at the
    // committed count; the caller adds the pending action.
    // Returns true when a rewind cleared all tracking (capture reason 'rewind-past-tracking').
    function applyRewindOrRedo(state, aidHistory, changeType, aidCount, dbg = null) {
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
    
      resolveRetryWinner(state, aidHistory, dbg);
      return rewoundPastTracking;
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
    return { updateDebugCard, updateAidDebugCard, getOrCreateCard, getStoryCardEntryByTitle, updateHistoryDebugCards, inferActionType, findHistoryMatch, classifyStateChange, trailingContinueCount, pushAction, startEntryBonus, countToIndex, trimToIndex, saveAltHistory, restoreAltHistory, restoreForkedBranch, applyRewindOrRedo, promoteRetry, resolveRetryWinner, freshenText, backfillFromAidHistory, captureUntrackedFromWindow, rvhEnsureInit, computeBigrams, jaccardSimilarity, DEBUG_CARD_TYPE, MATCH_CONFIDENCE_RATIO, LOOKBACK_WINDOW, MAX_CONSECUTIVE_MISMATCHES, AID_HISTORY_CAP, RVH_DEBUG_DEFAULT_LEVEL, AMBIGUOUS_DELTA, SIMILARITY_THRESHOLD };
  })();

  static preInput(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
  
    const dbg = new DuckieDebug({ modName: 'RevampedHistory', defaultLevel: RevampedHistory.#lib.RVH_DEBUG_DEFAULT_LEVEL });
    dbg.preHook();
    UnifiedSettings.input(text);
    dbg.applyLevel('Input');
  
    state.rvh.capture   = null; // new turn — clear last turn's capture and ambiguity signals
    state.rvh.ambiguous = null;
  
    const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
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
      RevampedHistory.#lib.captureUntrackedFromWindow(state, history, committedCount,
        changeType === 'retry' ? -1 : 0,
        rewoundPastTracking ? 'rewind-past-tracking' : undefined);
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
      changeType: 'retry',
      actionType: popped.actionType,
      text:       null,
      scriptData: {},
      retries:    [...popped.retries, { text: popped.text, actionType: popped.actionType, scriptData: popped.scriptData }],
    };
  }

  static preContext(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
  
    const dbg = new DuckieDebug({ modName: 'RevampedHistory', defaultLevel: RevampedHistory.#lib.RVH_DEBUG_DEFAULT_LEVEL });
    dbg.preHook();
    UnifiedSettings.context(text);
    dbg.applyLevel('Context');
  
    state.rvh.aiAction = { actionType: 'continue', text: null, scriptData: {} };
  
    if (state.rvh.playerAction) {
      state.rvh.aiAction.changeType = state.rvh.playerAction.changeType;
      if (state.rvh.playerAction.changeType !== 'retry') {
        dbg.inform("Player Action");
        state.rvh.actionCount++;
      } else {
        RevampedHistory.popRetryAiEntry(state);
      }
    } else {
      // Input hook didn't run this turn, so any capture or ambiguity signal is stale.
      state.rvh.capture   = null;
      state.rvh.ambiguous = null;
  
      const aidCount = info.actionCount;
      const rvhCount = state.rvh.actionCount;
  
      // Actions committed so far (AID pre-increments actionCount for the pending action).
      const committedCount = aidCount - 1;
      let rewoundPastTracking = false;
  
      if (aidCount < rvhCount || aidCount > rvhCount + 1) {
        // Counts alone say rewind or redo here; RevampedHistory.#lib.applyRewindOrRedo resolves the
        // retry winner once the history surgery has lined our last entry up with AID's.
        const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
        RevampedHistory.#lib.freshenText(state, edits);
        state.rvh.aiAction.changeType = changeType;
        rewoundPastTracking = RevampedHistory.#lib.applyRewindOrRedo(state, history, changeType, aidCount, dbg);
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
          if (changeType === 'new') RevampedHistory.#lib.resolveRetryWinner(state, history, dbg);
          RevampedHistory.#lib.freshenText(state, edits);
          state.rvh.aiAction.changeType = changeType;
          state.rvh.actionCount++;
        }
      }
  
      RevampedHistory.#lib.captureUntrackedFromWindow(state, history, committedCount, 0,
        rewoundPastTracking ? 'rewind-past-tracking' : undefined);
    }
  }

  static postInput(text) {
    state.rvh.playerAction.text = text;
  }

  static postOutput(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
  
    const dbg = new DuckieDebug({ modName: 'RevampedHistory', defaultLevel: RevampedHistory.#lib.RVH_DEBUG_DEFAULT_LEVEL });
    dbg.preHook();
    UnifiedSettings.output(text);
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
