// What a download card or a library tile shows of a job besides its progress, as one string (downloads/useQueue.js
// redraws them only when it changes). Its own module (0.5.2) so a test can load it without the queue.

  // Everything a card or library tile shows that is not progress: the last launch's outcome, the drive (a
  // move changes it) and whether a move is under way or stopped. 0.5.2: and which launch that was and what Fix it
  // did since (readiness.js tells "Start it to try the fix" from "It did not start last time" by them): without
  // them a tile kept its old line after Fix it, and after the next launch.
  var fixShape = (fix) => fix ? `${fix.round}:${fix.mark || ""}:${fix.fakelib || ""}:${fix.nothing ? 1 : 0}` : "";
  var shapeOf = (job2) => `${job2.id}|${job2.state}|${job2.phase || ""}|${job2.error}|${job2.message || ""}|${job2.total}|${job2.launch?.outcome || ""}|${job2.launch?.mark || ""}|${fixShape(job2.fixIt)}|${job2.root}|${job2.moving ? `${job2.moving.to}:${job2.moving.interrupted ? "stopped" : "moving"}:${job2.moving.error || ""}` : ""}|${job2.extras || ""}|${job2.autoOpenAt || ""}|${job2.partIndex ?? ""}|${job2.inspected || ""}|${job2.fileName || ""}|${job2.aheadAt || ""}|${job2.aheadState || ""}|${job2.aheadPart ?? ""}|${job2.cleared || ""}`;

export { shapeOf };
