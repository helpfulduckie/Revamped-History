// ==========================================================
// ===== RevampedHistory (ready to use) - 1.2.0 - input =====
// ==========================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.2
// - RevampedHistory@1.2.0
// ==========================================================
// Paste this ONLY into the input tab in AI Dungeon scripting
// ==========================================================

const modifier = (text) => {
  text = DuckieDebug.preInput(text).text;
  text = RevampedHistory.preInput(text).text;

  text = UnifiedSettings.input(text).text;

  text = RevampedHistory.postInput(text).text;

  return { text };
};
modifier(text);
