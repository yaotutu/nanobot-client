import type { TFunction } from 'i18next';

import { currentLocale } from '@/i18n';
import type { NanobotFeatureInfo } from '@/types/api/nanobot-features';

import { statusLabel } from '../model/channel-status';
import { channelPresentation } from './channel-presentation';

export function featureSearchText(feature: NanobotFeatureInfo, t: TFunction): string {
  const presentation = channelPresentation(feature);
  return [
    feature.name,
    feature.display_name,
    presentation.displayName,
    presentation.description,
    presentation.requirements,
    feature.status,
    feature.runtime_status,
    statusLabel(feature, t),
  ].filter(Boolean).join(' ').toLocaleLowerCase(currentLocale());
}
