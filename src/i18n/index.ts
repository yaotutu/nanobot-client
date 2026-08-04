import i18n, { type ResourceLanguage } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { debugLog } from '@/services/runtime/debug-log';

import {
  fallbackLocale,
  normalizeLocale,
  resolveDeviceLocale,
  supportedLocales,
  type SupportedLocale,
} from './config';

type LocaleModule = { default: ResourceLanguage };
type LocaleLoader = () => Promise<LocaleModule>;

/**
 * 语言包使用显式 loader 映射，避免根布局初始化时同步解析十份 JSON。
 * Metro 能看到每一个静态 import 路径，因此仍可正确打包；运行时只执行当前语言和英文兜底包。
 */
const localeLoaders: Record<SupportedLocale, LocaleLoader> = {
  en: () => import('./locales/en/common.json'),
  'zh-CN': () => import('./locales/zh-CN/common.json'),
  'zh-TW': () => import('./locales/zh-TW/common.json'),
  fr: () => import('./locales/fr/common.json'),
  ja: () => import('./locales/ja/common.json'),
  ko: () => import('./locales/ko/common.json'),
  es: () => import('./locales/es/common.json'),
  'pt-BR': () => import('./locales/pt-BR/common.json'),
  vi: () => import('./locales/vi/common.json'),
  id: () => import('./locales/id/common.json'),
};

const loadedResources = new Map<SupportedLocale, ResourceLanguage>();
let initPromise: Promise<void> | null = null;

async function loadLocale(locale: SupportedLocale): Promise<void> {
  if (loadedResources.has(locale)) return;
  const module = await localeLoaders[locale]();
  loadedResources.set(locale, module.default);

  // i18next 26 在 init 前尚未挂载 addResourceBundle；初始化后切换语言时再增量注入。
  if (i18n.isInitialized) {
    i18n.addResourceBundle(locale, 'common', module.default, true, true);
  }
}

/**
 * 显式初始化 i18next，并只加载启动所需语言。
 * 偏好设置应先完成 hydrate，再把保存的语言传入本函数，避免先加载设备语言后又立即切换。
 */
export function ensureI18n(requestedLocale?: string | null): Promise<void> {
  const locale = normalizeLocale(requestedLocale ?? resolveDeviceLocale());

  if (i18n.isInitialized) {
    return loadLocale(locale).catch((error: unknown) => {
      debugLog('I18N', `load ${locale} failed: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 英文包始终作为最后兜底；目标语言加载失败时应用仍可正常显示和进入设置页。
    await loadLocale(fallbackLocale);
    if (locale !== fallbackLocale) {
      try {
        await loadLocale(locale);
      } catch (error) {
        debugLog('I18N', `load ${locale} failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const resources = Object.fromEntries(
      [...loadedResources].map(([code, common]) => [code, { common }]),
    );
    await i18n.use(initReactI18next).init({
      resources,
      lng: loadedResources.has(locale) ? locale : fallbackLocale,
      fallbackLng: fallbackLocale,
      defaultNS: 'common',
      ns: ['common'],
      interpolation: { escapeValue: false },
      returnNull: false,
      supportedLngs: supportedLocales.map(({ code }) => code),
      partialBundledLanguages: true,
      initAsync: false,
    });
  })().catch((error: unknown) => {
    // 清空 Promise 允许设置页或 Fast Refresh 再次尝试初始化，不把一次偶发 IO 错误永久缓存。
    initPromise = null;
    debugLog('I18N', `init failed: ${error instanceof Error ? error.message : String(error)}`);
  });

  return initPromise;
}

export function currentLocale(): SupportedLocale {
  return normalizeLocale(i18n.resolvedLanguage ?? i18n.language ?? fallbackLocale);
}

export async function setAppLanguage(requestedLocale: SupportedLocale): Promise<void> {
  const locale = normalizeLocale(requestedLocale);
  await ensureI18n(locale);

  try {
    await loadLocale(locale);
    if (currentLocale() !== locale) await i18n.changeLanguage(locale);
  } catch (error) {
    debugLog('I18N', `change ${locale} failed: ${error instanceof Error ? error.message : String(error)}`);
    if (currentLocale() !== fallbackLocale) await i18n.changeLanguage(fallbackLocale);
  }
}

export default i18n;
