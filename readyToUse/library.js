// ============================================================
// ===== RevampedHistory (ready to use) - 1.2.0 - library =====
// ============================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.2
// - RevampedHistory@1.2.0
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
  if (!state.unified_settings || typeof state.unified_settings !== 'object') {
    state.unified_settings = {};
  }
  return state.unified_settings;
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

  const sortedMods = Object.keys(_registry)
    .map(function(modName, idx) { return { modName: modName, idx: idx }; })
    .filter(function(e) {
      return Object.keys(_registry[e.modName].groups).some(function(g) {
        return _effectiveCard(e.modName, g) === cardTitle &&
               _effectiveField(e.modName, g) === field &&
               _registry[e.modName].groups[g].settings.length > 0;
      });
    })
    .sort(function(a, b) {
      const pa = _registry[a.modName].position !== undefined ? _registry[a.modName].position : 5;
      const pb = _registry[b.modName].position !== undefined ? _registry[b.modName].position : 5;
      return pa !== pb ? pa - pb : a.idx - b.idx;
    });

  for (let mi = 0; mi < sortedMods.length; mi++) {
    const modName = sortedMods[mi].modName;
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

    if (mi > 0) { lines.push(''); lines.push(''); }

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
    return { _normalizeValue, _parseArray, _serializeArray, _simplify, _fuzzyMatchTitle, _fuzzyFindCard, _parseCardEntry, _parseCardSections, _escapeRegex, _effectiveCard, _effectiveField, _ensureState, _getCached, _setCached, _renderCardField, _registry, _defaultCard, _defaultGroup, _defaultField };
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
  
    for (const cardTitle of Object.keys(cardFields)) {
      const fields = cardFields[cardTitle];
      let card = UnifiedSettings.#lib._fuzzyFindCard(cardTitle);
  
      if (!card) {
        addStoryCard(cardTitle);
        card = storyCards[storyCards.length - 1];
        if (card) {
          card.type = 'zz_Settings';
          card.keys = '';
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
  
      card.keys = '';
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
}

class DuckieDebug {
  static #lib = (() => {
    let _duckieDebugLevel = 0;
    
    const DUCKIE_DEBUG_CARD = 'Duckie Debug Data';
    const DUCKIE_DEBUG_TYPE = 'zz_Debug';
    const DUCKIE_DEBUG_MODE = 1
    
    const DEFAULT_SETTINGS = {
      modName: 'DuckieDebug',
      setting: {
        debugMode: { key: 'Debug Mode', defaultValue: DUCKIE_DEBUG_MODE, valueType: 'num' },
      }
    };
    
    function preHook(){
        UnifiedSettings.defineMod('DuckieDebug', 'Debug output level', undefined, undefined, 9);
        UnifiedSettings.defineSettings(DEFAULT_SETTINGS);
    }
    return { preHook, _duckieDebugLevel, DUCKIE_DEBUG_CARD, DUCKIE_DEBUG_TYPE, DUCKIE_DEBUG_MODE, DEFAULT_SETTINGS };
  })();

  static duckieDebugMode = { OFF: 0, ERROR: 1, INFORM: 2 };

  static preInput(text) {
    DuckieDebug.resetDebugMode('Input', UnifiedSettings.getModSetting('DuckieDebug', 'debugMode'));
  
    return { text };
  }

  static preContext(text) {
    DuckieDebug.resetDebugMode('Context', UnifiedSettings.getModSetting('DuckieDebug', 'debugMode'));
  
    return { text };
  }

  static preOutput(text) {
    DuckieDebug.resetDebugMode('Output', UnifiedSettings.getModSetting('DuckieDebug', 'debugMode'));
    
    return { text };
  }

  static preInput(text) {
    DuckieDebug.#lib.preHook();
  
    return { text };
  }

  static preContext(text) {
    DuckieDebug.#lib.preHook();
  
    return { text };
  }

  static preOutput(text) {
    DuckieDebug.#lib.preHook();
    
    return { text };
  }

  static resetDebugMode(modifierName, level) {
    DuckieDebug.#lib._duckieDebugLevel = typeof level === 'number' ? level : (level ? 2 : 0);
    DuckieDebug.duckieDebug(`Turn ${info.actionCount} - ${modifierName}`, DuckieDebug.duckieDebugMode.ERROR);
  }

  static duckieDebug(msg, level = DuckieDebug.duckieDebugMode.INFORM) {
    if (DuckieDebug.#lib._duckieDebugLevel === 0 || level > DuckieDebug.#lib._duckieDebugLevel) return;
  
    // 1. Built-in AID console (stable fallback)
    log(msg);
  
    // 2. Debug Data storycard (convenient to read)
    let card = storyCards.find(c => c.title === DuckieDebug.#lib.DUCKIE_DEBUG_CARD);
    if (!card) {
      addStoryCard(DuckieDebug.#lib.DUCKIE_DEBUG_CARD);
      card = storyCards[storyCards.length - 1];
      if (card) {
        card.type        = DuckieDebug.#lib.DUCKIE_DEBUG_TYPE;
        card.keys        = '';
        card.description = 'duckie debug output — set Debug Mode to 0 in Settings to hide';
      }
    }
    if (card) {
      card.entry = card.entry ? card.entry + '\n' + msg : msg;
    }
  }

  static getLevel() {
    return DuckieDebug.#lib._duckieDebugLevel;
  }
}

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
    
    function pushAction(state, text, actionType, scriptData = {}) {
      state.rvh.history.push({ text, actionType, retries: [], scriptData });
      if (state.rvh.history.length > state.rvh.historyMaxLength) {
        state.rvh.history.shift();
      }
    }
    
    // Demotes the current last entry (text + actionType + scriptData) into its own retries array,
    // then replaces the canonical text with newText and resets scriptData for the new winner.
    function pushRetry(state, newText, newScriptData = {}) {
      const last = state.rvh.history[state.rvh.history.length - 1];
      if (!last) return;
      last.retries.push({ text: last.text, actionType: last.actionType, scriptData: last.scriptData });
      last.text = newText;
      last.scriptData = newScriptData;
    }
    
    // Removes history entries from index onward and returns the removed tail.
    function trimToIndex(state, index) {
      return state.rvh.history.splice(index);
    }
    
    // Saves a diverged history tail to altHistory, evicting the oldest branch if over the cap.
    function saveAltHistory(state, firstTurn, tail) {
      state.rvh.altHistory.unshift({ firstTurn, history: tail });
      if (state.rvh.altHistory.length > state.rvh.maxAltHistories) {
        state.rvh.altHistory.pop();
      }
    }
    
    // Searches altHistory for the branch that best matches the current AID history,
    // restores it, and removes it from altHistory. Returns true if a branch was restored.
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
    function resolveRetryWinner(state, aidHistory) {
      const last = state.rvh.history[state.rvh.history.length - 1];
      if (!last || last.retries.length === 0) return;
    
      const aidLast = aidHistory[aidHistory.length - 1];
      if (!aidLast) return;
    
      if (jaccardSimilarity(aidLast.text, last.text) >= SIMILARITY_THRESHOLD) return;
    
      const idx = last.retries.findIndex(
        r => jaccardSimilarity(aidLast.text, r.text) >= SIMILARITY_THRESHOLD
      );
      if (idx === -1) return;
    
      const picked = last.retries[idx];
      last.retries.splice(idx, 1);
      last.retries.push({ text: last.text, actionType: last.actionType, scriptData: last.scriptData });
      last.text = picked.text;
      last.actionType = picked.actionType;
      last.scriptData = picked.scriptData;
    }
    
    // Applies a list of detected text edits to rvh.history entries to keep stored prose fresh.
    // When the entry has stored retries, promotes the retry whose text best matches newText
    // so that the associated scriptData is preserved correctly.
    function freshenText(state, edits) {
      for (const { rvhIdx, newText } of edits) {
        const entry = state.rvh.history[rvhIdx];
        if (!entry) continue;
    
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
    
    // Pushes AID history entries into rvh.history starting at fromIdx,
    // using each entry's type directly as actionType.
    function backfillFromAidHistory(state, aidHistory, fromIdx) {
      for (let i = fromIdx; i < aidHistory.length; i++) {
        const entry = aidHistory[i];
        if (entry) pushAction(state, entry.text, entry.type, {});
      }
    }
    
    // Debug Cards
    function updateHistoryDebugCards(){
      if(DuckieDebug.getLevel() > 1){
        updateDebugCard();
        updateAidDebugCard();
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
    return { updateDebugCard, updateAidDebugCard, getOrCreateCard, getStoryCardEntryByTitle, inferActionType, findHistoryMatch, classifyStateChange, trailingContinueCount, pushAction, pushRetry, trimToIndex, saveAltHistory, restoreAltHistory, resolveRetryWinner, freshenText, backfillFromAidHistory, updateHistoryDebugCards, rvhEnsureInit, computeBigrams, jaccardSimilarity, DEBUG_CARD_TYPE, MATCH_CONFIDENCE_RATIO, LOOKBACK_WINDOW, MAX_CONSECUTIVE_MISMATCHES, AID_HISTORY_CAP, SIMILARITY_THRESHOLD };
  })();

  static preInput(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
    const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
    RevampedHistory.#lib.freshenText(state, edits);
  
    if (changeType !== 'retry' && changeType !== 'start') {
      RevampedHistory.#lib.resolveRetryWinner(state, history);
    }
  
    if (changeType === 'rewind') {
      const divergeIdx = info.actionCount - 1;
      const tail = RevampedHistory.#lib.trimToIndex(state, divergeIdx);
      RevampedHistory.#lib.saveAltHistory(state, divergeIdx, tail);
      state.rvh.actionCount = divergeIdx;
      state.rvh.actionCount++;
    } else if (changeType === 'redo') {
      const restored = RevampedHistory.#lib.restoreAltHistory(state, info.actionCount - 1, history);
      if (!restored) {
        // No matching alt branch; sync count with AID and treat as a fresh new action.
        state.rvh.actionCount = info.actionCount - 1;
      }
      state.rvh.actionCount++;
    } else if (changeType === 'new') {
      state.rvh.actionCount++;
    }
    // retry: no increment
  
    let actionType = RevampedHistory.#lib.inferActionType(text)
    if( changeType === 'start'){
      actionType = 'start';
    }
    state.rvh.playerAction = { changeType, actionType, text, scriptData: {} };
  
    return { text };
  }

  static preContext(text) {
    RevampedHistory.#lib.rvhEnsureInit(state);
    state.rvh.aiAction = { actionType: 'continue', text: null, scriptData: {} };
  
    if (state.rvh.playerAction) {
      if (state.rvh.playerAction.changeType !== 'retry' ) { 
        DuckieDebug.duckieDebug("Player Action", 2);
        state.rvh.actionCount++;
      }
      return { text };
    }
  
    // Continue Action: input hook never fired
    const aidCount = info.actionCount;
    const rvhCount = state.rvh.actionCount;
  
    if (aidCount < rvhCount || aidCount > rvhCount + 1) {
      // Count is unambiguously off: rewind or redo (or late-init on first activation).
      // Skip the trailing-continue retry check — it would misfire here.
      const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
      RevampedHistory.#lib.freshenText(state, edits);
      RevampedHistory.#lib.resolveRetryWinner(state, history);
      state.rvh.aiAction.changeType = changeType;
  
      if (changeType === 'rewind') {
        const divergeIdx = aidCount - 1;
        const tail = RevampedHistory.#lib.trimToIndex(state, divergeIdx);
        RevampedHistory.#lib.saveAltHistory(state, divergeIdx, tail);
        state.rvh.actionCount = divergeIdx;
      } else if (changeType === 'redo') {
        const restored = RevampedHistory.#lib.restoreAltHistory(state, aidCount - 1, history);
        if (!restored) {
          // No matching alt branch — late-init sync or redo with no saved branch
          RevampedHistory.#lib.backfillFromAidHistory(state, history, state.rvh.history.length);
          state.rvh.actionCount = aidCount - 1;
        }
      }
      state.rvh.actionCount++;
    } else {
      // Count is in the expected range (new continue or retry).
      // Use trailing-continue depth to distinguish retry from a genuine new continue.
      let aidTrailing = 0;
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].type !== 'continue') break;
        aidTrailing++;
      }
      if (aidTrailing < state.rvh.expectedAidContinueDepth) {
        // Continue-Retry: trailing continues short of expected → last AI entry was popped
        state.rvh.playerAction = { changeType: 'retry', actionType: 'continue', text: null, scriptData: {} };
      } else {
        // New Continue
        const { changeType, edits } = RevampedHistory.#lib.classifyStateChange(info, state, history);
        RevampedHistory.#lib.freshenText(state, edits);
        RevampedHistory.#lib.resolveRetryWinner(state, history);
        state.rvh.aiAction.changeType = changeType;
        state.rvh.actionCount++;
      }
    }
  
    return { text };
  }

  static postInput(text) {
    state.rvh.playerAction.text = text;
    return { text };
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
  
      state.rvh.expectedAidContinueDepth = Math.min(RevampedHistory.#lib.trailingContinueCount(history) + 1, RevampedHistory.#lib.AID_HISTORY_CAP);
      RevampedHistory.#lib.updateHistoryDebugCards();
  
      return { text };
    }
  
    aiAction.text = text;
  
    if (playerAction.changeType === 'retry') {
      RevampedHistory.#lib.pushRetry(state, aiAction.text, aiAction.scriptData);
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
  
    state.rvh.expectedAidContinueDepth = Math.min(RevampedHistory.#lib.trailingContinueCount(history) + 1, RevampedHistory.#lib.AID_HISTORY_CAP);
  
    RevampedHistory.#lib.updateHistoryDebugCards();
    return { text };
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
}
