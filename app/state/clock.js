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

  // [year, month, day] to days since 1970-01-01 (Howard Hinnant's days_from_civil).
  function civilDays(year, month, day) {
    const y = year - (month <= 2 ? 1 : 0);
    const era = Math.floor(y / 400);
    const yoe = y - era * 400;
    const doy = Math.floor((153 * (month + (month > 2 ? -3 : 9)) + 2) / 5) + day - 1;
    return era * 146097 + yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy - 719468;
  }
  // A timestamp ShadowMount reports: seconds or milliseconds since the epoch, or "2026-10-15 23:39:47" /
  // "2026-10-15T23:39:47Z". One without a zone is the console's local time, `offsetMinutes` east of UTC.
  // Milliseconds since the epoch, or null when it is none of these (or 0, "never").
  function parseStamp(value, offsetMinutes = 0) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) return value < 1e12 ? value * 1e3 : value;
    if (typeof value !== "string") return null;
    if (/^\d+$/.test(value.trim())) return parseStamp(Number(value.trim()), offsetMinutes);
    const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})?$/.exec(value.trim());
    if (!match) return null;
    const [, year, month, day, hour, minute, second = "0", zone] = match;
    const local = (civilDays(+year, +month, +day) * 86400 + +hour * 3600 + +minute * 60 + +second) * 1e3;
    if (!zone) return local - offsetMinutes * 6e4;
    if (zone === "Z") return local;
    const sign = zone[0] === "-" ? -1 : 1;
    const digits = zone.slice(1).replace(":", "");
    return local - sign * (+digits.slice(0, 2) * 60 + +digits.slice(2)) * 6e4;
  }
  // The local calendar day (days since 1970-01-01) of a time, `offsetMinutes` east of UTC.
  var localDay = (ms, offsetMinutes = 0) => Math.floor((ms + offsetMinutes * 6e4) / 864e5);

export { civilDays, isoDate, isoStamp, localDay, parseStamp };
