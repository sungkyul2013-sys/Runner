export type MissionKind = 'coins' | 'distance' | 'jetpack';

export interface Mission {
  kind: MissionKind;
  target: number;
  reward: number;
  progress: number;
  done: boolean;
}

interface MissionTemplate {
  kind: MissionKind;
  /** Target grows with tier (completions) so missions stay fresh. */
  base: number;
  step: number;
  reward: number;
  label: (target: number) => string;
}

const TEMPLATES: Record<MissionKind, MissionTemplate> = {
  coins: {
    kind: 'coins',
    base: 80,
    step: 40,
    reward: 250,
    label: (t) => `Collect ${t} coins in total`,
  },
  distance: {
    kind: 'distance',
    base: 1500,
    step: 750,
    reward: 300,
    label: (t) => `Run ${t} m in a single attempt`,
  },
  jetpack: {
    kind: 'jetpack',
    base: 3,
    step: 2,
    reward: 350,
    label: (t) => `Use the Jetpack ${t} times`,
  },
};

export function missionLabel(m: Mission): string {
  return TEMPLATES[m.kind].label(m.target);
}

/** Build a fresh mission of a kind, scaled by how many times it's been done. */
export function makeMission(kind: MissionKind, tier: number): Mission {
  const t = TEMPLATES[kind];
  return {
    kind,
    target: t.base + t.step * tier,
    reward: t.reward + tier * 50,
    progress: 0,
    done: false,
  };
}

export const MISSION_KINDS: MissionKind[] = ['coins', 'distance', 'jetpack'];
