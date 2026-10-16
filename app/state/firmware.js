// The system software a game asks for (its sce_sys/param.json requiredSystemSoftwareVersion) against the
// console's own, for the backport tag in the source picker and the folder checks in the queue.

import { t } from '../i18n/core.js';

  // "0x1270000000000000" as [12, 70], or null.
  function requiredFirmware(value) {
    const match = /^0x([0-9]{2})([0-9]{2})[0-9a-f]{12}$/i.exec(typeof value === "string" ? value.trim() : "");
    return match ? [Number(match[1]), Number(match[2])] : null;
  }
  // The console's system software ("13.60", "13.6", "13.600") as [13, 60], or null.
  function consoleFirmware(text) {
    const match = /(\d+)\.(\d+)/.exec(typeof text === "string" ? text : "");
    return match ? [Number(match[1]), Number(match[2].padEnd(2, "0").slice(0, 2))] : null;
  }
  var firmwareText = ([major, minor]) => `${major}.${String(minor).padStart(2, "0")}`;
  // Whether `required` is newer than `current`.
  var newerFirmware = (required, current) => (required[0] - current[0] || required[1] - current[1]) > 0;
  // What a title asks for, from the files Jobee'sLair can read: the copy of sce_sys ShadowMount keeps for
  // every title it installed (/user/app/<TITLE_ID>/sce_sys), else a downloaded game folder of it.
  function titleRequirement(fs, titleId, jobs = []) {
    const candidates = [
      `/user/app/${titleId}/sce_sys/param.json`,
      ...jobs.filter((job2) => (job2.installedTitleId ?? job2.consoleTitleId ?? job2.titleId) === titleId && job2.role !== "backport" && job2.artifact?.destination).map((job2) => `${job2.artifact.destination}/sce_sys/param.json`)
    ];
    for (const path of candidates) {
      try {
        const required = requiredFirmware(JSON.parse(fs.readFile(path)).requiredSystemSoftwareVersion);
        if (required) return required;
      } catch {
      }
    }
    return null;
  }
  /**
   * The backport tag for a game: "notNeeded" when the console's system software is at least what the game
   * asks for, "recommended" when it is older, "unknown" when either is unknown (the game is not installed
   * or downloaded yet, or the console did not say). `text` is the tag's sentence.
   */
  function backportAdvice({ fs, titleId, firmware, jobs }) {
    const required = titleRequirement(fs, titleId, jobs);
    const current = consoleFirmware(firmware);
    const key = !required || !current ? "unknown" : newerFirmware(required, current) ? "recommended" : "notNeeded";
    const params = { required: required ? firmwareText(required) : "", current: current ? firmwareText(current) : "" };
    return { key, ...params, text: t(`sources.backport.${key}`, params) };
  }

export { backportAdvice, consoleFirmware, firmwareText, newerFirmware, requiredFirmware, titleRequirement };
