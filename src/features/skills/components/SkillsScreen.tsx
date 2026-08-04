import Brain from 'lucide-react-native/icons/brain';
import Check from 'lucide-react-native/icons/check';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import RefreshCw from 'lucide-react-native/icons/refresh-cw';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';

import { useSkillsCatalog } from '@/features/skills/hooks/use-skills-catalog';
import type { SkillSummary } from '@/types/api/capabilities';
import type { Palette } from '@/ui/palette';

import { SkillDetailModal } from './SkillDetailModal';
import { skillSourceLabel } from './skill-presentation';
import { skillsScreenStyles as styles } from './skills-screen-styles';

interface SkillsScreenProps {
  colors: Palette;
}

export function SkillsScreen({ colors }: SkillsScreenProps) {
  const { t } = useTranslation();
  const { error, load, loading, refreshing, skills } = useSkillsCatalog();
  const [selectedSkill, setSelectedSkill] = useState<SkillSummary | null>(null);

  const availableCount = useMemo(
    () => skills.filter((skill) => skill.available).length,
    [skills],
  );
  const catalogBusy = loading || refreshing;

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
              accessibilityLabel={t('common.refresh')}
              accessibilityRole="button"
              accessibilityState={{ busy: refreshing, disabled: catalogBusy }}
              disabled={catalogBusy}
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
          <View accessibilityRole="alert" style={[styles.errorBanner, { backgroundColor: colors.errorBackground }]}>
            <Text style={[styles.errorText, { color: colors.errorText }]}>{error}</Text>
            <Pressable accessibilityRole="button" onPress={() => void load(skills.length > 0)}>
              <Text style={[styles.retryText, { color: colors.errorText }]}>{t('chat.retry')}</Text>
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
                enabled={!catalogBusy}
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
      accessibilityRole="button"
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
