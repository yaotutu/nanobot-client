import {
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  KeyRound,
  RefreshCw,
  Terminal,
  X,
} from 'lucide-react-native';
import type { TFunction } from 'i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { fetchSkillDetail, fetchSkills } from '@/features/skills/api';
import type { SkillDetail, SkillSummary } from '@/types/api';
import type { Palette } from '@/ui/palette';


interface SkillsScreenProps {
  colors: Palette;
}

export function SkillsScreen({ colors }: SkillsScreenProps) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [selectedSkill, setSelectedSkill] = useState<SkillSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const payload = await fetchSkills();
      setSkills(payload.skills ?? []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('settings.skills.loadCatalogFailed', { defaultValue: 'Unable to load skills.' }));
      if (!refresh) setSkills([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [t]);

  useEffect(() => {
    let cancelled = false;
    fetchSkills()
      .then((payload) => {
        if (!cancelled) setSkills(payload.skills ?? []);
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : t('settings.skills.loadCatalogFailed', { defaultValue: 'Unable to load skills.' }));
          setSkills([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const availableCount = useMemo(
    () => skills.filter((skill) => skill.available).length,
    [skills],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.summaryRow}>
        <Text style={[styles.description, { color: colors.muted }]}>{t('settings.skills.description')}</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          {t('settings.skills.caption', { available: availableCount, total: skills.length })}
        </Text>
      </View>

      <View style={[styles.catalog, { backgroundColor: colors.card }]}>
        <View style={[styles.catalogHeader, { borderBottomColor: colors.border }]}>
          <Text style={[styles.catalogTitle, { color: colors.foreground }]}>{t('settings.skills.featured')}</Text>
          <View style={styles.headerActions}>
            <View style={[styles.countBadge, { backgroundColor: colors.background }]}>
              <Text style={[styles.countText, { color: colors.muted }]}>{skills.length}</Text>
            </View>
            <Pressable
              accessibilityLabel={t('settings.skills.refresh', { defaultValue: 'Refresh skills' })}
              hitSlop={8}
              onPress={() => void load(true)}
              style={({ pressed }) => [styles.refreshButton, pressed && { backgroundColor: colors.pressed }]}
            >
              {refreshing
                ? <ActivityIndicator color={colors.muted} size="small" />
                : <RefreshCw color={colors.muted} size={16} strokeWidth={1.8} />}
            </Pressable>
          </View>
        </View>

        {error ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
            <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
            <Pressable accessibilityLabel={t('settings.skills.retry', { defaultValue: 'Retry loading skills' })} onPress={() => void load()}>
              <Text style={[styles.retryText, { color: colors.errorText }]}>{t('settings.skills.retryLabel', { defaultValue: 'Retry' })}</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>{t('settings.skills.loading', { defaultValue: 'Loading skills...' })}</Text>
          </View>
        ) : (
          <FlatList
            contentContainerStyle={skills.length ? styles.listContent : styles.emptyContent}
            data={skills}
            keyExtractor={(item) => `${item.source}:${item.name}`}
            ListEmptyComponent={<Text style={[styles.emptyText, { color: colors.muted }]}>{t('settings.skills.empty')}</Text>}
            refreshControl={(
              <RefreshControl
                colors={[colors.muted]}
                onRefresh={() => void load(true)}
                refreshing={refreshing}
                tintColor={colors.muted}
              />
            )}
            renderItem={({ item }) => (
              <SkillRow colors={colors} onPress={() => setSelectedSkill(item)} skill={item} />
            )}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>

      <SkillDetailModal
        colors={colors}
        key={selectedSkill?.name ?? 'closed'}
        onClose={() => setSelectedSkill(null)}
        skill={selectedSkill}
      />
    </View>
  );
}

function SkillRow({
  skill,
  colors,
  onPress,
}: {
  skill: SkillSummary;
  colors: Palette;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const statusLabel = skill.available
    ? t('settings.skills.statusAvailable')
    : t('settings.skills.statusUnavailable');
  return (
    <Pressable
      accessibilityLabel={t('settings.skills.openDetails', { name: skill.name })}
      onPress={onPress}
      style={({ pressed }) => [
        styles.skillRow,
        { borderBottomColor: colors.border, opacity: skill.available ? 1 : 0.65 },
        pressed && { backgroundColor: colors.pressed },
      ]}
    >
      <View style={[styles.skillIcon, { backgroundColor: colors.background }]}>
        <Brain color={colors.muted} size={20} strokeWidth={1.8} />
      </View>
      <View style={styles.skillCopy}>
        <View style={styles.skillTitleRow}>
          <Text numberOfLines={1} style={[styles.skillTitle, { color: colors.foreground }]}>{skill.name}</Text>
          <View style={[styles.sourceBadge, { backgroundColor: colors.background }]}>
            <Text style={[styles.sourceText, { color: colors.muted }]}>{skillSourceLabel(skill.source, t)}</Text>
          </View>
        </View>
        <Text numberOfLines={2} style={[styles.skillDescription, { color: colors.muted }]}>{skill.description}</Text>
        {!skill.available && skill.unavailable_reason ? (
          <Text numberOfLines={1} style={[styles.unavailableReason, { color: colors.subtle }]}>
            {t('settings.skills.unavailableReason', { reason: skill.unavailable_reason })}
          </Text>
        ) : null}
      </View>
      <View style={[
        styles.statusBadge,
        { backgroundColor: skill.available ? '#E8F6ED' : colors.background },
      ]}>
        {skill.available
          ? <Check color="#237A45" size={13} strokeWidth={2.2} />
          : <CircleAlert color={colors.muted} size={13} strokeWidth={2} />}
        <Text style={[styles.statusText, { color: skill.available ? '#237A45' : colors.muted }]}>{statusLabel}</Text>
      </View>
    </Pressable>
  );
}

function SkillDetailModal({
  skill,
  colors,
  onClose,
}: {
  skill: SkillSummary | null;
  colors: Palette;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { t } = useTranslation();
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(skill));
  const [loadFailed, setLoadFailed] = useState(false);
  const [rawOpen, setRawOpen] = useState(false);

  useEffect(() => {
    if (!skill) return;
    let cancelled = false;
    fetchSkillDetail(skill.name)
      .then((payload) => {
        if (!cancelled) setDetail(payload);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [skill]);

  // Do not mount an invisible native modal tree. This also avoids hidden Fabric updates.
  if (!skill) return null;

  const activeSkill = detail ?? skill;
  const sourceLabel = skillSourceLabel(activeSkill.source, t);
  const statusLabel = activeSkill.available
    ? t('settings.skills.statusAvailable')
    : t('settings.skills.statusUnavailable');
  const closeLabel = t('settings.skills.closeDetails', { defaultValue: 'Close skill details' });

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={closeLabel} onPress={onClose} style={styles.modalBackdrop} />
        <View
          style={[
            styles.detailPanel,
            {
              width: Math.min(width - 16, 544),
              backgroundColor: colors.background,
              paddingTop: insets.top + 10,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <View style={styles.detailTopBar}>
            <View style={[styles.detailIcon, { backgroundColor: colors.card }]}>
              <Brain color={colors.muted} size={20} strokeWidth={1.8} />
            </View>
            <View style={styles.detailHeading}>
              <Text numberOfLines={1} style={[styles.detailTitle, { color: colors.foreground }]}>{activeSkill.name}</Text>
              <View style={styles.detailBadges}>
                <Pill colors={colors} label={sourceLabel} />
                <Pill colors={colors} label={statusLabel} success={activeSkill.available} />
              </View>
            </View>
            <Pressable
              accessibilityLabel={closeLabel}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && { backgroundColor: colors.pressed }]}
            >
              <X color={colors.muted} size={18} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.detailLoading}>
              <ActivityIndicator color={colors.muted} />
              <Text style={[styles.detailLoadingText, { color: colors.muted }]}>{t('settings.skills.loadingDetail')}</Text>
            </View>
          ) : loadFailed ? (
            <View style={[styles.detailError, { backgroundColor: colors.errorBackground }]}>
              <Text style={[styles.errorText, { color: colors.errorText }]}>{t('settings.skills.loadFailed')}</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.detailContent}
              contentInsetAdjustmentBehavior="automatic"
              showsVerticalScrollIndicator={false}
            >
              <DetailSection colors={colors} title={t('settings.skills.descriptionTitle')}>
                <Text style={[styles.detailDescription, { color: colors.muted }]}>{activeSkill.description}</Text>
              </DetailSection>

              <View style={styles.metaGrid}>
                <MetaItem colors={colors} label={t('settings.skills.source')} value={sourceLabel} />
                <MetaItem colors={colors} label={t('settings.skills.status')} value={statusLabel} />
              </View>

              {!activeSkill.available && activeSkill.unavailable_reason ? (
                <DetailSection colors={colors} title={t('settings.skills.unavailableReasonLabel')}>
                  <Text style={[styles.unavailableDetail, { color: colors.errorText }]}>{activeSkill.unavailable_reason}</Text>
                </DetailSection>
              ) : null}

              {detail ? <RequirementsSection colors={colors} detail={detail} /> : null}

              {detail ? (
                <View style={[styles.rawBlock, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <Pressable
                    accessibilityLabel={rawOpen
                      ? t('settings.skills.collapseRaw', { defaultValue: 'Collapse raw SKILL.md' })
                      : t('settings.skills.expandRaw', { defaultValue: 'Expand raw SKILL.md' })}
                    onPress={() => setRawOpen((value) => !value)}
                    style={styles.rawHeader}
                  >
                    <Text style={[styles.rawTitle, { color: colors.foreground }]}>{t('settings.skills.rawInstructions')}</Text>
                    {rawOpen
                      ? <ChevronUp color={colors.muted} size={16} />
                      : <ChevronDown color={colors.muted} size={16} />}
                  </Pressable>
                  {rawOpen ? (
                    <View style={[styles.rawContent, { borderColor: colors.border, backgroundColor: colors.background }]}>
                      <Text selectable style={[styles.rawText, { color: colors.muted }]}>
                        {detail.raw_markdown || t('settings.skills.rawInstructionsEmpty')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function RequirementsSection({ detail, colors }: { detail: SkillDetail; colors: Palette }) {
  const { t } = useTranslation();
  const { bins, env, missing_bins: missingBins, missing_env: missingEnv } = detail.requirements;
  const hasRequirements = bins.length > 0 || env.length > 0;
  return (
    <DetailSection colors={colors} title={t('settings.skills.requirements')}>
      {hasRequirements ? (
        <View style={styles.requirements}>
          {missingBins.length ? <RequirementLine colors={colors} danger icon="terminal" items={missingBins} title={t('settings.skills.missingCommands')} /> : null}
          {missingEnv.length ? <RequirementLine colors={colors} danger icon="key" items={missingEnv} title={t('settings.skills.missingEnvironment')} /> : null}
          {bins.length ? <RequirementLine colors={colors} icon="terminal" items={bins} title={t('settings.skills.commands')} /> : null}
          {env.length ? <RequirementLine colors={colors} icon="key" items={env} title={t('settings.skills.environment')} /> : null}
        </View>
      ) : (
        <Text style={[styles.noRequirements, { color: colors.muted }]}>{t('settings.skills.noRequirements')}</Text>
      )}
    </DetailSection>
  );
}

function DetailSection({
  title,
  colors,
  children,
}: {
  title: string;
  colors: Palette;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.detailSection}>
      <Text style={[styles.detailSectionTitle, { color: colors.muted }]}>{title}</Text>
      {children}
    </View>
  );
}

function MetaItem({ label, value, colors }: { label: string; value: string; colors: Palette }) {
  return (
    <View style={[styles.metaItem, { backgroundColor: colors.card }]}>
      <Text style={[styles.metaLabel, { color: colors.muted }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.metaValue, { color: colors.foreground }]}>{value}</Text>
    </View>
  );
}

function RequirementLine({
  title,
  items,
  icon,
  colors,
  danger = false,
}: {
  title: string;
  items: string[];
  icon: 'terminal' | 'key';
  colors: Palette;
  danger?: boolean;
}) {
  const tint = danger ? colors.errorText : colors.muted;
  return (
    <View style={styles.requirementLine}>
      <View style={styles.requirementTitleRow}>
        {icon === 'terminal'
          ? <Terminal color={tint} size={14} />
          : <KeyRound color={tint} size={14} />}
        <Text style={[styles.requirementTitle, { color: tint }]}>{title}</Text>
      </View>
      <View style={styles.requirementPills}>
        {items.map((item) => <Pill colors={colors} key={item} label={item} />)}
      </View>
    </View>
  );
}

function Pill({
  label,
  colors,
  success = false,
}: {
  label: string;
  colors: Palette;
  success?: boolean;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: success ? '#E8F6ED' : colors.card }]}>
      <Text numberOfLines={1} style={[styles.pillText, { color: success ? '#237A45' : colors.muted }]}>{label}</Text>
    </View>
  );
}

function skillSourceLabel(source: string, t: TFunction): string {
  if (source === 'workspace') return t('settings.skills.sourceWorkspace');
  if (source === 'builtin') return t('settings.skills.sourceBuiltin');
  return source;
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  summaryRow: { marginBottom: 22, gap: 6 },
  description: { maxWidth: 680, fontSize: 13, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '600' },
  catalog: { flex: 1, borderRadius: 22, paddingHorizontal: 12, paddingTop: 12, overflow: 'hidden' },
  catalogHeader: { minHeight: 45, borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 4, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catalogTitle: { fontSize: 13, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  countBadge: { minWidth: 31, height: 25, borderRadius: 13, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  countText: { fontSize: 12, fontWeight: '600' },
  refreshButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  errorBanner: { marginTop: 10, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
  errorText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  retryText: { fontSize: 12.5, fontWeight: '700' },
  loadingState: { flex: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center', gap: 9 },
  listContent: { paddingVertical: 9, paddingBottom: 20 },
  emptyContent: { flexGrow: 1, minHeight: 220, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 13 },
  skillRow: { minHeight: 84, borderBottomWidth: StyleSheet.hairlineWidth, borderRadius: 16, paddingHorizontal: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 11 },
  skillIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  skillCopy: { flex: 1, minWidth: 0 },
  skillTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  skillTitle: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: '700' },
  sourceBadge: { borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  sourceText: { fontSize: 10, fontWeight: '700' },
  skillDescription: { marginTop: 3, fontSize: 13, lineHeight: 19 },
  unavailableReason: { marginTop: 2, fontSize: 11.5, lineHeight: 16 },
  statusBadge: { minHeight: 27, borderRadius: 14, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusText: { fontSize: 11, fontWeight: '700' },
  modalRoot: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  modalBackdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.24)' },
  detailPanel: { height: '100%', paddingHorizontal: 18, shadowColor: '#000', shadowOffset: { width: -8, height: 0 }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 16 },
  detailTopBar: { minHeight: 62, flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  detailIcon: { width: 48, height: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  detailHeading: { flex: 1, minWidth: 0, paddingTop: 1 },
  detailTitle: { fontSize: 20, lineHeight: 27, fontWeight: '700' },
  detailBadges: { marginTop: 5, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  closeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  detailLoading: { marginTop: 28, flexDirection: 'row', alignItems: 'center', gap: 9 },
  detailLoadingText: { fontSize: 13 },
  detailError: { marginTop: 28, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 12 },
  detailContent: { paddingTop: 24, paddingBottom: 26, gap: 23 },
  detailSection: { gap: 8 },
  detailSectionTitle: { fontSize: 12, fontWeight: '600' },
  detailDescription: { fontSize: 14, lineHeight: 23 },
  metaGrid: { flexDirection: 'row', gap: 8 },
  metaItem: { flex: 1, minWidth: 0, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  metaLabel: { fontSize: 11 },
  metaValue: { marginTop: 2, fontSize: 13, fontWeight: '600' },
  unavailableDetail: { fontSize: 13, lineHeight: 20 },
  requirements: { gap: 13 },
  noRequirements: { fontSize: 13 },
  requirementLine: { gap: 7 },
  requirementTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  requirementTitle: { fontSize: 12 },
  requirementPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: { maxWidth: '100%', minHeight: 24, borderRadius: 12, paddingHorizontal: 9, alignItems: 'center', justifyContent: 'center' },
  pillText: { maxWidth: 260, fontSize: 11, fontWeight: '600' },
  rawBlock: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 18, padding: 12 },
  rawHeader: { minHeight: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rawTitle: { fontSize: 13, fontWeight: '600' },
  rawContent: { marginTop: 10, maxHeight: 520, borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, paddingHorizontal: 13, paddingVertical: 12 },
  rawText: { fontSize: 12, lineHeight: 20, fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' },
});
