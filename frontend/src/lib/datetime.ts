/**
 * Date / Time formatting utilities
 * Handles per-field format strings and company timezone conversion.
 */

export const DATE_FORMATS = [
  { value: 'DD/MM/YYYY',   label: 'DD/MM/YYYY   (15/01/2024)' },
  { value: 'MM/DD/YYYY',   label: 'MM/DD/YYYY   (01/15/2024)' },
  { value: 'YYYY-MM-DD',   label: 'YYYY-MM-DD   (2024-01-15)' },
  { value: 'DD-MM-YYYY',   label: 'DD-MM-YYYY   (15-01-2024)' },
  { value: 'DD MMM YYYY',  label: 'DD MMM YYYY  (15 Jan 2024)' },
  { value: 'MMM DD, YYYY', label: 'MMM DD, YYYY (Jan 15, 2024)' },
] as const;

export const TIME_FORMATS = [
  { value: '24h', label: '24 Hour (14:30)' },
  { value: '12h', label: '12 Hour (2:30 PM)' },
] as const;

/** Common IANA timezone options with UTC offset labels. */
export const TIMEZONE_OPTIONS = [
  { value: 'UTC',                    label: '(UTC+00:00) UTC' },
  { value: 'Pacific/Midway',         label: '(UTC-11:00) Midway Island, Samoa' },
  { value: 'Pacific/Honolulu',       label: '(UTC-10:00) Hawaii' },
  { value: 'America/Anchorage',      label: '(UTC-09:00) Alaska' },
  { value: 'America/Los_Angeles',    label: '(UTC-08:00) Pacific Time — US & Canada' },
  { value: 'America/Denver',         label: '(UTC-07:00) Mountain Time — US & Canada' },
  { value: 'America/Chicago',        label: '(UTC-06:00) Central Time — US & Canada' },
  { value: 'America/New_York',       label: '(UTC-05:00) Eastern Time — US & Canada' },
  { value: 'America/Caracas',        label: '(UTC-04:30) Caracas' },
  { value: 'America/Halifax',        label: '(UTC-04:00) Atlantic Time — Canada' },
  { value: 'America/Sao_Paulo',      label: '(UTC-03:00) Brasilia' },
  { value: 'Atlantic/Azores',        label: '(UTC-01:00) Azores' },
  { value: 'Europe/London',          label: '(UTC+00:00) London, Dublin, Edinburgh' },
  { value: 'Europe/Paris',           label: '(UTC+01:00) Paris, Berlin, Amsterdam, Brussels' },
  { value: 'Europe/Helsinki',        label: '(UTC+02:00) Helsinki, Kyiv, Riga, Sofia' },
  { value: 'Europe/Moscow',          label: '(UTC+03:00) Moscow, St. Petersburg' },
  { value: 'Asia/Tehran',            label: '(UTC+03:30) Tehran' },
  { value: 'Asia/Dubai',             label: '(UTC+04:00) Abu Dhabi, Muscat, Dubai' },
  { value: 'Asia/Kabul',             label: '(UTC+04:30) Kabul' },
  { value: 'Asia/Karachi',           label: '(UTC+05:00) Karachi, Islamabad, Tashkent' },
  { value: 'Asia/Kolkata',           label: '(UTC+05:30) Chennai, Kolkata, Mumbai, New Delhi' },
  { value: 'Asia/Kathmandu',         label: '(UTC+05:45) Kathmandu' },
  { value: 'Asia/Dhaka',             label: '(UTC+06:00) Dhaka, Almaty' },
  { value: 'Asia/Yangon',            label: '(UTC+06:30) Yangon (Rangoon)' },
  { value: 'Asia/Bangkok',           label: '(UTC+07:00) Bangkok, Hanoi, Jakarta' },
  { value: 'Asia/Shanghai',          label: '(UTC+08:00) Beijing, Shanghai, Hong Kong' },
  { value: 'Asia/Singapore',         label: '(UTC+08:00) Singapore, Kuala Lumpur' },
  { value: 'Asia/Tokyo',             label: '(UTC+09:00) Tokyo, Osaka, Sapporo' },
  { value: 'Australia/Darwin',       label: '(UTC+09:30) Darwin' },
  { value: 'Australia/Sydney',       label: '(UTC+10:00) Sydney, Melbourne, Brisbane' },
  { value: 'Pacific/Guadalcanal',    label: '(UTC+11:00) Solomon Islands' },
  { value: 'Pacific/Auckland',       label: '(UTC+12:00) Auckland, Wellington' },
  { value: 'Pacific/Tongatapu',      label: '(UTC+13:00) Nuku\'alofa' },
] as const;

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Read the company timezone from Zustand's persisted localStorage key. */
export function getCompanyTimezone(): string {
  if (typeof window === 'undefined') return 'UTC';
  try {
    const raw = localStorage.getItem('tenant-storage');
    if (raw) {
      const state = JSON.parse(raw) as { state?: { company?: { settings?: { timezone?: string } } } };
      return state?.state?.company?.settings?.timezone ?? 'UTC';
    }
  } catch { /* ignore */ }
  return 'UTC';
}

// ── Internal helpers ──────────────────────────────────────────

function applyDateFmt(year: string, month: string, day: string, fmt: string): string {
  const mNum = parseInt(month, 10);
  return fmt
    .replace('YYYY', year)
    .replace('MM',   month)
    .replace('DD',   day)
    .replace('MMM',  MONTH_SHORT[mNum - 1] ?? '');
}

function applyTimeFmt(hours: number, minutes: number, fmt: string): string {
  if (fmt === '12h') {
    const period = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `${h}:${String(minutes).padStart(2, '0')} ${period}`;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Extract date/time parts in a specific timezone using Intl. */
function tzParts(date: Date, timezone: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year:   'numeric',
    month:  '2-digit',
    day:    '2-digit',
    hour:   '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const p: Record<string, string> = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  return p;
}

// ── Public API ────────────────────────────────────────────────

/**
 * Format a stored field value for display.
 *
 * @param value      Raw stored string (YYYY-MM-DD / YYYY-MM-DDTHH:mm / HH:mm)
 * @param fieldType  'date' | 'datetime' | 'time'
 * @param dateFormat One of DATE_FORMATS values  (default: 'DD/MM/YYYY')
 * @param timeFormat '24h' | '12h'               (default: '24h')
 * @param timezone   IANA timezone string         (default: 'UTC')
 */
export function formatFieldValue(
  value: string,
  fieldType: 'date' | 'datetime' | 'time',
  dateFormat = 'DD/MM/YYYY',
  timeFormat = '24h',
  timezone   = 'UTC',
): string {
  if (!value) return '';
  try {
    if (fieldType === 'time') {
      const [h, m] = value.split(':').map(Number);
      return applyTimeFmt(h, m, timeFormat);
    }

    if (fieldType === 'date') {
      // Pure date — no timezone shift; value is already YYYY-MM-DD
      const [year, month, day] = value.split('-');
      return applyDateFmt(year, month, day, dateFormat);
    }

    if (fieldType === 'datetime') {
      const p = tzParts(new Date(value), timezone);
      const datePart = applyDateFmt(p.year, p.month, p.day, dateFormat);
      const timePart = applyTimeFmt(parseInt(p.hour, 10), parseInt(p.minute, 10), timeFormat);
      return `${datePart} ${timePart}`;
    }
  } catch { /* fall through */ }
  return value;
}

/**
 * Return the current moment expressed in the given timezone as a local-time
 * string suitable for an HTML input (YYYY-MM-DD, YYYY-MM-DDTHH:mm, or HH:mm).
 */
export function nowInTimezone(
  fieldType: 'date' | 'datetime' | 'time',
  timezone = 'UTC',
): string {
  const p = tzParts(new Date(), timezone);
  if (fieldType === 'date')     return `${p.year}-${p.month}-${p.day}`;
  if (fieldType === 'time')     return `${p.hour}:${p.minute}`;
  /* datetime */                return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
