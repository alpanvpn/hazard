export interface MelodyPreset {
  id: string;
  name: string;
  notes: number[];
  stepMs: number;
  sharp?: boolean;
  isSweep?: boolean;
  custom?: boolean;
}

export const BUILTIN_MELODY_PRESETS: MelodyPreset[] = [
  {
    id: 'man_standard',
    name: 'Стандарт (600 ↔ 1700 Гц)',
    notes: [600, 1700],
    stepMs: 3000,
    sharp: false,
    isSweep: true,
  },
  {
    id: 'man_600_1000_800',
    name: '600 → 1000 → 800',
    notes: [600, 1000, 800],
    stepMs: 180,
    sharp: false,
    isSweep: false,
  },
  {
    id: 'pulse_600_800_600_1200',
    name: '600 → 800 → 600 → 1200',
    notes: [600, 800, 600, 1200],
    stepMs: 170,
    sharp: false,
    isSweep: false,
  },
  {
    id: 'wave_600_1000_800_1200_800',
    name: '600 → 1000 → 800 → 1200 → 800',
    notes: [600, 1000, 800, 1200, 800],
    stepMs: 210,
    sharp: false,
    isSweep: false,
  },
  {
    id: 'turbo_650_1100_650_1500',
    name: 'Турбо 650 → 1100 → 650 → 1500',
    notes: [650, 1100, 650, 1500],
    stepMs: 140,
    sharp: false,
    isSweep: false,
  },
  {
    id: 'stairs_550_850_1150_850',
    name: 'Ступени 550 → 850 → 1150 → 850',
    notes: [550, 850, 1150, 850],
    stepMs: 165,
    sharp: true,
    isSweep: false,
  },
];

export const DEFAULT_MELODY_PRESET: MelodyPreset = BUILTIN_MELODY_PRESETS[0];

export function formatMelodyLabel(notes: number[], isSweep?: boolean): string {
  if (isSweep) {
    return '600 ↔ 1700 Гц (Стандарт)';
  }
  return `${notes.join('→')} Гц`;
}
