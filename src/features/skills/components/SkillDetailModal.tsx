import {
  Brain,
  ChevronDown,
  ChevronUp,
  KeyRound,
  Terminal,
  X,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchSkillDetail } from '@/features/skills/api';
import type { SkillDetail, SkillSummary } from '@/types/api/capabilities';
import type { Palette } from '@/ui/palette';

import { skillSourceLabel } from './skill-presentation';
import { skillsScreenStyles as styles } from './skills-screen-styles';

export function SkillDetailModal({
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
  const mountedRef = useRef(true);
  const inFlightRef = useRef(false);
  const requestIdRef = useRef(0);

  const loadDetail = useCallback(async (retry = false) => {
    if (!skill || inFlightRef.current) return;
    inFlightRef.current = true;
    const requestId = ++requestIdRef.current;
    if (retry) {
      setLoading(true);
      setLoadFailed(false);
    }
    try {
      const payload = await fetchSkillDetail(skill.name);
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setDetail(payload);
      setLoadFailed(false);
    } catch {
      if (!mountedRef.current || requestId !== requestIdRef.current) return;
      setLoadFailed(true);
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
        inFlightRef.current = false;
      }
    }
  }, [skill]);

  useEffect(() => {
    mountedRef.current = true;
    const timer = setTimeout(() => void loadDetail(), 0);
    return () => {
      clearTimeout(timer);
      mountedRef.current = false;
      requestIdRef.current += 1;
      inFlightRef.current = false;
    };
  }, [loadDetail]);

  // Do not mount an invisible native modal tree. This also avoids hidden Fabric updates.
  if (!skill) return null;

  const activeSkill = detail ?? skill;
  const sourceLabel = skillSourceLabel(activeSkill.source, t);
  const statusLabel = activeSkill.available
    ? t('settings.skills.statusAvailable')
    : t('settings.skills.statusUnavailable');
  const closeLabel = t('common.dismiss');

  return (
    <Modal animationType="fade" onRequestClose={onClose} statusBarTranslucent transparent visible>
      <View style={styles.modalRoot}>
        <Pressable accessibilityLabel={closeLabel} accessibilityRole="button" onPress={onClose} style={styles.modalBackdrop} />
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
              accessibilityRole="button"
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
            <View accessibilityRole="alert" style={[styles.detailError, { backgroundColor: colors.errorBackground }]}>
              <Text style={[styles.errorText, { color: colors.errorText }]}>{t('settings.skills.loadFailed')}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void loadDetail(true)}
                style={styles.detailRetryButton}
              >
                <Text style={[styles.retryText, { color: colors.errorText }]}>{t('chat.retry')}</Text>
              </Pressable>
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
                    accessibilityLabel={t('settings.skills.rawInstructions')}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: rawOpen }}
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
  children: ReactNode;
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
