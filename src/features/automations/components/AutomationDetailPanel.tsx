import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  PauseCircle,
  Pencil,
  PlayCircle,
  Trash2,
} from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import type { SessionAutomationJob } from '@/types/api/automations';
import type { Palette } from '@/ui/palette';

import type { AutomationAction } from './automations-utils';
import {
  automationStatus,
  automationSummary,
  formatDateTime,
  formatNext,
  formatNextTitle,
  formatSchedule,
  isLocalTrigger,
  originLabel,
} from './automations-utils';

function messageNeedsExpansion(message: string): boolean {
  return message.length > 360 || message.split(/\r?\n/).length > 6;
}

export function AutomationDetailPanel({
  job,
  colors,
  actionKey,
  onAction,
  onEdit,
  onRequestDelete,
  onOpenLinkedChat,
}: {
  job: SessionAutomationJob;
  colors: Palette;
  actionKey: string | null;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => Promise<void>;
  onEdit: () => void;
  onRequestDelete: () => void;
  onOpenLinkedChat: (sessionKey: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [expanded, setExpanded] = useState(false);
  const status = automationStatus(job, t);
  const detailText = automationSummary(job, t);
  const schedule = formatSchedule(job, t, locale);
  const created = formatDateTime(job.created_at_ms, locale);
  const updated = formatDateTime(job.updated_at_ms, locale);
  const sessionKey = job.origin?.channel === 'websocket' ? job.origin.session_key : undefined;


  return (
    <View style={styles.detailSection}>
      <View style={styles.detailHeader}>
        <View style={styles.detailHeaderCopy}>
          <Text numberOfLines={2} style={[styles.detailTitle, { color: colors.foreground }]}>{job.name || job.id}</Text>
          <View style={styles.detailBadges}>
            <StatusBadge colors={colors} tone={status.tone}>{status.label}</StatusBadge>
            <StatusBadge colors={colors}>{schedule}</StatusBadge>
            <StatusBadge colors={colors}>{originLabel(job, t)}</StatusBadge>
            {job.delete_after_run ? <StatusBadge colors={colors}>{t('settings.automations.oneShot')}</StatusBadge> : null}
          </View>
        </View>
        <AutomationActions
          actionKey={actionKey}
          colors={colors}
          job={job}
          onAction={onAction}
          onEdit={onEdit}
          onRequestDelete={onRequestDelete}
        />
      </View>

      <View style={[styles.messageCard, { backgroundColor: colors.background }]}>
        <Text style={[styles.detailLabel, { color: colors.subtle }]}>
          {isLocalTrigger(job)
            ? t('settings.automations.fields.command', { defaultValue: 'Command' })
            : t('settings.automations.fields.message')}
        </Text>
        <Text
          numberOfLines={!expanded && messageNeedsExpansion(detailText) ? 6 : undefined}
          selectable
          style={[styles.messageText, { color: colors.foreground }]}
        >
          {detailText}
        </Text>
        {messageNeedsExpansion(detailText) ? (
          <Pressable onPress={() => setExpanded((value) => !value)} style={styles.expandButton}>
            <Text style={[styles.expandText, { color: colors.muted }]}>
              {expanded ? t('settings.automations.message.showLess') : t('settings.automations.message.showMore')}
            </Text>
            {expanded
              ? <ChevronUp color={colors.muted} size={14} />
              : <ChevronDown color={colors.muted} size={14} />}
          </Pressable>
        ) : null}
      </View>

      <View style={styles.detailGrid}>
        <DetailCard
          colors={colors}
          label={t('settings.automations.labels.next')}
          title={formatNextTitle(job, t, locale)}
          value={formatNext(job, t, locale)}
        />
        <DetailCard
          colors={colors}
          label={t('settings.automations.labels.origin')}
          title={originLabel(job, t)}
          value={originLabel(job, t)}
          onPress={sessionKey ? () => onOpenLinkedChat(sessionKey) : undefined}
        />
      </View>

      {job.state.last_error ? (
        <View style={[styles.lastError, { backgroundColor: colors.errorBackground, borderColor: colors.errorText }]}>
          <Text selectable style={[styles.lastErrorText, { color: colors.errorText }]}>{job.state.last_error}</Text>
        </View>
      ) : null}

      <View style={[styles.metadataArea, { borderTopColor: colors.border }]}>
        <DetailCard colors={colors} label={t('settings.automations.labels.schedule')} title={schedule} value={schedule} />
        <View style={[styles.metadataCard, { backgroundColor: colors.background }]}>
          {created ? <MetadataLine colors={colors} label={t('settings.automations.labels.created')} value={created} /> : null}
          {updated ? <MetadataLine colors={colors} label={t('settings.automations.labels.updated')} value={updated} /> : null}
          <MetadataLine colors={colors} label="ID" mono value={job.id} />
        </View>
      </View>
    </View>
  );
}

function AutomationActions({
  job,
  colors,
  actionKey,
  onAction,
  onEdit,
  onRequestDelete,
}: {
  job: SessionAutomationJob;
  colors: Palette;
  actionKey: string | null;
  onAction: (action: AutomationAction, job: SessionAutomationJob) => Promise<void>;
  onEdit: () => void;
  onRequestDelete: () => void;
}) {
  const { t } = useTranslation();
  if (job.protected) {
    return (
      <View style={[styles.protectedBadge, { backgroundColor: colors.pressed }]}>
        <Text style={[styles.protectedText, { color: colors.muted }]}>{t('settings.automations.protected')}</Text>
      </View>
    );
  }
  const local = isLocalTrigger(job);
  const hasLinkedChat = Boolean(job.origin);
  const canRun = hasLinkedChat && job.enabled && !job.state.pending && !local;
  const toggle: AutomationAction = job.enabled ? 'disable' : 'enable';
  const canToggle = job.enabled || hasLinkedChat;
  return (
    <View style={[styles.actionGroup, { backgroundColor: colors.background }]}>
      <RoundAction accessibilityLabel={t('settings.automations.edit')} colors={colors} disabled={Boolean(actionKey)} onPress={onEdit}>
        <Pencil color={colors.muted} size={16} strokeWidth={1.8} />
      </RoundAction>
      {!local ? (
        <RoundAction
          accessibilityLabel={t('settings.automations.runNow')}
          busy={actionKey === `run:${job.id}`}
          colors={colors}
          disabled={!canRun || Boolean(actionKey)}
          onPress={() => void onAction('run', job)}
        >
          <PlayCircle color={colors.muted} size={17} strokeWidth={1.8} />
        </RoundAction>
      ) : null}
      <RoundAction
        accessibilityLabel={job.enabled ? t('settings.automations.pause') : t('settings.automations.resume')}
        busy={actionKey === `${toggle}:${job.id}`}
        colors={colors}
        disabled={!canToggle || Boolean(actionKey)}
        onPress={() => void onAction(toggle, job)}
      >
        {job.enabled
          ? <PauseCircle color={colors.muted} size={17} strokeWidth={1.8} />
          : <PlayCircle color={colors.muted} size={17} strokeWidth={1.8} />}
      </RoundAction>
      <RoundAction accessibilityLabel={t('settings.automations.delete')} colors={colors} danger disabled={Boolean(actionKey)} onPress={onRequestDelete}>
        <Trash2 color={colors.errorText} size={16} strokeWidth={1.8} />
      </RoundAction>
    </View>
  );
}

function RoundAction({
  accessibilityLabel,
  colors,
  children,
  disabled,
  danger = false,
  busy = false,
  onPress,
}: {
  accessibilityLabel: string;
  colors: Palette;
  children: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.roundAction,
        pressed && { backgroundColor: danger ? colors.errorBackground : colors.pressed },
        disabled && styles.disabled,
      ]}
    >
      {busy ? <ActivityIndicator color={danger ? colors.errorText : colors.muted} size="small" /> : children}
    </Pressable>
  );
}

function DetailCard({
  colors,
  label,
  value,
  title,
  onPress,
}: {
  colors: Palette;
  label: string;
  value: string;
  title?: string;
  onPress?: () => void;
}) {
  const body = (
    <View style={[styles.detailCard, { backgroundColor: colors.background }]}>
      <Text style={[styles.detailLabel, { color: colors.subtle }]}>{label}</Text>
      <View style={styles.detailCardValueRow}>
        <Text numberOfLines={2} style={[styles.detailCardValue, { color: colors.foreground }]}>{value}</Text>
        {onPress ? <ExternalLink color={colors.muted} size={13} strokeWidth={1.8} /> : null}
      </View>
      {title && title !== value ? <Text numberOfLines={1} style={[styles.detailSecondary, { color: colors.muted }]}>{title}</Text> : null}
    </View>
  );
  return onPress ? <Pressable accessibilityRole="link" onPress={onPress} style={styles.detailCardFlex}>{body}</Pressable> : <View style={styles.detailCardFlex}>{body}</View>;
}

function MetadataLine({ colors, label, value, mono = false }: { colors: Palette; label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.metadataLine}>
      <Text style={[styles.metadataLabel, { color: colors.subtle }]}>{label}</Text>
      <Text selectable style={[styles.metadataValue, mono && styles.mono, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

export function StatusBadge({ colors, tone = 'neutral', children }: { colors: Palette; tone?: 'neutral' | 'success' | 'warning'; children: React.ReactNode }) {
  const backgroundColor = tone === 'success' ? '#FCE8D6' : tone === 'warning' ? '#FFF0C9' : colors.background;
  const color = tone === 'success' ? '#9B5724' : tone === 'warning' ? '#8A631F' : colors.muted;
  return (
    <View style={[styles.statusBadge, { backgroundColor }]}>
      <Text numberOfLines={1} style={[styles.statusBadgeText, { color }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  detailSection: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 18, gap: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  detailHeaderCopy: { flex: 1, minWidth: 0 },
  detailTitle: { fontSize: 21, lineHeight: 27, fontWeight: '700' },
  detailBadges: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statusBadge: { minHeight: 24, maxWidth: 190, borderRadius: 12, paddingHorizontal: 9, justifyContent: 'center' },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  protectedBadge: { height: 36, borderRadius: 18, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center' },
  protectedText: { fontSize: 12, fontWeight: '600' },
  actionGroup: { borderRadius: 20, padding: 3, flexDirection: 'row' },
  roundAction: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.42 },
  messageCard: { borderRadius: 17, paddingHorizontal: 13, paddingVertical: 12 },
  detailLabel: { fontSize: 11, fontWeight: '600' },
  messageText: { marginTop: 7, fontSize: 13, lineHeight: 20 },
  expandButton: { marginTop: 7, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
  expandText: { fontSize: 12, fontWeight: '600' },
  detailGrid: { flexDirection: 'row', gap: 9 },
  detailCardFlex: { flex: 1, minWidth: 0 },
  detailCard: { minHeight: 80, borderRadius: 17, paddingHorizontal: 12, paddingVertical: 11 },
  detailCardValueRow: { marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailCardValue: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  detailSecondary: { marginTop: 2, fontSize: 10.5 },
  lastError: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  lastErrorText: { fontSize: 12, lineHeight: 18 },
  metadataArea: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 13, gap: 10 },
  metadataCard: { borderRadius: 18, padding: 13, gap: 14 },
  metadataLine: { gap: 5 },
  metadataLabel: { fontSize: 10.5 },
  metadataValue: { fontSize: 12.5, lineHeight: 18 },
  mono: { fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' },
});
