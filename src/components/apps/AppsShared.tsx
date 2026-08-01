import { Image } from 'expo-image';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useLogoFallback } from '@/hooks/use-logo-fallback';
import { isGenericRepositoryLogoUrl, logoFallbackUrls } from '@/services/links/provider-brand';
import type { Palette } from '@/ui/palette';

export function ToolLogo({
  logoUrl: rawLogoUrl,
  displayName,
  brandColor,
  colors,
  hideGenericRepositoryLogo = false,
}: {
  logoUrl?: string | null;
  displayName: string;
  brandColor?: string | null;
  colors: Palette;
  hideGenericRepositoryLogo?: boolean;
}) {
  const logoUrls = useMemo(
    () => hideGenericRepositoryLogo && isGenericRepositoryLogoUrl(rawLogoUrl)
      ? []
      : logoFallbackUrls(rawLogoUrl),
    [hideGenericRepositoryLogo, rawLogoUrl],
  );
  const { logoUrl, logoLoaded, onLogoError, onLogoLoad } = useLogoFallback(logoUrls);
  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase())
    .join('') || displayName.slice(0, 2).toLocaleUpperCase() || 'AI';
  return (
    <View
      style={[
        styles.logo,
        {
          backgroundColor: logoUrl ? colors.background : brandColor || colors.card,
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        style={[
          styles.logoFallback,
          { color: logoUrl ? colors.foreground : brandColor ? '#FFFFFF' : colors.foreground },
        ]}
      >
        {initials}
      </Text>
      {logoUrl ? (
        <Image
          accessibilityLabel={`${displayName} icon`}
          contentFit="contain"
          onError={onLogoError}
          onLoad={onLogoLoad}
          source={{ uri: logoUrl }}
          style={[styles.logoImage, styles.logoImageOverlay, !logoLoaded && styles.logoImageLoading]}
          transition={0}
        />
      ) : null}
    </View>
  );
}

export function TypeBadge({ label, colors }: { label: string; colors: Palette }) {
  return (
    <View style={[styles.typeBadge, { backgroundColor: colors.card }]}>
      <Text style={[styles.typeText, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { width: 42, height: 42, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  logoImage: { width: 28, height: 28 },
  logoImageOverlay: { position: 'absolute' },
  logoImageLoading: { opacity: 0 },
  logoFallback: { fontSize: 12, fontWeight: '800' },
  typeBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  typeText: { fontSize: 9.5, fontWeight: '700' },
});
