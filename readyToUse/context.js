// ============================================================
// ===== RevampedHistory (ready to use) - 1.2.0 - context =====
// ============================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.2
// - RevampedHistory@1.2.0
// ============================================================
// Paste this ONLY into the context tab in AI Dungeon scripting
// ============================================================

const modifier = (text) => {
  text = DuckieDebug.preContext(text).text;
  text = RevampedHistory.preContext(text).text;

  text = UnifiedSettings.context(text).text;

  return { text };
};
modifier(text);
