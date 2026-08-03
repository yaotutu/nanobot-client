import { useChannelsSettingsController } from '@/features/channels/hooks/use-channels-settings-controller';
import type { Palette } from '@/ui/palette';

import { ChannelDetail } from './ChannelDetail';
import { ChannelsCatalog } from './ChannelsCatalog';

export function ChannelsSettings({
  colors,
  showBrandLogos,
}: {
  colors: Palette;
  showBrandLogos: boolean;
}) {
  const controller = useChannelsSettingsController();

  if (controller.selectedFeature) {
    return (
      <ChannelDetail
        actionKey={controller.actionKey}
        colors={colors}
        feature={controller.selectedFeature}
        onBack={() => controller.setSelected(null)}
        onError={controller.setError}
        onPayload={controller.applyPayload}
        onToggle={controller.toggle}
        showBrandLogos={showBrandLogos}
      />
    );
  }

  return (
    <ChannelsCatalog
      channels={controller.channels}
      colors={colors}
      enabledCount={controller.enabledCount}
      error={controller.error}
      filter={controller.filter}
      load={controller.load}
      loading={controller.loading}
      payload={controller.payload}
      query={controller.query}
      refreshing={controller.refreshing}
      setError={controller.setError}
      setFilter={controller.setFilter}
      setQuery={controller.setQuery}
      setSelected={controller.setSelected}
      showBrandLogos={showBrandLogos}
      totalCount={controller.totalCount}
    />
  );
}
