// The cafe runs on India Standard Time but Render runs in UTC, so day boundaries
// and printed dates go through these helpers instead of the server's local time.
// India has no daylight saving, so the fixed offset is exact all year.
export const BUSINESS_TIME_ZONE = "Asia/Kolkata";
export const BUSINESS_UTC_OFFSET = "+05:30";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getBusinessDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

// Midnight IST at the start of the given YYYY-MM-DD day, or null if invalid.
export function parseBusinessDate(ymd, endOfDay = false) {
  if (typeof ymd !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const time = endOfDay ? "23:59:59.999" : "00:00:00.000";
  const date = new Date(`${ymd}T${time}${BUSINESS_UTC_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Midnight IST, `daysBack` days before today.
export function getBusinessDayStart(daysBack = 0, now = new Date()) {
  const { year, month, day } = getBusinessDateParts(now);
  const todayStart = parseBusinessDate(`${year}-${month}-${day}`);
  return new Date(todayStart.getTime() - daysBack * DAY_MS);
}
