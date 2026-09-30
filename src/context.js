// ============================================================
// ============= RevampedHistory - 2.0.0 - context ============
// ============================================================
// - RevampedHistory@2.0.0
// ============================================================
// Paste this ONLY into the context tab in AI Dungeon scripting
// ============================================================

const modifier = (text) => {
  RevampedHistory.preContext(text);

  // Be sure to add text = UnifiedSettings.context(text).text; here, above RevampedHistory.context, or RevampedHistory's settings will not load. Other modifier scripts go below RevampedHistory.context.

  text = RevampedHistory.context(text).text;

  return { text };
};
modifier(text);
