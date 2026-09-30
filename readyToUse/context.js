// ============================================================
// ===== RevampedHistory (ready to use) - 1.5.0 - context =====
// ============================================================
// - UnifiedSettings@1.1.2
// - RevampedHistory@1.5.0
// ============================================================
// Paste this ONLY into the context tab in AI Dungeon scripting
// ============================================================

const modifier = (text) => {
  RevampedHistory.preContext(text);

  // Your modifier scripts that do not depend on UnifiedSettings or DuckieDebug can go here

  text = UnifiedSettings.context(text).text;

  // More modifier scripts can go here

  return { text };
};
modifier(text);
