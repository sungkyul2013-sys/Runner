// Spawn presets and scene list from data/structures/presets.json (§1.4 데이터 드리븐).
import presetData from '../../../data/structures/presets.json';
import type { VehicleSource } from '../physics/messages';
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

/** Headline figures of a car (§18.3-3 제원 카드), manufacturer data. */
export interface VehicleSpecs {
  powerKw: number;
  torqueNm: number;
  massKg: number;
  drive: string;
  zeroTo100: number; // [s]
}

export interface VehiclePreset {
  id: string;
  label: Localized;
  source: VehicleSource;
  model: string | null; // GLB visual (null: the node-beam debug view is the visual)
  redlineRpm: number;
  crash: { front: number; width: number }; // [m] footprint for the crash launcher: origin to front bumper, width
  specs?: VehicleSpecs;
}

/** A car on the main menu's turntable: a drivable one (`drive`: its vehicle preset) or a visual-only model. */
export interface ShowroomCar {
  id: string;
  drive?: string;
  label?: Localized;
  model?: string;
  specs?: VehicleSpecs;
}

export const SCENES = presetData.scenes as ScenePreset[];
export const DRIVE_VEHICLES = presetData.vehicles as VehiclePreset[];
export const SPAWNS = presetData.presets as unknown as SpawnPreset[];
export const SHOWROOM = (presetData as unknown as { showroom: ShowroomCar[] }).showroom;

/** A showroom entry with its label, model and figures filled in from its vehicle preset when it has one. */
export function showroomCar(c: ShowroomCar): Required<Pick<ShowroomCar, 'id' | 'label'>> & ShowroomCar {
  const v = c.drive ? DRIVE_VEHICLES.find((x) => x.id === c.drive) : undefined;
  return { ...c, label: c.label ?? v?.label ?? { ko: c.id, en: c.id }, model: c.model ?? v?.model ?? undefined, specs: c.specs ?? v?.specs };
}

/** Resolves a preset into core lattice parameters at a concrete world position. */
export function resolveSpawn(p: SpawnPreset, target: Vec3): LatticeParams {
  const o = p.place.offset;
  const center: Vec3 = p.place.mode === 'target' ? [target[0] + o[0], o[1], target[2] + o[2]] : [o[0], o[1], o[2]];
  return { ...p.lattice, center };
}
