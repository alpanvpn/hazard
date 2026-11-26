import type { SirenMode } from '../audio/sirenEngine';

export type SguSystemId = 'hazard' | 'grach' | 'elina' | 'bars';

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
  // Ordered bottom-to-top for rotary knob & arc labels (matches Hazard 7007 layout)
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
    tagline: 'Классический чёрный корпус · жёлтая разметка · 2 крутилки · MAN / HORN',
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
  grach: {
    id: 'grach',
    name: 'СГУ «ГРАЧ» (Элект-200)',
    shortName: 'СГУ ГРАЧ',
    brandTop: 'ЭЛЕКТ',
    brandBottom: 'ГРАЧ',
    modelCode: 'СГУ-200',
    tagline: 'Пульт ДПС «Грач» · красная шкала · жёсткий тифон · крякалка',
    accentColor: '#ef4444',
    manLabel: 'СМЕНА',
    hornLabel: 'КРЯК',
    pttLabel: 'ПЭУ',
    modes: [
      { mode: 'standby', label: 'ОЖИД.' },
      { mode: 'grach', label: 'ГРАЧ-1' },
      { mode: 'smerch', label: 'СМЕРЧ' },
      { mode: 'wail', label: 'ВОЙ' },
      { mode: 'pa', label: 'ГГС' },
      { mode: 'radio', label: 'РАДИО' },
    ],
  },
  elina: {
    id: 'elina',
    name: 'СГУ «ЭЛИНА» (Смерч-200П)',
    shortName: 'СГУ ЭЛИНА',
    brandTop: 'ЭЛИНА',
    brandBottom: 'СМЕРЧ',
    modelCode: '200П',
    tagline: 'Синяя индикация · резкий спецсигнал Элина · мгновенный кряк',
    accentColor: '#38bdf8',
    manLabel: 'РУЧН.',
    hornLabel: 'КРЯК',
    pttLabel: 'МИКР.',
    modes: [
      { mode: 'standby', label: 'ПАУЗА' },
      { mode: 'elina', label: 'ЭЛИНА' },
      { mode: 'yelp', label: 'ЧАСТ.' },
      { mode: 'phaser', label: 'ТРЕЛЬ' },
      { mode: 'pa', label: 'ЭФИР' },
      { mode: 'radio', label: 'РАДИО' },
    ],
  },
  bars: {
    id: 'bars',
    name: 'СГУ «БАРС» (Патриот-200)',
    shortName: 'СГУ БАРС',
    brandTop: 'СПЕЦ',
    brandBottom: 'БАРС',
    modelCode: 'П-200',
    tagline: 'Усиленный низкий тон Барс · Патриот · двухтональный Тритон',
    accentColor: '#f97316',
    manLabel: 'ТОН',
    hornLabel: 'ТИФОН',
    pttLabel: 'ТАНГ.',
    modes: [
      { mode: 'standby', label: 'СТОП' },
      { mode: 'bars', label: 'БАРС' },
      { mode: 'patriot', label: 'ПАТРИОТ' },
      { mode: 'rumbler', label: 'ТРИТОН' },
      { mode: 'pa', label: 'ГГС' },
      { mode: 'radio', label: 'РАДИО' },
    ],
  },
};

export const SGU_LIST: SguSystemSpec[] = [
  SGU_SYSTEMS.hazard,
  SGU_SYSTEMS.grach,
  SGU_SYSTEMS.elina,
  SGU_SYSTEMS.bars,
];
