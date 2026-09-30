// ===========================================================
// ===== RevampedHistory (ready to use) - 2.0.0 - output =====
// ===========================================================
// - UnifiedSettings@1.1.2
// - RevampedHistory@2.0.0
// ===========================================================
// Paste this ONLY into the output tab in AI Dungeon scripting
// ===========================================================

const modifier = (text) => {
  RevampedHistory.preOutput(text);

  // Your modifier scripts that do not use UnifiedSettings or RevampedHistory can go here

  text = UnifiedSettings.output(text).text;

  // More modifier scripts can go here

  RevampedHistory.postOutput(text);

  return { text };
};
modifier(text);
