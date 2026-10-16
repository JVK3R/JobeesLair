// Make Room's plan: what to free on one drive, in three tiers, safest first.
//   1. Reclaim   files no game needs: an archive already unpacked, a download's partial file nobody owns
//                any more, the notes an archive came with (<name>-extras), backports of games that are no
//                longer installed. Nothing playable is lost; all of it is ticked.
//   2. Relocate  installed games moved to another drive (internal to USB, say), least recently played
//                first: still playable from there. Never a game kept on internal storage, one of the five
//                most played, or one that is mounted, downloading, moving or being deleted. Ticked one by one
//                until the drive has the room it needs.
//   3. Remove    games deleted, those that won't start first. Never ticked: the gamer picks.
// Pure: the library screen gives it the drives, the games and what it found on disk, and gets back items
// to show and tick. `selection(plan, ticked)` says what a choice frees.

  var MARGIN = 16 * 1024 ** 2;
  var MOST_PLAYED = 5;
  var TIERS = ["reclaim", "relocate", "remove"];
  // Where a game's files are: its jobs' drive, else its first file's.
  var rootOf = (entry) => entry.jobs?.[0]?.root ?? entry.files?.[0]?.root ?? null;
  var titleOf = (entry) => {
    const job = entry.jobs?.[0];
    return job?.installedTitleId ?? job?.consoleTitleId ?? job?.titleId ?? entry.files?.find((file) => file.titleId)?.titleId ?? entry.game?.titleId ?? entry.game?.id ?? null;
  };
  /**
   * `target`: the drive to free; `need`: the bytes that must be free there once done (0: as much as the
   * reclaim tier gives). `drives`: { root: { free, total } }. `entries`: the library's games
   * (library/shelf.js), each with `addedAt` (ms). `leftovers`: tier-1 finds (library/leftovers.js).
   * `playtimes`: { TITLE: { seconds, lastPlayed } }. `kept`: library keys kept on internal storage.
   * `held(entry)`: true while a game is mounted, downloading, moving or being deleted.
   */
  function planRoom({ target, need = 0, drives, entries = [], leftovers = [], playtimes = {}, kept = /* @__PURE__ */ new Set(), held = () => false }) {
    const freeBefore = drives[target]?.free ?? 0;
    const items = [];
    for (const item of leftovers.filter((found) => found.root === target && found.bytes > 0)) {
      items.push({ ...item, tier: "reclaim", selected: item.selected !== false });
    }
    const played = (entry) => playtimes[titleOf(entry)] ?? null;
    const recency = (entry) => played(entry)?.lastPlayed ?? entry.addedAt ?? 0;
    const favourites = new Set([...entries].filter((entry) => (played(entry)?.seconds ?? 0) > 0).sort((a, b) => played(b).seconds - played(a).seconds).slice(0, MOST_PLAYED).map((entry) => entry.key));
    const here = entries.filter((entry) => rootOf(entry) === target && entry.size > 0 && !entry.removing && !held(entry));
    // Other drives, most room first; internal storage only takes games when it is not the drive freed and
    // none other has room (it is where games play best).
    const room = Object.fromEntries(Object.entries(drives).filter(([root, usage]) => root !== target && usage?.free != null).map(([root, usage]) => [root, usage.free - MARGIN]));
    const destinationFor = (bytes) => {
      const options = Object.keys(room).filter((root) => room[root] >= bytes).sort((a, b) => Number(a === "/data") - Number(b === "/data") || room[b] - room[a]);
      return options.find((root) => root !== "/data") ?? null;
    };
    const movable = here.filter((entry) => entry.ready?.stage !== "wontStart" && !(target === "/data" && kept.has(entry.key)) && !favourites.has(entry.key) && entry.jobs.every((job) => job.artifact?.nextAction === "shadowmount" || !job.artifact) && entry.relocatable !== false);
    for (const entry of movable.sort((a, b) => recency(a) - recency(b) || b.size - a.size)) {
      const to = destinationFor(entry.size);
      if (!to) continue;
      room[to] -= entry.size;
      items.push({ id: `relocate:${entry.key}`, tier: "relocate", kind: "relocate", entryKey: entry.key, title: entry.game.title, bytes: entry.size, root: target, to, lastPlayed: played(entry)?.lastPlayed ?? null, seconds: played(entry)?.seconds ?? 0, selected: false, action: { type: "relocate", entryKey: entry.key, to } });
    }
    const removable = here.sort((a, b) => Number(b.ready?.stage === "wontStart") - Number(a.ready?.stage === "wontStart") || recency(a) - recency(b));
    for (const entry of removable) {
      items.push({ id: `remove:${entry.key}`, tier: "remove", kind: entry.ready?.stage === "wontStart" ? "wontStart" : "remove", entryKey: entry.key, title: entry.game.title, bytes: entry.size, root: target, lastPlayed: played(entry)?.lastPlayed ?? null, seconds: played(entry)?.seconds ?? 0, selected: false, action: { type: "remove", entryKey: entry.key } });
    }
    // Ticked by default: every reclaim the finder ticked, then the relocations, oldest first, until the drive
    // has what it needs.
    let freed = items.filter((item) => item.selected).reduce((sum, item) => sum + item.bytes, 0);
    for (const item of items.filter((candidate) => candidate.tier === "relocate")) {
      if (freeBefore + freed >= need) break;
      item.selected = true;
      freed += item.bytes;
    }
    return { target, need, freeBefore, drives, items, tiers: Object.fromEntries(TIERS.map((tier) => [tier, items.filter((item) => item.tier === tier)])) };
  }
  // The ticked items' ids after ticking or unticking `id`: a game is either moved or deleted, never both.
  function toggle(plan, ticked, id) {
    const item = plan.items.find((candidate) => candidate.id === id);
    const next = new Set(ticked);
    if (!item) return next;
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      for (const other of plan.items) if (other !== item && item.entryKey && other.entryKey === item.entryKey) next.delete(other.id);
    }
    return next;
  }
  var ticked0 = (plan) => new Set(plan.items.filter((item) => item.selected).map((item) => item.id));
  /**
   * What the ticked items do: `freed` on the target, `after` ({ root: free }) for each drive, and whether
   * the target then has `need` free (`enough`).
   */
  function selection(plan, ticked) {
    const after = Object.fromEntries(Object.entries(plan.drives).map(([root, usage]) => [root, usage?.free ?? null]));
    let freed = 0;
    for (const item of plan.items) {
      if (!ticked.has(item.id)) continue;
      freed += item.bytes;
      if (item.to && after[item.to] !== null) after[item.to] -= item.bytes;
    }
    if (after[plan.target] !== null) after[plan.target] += freed;
    return { freed, after, enough: (after[plan.target] ?? 0) >= plan.need, count: ticked.size };
  }

export { TIERS, planRoom, rootOf, selection, ticked0, titleOf, toggle };
