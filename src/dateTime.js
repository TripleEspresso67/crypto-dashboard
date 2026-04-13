const UTC_DATE_OPTIONS = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'UTC',
};

const UTC_TIME_OPTIONS = {
  timeZone: 'UTC',
};

const UTC_DATETIME_OPTIONS = {
  ...UTC_DATE_OPTIONS,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
};

function isInvalidTimestamp(ts) {
  if (ts === null || ts === undefined || ts === '') return true;
  return Number.isNaN(Number(ts));
}

export function formatUtcDate(ts, fallback = '--') {
  if (isInvalidTimestamp(ts)) return fallback;
  return new Date(ts).toLocaleDateString('en-GB', UTC_DATE_OPTIONS);
}

export function formatUtcTime(ts, fallback = '--') {
  if (isInvalidTimestamp(ts)) return fallback;
  return new Date(ts).toLocaleTimeString('en-GB', UTC_TIME_OPTIONS);
}

export function formatUtcDateTime(ts, fallback = '--') {
  if (isInvalidTimestamp(ts)) return fallback;
  return new Date(ts).toLocaleString('en-GB', UTC_DATETIME_OPTIONS);
}
