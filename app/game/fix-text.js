// "Fix it" (0.5.2, state/download-queue.js fixState / fixTitle) in words, for the Library and "Why won't it
// start?": where a game stands before anything is pressed, and what a press found or did.

  // A state before a press: what Fix it would do ("needs", "retry"), or why it has nothing to do.
  var STATE = { needs: "fix.detail", retry: "fix.retryDetail", notLaunched: "fix.notLaunched", fine: "fix.fine", waiting: "fix.waiting", none: "fix.none" };
  var fixStateText = (t2, state, title) => t2(STATE[state] ?? "fix.none", { title });
  // Whether a press would change anything: the button shows only then.
  var fixNeeded = (state) => state === "needs" || state === "retry";
  // A press's answer: what it changed, else the state it found. `bad`: nothing it can change.
  function fixText(t2, result, title) {
    const key = result.step === "applied" ? result.opened && result.fakelib ? "fix.appliedBoth" : result.fakelib ? "fix.appliedFakelib" : "fix.appliedFiles" : result.step === "restored" ? "fix.restored" : STATE[result.step] ?? "fix.none";
    return { text: t2(key, { title }), bad: key === "fix.none" };
  }

export { fixNeeded, fixStateText, fixText };
