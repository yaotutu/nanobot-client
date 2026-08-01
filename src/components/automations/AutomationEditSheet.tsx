import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Check, X } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';

import { safeDateTimeFormat } from '@/services/format';
import type { AutomationUpdatePayload, SessionAutomationJob } from '@/types/api';
import type { Palette } from '@/ui/palette';

import {
  EVERY_UNITS,
  SORTS,
  isLocalTrigger,
} from './automations-utils';
import type {
  AutomationSort,
  EditDraft,
  EveryUnit,
  ScheduleKind,
} from './automations-utils';

export function SortSheet({
  visible,
  selected,
  colors,
  onSelect,
  onClose,
}: {
  visible: boolean;
  selected: AutomationSort;
  colors: Palette;
  onSelect: (sort: AutomationSort) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  if (!visible) return null;
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.sheetRoot}>
        <Pressable accessibilityLabel={t('settings.automations.closeSort', { defaultValue: 'Close sort options' })} onPress={onClose} style={styles.sheetBackdrop} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Text style={[styles.sheetTitle, { color: colors.muted }]}>{t('settings.automations.sortTitle', { defaultValue: 'Sort by' })}</Text>
          {SORTS.map((item) => (
            <Pressable
              accessibilityState={{ selected: selected === item }}
              key={item}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
              style={({ pressed }) => [styles.sheetRow, pressed && { backgroundColor: colors.pressed }]}
            >
              <Text style={[styles.sheetRowText, { color: colors.foreground }]}>{t(`settings.automations.sort.${item}`)}</Text>
              {selected === item ? <Check color={colors.foreground} size={17} strokeWidth={2} /> : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

export function AutomationEditModal({
  job,
  saving,
  colors,
  onClose,
  onSave,
}: {
  job: SessionAutomationJob | null;
  saving: boolean;
  colors: Palette;
  onClose: () => void;
  onSave: (job: SessionAutomationJob, values: AutomationUpdatePayload) => Promise<void>;
}) {
  if (!job) return null;
  return (
    <AutomationEditSheet
      colors={colors}
      job={job}
      onClose={onClose}
      onSave={onSave}
      saving={saving}
    />
  );
}

function AutomationEditSheet({
  job,
  saving,
  colors,
  onClose,
  onSave,
}: {
  job: SessionAutomationJob;
  saving: boolean;
  colors: Palette;
  onClose: () => void;
  onSave: (job: SessionAutomationJob, values: AutomationUpdatePayload) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage || i18n.language;
  const [draft, setDraft] = useState<EditDraft>(() => draftFromJob(job));
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);

  const local = isLocalTrigger(job);
  const validation = editDraftError(draft, job, t);
  const submit = () => {
    const values = updatePayloadFromDraft(draft, job);
    if (typeof values === 'string') return;
    void onSave(job, values);
  };
  const onPickerChange = (event: DateTimePickerEvent, selected?: Date) => {
    if (process.env.EXPO_OS === 'android') setPicker(null);
    if (event.type !== 'set' || !selected) return;
    setDraft((current) => {
      const next = new Date(current.atDate);
      if (picker === 'date') next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      else next.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      return { ...current, atDate: next };
    });
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible>
      <View style={styles.editRoot}>
        <Pressable accessibilityLabel={t('settings.automations.closeEdit', { defaultValue: 'Close editor' })} onPress={onClose} style={styles.editBackdrop} />
        <View style={[styles.editCard, { backgroundColor: colors.card, paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.editHeader}>
            <Text style={[styles.editTitle, { color: colors.foreground }]}>{t('settings.automations.editTitle')}</Text>
            <Pressable accessibilityLabel={t('common.dismiss')} hitSlop={8} onPress={onClose} style={styles.editClose}>
              <X color={colors.muted} size={18} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.editContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <FieldLabel colors={colors}>{t('settings.automations.fields.name')}</FieldLabel>
            <TextInput
              accessibilityLabel={t('settings.automations.fields.name')}
              editable={!saving}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              placeholder={t('settings.automations.namePlaceholder', { defaultValue: 'Automation name' })}
              placeholderTextColor={colors.subtle}
              style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
              value={draft.name}
            />

            {!local ? (
              <>
                <FieldLabel colors={colors}>{t('settings.automations.fields.message')}</FieldLabel>
                <TextInput
                  accessibilityLabel={t('settings.automations.fields.message')}
                  editable={!saving}
                  multiline
                  onChangeText={(message) => setDraft((current) => ({ ...current, message }))}
                  placeholder={t('settings.automations.messagePlaceholder', { defaultValue: 'Message sent when the automation runs' })}
                  placeholderTextColor={colors.subtle}
                  style={[styles.fieldInput, styles.messageInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                  textAlignVertical="top"
                  value={draft.message}
                />

                <FieldLabel colors={colors}>{t('settings.automations.fields.scheduleType')}</FieldLabel>
                <View style={[styles.segmented, { backgroundColor: colors.pressed }]}>
                  {(['every', 'cron', 'at'] as ScheduleKind[]).map((kind) => (
                    <Pressable
                      accessibilityState={{ selected: draft.scheduleKind === kind }}
                      key={kind}
                      onPress={() => setDraft((current) => ({ ...current, scheduleKind: kind }))}
                      style={[styles.segment, draft.scheduleKind === kind && { backgroundColor: colors.card }]}
                    >
                      <Text style={[styles.segmentText, { color: draft.scheduleKind === kind ? colors.foreground : colors.muted }]}>
                        {t(`settings.automations.scheduleTypes.${kind}`)}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {draft.scheduleKind === 'every' ? (
                  <>
                    <FieldLabel colors={colors}>{t('settings.automations.fields.every')}</FieldLabel>
                    <View style={styles.intervalRow}>
                      <TextInput
                        accessibilityLabel={t('settings.automations.fields.every')}
                        editable={!saving}
                        keyboardType="number-pad"
                        onChangeText={(everyValue) => setDraft((current) => ({ ...current, everyValue }))}
                        style={[styles.fieldInput, styles.intervalValue, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                        value={draft.everyValue}
                      />
                      <View style={styles.unitRow}>
                        {EVERY_UNITS.map((unit) => (
                          <Pressable
                            accessibilityState={{ selected: draft.everyUnit === unit.key }}
                            key={unit.key}
                            onPress={() => setDraft((current) => ({ ...current, everyUnit: unit.key }))}
                            style={[styles.unitButton, { borderColor: colors.border, backgroundColor: draft.everyUnit === unit.key ? colors.pressed : colors.background }]}
                          >
                            <Text style={[styles.unitText, { color: draft.everyUnit === unit.key ? colors.foreground : colors.muted }]}>
                              {t(`settings.automations.everyUnits.${unit.key}`)}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  </>
                ) : draft.scheduleKind === 'cron' ? (
                  <>
                    <FieldLabel colors={colors}>{t('settings.automations.fields.cronExpression')}</FieldLabel>
                    <TextInput
                      accessibilityLabel={t('settings.automations.fields.cronExpression')}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!saving}
                      onChangeText={(cronExpr) => setDraft((current) => ({ ...current, cronExpr }))}
                      placeholder="0 9 * * *"
                      placeholderTextColor={colors.subtle}
                      style={[styles.fieldInput, styles.mono, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={draft.cronExpr}
                    />
                    <FieldLabel colors={colors}>
                      {t('settings.automations.timezoneOptional', {
                        defaultValue: '{{timezone}} (optional)',
                        timezone: t('settings.automations.fields.timezone'),
                      })}
                    </FieldLabel>
                    <TextInput
                      accessibilityLabel={t('settings.automations.fields.timezone')}
                      autoCapitalize="none"
                      autoCorrect={false}
                      editable={!saving}
                      onChangeText={(tz) => setDraft((current) => ({ ...current, tz }))}
                      placeholder="Asia/Shanghai"
                      placeholderTextColor={colors.subtle}
                      style={[styles.fieldInput, { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background }]}
                      value={draft.tz}
                    />
                  </>
                ) : (
                  <>
                    <FieldLabel colors={colors}>{t('settings.automations.fields.runAt')}</FieldLabel>
                    <View style={styles.dateTimeRow}>
                      <Pressable
                        accessibilityLabel={t('settings.automations.selectDate', { defaultValue: 'Select date' })}
                        disabled={saving}
                        onPress={() => setPicker('date')}
                        style={[styles.dateTimeButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                      >
                        <Text style={[styles.dateTimeText, { color: colors.foreground }]}>{formatDate(draft.atDate, locale)}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityLabel={t('settings.automations.selectTime', { defaultValue: 'Select time' })}
                        disabled={saving}
                        onPress={() => setPicker('time')}
                        style={[styles.dateTimeButton, { borderColor: colors.border, backgroundColor: colors.background }]}
                      >
                        <Text style={[styles.dateTimeText, { color: colors.foreground }]}>{formatTime(draft.atDate, locale)}</Text>
                      </Pressable>
                    </View>
                    {picker ? (
                      <View style={styles.pickerWrap}>
                        <DateTimePicker
                          display={process.env.EXPO_OS === 'ios' ? 'spinner' : 'default'}
                          mode={picker}
                          onChange={onPickerChange}
                          value={draft.atDate}
                        />
                      </View>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <Text style={[styles.localHint, { color: colors.muted }]}>
                {t('settings.automations.localEditHint', {
                  defaultValue: 'The system manages this local trigger command and conditions. Only its name can be edited here.',
                })}
              </Text>
            )}

            {validation ? <Text style={[styles.validationText, { color: colors.errorText }]}>{validation}</Text> : null}
          </ScrollView>
          <View style={[styles.editActions, { borderTopColor: colors.border }]}>
            <Pressable disabled={saving} onPress={onClose} style={[styles.editButton, { backgroundColor: colors.pressed }]}>
              <Text style={[styles.editButtonText, { color: colors.foreground }]}>{t('settings.automations.cancel')}</Text>
            </Pressable>
            <Pressable
              accessibilityLabel={t('settings.automations.save')}
              disabled={Boolean(validation) || saving}
              onPress={submit}
              style={[styles.editButton, styles.saveButton, { backgroundColor: colors.foreground }, (validation || saving) && styles.disabled]}
            >
              {saving ? <ActivityIndicator color={colors.background} size="small" /> : <Text style={[styles.saveButtonText, { color: colors.background }]}>{t('settings.automations.save')}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function FieldLabel({ colors, children }: { colors: Palette; children: React.ReactNode }) {
  return <Text style={[styles.fieldLabel, { color: colors.muted }]}>{children}</Text>;
}

function formatDate(date: Date, locale: string): string {
  return safeDateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

function formatTime(date: Date, locale: string): string {
  return safeDateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
}

function draftFromJob(job: SessionAutomationJob | null): EditDraft {
  const every = intervalDraft(job?.schedule.every_ms ?? 3_600_000);
  const kind: ScheduleKind = job?.schedule.kind === 'at' || job?.schedule.kind === 'cron' ? job.schedule.kind : 'every';
  return {
    name: job?.name ?? '',
    message: job?.payload.message ?? '',
    scheduleKind: kind,
    everyValue: every.value,
    everyUnit: every.unit,
    cronExpr: job?.schedule.expr ?? '0 9 * * *',
    tz: job?.schedule.tz ?? '',
    atDate: new Date(job?.schedule.at_ms ?? Date.now() + 3_600_000),
  };
}

function intervalDraft(ms: number): { value: string; unit: EveryUnit } {
  for (const unit of [...EVERY_UNITS].reverse()) {
    if (ms >= unit.ms && ms % unit.ms === 0) return { value: String(ms / unit.ms), unit: unit.key };
  }
  return { value: String(Math.max(1, Math.round(ms / 60_000))), unit: 'minute' };
}

function editDraftError(draft: EditDraft, job: SessionAutomationJob, t: TFunction): string | null {
  if (!draft.name.trim()) return t('settings.automations.validation.nameRequired');
  if (isLocalTrigger(job)) return null;
  if (!draft.message.trim()) return t('settings.automations.validation.messageRequired');
  if (draft.scheduleKind === 'every') {
    const value = Number(draft.everyValue);
    if (!Number.isInteger(value) || value <= 0) return t('settings.automations.validation.intervalRequired');
  }
  if (draft.scheduleKind === 'cron' && !draft.cronExpr.trim()) return t('settings.automations.validation.cronRequired');
  if (draft.scheduleKind === 'at') {
    const atMs = draft.atDate.getTime();
    if (!Number.isFinite(atMs)) return t('settings.automations.validation.timeRequired');
    if (atMs <= Date.now() && scheduleChanged(draft, job)) return t('settings.automations.validation.futureRequired');
  }
  return null;
}

function scheduleFromDraft(draft: EditDraft): NonNullable<AutomationUpdatePayload['schedule']> | string {
  if (draft.scheduleKind === 'every') {
    const unit = EVERY_UNITS.find((candidate) => candidate.key === draft.everyUnit);
    const value = Number(draft.everyValue);
    if (!unit || !Number.isInteger(value) || value <= 0) return 'invalid';
    return { kind: 'every', every_ms: value * unit.ms };
  }
  if (draft.scheduleKind === 'cron') {
    const expr = draft.cronExpr.trim();
    if (!expr) return 'invalid';
    return { kind: 'cron', expr, ...(draft.tz.trim() ? { tz: draft.tz.trim() } : {}) };
  }
  const atMs = draft.atDate.getTime();
  return Number.isFinite(atMs) ? { kind: 'at', at_ms: atMs } : 'invalid';
}

function scheduleChanged(
  draft: EditDraft,
  job: SessionAutomationJob,
  schedule: NonNullable<AutomationUpdatePayload['schedule']> | string = scheduleFromDraft(draft),
): boolean {
  if (typeof schedule === 'string') return true;
  if (schedule.kind !== job.schedule.kind) return true;
  if (schedule.kind === 'every') return schedule.every_ms !== job.schedule.every_ms;
  if (schedule.kind === 'cron') return schedule.expr !== (job.schedule.expr ?? '') || (schedule.tz ?? null) !== (job.schedule.tz ?? null);
  return schedule.at_ms !== job.schedule.at_ms;
}

function updatePayloadFromDraft(draft: EditDraft, job: SessionAutomationJob): AutomationUpdatePayload | string {
  const name = draft.name.trim();
  if (isLocalTrigger(job)) return name ? { name } : 'invalid';
  const message = draft.message.trim();
  if (!name || !message) return 'invalid';
  const values: AutomationUpdatePayload = { name, message };
  const schedule = scheduleFromDraft(draft);
  if (typeof schedule === 'string') return schedule;
  if (scheduleChanged(draft, job, schedule)) values.schedule = schedule;
  return values;
}

const styles = StyleSheet.create({
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,16,14,0.28)' },
  sheet: { borderTopLeftRadius: 23, borderTopRightRadius: 23, paddingHorizontal: 12, paddingTop: 15, elevation: 26 },
  sheetTitle: { paddingHorizontal: 12, paddingBottom: 8, fontSize: 12, fontWeight: '600' },
  sheetRow: { height: 50, borderRadius: 13, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetRowText: { fontSize: 15, fontWeight: '500' },
  editRoot: { flex: 1, justifyContent: 'flex-end' },
  editBackdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,16,14,0.3)' },
  editCard: { maxHeight: '92%', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 17, paddingTop: 16, elevation: 30 },
  editHeader: { minHeight: 44, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  editTitle: { fontSize: 20, fontWeight: '700' },
  editClose: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  editContent: { paddingTop: 10, paddingBottom: 18 },
  fieldLabel: { marginTop: 15, marginBottom: 7, fontSize: 12, fontWeight: '600' },
  fieldInput: { minHeight: 45, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, paddingHorizontal: 12, fontSize: 14 },
  messageInput: { minHeight: 100, paddingTop: 11, paddingBottom: 11 },
  segmented: { height: 42, borderRadius: 14, padding: 4, flexDirection: 'row', gap: 3 },
  segment: { flex: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  segmentText: { fontSize: 12, fontWeight: '600' },
  intervalRow: { gap: 9 },
  intervalValue: { width: '100%' },
  unitRow: { flexDirection: 'row', gap: 6 },
  unitButton: { flex: 1, height: 40, borderWidth: StyleSheet.hairlineWidth, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  unitText: { fontSize: 11.5, fontWeight: '600' },
  dateTimeRow: { flexDirection: 'row', gap: 9 },
  dateTimeButton: { flex: 1, height: 45, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  dateTimeText: { fontSize: 13, fontWeight: '600' },
  pickerWrap: { marginTop: 8, alignItems: 'center' },
  localHint: { marginTop: 17, fontSize: 12.5, lineHeight: 19 },
  validationText: { marginTop: 12, fontSize: 12, lineHeight: 18 },
  editActions: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, flexDirection: 'row', justifyContent: 'flex-end', gap: 9 },
  editButton: { minWidth: 86, height: 43, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editButtonText: { fontSize: 14, fontWeight: '600' },
  saveButton: { minWidth: 96 },
  saveButtonText: { fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.42 },
  mono: { fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace' },
});
