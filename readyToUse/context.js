// ============================================================
// ===== RevampedHistory (ready to use) - 2.0.0 - context =====
// ============================================================
// - UnifiedSettings@1.1.2
// - RevampedHistory@2.0.0
// ============================================================
// Paste this ONLY into the context tab in AI Dungeon scripting
// ============================================================

const modifier = (text) => {
  RevampedHistory.preContext(text);

  // Your modifier scripts that do not use UnifiedSettings or RevampedHistory can go here

  text = UnifiedSettings.context(text).text;
  text = RevampedHistory.context(text).text;

  // More modifier scripts can go here

  return { text };
};
modifier(text);
