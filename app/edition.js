// The build's edition (0.5.1). "store" is Jobee'sLair as released: the game store with its Homebrew section.
// "homebrew" is Jobee'sLair Homebrew: the Homebrew section alone, under its own title ID, with its own
// repository (for the update check) and its own image name, so it installs beside the store and lives on
// without it. packaging/homebrew-edition.sh writes EDITION here and swaps app.json for app.homebrew.json in a
// build copy; nothing else in the app is edited for it. Everything the editions differ in reads this file:
// version.js (TITLE_ID, REPO, the image), the dock and the sections (Header.jsx, useSections.js), the first
// screen (nav.jsx), what starts at launch (index.jsx), Settings' categories, and the title migration.

  var EDITION = "store";
  var HOMEBREW_ONLY = EDITION === "homebrew";
  var EDITIONS = {
    store: { titleId: "PPSA99471", repo: "JVK3R/JobeesLair", image: "JobeesLair.exfat", name: "Jobee'sLair" },
    homebrew: { titleId: "PPSA99472", repo: "JVK3R/JobeesLair-Homebrew", image: "JobeesLair-Homebrew.exfat", name: "Jobee'sLair Homebrew" }
  };

export { EDITION, EDITIONS, HOMEBREW_ONLY };
