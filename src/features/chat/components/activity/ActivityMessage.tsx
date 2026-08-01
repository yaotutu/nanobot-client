import {
  AlertCircle,
  Check,
  Clock3,
  FileSearch,
  FolderOpen,
  Globe2,
  ListTree,
  MemoryStick,
  Play,
  Search,
  Server,
  Terminal,
  Wrench,
} from 'lucide-react-native';
import { Image as ExpoImage } from 'expo-image';
import { useMemo } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { isReasoningOnlyAssistant } from '@/features/chat/activity-timeline';
import { useLogoFallback } from '@/hooks/use-logo-fallback';
import { browserSafeFaviconUrls } from '@/services/links/web-url';
import type { Palette } from '@/ui/palette';
import type { CliAppInfo, McpPresetInfo, UIMessage } from '@/types/api';

import {
  type CapabilityBrand,
  type ToolRowModel,
  type ToolStatus,
  brandBorderColor,
  compactReasoningPreview,
  toolRows,
} from './tool-helpers';

export function ActivityMessage({
  active,
  cliAppsByName,
  colors,
  message,
  mcpPresetsByName,
}: {
  active: boolean;
  cliAppsByName: Map<string, CliAppInfo>;
  colors: Palette;
  message: UIMessage;
  mcpPresetsByName: Map<string, McpPresetInfo>;
}) {
  const { t } = useTranslation();
  if (isReasoningOnlyAssistant(message)) {
    const preview = compactReasoningPreview(message.reasoning ?? '')
      || (active ? t('message.reasoningStreaming') : t('message.reasoningSummary'));
    return (
      <ActivityStep
        active={active && Boolean(message.reasoningStreaming)}
        colors={colors}
        label={preview}
        status={active && message.reasoningStreaming ? 'running' : 'done'}
        variant="reasoning"
      />
    );
  }
  if (message.kind !== 'trace') return null;
  const rows = toolRows(message, active, cliAppsByName, mcpPresetsByName);
  return (
    <View>
      {rows.map((row) => (
        <ActivityStep
          active={row.status === 'running'}
          brand={row.brand}
          colors={colors}
          detail={row.detail}
          icon={row.icon}
          key={row.key}
          label={row.label}
          status={row.status}
          url={row.url}
          variant="tool"
          webHost={row.webHost}
        />
      ))}
    </View>
  );
}

function ActivityStep({
  active,
  brand,
  colors,
  detail,
  icon = 'tool',
  label,
  status,
  url,
  variant,
  webHost,
}: {
  active: boolean;
  brand?: CapabilityBrand;
  colors: Palette;
  detail?: string;
  icon?: ToolRowModel['icon'];
  label: string;
  status: ToolStatus;
  url?: string;
  variant: 'reasoning' | 'tool';
  webHost?: string;
}) {
  const { t } = useTranslation();
  const tone = status === 'error' ? colors.errorText : colors.muted;
  const StepIcon = icon === 'clock'
    ? Clock3
    : icon === 'file-search'
      ? FileSearch
      : icon === 'folder'
        ? FolderOpen
        : icon === 'list'
          ? ListTree
          : icon === 'memory'
            ? MemoryStick
            : icon === 'play'
              ? Play
              : icon === 'search'
                ? Search
                : icon === 'web'
                  ? Globe2
                  : icon === 'server'
                    ? Server
                    : Wrench;
  return (
    <Pressable
      accessibilityHint={url ? t('message.openInBrowser', { defaultValue: 'Open in browser' }) : undefined}
      accessibilityRole={url ? 'link' : undefined}
      disabled={!url}
      onPress={url ? () => void Linking.openURL(url).catch(() => undefined) : undefined}
      style={({ pressed }) => [styles.step, pressed && { backgroundColor: colors.pressed }]}
    >
      <View style={styles.marker}>
        {brand ? (
          <CapabilityBrandMark active={active} brand={brand} colors={colors} />
        ) : icon === 'web' && webHost ? (
          <WebFavicon active={active} colors={colors} host={webHost} />
        ) : active ? (
          <ActivityIndicator color={colors.subtle} size={13} />
        ) : status === 'error' ? (
          <AlertCircle color={colors.errorText} size={14} strokeWidth={1.9} />
        ) : variant === 'reasoning' ? (
          <View style={[styles.doneMarker, { borderColor: colors.border }]}>
            <Check color="#2F9A68" size={9} strokeWidth={2.4} />
          </View>
        ) : (
          <View style={[styles.doneMarker, { borderColor: colors.border }]}>
            <StepIcon color="#2F9A68" size={9} strokeWidth={2.1} />
          </View>
        )}
      </View>
      <View style={styles.stepBody}>
        <Text
          numberOfLines={2}
          selectable
          style={[
            styles.stepLabel,
            variant === 'reasoning' && styles.reasoningLabel,
            { color: tone },
          ]}
        >
          {label}
        </Text>
        {detail ? (
          <Text numberOfLines={3} selectable style={[styles.stepDetail, { color: colors.subtle }]}>
            {detail}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function WebFavicon({
  active,
  colors,
  host,
}: {
  active: boolean;
  colors: Palette;
  host: string;
}) {
  const candidates = useMemo(() => browserSafeFaviconUrls(host), [host]);
  const { logoUrl, onLogoError, onLogoLoad } = useLogoFallback(candidates);

  if (!logoUrl) {
    return <Globe2 color={colors.subtle} size={14} strokeWidth={1.8} />;
  }

  return (
    <View
      style={[
        styles.webFavicon,
        { borderColor: colors.border, backgroundColor: colors.background },
        active && { opacity: 0.72 },
      ]}
    >
      <ExpoImage
        contentFit="contain"
        onError={onLogoError}
        onLoad={onLogoLoad}
        source={{ uri: logoUrl }}
        style={styles.webFaviconImage}
        transition={0}
      />
    </View>
  );
}

function CapabilityBrandMark({
  active,
  brand,
  colors,
}: {
  active: boolean;
  brand: CapabilityBrand;
  colors: Palette;
}) {
  const { logoUrl, onLogoError, onLogoLoad } = useLogoFallback(brand.logoUrls);
  const showLogo = Boolean(logoUrl);
  const FallbackIcon = brand.fallback === 'terminal' ? Terminal : Server;
  return (
    <View
      style={[
        styles.brandMark,
        {
          backgroundColor: showLogo ? colors.background : brand.color,
          borderColor: brandBorderColor(brand.color, colors.border),
        },
        active && { shadowColor: brand.color, shadowOpacity: 0.18, shadowRadius: 4 },
      ]}
    >
      {showLogo ? (
        <ExpoImage
          contentFit="contain"
          onError={onLogoError}
          onLoad={onLogoLoad}
          source={{ uri: logoUrl }}
          style={styles.brandLogo}
          transition={0}
        />
      ) : brand.initials ? (
        <Text style={styles.brandInitials}>{brand.initials.slice(0, 2)}</Text>
      ) : (
        <FallbackIcon color="#FFFFFF" size={11} strokeWidth={2} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { minWidth: 0, flexDirection: 'row', gap: 7, paddingVertical: 3 },
  marker: { width: 18, height: 20, alignItems: 'center', justifyContent: 'center' },
  doneMarker: {
    width: 14,
    height: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMark: {
    width: 16,
    height: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 0,
  },
  brandLogo: { width: 13, height: 13 },
  brandInitials: { color: '#FFFFFF', fontSize: 6.5, lineHeight: 9, fontWeight: '700' },
  webFavicon: {
    width: 16,
    height: 16,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webFaviconImage: { width: 14, height: 14 },
  stepBody: { minWidth: 0, flex: 1 },
  stepLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  reasoningLabel: { fontStyle: 'italic', fontWeight: '400' },
  stepDetail: { marginTop: 1, fontSize: 11.5, lineHeight: 16 },
});
