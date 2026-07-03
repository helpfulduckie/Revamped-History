// ===========================================================
// ============= RevampedHistory - 1.2.2 - output ============
// ===========================================================
// - RevampedHistory@1.2.2
// ===========================================================
// Paste this ONLY into the output tab in AI Dungeon scripting
// ===========================================================

const modifier = (text) => {
  // Be sure to add DuckieDebug.preInput(text) to this area or RevampedHistory will not work!

  // Be sure to add UnifiedSettings.input(text) and DuckieDebug.input(text) to this area or RevampedHistory will not work!
  // Your other modifier scripts also go here

  RevampedHistory.postOutput(text);

  return { text };
};
modifier(text);
