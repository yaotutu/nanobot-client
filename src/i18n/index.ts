import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import enCommon from './locales/en/common.json';
import esCommon from './locales/es/common.json';
import frCommon from './locales/fr/common.json';
import idCommon from './locales/id/common.json';
import jaCommon from './locales/ja/common.json';
import koCommon from './locales/ko/common.json';
import ptBRCommon from './locales/pt-BR/common.json';
import viCommon from './locales/vi/common.json';
import zhCNCommon from './locales/zh-CN/common.json';
import zhTWCommon from './locales/zh-TW/common.json';
import {
  fallbackLocale,
  normalizeLocale,
  resolveDeviceLocale,
  type SupportedLocale,
} from './config';

export const resources = {
  en: { common: enCommon },
  'zh-CN': { common: zhCNCommon },
  'zh-TW': { common: zhTWCommon },
  fr: { common: frCommon },
  ja: { common: jaCommon },
  ko: { common: koCommon },
  es: { common: esCommon },
  'pt-BR': { common: ptBRCommon },
  vi: { common: viCommon },
  id: { common: idCommon },
} as const;

if (!i18n.isInitialized) {
  try {
    i18n.use(initReactI18next).init({
      resources,
      lng: resolveDeviceLocale(),
      fallbackLng: fallbackLocale,
      defaultNS: 'common',
      ns: ['common'],
      interpolation: { escapeValue: false },
      returnNull: false,
      supportedLngs: Object.keys(resources),
      initAsync: false,
    });
  } catch (error) {
    console.warn('🟦 i18n init failed, using fallback', error instanceof Error ? error.message : String(error));
  }
}

export function currentLocale(): SupportedLocale {
  return normalizeLocale(i18n.resolvedLanguage ?? i18n.language ?? fallbackLocale);
}

export async function setAppLanguage(locale: SupportedLocale): Promise<void> {
  if (currentLocale() !== locale) {
    await i18n.changeLanguage(locale);
  }
}

export default i18n;
