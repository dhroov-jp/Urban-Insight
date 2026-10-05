const INDIA_LOCALE = 'en-IN';
const INDIA_TIME_ZONE = 'Asia/Kolkata';

export type DateInput = string | number | Date | null | undefined;

function partsToDate(parts: Intl.DateTimeFormatPart[]) {
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}-${values.month}-${values.year}`;
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  return `${day}-${month}-${year}`;
}

export function formatDate(value: DateInput): string {
  if (value === null || value === undefined || value === '') return '—';

  if (typeof value === 'string') {
    const dateOnly = parseDateOnly(value);
    if (dateOnly) return dateOnly;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  return partsToDate(new Intl.DateTimeFormat(INDIA_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: INDIA_TIME_ZONE,
  }).formatToParts(date));
}

export function formatDateTime(value: DateInput): string {
  if (value === null || value === undefined || value === '') return '—';

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';

  const parts = new Intl.DateTimeFormat(INDIA_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: INDIA_TIME_ZONE,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.day}-${values.month}-${values.year} ${values.hour}:${values.minute}`;
}

export function formatDateRange(start: DateInput, end: DateInput): string {
  return `${formatDate(start)} → ${formatDate(end)}`;
}
