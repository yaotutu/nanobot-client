import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SessionAutomationJob } from '@/types/api/automations';
import type { Palette } from '@/ui/palette';

import {
  automationStatus,
  automationSummary,
  formatNext,
  originLabel,
  statusDotColor,
} from './automations-utils';
import { StatusBadge } from './AutomationDetailPanel';

export function AutomationListItem({
  job,
  selected,
  colors,
  onSelect,
}: {
  job: SessionAutomationJob;
  selected: boolean;
  colors: Palette;
  onSelect: () => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const status = automationStatus(job, t);
  return (
    <Pressable
      accessibilityLabel={`${job.name || job.id}，${status.label}`}
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.jobRow,
        { backgroundColor: selected || pressed ? colors.background : 'transparent' },
      ]}
    >
      <View style={styles.jobMain}>
        <View style={styles.jobNameRow}>
          <View style={[styles.statusDot, { backgroundColor: statusDotColor(job) }]} />
          <Text numberOfLines={1} style={[styles.jobName, { color: colors.foreground }]}>{job.name || job.id}</Text>
        </View>
        <Text numberOfLines={2} style={[styles.jobSummary, { color: colors.muted }]}>{automationSummary(job, t)}</Text>
        <View style={styles.jobMetaRow}>
          <Text numberOfLines={1} style={[styles.jobMeta, { color: colors.subtle }]}>{formatNext(job, t, locale)}</Text>
          <Text style={[styles.jobMetaDot, { color: colors.subtle }]}>·</Text>
          <Text numberOfLines={1} style={[styles.jobMeta, { color: colors.subtle }]}>{originLabel(job, t)}</Text>
        </View>
      </View>
      <View style={styles.jobBadges}>
        <StatusBadge colors={colors} tone={status.tone}>{status.label}</StatusBadge>
        {job.delete_after_run ? <Text style={[styles.oneTime, { color: colors.subtle }]}>{t('settings.automations.oneShot')}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  jobRow: { minHeight: 116, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  jobMain: { flex: 1, minWidth: 0 },
  jobNameRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  jobName: { flex: 1, fontSize: 13.5, fontWeight: '700' },
  jobSummary: { marginTop: 7, fontSize: 12, lineHeight: 18 },
  jobMetaRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  jobMeta: { maxWidth: '46%', fontSize: 10.5 },
  jobMetaDot: { fontSize: 10 },
  jobBadges: { alignItems: 'flex-end', gap: 5 },
  oneTime: { fontSize: 10.5 },
});
