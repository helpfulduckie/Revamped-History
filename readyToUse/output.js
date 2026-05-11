// ===========================================================
// ===== RevampedHistory (ready to use) - 1.2.0 - output =====
// ===========================================================
// - UnifiedSettings@1.1.2
// - DuckieDebug@1.0.2
// - RevampedHistory@1.2.0
// ===========================================================
// Paste this ONLY into the output tab in AI Dungeon scripting
// ===========================================================

const modifier = (text) => {
  text = DuckieDebug.preOutput(text).text;

  text = UnifiedSettings.output(text).text;

  text = RevampedHistory.postOutput(text).text;

  return { text };
};
modifier(text);
