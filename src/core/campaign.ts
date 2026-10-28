import type { LevelId } from './game';

export const CAMPAIGN_STORAGE_KEY = 'dead-circuit-campaign-v1';
export const SETTINGS_STORAGE_KEY = 'dead-circuit-settings-v1';
export const CAMPAIGN_SCHEMA_VERSION = 1;

export interface CampaignSave {
  schemaVersion: typeof CAMPAIGN_SCHEMA_VERSION;
  completedMissions: LevelId[];
  unlockedMissions: LevelId[];
}

export interface DisplaySettings {
  uiScale: number;
  reducedMotion: boolean;
  screenShake: boolean;
}

export const DEFAULT_SETTINGS: DisplaySettings = {
  uiScale: 1,
  reducedMotion: typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
  screenShake: true,
};

export function createCampaign(): CampaignSave {
  return { schemaVersion: CAMPAIGN_SCHEMA_VERSION, completedMissions: [], unlockedMissions: ['standard'] };
}

export function decodeCampaign(raw: string | null): CampaignSave | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<CampaignSave>;
    if (value.schemaVersion !== CAMPAIGN_SCHEMA_VERSION || !Array.isArray(value.completedMissions) || !Array.isArray(value.unlockedMissions)) return null;
    const valid = (id: unknown): id is LevelId => id === 'standard' || id === 'logic';
    if (!value.completedMissions.every(valid) || !value.unlockedMissions.every(valid) || !value.unlockedMissions.includes('standard')) return null;
    return {
      schemaVersion: CAMPAIGN_SCHEMA_VERSION,
      completedMissions: Array.from(new Set(value.completedMissions)),
      unlockedMissions: Array.from(new Set(value.unlockedMissions)),
    };
  } catch {
    return null;
  }
}

export function decodeSettings(raw: string | null): DisplaySettings {
  if (!raw) return { ...DEFAULT_SETTINGS };
  try {
    const value = JSON.parse(raw) as Partial<DisplaySettings>;
    const uiScale = typeof value.uiScale === 'number' && Number.isFinite(value.uiScale) ? Math.min(1.15, Math.max(0.85, value.uiScale)) : DEFAULT_SETTINGS.uiScale;
    return {
      uiScale,
      reducedMotion: typeof value.reducedMotion === 'boolean' ? value.reducedMotion : DEFAULT_SETTINGS.reducedMotion,
      screenShake: typeof value.screenShake === 'boolean' ? value.screenShake : DEFAULT_SETTINGS.screenShake,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function nextCampaignMission(save: CampaignSave): LevelId | 'replay' {
  if (!save.completedMissions.includes('standard')) return 'standard';
  if (!save.completedMissions.includes('logic')) return 'logic';
  return 'replay';
}

export function recordMissionResult(save: CampaignSave, mission: LevelId, won: boolean): CampaignSave {
  if (!won) return save;
  const completedMissions = Array.from(new Set([...save.completedMissions, mission]));
  const unlockedMissions = Array.from(new Set([...save.unlockedMissions, ...(mission === 'standard' ? ['logic' as const] : [])]));
  return { schemaVersion: CAMPAIGN_SCHEMA_VERSION, completedMissions, unlockedMissions };
}
