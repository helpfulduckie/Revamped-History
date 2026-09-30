// ==========================================================
// ===== RevampedHistory (ready to use) - 1.5.0 - input =====
// ==========================================================
// - UnifiedSettings@1.1.2
// - RevampedHistory@1.5.0
// ==========================================================
// Paste this ONLY into the input tab in AI Dungeon scripting
// ==========================================================

const modifier = (text) => {
  RevampedHistory.preInput(text);

  // Your modifier scripts that do not depend on UnifiedSettings or DuckieDebug can go here

  text = UnifiedSettings.input(text).text;

  // More modifier scripts can go here

  RevampedHistory.postInput(text);

  return { text };
};
modifier(text);
