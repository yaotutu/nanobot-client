import type { TFunction } from 'i18next';
import { useCallback, useRef, useState } from 'react';

import { configureChannel, validateChannel } from '@/features/channels/api';
import { channelCopy, defaultValues } from '@/features/channels/model';
import type { ChannelConfigField } from '@/features/channels/presentation/types';
import type { ChannelValidationPayload } from '@/types/api/channels';
import type { NanobotFeaturesPayload } from '@/types/api/nanobot-features';

interface UseChannelConfigurationOptions {
  configValues?: Record<string, string>;
  featureName: string;
  fields: ChannelConfigField[];
  instanceId?: string;
  onError: (message: string | null) => void;
  onPayload: (payload: NanobotFeaturesPayload) => void;
  t: TFunction;
}

export function useChannelConfiguration(options: UseChannelConfigurationOptions) {
  const {
    configValues,
    featureName,
    fields,
    instanceId,
    onError,
    onPayload,
    t,
  } = options;
  const [values, setValues] = useState(() => defaultValues(fields, configValues));
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [visibleSecrets, setVisibleSecrets] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState<ChannelValidationPayload | null>(null);
  const requestContextRef = useRef(0);
  const mutationInFlightRef = useRef(false);

  const submission = useCallback(() => Object.fromEntries(
    fields.flatMap((field) => {
      const value = values[field.key] ?? '';
      if (field.secret && !value.trim()) return [];
      if (!touched.has(field.key) && !value.trim()) return [];
      if (!touched.has(field.key) && field.options?.length) return [];
      return [[field.key, value]];
    }),
  ), [fields, touched, values]);

  const clearSavedSecrets = useCallback(() => {
    setValues((current) => Object.fromEntries(
      fields.map((field) => [field.key, field.secret ? '' : (current[field.key] ?? '')]),
    ));
    setVisibleSecrets(new Set());
    setTouched(new Set());
  }, [fields]);

  const save = useCallback(async () => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const context = requestContextRef.current;
    setSaving(true);
    onError(null);
    try {
      const result = await configureChannel(featureName, submission(), { instanceId });
      if (context !== requestContextRef.current) return;
      if (result.nanobot_features) onPayload(result.nanobot_features);
      clearSavedSecrets();
    } catch (caught) {
      if (context !== requestContextRef.current) return;
      onError(caught instanceof Error
        ? caught.message
        : channelCopy(t, 'saveFailed', 'Could not save channel settings.'));
    } finally {
      if (context === requestContextRef.current) setSaving(false);
      mutationInFlightRef.current = false;
    }
  }, [clearSavedSecrets, featureName, instanceId, onError, onPayload, submission, t]);

  const runValidation = useCallback(async () => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const context = requestContextRef.current;
    setValidating(true);
    onError(null);
    try {
      const next = await validateChannel(featureName, submission(), instanceId);
      if (context === requestContextRef.current) setValidation(next);
    } catch (caught) {
      if (context !== requestContextRef.current) return;
      onError(caught instanceof Error
        ? caught.message
        : channelCopy(t, 'validateFailed', 'Could not validate channel.'));
    } finally {
      if (context === requestContextRef.current) setValidating(false);
      mutationInFlightRef.current = false;
    }
  }, [featureName, instanceId, onError, submission, t]);

  const checkAndEnable = useCallback(async () => {
    if (mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const context = requestContextRef.current;
    setSaving(true);
    setValidating(true);
    onError(null);
    try {
      const valuesForSubmit = submission();
      const nextValidation = await validateChannel(featureName, valuesForSubmit, instanceId);
      if (context !== requestContextRef.current) return;
      setValidation(nextValidation);
      if (!nextValidation.can_enable) {
        onError(nextValidation.message || channelCopy(
          t,
          'validationFailed',
          'Check the required setup before enabling.',
        ));
        return;
      }
      const result = await configureChannel(featureName, valuesForSubmit, {
        enable: true,
        instanceId,
      });
      if (context !== requestContextRef.current) return;
      if (result.nanobot_features) onPayload(result.nanobot_features);
      clearSavedSecrets();
      onError(null);
    } catch (caught) {
      if (context !== requestContextRef.current) return;
      onError(caught instanceof Error
        ? caught.message
        : channelCopy(t, 'checkAndEnableFailed', 'Could not check and enable channel.'));
    } finally {
      if (context === requestContextRef.current) {
        setSaving(false);
        setValidating(false);
      }
      mutationInFlightRef.current = false;
    }
  }, [clearSavedSecrets, featureName, instanceId, onError, onPayload, submission, t]);

  const reset = useCallback((nextValues?: Record<string, string>) => {
    requestContextRef.current += 1;
    mutationInFlightRef.current = false;
    setValues(defaultValues(fields, nextValues));
    setTouched(new Set());
    setVisibleSecrets(new Set());
    setValidation(null);
    setSaving(false);
    setValidating(false);
  }, [fields]);

  const applyPreset = useCallback((presetValues: Record<string, string>) => {
    setValues((current) => ({ ...current, ...presetValues }));
    setTouched((current) => {
      const next = new Set(current);
      Object.keys(presetValues).forEach((key) => next.add(key));
      return next;
    });
  }, []);

  const changeValue = useCallback((key: string, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
    setTouched((current) => new Set(current).add(key));
  }, []);

  const toggleSecret = useCallback((key: string) => {
    setVisibleSecrets((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  return {
    applyPreset,
    changeValue,
    checkAndEnable,
    reset,
    runValidation,
    save,
    saving,
    submission,
    toggleSecret,
    touched,
    validating,
    validation,
    values,
    visibleSecrets,
  };
}
