// Calendar text from a millisecond timestamp, without Date objects: the console's JS engine is built with
// only Date.now() (constructing a Date throws "Date objects need ER_JS_INTRINSIC_DATE"), so anything that
// needs a date string works it out from the epoch milliseconds here. UTC, proleptic Gregorian.

  var pad = (n, width = 2) => String(n).padStart(width, "0");
  // Days since 1970-01-01 to [year, month, day] (Howard Hinnant's civil_from_days).
  function civil(days) {
    const z = days + 719468;
    const era = Math.floor(z / 146097);
    const doe = z - era * 146097;
    const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
    const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
    const mp = Math.floor((5 * doy + 2) / 153);
    const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
    const month = mp < 10 ? mp + 3 : mp - 9;
    return [yoe + era * 400 + (month <= 2 ? 1 : 0), month, day];
  }
  // "2026-10-15" for a time in milliseconds.
  function isoDate(ms) {
    const [year, month, day] = civil(Math.floor(ms / 864e5));
    return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
  }
  // "2026-10-15T16:20:05.123Z", as Date.prototype.toISOString writes it.
  function isoStamp(ms) {
    const inDay = (ms % 864e5 + 864e5) % 864e5;
    return `${isoDate(ms)}T${pad(Math.floor(inDay / 36e5))}:${pad(Math.floor(inDay % 36e5 / 6e4))}:${pad(Math.floor(inDay % 6e4 / 1e3))}.${pad(inDay % 1e3, 3)}Z`;
  }

export { isoDate, isoStamp };
