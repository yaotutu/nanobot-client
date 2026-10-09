import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View, type DimensionValue } from 'react-native';
import type { Palette } from '@/ui/palette';
import { hasUpdate, updateBusy, type UpdateState } from '../store';

export function updateSummaryKey(state: UpdateState) {
  if (!state.runtime.supported) return 'updates.unsupported';
  if (state.checkStatus === 'checking') return 'updates.checking';
  if (state.checkError) return 'updates.errors.' + state.checkError;
  if (hasUpdate(state)) return 'updates.available';
  if (state.checkStatus === 'checked') return state.candidate ? 'updates.upToDate' : 'updates.noPublished';
  return 'updates.unknown';
}

/** 纯展示组件：更新动作由应用级状态负责，设置关闭/返回不会中止下载。 */
export function UpdateDetails({ colors, updates }: { colors: Palette; updates: UpdateState }) {
  const { t, i18n } = useTranslation();
  const styles = createStyles(colors);
  const { candidate, runtime, stage } = updates;
  const available = hasUpdate(updates);
  const busy = updateBusy(updates);
  const allowed = runtime.supported && !runtime.development;
  const size = candidate?.size ?? 0;
  const percent = size ? Math.min(100, Math.round(updates.downloadedBytes / size * 100)) : 0;
  const date = (value: string | number) => new Date(value).toLocaleString(i18n.language);
  const action = (label: string, callback: () => Promise<void>, disabled = false, secondary = false) => (
    <Pressable accessibilityRole="button" accessibilityLabel={t(label)} disabled={disabled} accessibilityState={{ disabled }}
      onPress={() => { void callback(); }} style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled) && styles.dim]}>
      <Text style={secondary ? styles.secondaryText : styles.buttonText}>{t(label)}</Text>
    </Pressable>
  );
  return (
    <View style={styles.content}>
      <View style={styles.group}>
        <View style={styles.row}><Text style={styles.label}>{t('updates.currentVersion')}</Text><Text selectable style={styles.value}>{runtime.version ?? '—'} ({runtime.versionCode})</Text></View>
        {candidate ? <>
          <View style={styles.divider} />
          <View style={styles.row}><Text style={styles.label}>{t('updates.latestVersion')}</Text><Text selectable style={styles.value}>{candidate.version}</Text></View>
          <View style={styles.row}><Text style={styles.label}>{t('updates.publishedAt')}</Text><Text style={styles.value}>{date(candidate.publishedAt)}</Text></View>
          <View style={styles.row}><Text style={styles.label}>{t('updates.size')}</Text><Text style={styles.value}>{(size / 1048576).toFixed(1)} MB</Text></View>
        </> : null}
      </View>
      <Text accessibilityLiveRegion="polite" style={updates.checkError ? styles.error : styles.hint}>{t(updateSummaryKey(updates))}</Text>
      {!runtime.supported ? null : <>
        <Text style={styles.hint}>{t('updates.lastChecked')}: {updates.lastCheckedAt ? date(updates.lastCheckedAt) : t('updates.never')}</Text>
        {action(updates.checkStatus === 'checking' ? 'updates.checking' : 'updates.check', () => updates.check(true), busy || updates.checkStatus === 'checking', true)}
      </>}
      {runtime.development && runtime.supported ? <Text style={styles.hint}>{t('updates.development')}</Text> : null}
      {candidate ? <View style={styles.notes}>
        <Text style={styles.heading}>{t('updates.notes')}</Text>
        <Text selectable style={styles.notesText}>{candidate.notes || t('updates.noNotes')}</Text>
      </View> : null}
      {updates.actionError ? <Text accessibilityLiveRegion="polite" style={styles.error}>{t('updates.errors.' + updates.actionError)}</Text> : null}
      {stage === 'downloading' ? <View style={styles.progressSection}>
        <Text style={styles.label}>{t('updates.downloading')}</Text>
        <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }} style={styles.track}>
          <View style={[styles.fill, { width: (percent + '%') as DimensionValue }]} />
        </View>
        <Text style={styles.hint}>{t('updates.progress', { percent, downloaded: (updates.downloadedBytes / 1048576).toFixed(1), total: (size / 1048576).toFixed(1) })}</Text>
        {action('updates.cancel', async () => updates.cancel(), false, true)}
      </View> : null}
      {available && allowed ? <>
        {stage === 'ready' ? <Text style={styles.hint}>{t('updates.downloaded')}</Text> : null}
        {stage === 'installing' ? <Text style={styles.hint}>{t('updates.installing')}</Text> : null}
        {!busy ? action(stage === 'ready' ? 'updates.install' : 'updates.download', stage === 'ready' ? updates.install : updates.download, updates.checkStatus === 'checking') : null}
        <Text style={styles.hint}>{t('updates.installHint')}</Text>
        {stage === 'ready' ? <>
          <Text style={styles.hint}>{t('updates.permissionHint')}</Text>
          {action('updates.permission', updates.permission, false, true)}
        </> : null}
      </> : null}
    </View>
  );
}
const createStyles = (colors: Palette) => StyleSheet.create({
  content: { gap: 16 },
  group: { borderRadius: 23, backgroundColor: colors.pressed, padding: 16, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  label: { color: colors.foreground, fontSize: 14 },
  value: { flex: 1, textAlign: 'right', color: colors.muted, fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  error: { color: colors.errorText, fontSize: 13, lineHeight: 20 },
  heading: { color: colors.foreground, fontSize: 16, fontWeight: '600' },
  notes: { gap: 10 },
  notesText: { color: colors.muted, fontSize: 13, lineHeight: 21 },
  button: { minHeight: 48, padding: 12, borderRadius: 16, backgroundColor: '#208AEF', alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  secondary: { backgroundColor: colors.pressed },
  secondaryText: { color: colors.foreground, fontSize: 14, fontWeight: '500' },
  dim: { opacity: 0.5 },
  progressSection: { gap: 12 },
  track: { height: 5, borderRadius: 3, backgroundColor: colors.pressed, overflow: 'hidden' },
  fill: { height: 5, backgroundColor: '#208AEF' },
});
