import type { TFunction } from 'i18next';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import {
  cancelChannelConnect,
  pollChannelConnect,
  startChannelConnect,
} from '@/features/channels/api';
import { channelCopy } from '@/features/channels/model';
import type { ChannelConnectPayload } from '@/types/api/channels';
import type { NanobotFeaturesPayload } from '@/types/api/nanobot-features';

export type ChannelConnectMode = 'replace' | 'create';

interface UseChannelConnectOptions {
  channelName: string;
  instanceId?: string;
  onError: (message: string | null) => void;
  onPayload: (payload: NanobotFeaturesPayload) => void;
  t: TFunction;
}

export function useChannelConnect(options: UseChannelConnectOptions) {
  const { channelName, instanceId, onError, onPayload, t } = options;
  const [connect, setConnect] = useState<ChannelConnectPayload | null>(null);
  const [mode, setMode] = useState<ChannelConnectMode>('replace');
  const [busy, setBusy] = useState(false);
  const [appState, setAppState] = useState(AppState.currentState);
  const pollInFlightRef = useRef(false);
  const mutationInFlightRef = useRef(false);
  const contextRef = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (appState !== 'active' || !connect?.session_id || connect.status !== 'pending') return;
    let cancelled = false;
    const context = contextRef.current;
    const sessionId = connect.session_id;
    const poll = async () => {
      if (pollInFlightRef.current) return;
      pollInFlightRef.current = true;
      try {
        const next = await pollChannelConnect(channelName, sessionId);
        if (cancelled || context !== contextRef.current) return;
        setConnect((current) => ({
          ...(current ?? next),
          ...next,
          qr_url: next.qr_url ?? current?.qr_url,
        }));
        if (next.nanobot_features) onPayload(next.nanobot_features);
        if (next.status !== 'pending') onError(null);
      } catch (caught) {
        if (!cancelled && context === contextRef.current) {
          onError(caught instanceof Error
            ? caught.message
            : channelCopy(t, 'connectPollFailed', 'Could not refresh connection status.'));
        }
      } finally {
        pollInFlightRef.current = false;
      }
    };
    const initialTimer = setTimeout(() => void poll(), 900);
    const intervalTimer = setInterval(
      () => void poll(),
      Math.max(2_500, connect.interval_ms ?? 5_000),
    );
    return () => {
      cancelled = true;
      clearTimeout(initialTimer);
      clearInterval(intervalTimer);
    };
  }, [
    appState,
    channelName,
    connect?.interval_ms,
    connect?.session_id,
    connect?.status,
    onError,
    onPayload,
    t,
  ]);

  const begin = useCallback(async (nextMode: ChannelConnectMode = 'replace') => {
    if (mutationInFlightRef.current || connect?.status === 'pending') return;
    mutationInFlightRef.current = true;
    const context = contextRef.current;
    setMode(nextMode);
    setBusy(true);
    onError(null);
    try {
      const state = await startChannelConnect(
        channelName,
        channelName === 'feishu'
          ? {
              domain: 'feishu',
              instanceId: nextMode === 'create' ? 'default' : (instanceId ?? 'default'),
              mode: nextMode,
            }
          : {
              instanceId,
              force: channelName === 'weixin' && connect?.status === 'succeeded',
            },
      );
      if (context === contextRef.current) setConnect(state);
    } catch (caught) {
      if (context === contextRef.current) {
        onError(caught instanceof Error
          ? caught.message
          : channelCopy(t, 'connectStartFailed', 'Could not start the connection flow.'));
      }
    } finally {
      mutationInFlightRef.current = false;
      if (context === contextRef.current) setBusy(false);
    }
  }, [channelName, connect, instanceId, onError, t]);

  const cancel = useCallback(async () => {
    if (!connect || mutationInFlightRef.current) return;
    mutationInFlightRef.current = true;
    const context = contextRef.current;
    setBusy(true);
    try {
      const next = await cancelChannelConnect(channelName, connect.session_id);
      if (context === contextRef.current) setConnect(next);
    } catch (caught) {
      if (context === contextRef.current) {
        onError(caught instanceof Error
          ? caught.message
          : channelCopy(t, 'connectCancelFailed', 'Could not cancel connection.'));
      }
    } finally {
      mutationInFlightRef.current = false;
      if (context === contextRef.current) setBusy(false);
    }
  }, [channelName, connect, onError, t]);

  const reset = useCallback(() => {
    contextRef.current += 1;
    pollInFlightRef.current = false;
    mutationInFlightRef.current = false;
    setConnect(null);
    setMode('replace');
    setBusy(false);
  }, []);

  return { begin, busy, cancel, connect, mode, reset };
}
