import type { SirenMode } from '../audio/sirenEngine';

export type SguSystemId = 'hazard' | 'k13' | 'elina' | 'grach';

export interface SguSystemSpec {
  id: SguSystemId;
  name: string;
  shortName: string;
  brandTop: string;
  brandBottom: string;
  modelCode: string;
  tagline: string;
  accentColor: string;
  manLabel: string;
  hornLabel: string;
  pttLabel: string;
  modes: Array<{
    mode: SirenMode;
    label: string;
  }>;
}

export const SGU_SYSTEMS: Record<SguSystemId, SguSystemSpec> = {
  hazard: {
    id: 'hazard',
    name: 'Premier Hazard 7007',
    shortName: 'HAZARD 7007',
    brandTop: 'PREMIER',
    brandBottom: 'HAZARD',
    modelCode: '7007',
    tagline: 'Классический чёрный корпус · 2 крутилки · MAN / PULSAR / HORN',
    accentColor: '#eab308',
    manLabel: 'MAN',
    hornLabel: 'HORN',
    pttLabel: 'PTT',
    modes: [
      { mode: 'standby', label: 'STANDBY' },
      { mode: 'hilo', label: 'HILO' },
      { mode: 'yelp', label: 'YELP' },
      { mode: 'wail', label: 'WAIL' },
      { mode: 'pa', label: 'PA' },
      { mode: 'radio', label: 'RADIO' },
    ],
  },
  k13: {
    id: 'k13',
    name: 'СГУ «K-13» (ГИБДД)',
    shortName: 'СГУ K-13',
    brandTop: 'ГИБДД',
    brandBottom: 'K-13',
    modelCode: 'K-13',
    tagline: '6 кнопок как на видео · SHORT · HORN · PULSAR · SIREN · MANUAL · MODE',
    accentColor: '#f59e0b',
    manLabel: 'MANUAL',
    hornLabel: 'HORN',
    pttLabel: 'ГГС',
    modes: [
      { mode: 'standby', label: 'ВЫКЛ' },
      { mode: 'wail', label: 'WAIL' },
      { mode: 'yelp', label: 'YELP' },
      { mode: 'hilo', label: 'HILO' },
      { mode: 'phaser', label: 'PULSAR' },
      { mode: 'pa', label: 'PA' },
    ],
  },
  elina: {
    id: 'elina',
    name: 'СГУ «Элина Смерч»',
    shortName: 'ЭЛИНА СМЕРЧ',
    brandTop: 'ПК ЭЛИНА',
    brandBottom: 'СМЕРЧ',
    modelCode: '200ВТ',
    tagline: 'Оригинальные заводские записи ПК «Элина» · WAIL / YELP / HILO / AIR HORN',
    accentColor: '#38bdf8',
    manLabel: 'MAN',
    hornLabel: 'AIR HORN',
    pttLabel: 'ГГС',
    modes: [
      { mode: 'standby', label: 'STANDBY' },
      { mode: 'hilo', label: 'HILO' },
      { mode: 'yelp', label: 'YELP' },
      { mode: 'wail', label: 'WAIL' },
      { mode: 'pa', label: 'PA' },
      { mode: 'radio', label: 'RADIO' },
    ],
  },
  grach: {
    id: 'grach',
    name: 'СГУ «Грач» (Элект)',
    shortName: 'СГУ ГРАЧ',
    brandTop: 'ЭЛЕКТ',
    brandBottom: 'ГРАЧ',
    modelCode: 'МД-200',
    tagline: 'Реальные записи СГУ ДПС · низкий «кряк», WAIL, YELP и PULSAR',
    accentColor: '#f87171',
    manLabel: 'РУЧН',
    hornLabel: 'КРЯК',
    pttLabel: 'ГГС',
    modes: [
      { mode: 'standby', label: 'ВЫКЛ' },
      { mode: 'phaser', label: 'PULSAR' },
      { mode: 'yelp', label: 'YELP' },
      { mode: 'wail', label: 'WAIL' },
      { mode: 'pa', label: 'PA' },
      { mode: 'radio', label: 'RADIO' },
    ],
  },
};

export const SGU_LIST: SguSystemSpec[] = [
  SGU_SYSTEMS.hazard,
  SGU_SYSTEMS.k13,
  SGU_SYSTEMS.elina,
  SGU_SYSTEMS.grach,
];
