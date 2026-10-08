import { Image } from 'expo-image';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { normalizeServerUrl } from '@/services/api/config';

// Static Metro asset; require is the React Native asset loader.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const nanobotIcon = require('../../../../assets/images/nanobot-icon.png');

interface AuthScreenProps {
  failed: boolean;
  /** 连接错误；存在时始终回到服务器步骤，让用户能先修正地址。 */
  error?: string | null;
  submitting?: boolean;
  serverUrl: string;
  /** 首次安装尚未确认地址时输入框留空，用户必须先完成服务器配置。 */
  serverConfigured: boolean;
  onServerUrlChange: (serverUrl: string) => void;
  onSubmit: (secret: string) => Promise<void> | void;
}

type LoginStep = 'server' | 'password';

export function AuthScreen({
  error = null,
  failed,
  submitting = false,
  serverUrl,
  serverConfigured,
  onServerUrlChange,
  onSubmit,
}: AuthScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [secret, setSecret] = useState('');
  const [serverDraft, setServerDraft] = useState(serverConfigured ? serverUrl : '');
  // 服务器已确认后，组件因 loading 卸载再重挂载（例如密码错误）应直接回到密码步骤；
  // 只有 activeError 才强制回到服务器步骤，避免用户被无意义的重复配置挡住。
  const [selectedStep, setSelectedStep] = useState<LoginStep>(serverConfigured ? 'password' : 'server');
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const normalizedServerUrl = normalizeServerUrl(serverDraft);

  // 密码错误仍留在密码步骤；网关不可达、超时等连接错误强制回到服务器步骤。
  // 这里用派生值而不是 effect 同步状态，避免服务器地址错误或宕机时把用户锁在密码页。
  const activeError = error && error !== dismissedError ? error : null;
  const step: LoginStep = activeError ? 'server' : selectedStep;
  const continueToPassword = () => {
    if (!normalizedServerUrl) return;
    onServerUrlChange(normalizedServerUrl);
    // 用户已确认修正地址；当前错误不再强制停留在服务器页，下一步输入密码后重新验证。
    setDismissedError(error);
    setSelectedStep('password');
  };

  const submitPassword = () => {
    const value = secret.trim();
    if (!value || !normalizedServerUrl || submitting) return;
    onServerUrlChange(normalizedServerUrl);
    void onSubmit(value);
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
      style={[styles.screen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
    >
      <View style={styles.card}>
        <Image source={nanobotIcon} style={styles.logo} />
        <Text accessibilityRole="header" style={styles.title}>
          {step === 'server' ? t('app.auth.serverTitle') : t('app.auth.title')}
        </Text>
        <Text style={styles.hint}>
          {step === 'server' ? t('app.auth.serverHint') : t('app.auth.hint')}
        </Text>
        {activeError ? (
          <Text style={[styles.error, styles.formError]}>{activeError}</Text>
        ) : null}
        {step === 'server' ? (
          <>
            <TextInput
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              keyboardType="url"
              onChangeText={setServerDraft}
              placeholder={t('app.auth.serverPlaceholder')}
              placeholderTextColor="#9B9B9B"
              returnKeyType="go"
              onSubmitEditing={continueToPassword}
              style={[styles.input, !!serverDraft.trim() && !normalizedServerUrl && styles.inputFailed]}
              value={serverDraft}
            />
            {!!serverDraft.trim() && !normalizedServerUrl ? (
              <Text style={[styles.error, styles.serverError]}>{t('app.auth.serverInvalid')}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={!normalizedServerUrl || submitting}
              onPress={continueToPassword}
              style={({ pressed }) => [
                styles.button,
                (!normalizedServerUrl || submitting) && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>{t('app.auth.serverContinue')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.serverSummary}>
              <Text numberOfLines={1} style={styles.serverSummaryText}>{normalizedServerUrl}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={submitting}
              onPress={() => setSelectedStep('server')}
              style={({ pressed }) => [styles.changeServerButton, pressed && styles.buttonPressed]}
            >
              <Text style={styles.changeServerText}>{t('app.auth.changeServer')}</Text>
            </Pressable>
            {failed && !activeError ? (
              <Text style={[styles.error, styles.formError]}>{t('app.auth.invalid')}</Text>
            ) : null}
            <TextInput
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              editable={!submitting}
              onChangeText={setSecret}
              onSubmitEditing={submitPassword}
              placeholder={t('app.auth.placeholder')}
              placeholderTextColor="#9B9B9B"
              returnKeyType="go"
              secureTextEntry
              style={[styles.input, failed && !activeError && styles.inputFailed]}
              value={secret}
            />
            <Pressable
              accessibilityRole="button"
              disabled={!secret.trim() || !normalizedServerUrl || submitting}
              onPress={submitPassword}
              style={({ pressed }) => [
                styles.button,
                (!secret.trim() || !normalizedServerUrl || submitting) && styles.buttonDisabled,
                pressed && styles.buttonPressed,
              ]}
            >
              <Text style={styles.buttonText}>{t('app.auth.submit')}</Text>
            </Pressable>
          </>
        )}
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
  serverError: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  formError: {
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  serverSummary: {
    width: '100%',
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F1F0ED',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  serverSummaryText: {
    color: '#38372F',
    fontSize: 13,
    maxWidth: '100%',
  },
  changeServerButton: {
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  changeServerText: {
    color: '#5D5B54',
    fontSize: 13,
    fontWeight: '600',
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
