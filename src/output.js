// ===========================================================
// ============= RevampedHistory - 1.2.0 - output ============
// ===========================================================
// - RevampedHistory@1.2.0
// ===========================================================
// Paste this ONLY into the output tab in AI Dungeon scripting
// ===========================================================

const modifier = (text) => {
  text = RevampedHistory.postOutput(text).text;

  return { text };
};
modifier(text);
