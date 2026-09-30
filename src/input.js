// ==========================================================
// ============= RevampedHistory - 2.0.0 - input ============
// ==========================================================
// - RevampedHistory@2.0.0
// ==========================================================
// Paste this ONLY into the input tab in AI Dungeon scripting
// ==========================================================

const modifier = (text) => {
  RevampedHistory.preInput(text);

  // Be sure to add text = UnifiedSettings.input(text).text; here, above RevampedHistory.input, or RevampedHistory's settings will not load. Other modifier scripts go below RevampedHistory.input.

  text = RevampedHistory.input(text).text;

  // Keep RevampedHistory's post call last: it records the text after every other script has changed it.

  RevampedHistory.postInput(text);

  return { text };
};
modifier(text);
