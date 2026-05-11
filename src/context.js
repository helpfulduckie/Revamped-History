// ============================================================
// ============= RevampedHistory - 1.2.0 - context ============
// ============================================================
// - RevampedHistory@1.2.0
// ============================================================
// Paste this ONLY into the context tab in AI Dungeon scripting
// ============================================================

const modifier = (text) => {
  text = RevampedHistory.preContext(text).text;

  return { text };
};
modifier(text);
