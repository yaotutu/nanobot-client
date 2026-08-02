import type { TFunction } from 'i18next';

export function skillSourceLabel(source: string, t: TFunction): string {
  if (source === 'workspace') return t('settings.skills.sourceWorkspace');
  if (source === 'builtin') return t('settings.skills.sourceBuiltin');
  return source;
}
