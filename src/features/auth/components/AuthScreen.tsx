import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// Static Metro asset; require is the React Native asset loader.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nanobotIcon = require('../../../assets/images/nanobot-icon.png');

interface AuthScreenProps {
  failed: boolean;
  submitting?: boolean;
  onSubmit: (secret: string) => Promise<void> | void;
}

export function AuthScreen({ failed, submitting = false, onSubmit }: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [secret, setSecret] = useState('');

  const submit = () => {
    const value = secret.trim();
    if (!value || submitting) return;
    void onSubmit(value);
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.card}>
        <Image source={nanobotIcon} style={styles.logo} />
        <Text style={styles.title}>{t('app.auth.title')}</Text>
        <Text style={styles.hint}>{t('app.auth.hint')}</Text>
        {failed ? <Text style={styles.error}>{t('app.auth.invalid')}</Text> : null}
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          editable={!submitting}
          onChangeText={setSecret}
          onSubmitEditing={submit}
          placeholder={t('app.auth.placeholder')}
          placeholderTextColor="#9B9B9B"
          returnKeyType="go"
          secureTextEntry
          style={[styles.input, failed && styles.inputFailed]}
          value={secret}
        />
        <Pressable
          accessibilityRole="button"
          disabled={!secret.trim() || submitting}
          onPress={submit}
          style={({ pressed }) => [
            styles.button,
            (!secret.trim() || submitting) && styles.buttonDisabled,
            pressed && styles.buttonPressed,
          ]}
        >
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{t('app.auth.submit')}</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FAFAF9',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 54,
    height: 54,
    marginBottom: 10,
    borderRadius: 16,
  },
  title: {
    color: '#1D1D1B',
    fontSize: 20,
    fontWeight: '600',
  },
  hint: {
    color: '#777672',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 6,
  },
  error: {
    color: '#C94035',
    fontSize: 13,
  },
  input: {
    width: '100%',
    height: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#D8D7D3',
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    color: '#20201E',
    fontSize: 16,
    paddingHorizontal: 15,
  },
  inputFailed: {
    borderColor: '#D9685E',
  },
  button: {
    width: '100%',
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 13,
    backgroundColor: '#20201E',
    marginTop: 2,
  },
  buttonDisabled: {
    opacity: 0.42,
  },
  buttonPressed: {
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});
