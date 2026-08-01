import i18n, { currentLocale } from '@/i18n';
import type { ChatSummary } from '@/types/api';

const LOW_INFORMATION_TITLE_PREVIEWS = new Set([
  'hi',
  'hello',
  'hey',
  'hello nano',
  'hello nanobot',
  'hi nano',
  'hi nanobot',
  '你好',
  '您好',
  '嗨',
  '哈喽',
  '哈啰',
  '在吗',
]);

const RELATIVE_THRESHOLDS: Array<[number, Intl.RelativeTimeFormatUnit]> = [
  [60, 'second'],
  [60, 'minute'],
  [24, 'hour'],
  [7, 'day'],
  [4.345, 'week'],
  [12, 'month'],
  [Number.POSITIVE_INFINITY, 'year'],
];

const relativeTimeFormatters = new Map<string, Intl.RelativeTimeFormat>();
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();
const clockTimeFormatters = new Map<string, Intl.DateTimeFormat>();

function activeLocale(locale?: string): string {
  return locale || i18n.resolvedLanguage || i18n.language || currentLocale();
}

type RelativeTimeLike = { format(value: number, unit: string): string };

const hasNativeRTF = typeof Intl !== 'undefined' && typeof (Intl as Record<string, unknown>).RelativeTimeFormat === 'function';

/**
 * Fallback relative-time formatter for JS engines (e.g. older Hermes) that lack
 * Intl.RelativeTimeFormat. Produces readable strings via i18n keys.
 */
function fallbackRelativeTimeFormat(): RelativeTimeLike {
  return {
    format(value: number, unit: string): string {
      const rounded = Math.round(value);
      const abs = Math.abs(rounded);
      if (abs < 60 && unit === 'second') {
        return rounded === 0 ? i18n.t('format.justNow', { defaultValue: 'just now' }) : i18n.t('format.secondsAgo', { count: abs, defaultValue: '{{count}}s ago' });
      }
      if (unit === 'minute') return i18n.t('format.minutesAgo', { count: abs, defaultValue: '{{count}}m ago' });
      if (unit === 'hour') return i18n.t('format.hoursAgo', { count: abs, defaultValue: '{{count}}h ago' });
      if (unit === 'day') return i18n.t('format.daysAgo', { count: abs, defaultValue: '{{count}}d ago' });
      if (unit === 'week') return i18n.t('format.weeksAgo', { count: abs, defaultValue: '{{count}}w ago' });
      if (unit === 'month') return i18n.t('format.monthsAgo', { count: abs, defaultValue: '{{count}}mo ago' });
      return i18n.t('format.yearsAgo', { count: abs, defaultValue: '{{count}}y ago' });
    },
  };
}

function relativeTimeFormatter(locale: string): RelativeTimeLike {
  const existing = relativeTimeFormatters.get(locale);
  if (existing) return existing;
  const formatter = hasNativeRTF
    ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    : fallbackRelativeTimeFormat();
  relativeTimeFormatters.set(locale, formatter as Intl.RelativeTimeFormat);
  return formatter as Intl.RelativeTimeFormat;
}

export function safeDateTimeFormat(locale: string, options?: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  if (typeof Intl !== 'undefined' && typeof Intl.DateTimeFormat === 'function') {
    try {
      return new Intl.DateTimeFormat(locale, options);
    } catch {
      // fall through
    }
  }
  // Minimal fallback: numeric date/time without locale awareness
  const fallback = {
    format(date: Date): string {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      return options?.timeStyle ? `${h}:${min}` : `${y}-${m}-${d} ${h}:${min}`;
    },
  } as unknown as Intl.DateTimeFormat;
  return fallback;
}

export function safeNumberFormat(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  if (typeof Intl !== 'undefined' && typeof Intl.NumberFormat === 'function') {
    try {
      return new Intl.NumberFormat(locale, options);
    } catch {
      // fall through (e.g. 'style: unit' unsupported)
    }
  }
  const fallback = {
    format(value: number): string {
      const base = options?.maximumFractionDigits !== undefined
        ? value.toFixed(options.maximumFractionDigits)
        : String(Math.round(value));
      const unit = options?.unit;
      if (unit && options?.style === 'unit') {
        const labels: Record<string, string> = {
          day: 'day', days: 'days', hour: 'hour', hours: 'hours',
          minute: 'minute', minutes: 'minutes', second: 'second', seconds: 'seconds',
        };
        const label = labels[unit] ?? unit;
        return `${base} ${label}${Math.abs(value) === 1 ? '' : 's'}`;
      }
      return base;
    },
  } as unknown as Intl.NumberFormat;
  return fallback;
}

function dateTimeFormatter(locale: string): Intl.DateTimeFormat {
  const existing = dateTimeFormatters.get(locale);
  if (existing) return existing;
  const formatter = safeDateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  dateTimeFormatters.set(locale, formatter);
  return formatter;
}

function clockTimeFormatter(locale: string): Intl.DateTimeFormat {
  const existing = clockTimeFormatters.get(locale);
  if (existing) return existing;
  const formatter = safeDateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
  clockTimeFormatters.set(locale, formatter);
  return formatter;
}

function parseDateValue(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isSameLocalCalendarDay(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

export function isModelCommandText(text: string | null | undefined): boolean {
  return /^\/model(?:@[A-Za-z0-9_]+)?(?:\s|$)/i.test(text?.trim() ?? '');
}

export function isModelCommandResponseText(text: string | null | undefined): boolean {
  const normalized = text?.trim() ?? '';
  return /^## Model\s+- Current (?:model|selection error):/.test(normalized)
    || normalized.startsWith('Switched model preset to ')
    || normalized.startsWith('Could not switch model preset:')
    || normalized === 'Usage: `/model [preset]`';
}

export function visibleSessionPreview(value: string | null | undefined): string {
  const normalized = value?.trim() ?? '';
  return isModelCommandText(normalized) || isModelCommandResponseText(normalized) ? '' : normalized;
}

function isLowInformationTitlePreview(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[.!?。！？~～\s]+$/g, '').trim();
  return normalized.startsWith('/') || LOW_INFORMATION_TITLE_PREVIEWS.has(normalized);
}

export function sessionTitle(session: ChatSummary, fallback = i18n.t('chat.newChat')): string {
  const explicit = session.title?.trim();
  if (explicit) return explicit;
  const preview = visibleSessionPreview(session.preview).replace(/\s+/g, ' ').trim();
  if (!preview || isLowInformationTitlePreview(preview)) return fallback;
  return preview.length > 60 ? `${preview.slice(0, 57)}…` : preview;
}

export function relativeTime(value: string | number | null | undefined, locale?: string): string {
  const date = parseDateValue(value);
  if (!date) return '';
  return relativeTimeFromMs(date.getTime(), undefined, locale);
}

export function relativeTimeFromMs(
  valueMs: number,
  _absoluteAfterDays?: number,
  locale?: string,
): string {
  let delta = (valueMs - Date.now()) / 1_000;
  const formatter = relativeTimeFormatter(activeLocale(locale));
  for (const [step, unit] of RELATIVE_THRESHOLDS) {
    if (Math.abs(delta) < step) return formatter.format(Math.round(delta), unit);
    delta /= step;
  }
  return formatter.format(Math.round(delta), 'year');
}

export function formatDateTime(
  value: string | number | null | undefined,
  locale?: string,
): string {
  const date = parseDateValue(value);
  return date ? dateTimeFormatter(activeLocale(locale)).format(date) : '';
}

export function formatMessageEndTime(
  value: number | null | undefined,
  locale?: string,
): string {
  const date = parseDateValue(value);
  if (!date) return '';
  const resolvedLocale = activeLocale(locale);
  return isSameLocalCalendarDay(date, new Date())
    ? clockTimeFormatter(resolvedLocale).format(date)
    : dateTimeFormatter(resolvedLocale).format(date);
}
