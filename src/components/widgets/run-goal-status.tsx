import { ChevronUp, CircleDotDashed, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppState,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { GoalStateWsPayload } from '@/types/api/runtime';

import { MarkdownText } from './markdown-text';

interface RunGoalPalette {
  background: string;
  foreground: string;
  muted: string;
  subtle: string;
  border: string;
  card: string;
  pressed: string;
}

interface RunGoalStatusProps {
  colors: RunGoalPalette;
  dark: boolean;
  goalState?: GoalStateWsPayload;
  runStartedAt: number | null;
}

function goalPreview(goalState: GoalStateWsPayload | undefined, fallback: string): string | null {
  if (!goalState?.active) return null;
  const summary = goalState.ui_summary?.trim();
  if (summary) return summary;
  const objective = goalState.objective?.trim();
  if (objective) return objective.length > 72 ? `${objective.slice(0, 72)}…` : objective;
  return fallback;
}

function elapsedLabel(startedAt: number | null, nowMs: number): string | null {
  if (startedAt == null) return null;
  const elapsed = Math.max(0, Math.floor(nowMs / 1000 - startedAt));
  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : `${seconds}s`;
}

function goalMarkdown(goalState?: GoalStateWsPayload): string {
  const summary = goalState?.ui_summary?.trim() ?? '';
  const objective = goalState?.objective?.trim() ?? '';
  if (summary && objective) return `${summary}\n\n---\n\n${objective}`;
  return objective || summary;
}

export function RunGoalStatus({ colors, dark, goalState, runStartedAt }: RunGoalStatusProps) {
  const { t } = useTranslation();
  const [nowMs, setNowMs] = useState(0);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const [goalOpen, setGoalOpen] = useState(false);
  const preview = goalPreview(goalState, t('thread.composer.goalStateFallback'));
  const elapsed = elapsedLabel(runStartedAt, nowMs);
  const active = Boolean(elapsed || preview);
  const markdown = useMemo(() => goalMarkdown(goalState), [goalState]);
  const canExpand = Boolean(goalState?.active && markdown);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const nextActive = state === 'active';
      setAppActive(nextActive);
      if (nextActive) setNowMs(Date.now());
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (runStartedAt == null || !appActive) return;
    const immediate = setTimeout(() => setNowMs(Date.now()), 0);
    const timer = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => {
      clearTimeout(immediate);
      clearInterval(timer);
    };
  }, [appActive, runStartedAt]);

  useEffect(() => {
    if (active && canExpand) return;
    const timer = setTimeout(() => setGoalOpen(false), 0);
    return () => clearTimeout(timer);
  }, [active, canExpand]);

  if (!active) return null;

  return (
    <>
      <Pressable
        accessibilityLabel={elapsed
          ? t('thread.composer.runRuntimeTitle', { elapsed })
          : preview ?? undefined}
        accessibilityRole={canExpand ? 'button' : undefined}
        disabled={!canExpand}
        onPress={() => setGoalOpen(true)}
        style={({ pressed }) => [
          styles.strip,
          { borderBottomColor: colors.border, backgroundColor: colors.pressed },
          pressed && canExpand ? styles.pressed : null,
        ]}
      >
        <CircleDotDashed color={colors.muted} size={15} strokeWidth={1.9} />
        {elapsed ? (
          <Text style={[styles.elapsed, { color: colors.muted }]}>{elapsed}</Text>
        ) : null}
        {elapsed && preview ? <View style={[styles.divider, { backgroundColor: colors.border }]} /> : null}
        {preview ? (
          <Text numberOfLines={1} style={[styles.preview, { color: colors.muted }]}>{preview}</Text>
        ) : null}
        {canExpand ? <ChevronUp color={colors.subtle} size={14} strokeWidth={2} /> : null}
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setGoalOpen(false)}
        transparent
        visible={goalOpen}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityLabel={t('thread.composer.goalStateCloseAria')}
            onPress={() => setGoalOpen(false)}
            style={styles.backdrop}
          />
          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.panelHeader, { borderBottomColor: colors.border }]}>
              <View style={styles.panelTitleRow}>
                <CircleDotDashed color={colors.muted} size={17} strokeWidth={1.9} />
                <Text style={[styles.panelTitle, { color: colors.foreground }]}>
                  {t('thread.composer.goalStateSheetTitle')}
                </Text>
              </View>
              <Pressable
                accessibilityLabel={t('thread.composer.goalStateCloseAria')}
                hitSlop={8}
                onPress={() => setGoalOpen(false)}
                style={styles.closeButton}
              >
                <X color={colors.muted} size={18} strokeWidth={2} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.panelBody} showsVerticalScrollIndicator={false}>
              <MarkdownText colors={colors} dark={dark}>{markdown}</MarkdownText>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  strip: {
    minHeight: 34,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pressed: { opacity: 0.76 },
  elapsed: { fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  divider: { width: StyleSheet.hairlineWidth, height: 14 },
  preview: { minWidth: 0, flex: 1, fontSize: 11.5, lineHeight: 16 },
  modalRoot: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 12, paddingBottom: 18 },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.38)' },
  panel: {
    maxHeight: '64%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  panelHeader: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingLeft: 16,
    paddingRight: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  panelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelTitle: { fontSize: 15, fontWeight: '700' },
  closeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  panelBody: { paddingHorizontal: 17, paddingTop: 16, paddingBottom: 24 },
});
