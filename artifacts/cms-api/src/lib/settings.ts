import {
  defaultDemoSettings,
  defaultEmailSettings,
  defaultFormSettings,
  defaultSecuritySettings,
  defaultSeoSettings,
  defaultSiteSettings,
  demoSettingsSchema,
  emailSettingsSchema,
  formSettingsSchema,
  securitySettingsSchema,
  seoSettingsSchema,
  siteSettingsSchema,
  type DemoSettings,
  type EmailSettings,
  type FormSettings,
  type SecuritySettings,
  type SeoSettings,
  type SiteSettings,
} from '@workspace/cms-content';
import type { ZodTypeAny } from 'zod';
import { db } from '../db.ts';

export const settingGroups = {
  site: { schema: siteSettingsSchema, defaults: defaultSiteSettings },
  demo: { schema: demoSettingsSchema, defaults: defaultDemoSettings },
  forms: { schema: formSettingsSchema, defaults: defaultFormSettings },
  email: { schema: emailSettingsSchema, defaults: defaultEmailSettings },
  seo: { schema: seoSettingsSchema, defaults: defaultSeoSettings },
  security: { schema: securitySettingsSchema, defaults: defaultSecuritySettings },
} as const;

export type SettingKey = keyof typeof settingGroups;

type SettingValue = { site: SiteSettings; demo: DemoSettings; forms: FormSettings; email: EmailSettings; seo: SeoSettings; security: SecuritySettings };

// Stored values are merged over the defaults, so a settings field added in a
// later release has a sensible value before anyone edits it.
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue[K]> {
  const group = settingGroups[key];
  const row = await db.setting.findUnique({ where: { key } });
  const merged = { ...group.defaults, ...((row?.value as object | null) ?? {}) };
  const parsed = (group.schema as ZodTypeAny).safeParse(merged);
  if (!parsed.success) {
    console.warn(`[settings] stored "${key}" settings are invalid; serving defaults.`);
    return group.defaults as SettingValue[K];
  }
  return parsed.data as SettingValue[K];
}

export async function getAllSettings() {
  const [site, demo, forms, email, seo, security] = await Promise.all([
    getSetting('site'),
    getSetting('demo'),
    getSetting('forms'),
    getSetting('email'),
    getSetting('seo'),
    getSetting('security'),
  ]);
  return { site, demo, forms, email, seo, security };
}
