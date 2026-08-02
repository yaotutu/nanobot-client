import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SettingsPalette } from '@/features/settings/types';
import type { SettingsPayload, UsageDayInfo } from '@/types/api';

type TokenUsagePayload = NonNullable<SettingsPayload['usage']>;
type TokenUsageCell = {
  date: string;
  total: number;
  estimated: number;
  requests: number;
  sources: NonNullable<UsageDayInfo['sources']>;
  future: boolean;
};
type TokenUsageMonthLabel = {
  label: string;
  column: number;
};

const TOKEN_HEATMAP_CELLS = 371;
const TOKEN_HEATMAP_ROWS = 7;
const TOKEN_HEATMAP_COLUMNS = Math.ceil(TOKEN_HEATMAP_CELLS / TOKEN_HEATMAP_ROWS);
const TOKEN_HEATMAP_CELL_SIZE = 12;
const TOKEN_HEATMAP_GAP = 4;
const TOKEN_HEATMAP_COLUMN_WIDTH = TOKEN_HEATMAP_CELL_SIZE + TOKEN_HEATMAP_GAP;
const TOKEN_HEATMAP_WIDTH = TOKEN_HEATMAP_COLUMNS * TOKEN_HEATMAP_COLUMN_WIDTH - TOKEN_HEATMAP_GAP;
const TOKEN_USAGE_SOURCE_ORDER = ['user', 'api', 'cron', 'dream', 'system'] as const;

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utcDateFromIsoDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date));
}

function isoDayInTimeZone(date: Date, timeZone: string | undefined): string {
  if (!timeZone) return isoDay(date);
  try {
    const parts = new Intl.DateTimeFormat('en', {
      calendar: 'gregory',
      numberingSystem: 'latn',
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    if (values.year && values.month && values.day) {
      return `${values.year.padStart(4, '0')}-${values.month.padStart(2, '0')}-${values.day.padStart(2, '0')}`;
    }
  } catch {
    // Match WebUI: use UTC when the configured timezone is unavailable.
  }
  return isoDay(date);
}

function buildTokenUsageCalendar(
  days: UsageDayInfo[] | undefined,
  monthFormatter: Intl.DateTimeFormat,
  timeZone: string | undefined,
): { cells: TokenUsageCell[]; monthLabels: TokenUsageMonthLabel[] } {
  const byDate = new Map((days ?? []).map((day) => [day.date, day]));
  const today = utcDateFromIsoDay(isoDayInTimeZone(new Date(), timeZone));
  const end = addUtcDays(today, 6 - today.getUTCDay());
  const start = addUtcDays(end, -(TOKEN_HEATMAP_CELLS - 1));
  const monthLabels: TokenUsageMonthLabel[] = [];

  const cells = Array.from({ length: TOKEN_HEATMAP_CELLS }, (_, index) => {
    const date = addUtcDays(start, index);
    const key = isoDay(date);
    const row = byDate.get(key);
    if (date.getUTCDate() === 1) {
      monthLabels.push({
        label: monthFormatter.format(date),
        column: Math.floor(index / TOKEN_HEATMAP_ROWS) + 1,
      });
    }
    return {
      date: key,
      total: row?.total_tokens ?? 0,
      estimated: row?.estimated_tokens ?? 0,
      requests: row?.requests ?? 0,
      sources: row?.sources ?? {},
      future: date > today,
    };
  });

  return { cells, monthLabels };
}

function formatCompactTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens >= 10_000_000 ? 0 : 1)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(tokens >= 10_000 ? 0 : 1)}K`;
  return String(tokens);
}

function tokenUsageLevel(tokens: number, max: number): number {
  if (tokens <= 0 || max <= 0) return 0;
  const ratio = tokens / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.45) return 3;
  if (ratio >= 0.2) return 2;
  return 1;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function tokenUsageSourceLabel(source: string, t: Translate): string {
  if (source === 'user') return t('settings.usage.sources.user');
  if (source === 'api') return t('settings.usage.sources.api');
  if (source === 'cron') return t('settings.usage.sources.cron');
  if (source === 'dream') return t('settings.usage.sources.dream');
  if (source === 'system') return t('settings.usage.sources.system');
  return source;
}

function tokenUsageSourceBreakdown(cell: TokenUsageCell, t: Translate): string {
  const known = TOKEN_USAGE_SOURCE_ORDER.filter((source) => (cell.sources[source]?.total_tokens ?? 0) > 0);
  const extra = Object.keys(cell.sources)
    .filter((source) => !TOKEN_USAGE_SOURCE_ORDER.includes(source as typeof TOKEN_USAGE_SOURCE_ORDER[number]))
    .filter((source) => (cell.sources[source]?.total_tokens ?? 0) > 0)
    .sort();
  return [...known, ...extra]
    .map((source) => `${tokenUsageSourceLabel(source, t)} ${formatCompactTokens(cell.sources[source]?.total_tokens ?? 0)}`)
    .join(' · ');
}

function cellBackground(level: number, future: boolean, colors: SettingsPalette): string {
  if (future) return 'transparent';
  if (level === 4) return '#7DD3FC';
  if (level === 3) return 'rgba(14,165,233,0.82)';
  if (level === 2) return 'rgba(14,165,233,0.58)';
  if (level === 1) return 'rgba(14,165,233,0.30)';
  return colors.pressed;
}

function accessibilityLabel(cell: TokenUsageCell, t: Translate): string {
  if (cell.future) return cell.date;
  const baseLabel = t('settings.usage.cellTitle', {
    date: cell.date,
    tokens: formatCompactTokens(cell.total),
    requests: cell.requests,
  });
  const estimate = cell.estimated <= 0
    ? ''
    : cell.estimated >= cell.total
      ? t('settings.usage.estimated')
      : t('settings.usage.includesEstimates');
  const breakdown = tokenUsageSourceBreakdown(cell, t);
  return [baseLabel, estimate, breakdown].filter(Boolean).join(' · ');
}

export function TokenUsageHeatmap({
  colors,
  usage,
  timeZone,
}: {
  colors: SettingsPalette;
  usage?: TokenUsagePayload;
  timeZone?: string;
}) {
  const { i18n, t } = useTranslation();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? i18n.language, {
      month: 'short',
      timeZone: 'UTC',
    }),
    [i18n.language, i18n.resolvedLanguage],
  );
  const { cells, monthLabels } = useMemo(
    () => buildTokenUsageCalendar(usage?.days, monthFormatter, timeZone),
    [monthFormatter, timeZone, usage?.days],
  );
  const columns = useMemo(
    () => Array.from({ length: TOKEN_HEATMAP_COLUMNS }, (_, column) =>
      cells.slice(column * TOKEN_HEATMAP_ROWS, column * TOKEN_HEATMAP_ROWS + TOKEN_HEATMAP_ROWS)),
    [cells],
  );
  const maxTokens = Math.max(0, ...cells.map((cell) => cell.total));
  const selected = selectedDate ? cells.find((cell) => cell.date === selectedDate && !cell.future) : undefined;
  const selectedBreakdown = selected ? tokenUsageSourceBreakdown(selected, t) : '';
  const selectedLabel = selected ? accessibilityLabel(selected, t) : '';

  return (
    <View style={styles.root}>
      <ScrollView
        accessibilityLabel={t('settings.usage.title')}
        contentContainerStyle={styles.scrollContent}
        horizontal
        nestedScrollEnabled
        showsHorizontalScrollIndicator={false}
      >
        <View style={{ width: TOKEN_HEATMAP_WIDTH }}>
          <Text style={[styles.shortTitle, { color: colors.subtle }]}>{t('settings.usage.shortTitle')}</Text>
          <View pointerEvents="none" style={styles.monthLabels}>
            {monthLabels.map((month) => (
              <Text
                key={`${month.label}-${month.column}`}
                numberOfLines={1}
                style={[
                  styles.monthLabel,
                  { color: colors.subtle, left: (month.column - 1) * TOKEN_HEATMAP_COLUMN_WIDTH },
                ]}
              >
                {month.label}
              </Text>
            ))}
          </View>
          <View style={styles.columns}>
            {columns.map((column, columnIndex) => (
              <View key={column[0]?.date ?? columnIndex} style={styles.column}>
                {column.map((cell) => {
                  const level = tokenUsageLevel(cell.total, maxTokens);
                  const active = selectedDate === cell.date && !cell.future;
                  return (
                    <Pressable
                      accessibilityLabel={accessibilityLabel(cell, t)}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: cell.future, selected: active }}
                      disabled={cell.future}
                      hitSlop={2}
                      key={cell.date}
                      onPress={() => setSelectedDate((current) => current === cell.date ? null : cell.date)}
                      style={({ pressed }) => [
                        styles.cell,
                        {
                          backgroundColor: cellBackground(level, cell.future, colors),
                          borderColor: active ? colors.foreground : cell.future ? colors.border : 'transparent',
                        },
                        pressed && styles.cellPressed,
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      {selected ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={selectedLabel}
          accessibilityLabel={t('settings.usage.closeDetail', {
            defaultValue: 'Close token usage details',
          })}
          onPress={() => setSelectedDate(null)}
          style={[styles.detail, { backgroundColor: colors.pressed, borderColor: colors.border }]}
        >
          <Text selectable style={[styles.detailTitle, { color: colors.foreground }]}>            {t('settings.usage.cellTitle', {
              date: selected.date,
              tokens: formatCompactTokens(selected.total),
              requests: selected.requests,
            })}
          </Text>
          {selected.estimated > 0 ? (
            <Text style={[styles.detailMeta, { color: colors.subtle }]}>              {selected.estimated >= selected.total
                ? t('settings.usage.estimated')
                : t('settings.usage.includesEstimates')}
            </Text>
          ) : null}
          {selectedBreakdown ? (
            <Text selectable style={[styles.detailMeta, { color: colors.subtle }]}>{selectedBreakdown}</Text>
          ) : null}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 10 },
  scrollContent: { paddingHorizontal: 2, paddingBottom: 2 },
  shortTitle: { height: 14, textAlign: 'right', fontSize: 10.5, lineHeight: 13 },
  monthLabels: { position: 'relative', height: 22, marginTop: 2 },
  monthLabel: { position: 'absolute', top: 2, maxWidth: 44, fontSize: 10, lineHeight: 16 },
  columns: { flexDirection: 'row', gap: TOKEN_HEATMAP_GAP },
  column: { gap: TOKEN_HEATMAP_GAP },
  cell: {
    width: TOKEN_HEATMAP_CELL_SIZE,
    height: TOKEN_HEATMAP_CELL_SIZE,
    borderRadius: 3,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cellPressed: { transform: [{ scale: 1.18 }] },
  detail: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, gap: 3 },
  detailTitle: { fontSize: 11.5, lineHeight: 16, fontWeight: '600' },
  detailMeta: { fontSize: 10.5, lineHeight: 15 },
});
