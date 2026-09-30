// ===========================================================
// ============= RevampedHistory - 1.4.0 - output ============
// ===========================================================
// - RevampedHistory@1.4.0
// ===========================================================
// Paste this ONLY into the output tab in AI Dungeon scripting
// ===========================================================

const modifier = (text) => {
  // RevampedHistory wires its own UnifiedSettings/DuckieDebug calls internally — nothing required here for RevampedHistory itself.

  // Your other modifier scripts go here. If they use UnifiedSettings or DuckieDebug, wire those calls into their own code the same way RevampedHistory does — do not rely on this comment block.

  RevampedHistory.postOutput(text);

  return { text };
};
modifier(text);
