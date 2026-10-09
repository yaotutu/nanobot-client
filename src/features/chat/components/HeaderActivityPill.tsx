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
  colors: Palette;
}

/** 顶部 Agent 状态标签；点击行为由外层头像区域统一处理。 */
export function HeaderActivityPill({
  activity,
  colors,
}: HeaderActivityPillProps) {
  const { t } = useTranslation();

  // 空闲显示 Agent 身份，工作时在原位替换为状态；两种状态尺寸一致，不让头像上下跳动。
  const active = activity.phase !== 'idle';
  const label = active ? activityLabel(activity, t) : t('app.brand');
  const dotColor = headerActivityDotColor(activity.phase, colors);

  return (
    <View testID="header-activity-pill" style={[styles.pill, { backgroundColor: colors.pressed }]}>
      {active ? <View style={[styles.dot, { backgroundColor: dotColor }]} /> : null}
      <Text numberOfLines={1} style={[styles.text, { color: colors.foreground }]}>
        {label}
      </Text>
    </View>
  );
}

function activityLabel(activity: HeaderActivity, t: TFunction) {
  if (activity.phase === 'done' && activity.durationMs !== undefined) {
    return t('thread.agentActivity.done', { duration: formatDuration(activity.durationMs) });
  }
  return t(`thread.agentActivity.${activity.phase}`);
}

const styles = StyleSheet.create({
  pill: {
    height: 30,
    minWidth: 80,
    maxWidth: '100%',
    marginTop: -8,
    paddingHorizontal: 14,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  text: { flexShrink: 1, fontSize: 12, lineHeight: 18, fontWeight: '500' },
  dot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
});
