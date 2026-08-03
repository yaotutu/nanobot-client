import type { ChannelConfigField } from '@/features/channels/presentation/types';

export function defaultValues(
  fields: ChannelConfigField[],
  values: Record<string, string> | undefined,
): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => [
      field.key,
      values?.[field.key]
        ?? field.defaultValue
        ?? field.options?.[0]?.value
        ?? '',
    ]),
  );
}
