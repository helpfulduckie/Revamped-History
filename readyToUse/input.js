// ==========================================================
// ===== RevampedHistory (ready to use) - 1.2.2 - input =====
// ==========================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.3
// - RevampedHistory@1.2.2
// ==========================================================
// Paste this ONLY into the input tab in AI Dungeon scripting
// ==========================================================

const modifier = (text) => {
  DuckieDebug.preInput(text);

  RevampedHistory.preInput(text);

  // Your modifier scripts that do not depend on UnifiedSettings or DuckieDebug can go here

  text = UnifiedSettings.input(text).text;
  text = DuckieDebug.input(text).text;

  // More modifier scripts can go here

  RevampedHistory.postInput(text);

  return { text };
};
modifier(text);
