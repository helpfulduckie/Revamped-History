// ===========================================================
// ============= RevampedHistory - 2.0.0 - output ============
// ===========================================================
// - RevampedHistory@2.0.0
// ===========================================================
// Paste this ONLY into the output tab in AI Dungeon scripting
// ===========================================================

const modifier = (text) => {
  RevampedHistory.preOutput(text);

  // Be sure to add text = UnifiedSettings.output(text).text; here, or RevampedHistory's settings will not load. Other modifier scripts can go here too.

  // Keep RevampedHistory's post call last: it records the text after every other script has changed it.

  RevampedHistory.postOutput(text);

  return { text };
};
modifier(text);
