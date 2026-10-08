import AlertCircle from 'lucide-react-native/icons/circle-alert';
import Check from 'lucide-react-native/icons/check';
import FilePenLine from 'lucide-react-native/icons/file-pen-line';
import MessageCircle from 'lucide-react-native/icons/message-circle';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Wrench from 'lucide-react-native/icons/wrench';
import { StyleSheet, Text, View } from 'react-native';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { formatDuration } from '@/features/chat/activity/model/activity-format';
import {
  headerActivityDotColor,
  type HeaderActivity,
} from '@/features/chat/activity/model/header-activity';
import type { Palette } from '@/ui/palette';

interface HeaderActivityPillProps {
  activity: HeaderActivity;
  chatTitle: string;
  colors: Palette;
  hasUserPrompts: boolean;
}

/** 顶部 Agent 状态标签；点击行为由外层头像区域统一处理。 */
export function HeaderActivityPill({
  activity,
  chatTitle,
  colors,
  hasUserPrompts,
}: HeaderActivityPillProps) {
  const { t } = useTranslation();
  const isIdle = activity.phase === 'idle';

  if (isIdle) {
    return (
      <View style={[styles.pill, { backgroundColor: colors.pressed }]}>
        <Text numberOfLines={1} style={[styles.text, { color: colors.muted }]}>
          {hasUserPrompts ? chatTitle : t('sidebar.newChat')}
        </Text>
      </View>
    );
  }

  const label = activityLabel(activity, t);
  const dotColor = headerActivityDotColor(activity.phase, colors);

  return (
    <View style={[styles.pill, styles.statusPill, { backgroundColor: colors.pressed }]}>
        <ActivityPhaseIcon color={colors.foreground} phase={activity.phase} />
        <Text numberOfLines={1} style={[styles.text, styles.statusText, { color: colors.foreground }]}>
          {label}
        </Text>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
    </View>
  );
}

function activityLabel(activity: HeaderActivity, t: TFunction) {
  if (activity.phase === 'done' && activity.durationMs !== undefined) {
    return t('thread.agentActivity.done', { duration: formatDuration(activity.durationMs) });
  }
  return t(`thread.agentActivity.${activity.phase}`);
}

/** 状态图标在组件外声明，避免每次 render 重新创建组件导致状态丢失。 */
function ActivityPhaseIcon({ color, phase }: { color: string; phase: HeaderActivity['phase'] }) {
  if (phase === 'thinking' || phase === 'waiting') return <Sparkles color={color} size={13} strokeWidth={1.8} />;
  if (phase === 'tool') return <Wrench color={color} size={13} strokeWidth={1.8} />;
  if (phase === 'file') return <FilePenLine color={color} size={13} strokeWidth={1.8} />;
  if (phase === 'replying') return <MessageCircle color={color} size={13} strokeWidth={1.8} />;
  if (phase === 'done') return <Check color={color} size={13} strokeWidth={1.8} />;
  if (phase === 'error') return <AlertCircle color={color} size={13} strokeWidth={1.8} />;
  return <Sparkles color={color} size={13} strokeWidth={1.8} />;
}
const styles = StyleSheet.create({
  pill: {
    minHeight: 28,
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusPill: { minWidth: 88 },
  text: { flexShrink: 1, fontSize: 11, lineHeight: 16 },
  statusText: { fontWeight: '500' },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
});
