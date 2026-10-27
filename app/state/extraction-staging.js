// What Archives.extract keeps beside a destination while it works (ps5-react native/shared/archives.cpp): its
// staging, <destination>.extracting ("-1" to "-3" after a silent worker), and each one's ".discard" (an earlier
// run's staging set aside to be cleared). An extraction that is cut off (the app closed, the console crashed)
// leaves them behind. The staging records which archive it was for (its path, inode, size and time), so once that
// archive has been downloaded again it refuses every later extraction to the same place: "Staging belongs to
// another extraction; files preserved." Added in 0.5.3 (Homebrew installs of RPCS3 and RetroArch on players'
// consoles).

  var STAGING_SUFFIXES = [".extracting", ".extracting.discard", ".extracting-1", ".extracting-1.discard", ".extracting-2", ".extracting-2.discard", ".extracting-3", ".extracting-3.discard"];
  var stagingOf = (destination) => STAGING_SUFFIXES.map((suffix) => destination + suffix);

export { STAGING_SUFFIXES, stagingOf };
