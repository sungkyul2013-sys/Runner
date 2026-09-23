// Spawn presets and scene list from data/structures/presets.json (§1.4 데이터 드리븐).
import presetData from '../../../data/structures/presets.json';
import type { LatticeParams } from '../physics/sbc';
import type { Localized } from '../ui/i18n';

type Vec3 = [number, number, number];

export interface ScenePreset {
  id: string;
  label: Localized;
  bodies?: number;
}

export interface SpawnPreset {
  id: string;
  key: string;
  label: Localized;
  place: { mode: 'target' | 'world'; offset: Vec3 };
  lattice: Omit<LatticeParams, 'center'>;
}

export const SCENES = presetData.scenes as ScenePreset[];
export const SPAWNS = presetData.presets as unknown as SpawnPreset[];

/** Resolves a preset into core lattice parameters at a concrete world position. */
export function resolveSpawn(p: SpawnPreset, target: Vec3): LatticeParams {
  const o = p.place.offset;
  const center: Vec3 = p.place.mode === 'target' ? [target[0] + o[0], o[1], target[2] + o[2]] : [o[0], o[1], o[2]];
  return { ...p.lattice, center };
}
