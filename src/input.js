// ==========================================================
// ============= RevampedHistory - 1.5.0 - input ============
// ==========================================================
// - RevampedHistory@1.5.0
// ==========================================================
// Paste this ONLY into the input tab in AI Dungeon scripting
// ==========================================================

const modifier = (text) => {
  // RevampedHistory wires its own UnifiedSettings/DuckieDebug calls internally — nothing required here for RevampedHistory itself.

  RevampedHistory.preInput(text);

  // Your other modifier scripts go here. If they use UnifiedSettings or DuckieDebug, wire those calls into their own code the same way RevampedHistory does — do not rely on this comment block.

  RevampedHistory.postInput(text);

  return { text };
};
modifier(text);
