// ===========================================================
// ===== RevampedHistory (ready to use) - 1.2.2 - output =====
// ===========================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.3
// - RevampedHistory@1.2.2
// ===========================================================
// Paste this ONLY into the output tab in AI Dungeon scripting
// ===========================================================

const modifier = (text) => {
  DuckieDebug.preOutput(text);

  // Your modifier scripts that do not depend on UnifiedSettings or DuckieDebug can go here

  text = UnifiedSettings.output(text).text;
  text = DuckieDebug.output(text).text;

  // More modifier scripts can go here

  RevampedHistory.postOutput(text);

  return { text };
};
modifier(text);
