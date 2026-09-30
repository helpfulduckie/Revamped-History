// ==========================================================
// ===== RevampedHistory (ready to use) - 2.0.0 - input =====
// ==========================================================
// - UnifiedSettings@1.1.2
// - RevampedHistory@2.0.0
// ==========================================================
// Paste this ONLY into the input tab in AI Dungeon scripting
// ==========================================================

const modifier = (text) => {
  RevampedHistory.preInput(text);

  // Your modifier scripts that do not use UnifiedSettings or RevampedHistory can go here

  text = UnifiedSettings.input(text).text;
  text = RevampedHistory.input(text).text;

  // More modifier scripts can go here

  RevampedHistory.postInput(text);

  return { text };
};
modifier(text);
