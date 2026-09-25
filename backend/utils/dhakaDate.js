/**
 * Asia/Dhaka Date Utility
 *
 * Implements strict calendar-month boundary calculations in Asia/Dhaka (UTC+6),
 * with leap-year handling and end-of-month clamping.
 * Timestamps are stored in UTC and converted to/from Bangladesh time.
 * Note: Never substitutes 180 days for 6 calendar months.
 */

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;

function getDaysInMonth(year, month) {
  // month is 1-indexed (1 = January, 12 = December)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Converts a UTC Date into local Dhaka calendar parts
 */
function toDhakaParts(utcDate) {
  const d = new Date(utcDate.getTime() + DHAKA_OFFSET_MS);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1, // 1-12
    day: d.getUTCDate(),
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    seconds: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
  };
}

/**
 * Converts Dhaka calendar parts back into a UTC Date
 */
function fromDhakaParts({ year, month, day, hours = 0, minutes = 0, seconds = 0, ms = 0 }) {
  const utcMs = Date.UTC(year, month - 1, day, hours, minutes, seconds, ms) - DHAKA_OFFSET_MS;
  return new Date(utcMs);
}

/**
 * Adds calendar months in Asia/Dhaka with strict end-of-month clamping.
 * Example: Aug 31 + 6 months -> Feb 28 (or Feb 29 in leap years), NOT March 2 or 3!
 *
 * @param {Date} baseDate - Starting UTC Date
 * @param {number} monthsToAdd - Number of calendar months (e.g. 6)
 * @returns {Date} New UTC Date reflecting target Dhaka calendar day
 */
function addDhakaCalendarMonths(baseDate, monthsToAdd) {
  if (!baseDate || isNaN(baseDate.getTime())) {
    throw new Error('Invalid baseDate provided to addDhakaCalendarMonths');
  }

  const parts = toDhakaParts(baseDate);

  let targetYear = parts.year;
  let targetMonth = parts.month + monthsToAdd;

  while (targetMonth > 12) {
    targetYear++;
    targetMonth -= 12;
  }
  while (targetMonth < 1) {
    targetYear--;
    targetMonth += 12;
  }

  // End-of-month clamping
  const maxDaysInTargetMonth = getDaysInMonth(targetYear, targetMonth);
  const targetDay = Math.min(parts.day, maxDaysInTargetMonth);

  return fromDhakaParts({
    year: targetYear,
    month: targetMonth,
    day: targetDay,
    hours: parts.hours,
    minutes: parts.minutes,
    seconds: parts.seconds,
    ms: parts.ms,
  });
}

/**
 * Adds exact days in Asia/Dhaka (e.g. 7-day trial)
 */
function addDhakaDays(baseDate, days) {
  if (!baseDate || isNaN(baseDate.getTime())) {
    throw new Error('Invalid baseDate provided to addDhakaDays');
  }
  return new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Formats a Date in Asia/Dhaka readable string
 */
function formatDhakaDateTime(date) {
  if (!date) return 'N/A';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(new Date(date));
}

/**
 * Returns current YYYY-MM-DD date string in Asia/Dhaka time.
 */
function getDhakaDateString(date = new Date()) {
  const parts = toDhakaParts(date);
  const m = String(parts.month).padStart(2, '0');
  const d = String(parts.day).padStart(2, '0');
  return `${parts.year}-${m}-${d}`;
}

module.exports = {
  addDhakaCalendarMonths,
  addDhakaDays,
  formatDhakaDateTime,
  toDhakaParts,
  getDhakaDateParts: toDhakaParts,
  fromDhakaParts,
  getDaysInMonth,
  getDhakaDateString,
};
