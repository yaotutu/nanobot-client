import { Check } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { SORTS, type AutomationSort } from '@/features/automations/model';
import type { Palette } from '@/ui/palette';

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
        <Pressable
          accessibilityLabel={t('settings.automations.closeSort', {
            defaultValue: 'Close sort options',
          })}
          onPress={onClose}
          style={styles.sheetBackdrop}
        />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              paddingBottom: Math.max(insets.bottom, 12),
            },
          ]}
        >
          <Text style={[styles.sheetTitle, { color: colors.muted }]}>
            {t('settings.automations.sortTitle', { defaultValue: 'Sort by' })}
          </Text>
          {SORTS.map((item) => (
            <Pressable
              accessibilityState={{ selected: selected === item }}
              key={item}
              onPress={() => {
                onSelect(item);
                onClose();
              }}
              style={({ pressed }) => [
                styles.sheetRow,
                pressed && { backgroundColor: colors.pressed },
              ]}
            >
              <Text style={[styles.sheetRowText, { color: colors.foreground }]}>
                {t(`settings.automations.sort.${item}`)}
              </Text>
              {selected === item ? (
                <Check color={colors.foreground} size={17} strokeWidth={2} />
              ) : null}
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(16,16,14,0.28)',
  },
  sheet: {
    borderTopLeftRadius: 23,
    borderTopRightRadius: 23,
    paddingHorizontal: 12,
    paddingTop: 15,
    elevation: 26,
  },
  sheetTitle: {
    paddingHorizontal: 12,
    paddingBottom: 8,
    fontSize: 12,
    fontWeight: '600',
  },
  sheetRow: {
    height: 50,
    borderRadius: 13,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sheetRowText: { fontSize: 15, fontWeight: '500' },
});
