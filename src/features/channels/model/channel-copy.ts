import type { TFunction } from 'i18next';

export function channelCopy(
  t: TFunction,
  key: string,
  defaultValue: string,
  values: Record<string, string | number> = {},
): string {
  return t(`settings.channels.${key}`, { defaultValue, ...values });
}
