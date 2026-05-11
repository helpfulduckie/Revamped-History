// ==========================================================
// ============= RevampedHistory - 1.2.0 - input ============
// ==========================================================
// - RevampedHistory@1.2.0
// ==========================================================
// Paste this ONLY into the input tab in AI Dungeon scripting
// ==========================================================

const modifier = (text) => {
  text = RevampedHistory.preInput(text).text;

  text = RevampedHistory.postInput(text).text;

  return { text };
};
modifier(text);
