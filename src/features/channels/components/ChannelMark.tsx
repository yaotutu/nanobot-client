import { Image } from "expo-image";
import { useState } from "react";
import { StyleSheet, Text } from "react-native";

import type { ChannelPresentation } from '@/types/api/channels';

export function ChannelMark({
  presentation,
  showBrandLogos,
  size,
}: {
  presentation: ChannelPresentation;
  showBrandLogos: boolean;
  size: "small" | "large";
}) {
  const [failed, setFailed] = useState(false);
  const imageSize = size === "large" ? 32 : 25;
  if (showBrandLogos && presentation.logoUrl && !failed) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        contentFit="contain"
        onError={() => setFailed(true)}
        source={{ uri: presentation.logoUrl }}
        style={{ width: imageSize, height: imageSize }}
      />
    );
  }
  return (
    <Text
      style={[
        size === "large" ? styles.detailInitials : styles.channelInitials,
        { color: presentation.color },
      ]}
    >
      {presentation.initials}
    </Text>
  );
}

const styles = StyleSheet.create({
  channelInitials: { fontSize: 12, fontWeight: "800" },
  detailInitials: { fontSize: 14, fontWeight: "800" },
});
