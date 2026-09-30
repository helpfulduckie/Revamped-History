// ============================================================
// ============= RevampedHistory - 1.4.0 - context ============
// ============================================================
// - RevampedHistory@1.4.0
// ============================================================
// Paste this ONLY into the context tab in AI Dungeon scripting
// ============================================================

const modifier = (text) => {
  // RevampedHistory wires its own UnifiedSettings/DuckieDebug calls internally — nothing required here for RevampedHistory itself.

  RevampedHistory.preContext(text);

  // Your other modifier scripts go here. If they use UnifiedSettings or DuckieDebug, wire those calls into their own code the same way RevampedHistory does — do not rely on this comment block.

  return { text };
};
modifier(text);
