import type { CatalogItem } from './types';

export const CLI_APPS_REFRESH_RETRY_MS = 2_000;
export const CLI_APPS_REFRESH_MAX_RETRIES = 30;

export function titleOf(item: CatalogItem): string {
  return item.kind === 'cli' ? item.app.display_name : item.preset.display_name;
}

export function itemReady(item: CatalogItem): boolean {
  return item.kind === 'cli'
    ? item.app.installed
    : item.preset.installed && item.preset.configured;
}

export function searchText(item: CatalogItem): string {
  if (item.kind === 'cli') {
    const { app } = item;
    return [
      app.display_name,
      app.name,
      app.category,
      app.description,
      app.requires,
      app.entry_point,
      app.source,
    ].join(' ').toLocaleLowerCase();
  }
  const { preset } = item;
  return [
    preset.display_name,
    preset.name,
    preset.category,
    preset.description,
    preset.transport,
    preset.requires,
    preset.note,
    preset.connection_summary,
    ...(preset.tool_names ?? []),
  ].join(' ').toLocaleLowerCase();
}
