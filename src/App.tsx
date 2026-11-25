import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileAudio,
  Lightbulb,
  Lock,
  Megaphone,
  Mic,
  MicOff,
  Power,
  Radio,
  ShieldAlert,
  Sliders,
  SlidersHorizontal,
  Trash2,
  Volume2,
  Waves,
  X,
} from 'lucide-react';
import { EngineSnapshot, PhraseId, SirenAudioEngine, SirenMode } from './audio/sirenEngine';
import { PWAInstallButton } from './components/PWAInstallButton';
import { RotaryKnob } from './components/RotaryKnob';
import { useWakeLock } from './hooks/useWakeLock';

type TabId = 'siren' | 'modes' | 'light' | 'fx';
type LightMode = '' | 'r' | 'w' | 'a';
type UiTheme = 'hardware' | 'glass';
type ManSirenBehavior = 'toggle' | 'hold';
type ManStandbyStyle = 'siren' | 'wolf';

const BOT_URL = 'https://t.me/AlpanVPNrobot?start=alpan';
const SUPPORT_TG_URL = 'https://t.me/aitral';
// SHA-256 hex of the 4-digit unlock code
const UNLOCK_CODE_HASH = 'dd3fac072357758b41aabe831c4abf01de1cd7cc16065c48c7525c0b43f80042';

const KNOB_MODES: SirenMode[] = ['standby', 'hilo', 'yelp', 'wail', 'pa', 'radio'];
const EXTRA_MODES: SirenMode[] = ['phaser', 'piercer', 'rumbler', 'usa', 'airraid', 'fast'];

const MODE_LABELS: Record<SirenMode, string> = {
  standby: 'STANDBY',
  hilo: 'HI-LO',
  yelp: 'YELP',
  wail: 'WAIL',
  pa: 'PA',
  radio: 'RADIO',
  phaser: 'PHASER',
  piercer: 'PIERCER',
  rumbler: 'RUMBLER',
  usa: 'US POLICE',
  airraid: 'AIR RAID',
  fast: 'FAST WAIL',
};

const ALT_MODE_MAP: Partial<Record<SirenMode, SirenMode>> = {
  hilo: 'wail',
  wail: 'yelp',
  yelp: 'phaser',
};

const DPS_PHRASES: { id: PhraseId; label: string; full: string }[] = [
  { id: 'obochina', label: 'К обочине!', full: 'К обочине прижимаемся!' },
  { id: 'vpravo_stop', label: 'Вправо, стоп!', full: 'Вправо прижимаемся, останавливаемся!' },
  { id: 'prizhatsa', label: 'Прижаться!', full: 'Вправо прижаться, остановиться!' },
  { id: 'ostanavlivaemsya', label: 'Остановка!', full: 'Останавливаемся!' },
  { id: 'strelyat', label: 'Стрелять будем!', full: 'Останавливаемся, стрелять будем!' },
];

const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, val: string): void {
    try {
      window.localStorage.setItem(key, val);
    } catch {
      // Ignore storage quota / private mode restrictions
    }
  },
};

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const data = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const bytes = new TextEncoder().encode(text);
  const bitLen = bytes.length * 8;
  const paddedLen = Math.ceil((bytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen, false);
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const W = new Uint32Array(64);
  for (let i = 0; i < paddedLen; i += 64) {
    for (let t = 0; t < 16; t++) W[t] = view.getUint32(i + t * 4, false);
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, W[t - 15]) ^ rotr(18, W[t - 15]) ^ (W[t - 15] >>> 3);
      const s1 = rotr(17, W[t - 2]) ^ rotr(19, W[t - 2]) ^ (W[t - 2] >>> 10);
      W[t] = (W[t - 16] + s0 + W[t - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + W[t]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    H[0] = (H[0] + a) >>> 0;
    H[1] = (H[1] + b) >>> 0;
    H[2] = (H[2] + c) >>> 0;
    H[3] = (H[3] + d) >>> 0;
    H[4] = (H[4] + e) >>> 0;
    H[5] = (H[5] + f) >>> 0;
    H[6] = (H[6] + g) >>> 0;
    H[7] = (H[7] + h) >>> 0;
  }
  return H.map((x) => x.toString(16).padStart(8, '0')).join('');
}

export default function App() {
  const [gateOpen, setGateOpen] = useState<boolean>(() => storage.get('alpan_ok') !== '1');
  const [botClicked, setBotClicked] = useState(false);
  const [gateCountdown, setGateCountdown] = useState<number>(0);

  const [proUnlocked, setProUnlocked] = useState<boolean>(() => storage.get('alpan_pro') === '1');
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [uiTheme, setUiTheme] = useState<UiTheme>(() =>
    storage.get('alpan_theme') === 'glass' ? 'glass' : 'hardware'
  );
  const [activeTab, setActiveTab] = useState<TabId>('siren');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [lightMode, setLightMode] = useState<LightMode>('');
  const [strobeConfirmOpen, setStrobeConfirmOpen] = useState(false);
  const [strobeAcknowledged, setStrobeAcknowledged] = useState(false);

  const [volume, setVolume] = useState(1.0);
  const [echoVal, setEchoVal] = useState(0);
  const [tunnelVal, setTunnelVal] = useState(0);
  const [toneVal, setToneVal] = useState(4800);

  const [manSiren, setManSiren] = useState<ManSirenBehavior>(() =>
    storage.get('alpan_man_mode') === 'toggle' ? 'toggle' : 'hold'
  );
  const [manStyle, setManStyle] = useState<ManStandbyStyle>(() =>
    storage.get('alpan_man_style') === 'wolf' ? 'wolf' : 'siren'
  );
  const [beepEnabled, setBeepEnabled] = useState<boolean>(
    () => storage.get('alpan_beep') !== '0'
  );
  const [hapticEnabled, setHapticEnabled] = useState<boolean>(
    () => storage.get('alpan_haptic') !== '0'
  );
  const [micDb, setMicDb] = useState<number>(() => {
    const saved = Number(storage.get('alpan_mic_db'));
    return Number.isFinite(saved) && saved >= 0 && saved <= 36 ? saved : 18;
  });
  const [bgMusicMode, setBgMusicMode] = useState<'ambient' | 'playback'>(() =>
    storage.get('alpan_session_v2') === 'ambient' ? 'ambient' : 'playback'
  );

  const [manPressed, setManPressed] = useState(false);
  const [hornPressed, setHornPressed] = useState(false);
  const [pttPressed, setPttPressed] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0);

  const [micWarningOpen, setMicWarningOpen] = useState(false);
  const [micConfirmed, setMicConfirmed] = useState(false);
  const [micPendingAction, setMicPendingAction] = useState<'pa' | 'ptt' | null>(null);
  const [micStatusMsg, setMicStatusMsg] = useState('');
  const [radioError, setRadioError] = useState('');
  const [singleCopied, setSingleCopied] = useState(false);
  const [singleCopyError, setSingleCopyError] = useState('');

  const [engineSnap, setEngineSnap] = useState<EngineSnapshot>({
    powered: false,
    mode: 'standby',
    altActive: false,
    hz: 0,
    hornActive: false,
    wolfActive: false,
    loadedCount: 0,
    totalCount: 6,
    audioState: 'uninitialized',
    sessionType: 'playback',
    micOn: false,
    radioName: null,
    activePhrase: null,
  });

  const engineRef = useRef<SirenAudioEngine | null>(null);
  const hornPointerRef = useRef<number | null>(null);
  const manPointerRef = useRef<number | null>(null);
  const pttPointerRef = useRef<number | null>(null);
  const hapticLabelRef = useRef<HTMLLabelElement | null>(null);
  const radioInputRef = useRef<HTMLInputElement | null>(null);

  const wakeLock = useWakeLock();

  // Apply selected theme attribute cleanly on root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', uiTheme === 'hardware' ? '#030406' : '#05070d');
    }
  }, [uiTheme]);

  const triggerHaptic = useCallback(
    (pattern: number | number[] = 14) => {
      if (!hapticEnabled) return;
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(pattern);
        } else {
          hapticLabelRef.current?.click();
        }
      } catch {
        // Ignore on unsupported devices
      }
    },
    [hapticEnabled]
  );

  // Initialize Audio Engine and prefetch Hazard 7007 WAV recordings + meta.json immediately
  useEffect(() => {
    const engine = new SirenAudioEngine((snap) => setEngineSnap(snap));
    engine.setSessionType(bgMusicMode);
    engine.setManSiren(manSiren);
    engine.setManStyle(manStyle);
    engine.setBeepEnabled(beepEnabled);
    engine.setMicDb(micDb);
    engine.setVolume(volume);
    engineRef.current = engine;
    void engine.prefetchAll();
    return () => {
      void engine.stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.body.classList.toggle('gated', gateOpen);
  }, [gateOpen]);

  const isSirenSounding = useMemo(
    () =>
      engineSnap.powered &&
      (hornPressed ||
        engineSnap.hornActive ||
        manPressed ||
        engineSnap.wolfActive ||
        engineSnap.hz > 10 ||
        (engineSnap.mode !== 'standby' &&
          engineSnap.mode !== 'pa' &&
          engineSnap.mode !== 'radio')),
    [
      engineSnap.powered,
      engineSnap.mode,
      engineSnap.hornActive,
      engineSnap.wolfActive,
      engineSnap.hz,
      hornPressed,
      manPressed,
    ]
  );

  useEffect(() => {
    document.body.classList.toggle('siren-active', isSirenSounding);
  }, [isSirenSounding]);

  useEffect(() => {
    if (!botClicked || gateCountdown <= 0) return;
    const t = window.setTimeout(() => setGateCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [botClicked, gateCountdown]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (engineRef.current) {
        setMeterLevel(engineRef.current.getMeterLevel());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const releaseAllHeld = () => {
      if (hornPointerRef.current !== null) {
        hornPointerRef.current = null;
        setHornPressed(false);
        engineRef.current?.releaseHorn();
      }
      if (manPointerRef.current !== null) {
        manPointerRef.current = null;
        setManPressed(false);
        engineRef.current?.releaseMan();
      }
      if (pttPointerRef.current !== null) {
        pttPointerRef.current = null;
        setPttPressed(false);
        if (engineRef.current?.getSnapshot().mode !== 'pa') {
          engineRef.current?.stopMic();
        }
      }
    };
    window.addEventListener('blur', releaseAllHeld);
    return () => window.removeEventListener('blur', releaseAllHeld);
  }, []);

  const handleBotClick = () => {
    if (!botClicked) {
      setBotClicked(true);
      setGateCountdown(5);
    }
  };

  const handleEnterApp = async () => {
    storage.set('alpan_ok', '1');
    setGateOpen(false);
    triggerHaptic(15);
    await engineRef.current?.ensureStarted();
    await wakeLock.requestLock();
  };

  const handleCopyBotLink = async () => {
    try {
      await navigator.clipboard?.writeText(BOT_URL);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      setCopiedLink(false);
    }
  };

  const handleUnlockSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleaned = codeInput.replace(/\D/g, '').slice(0, 4);
    if (cleaned.length < 4) {
      setCodeError('Введи 4 цифры кода');
      return;
    }
    const digest = await sha256Hex(cleaned);
    if (digest === UNLOCK_CODE_HASH) {
      setProUnlocked(true);
      storage.set('alpan_pro', '1');
      setLockModalOpen(false);
      setCodeInput('');
      setCodeError('');
      triggerHaptic([20, 30, 20]);
    } else {
      setCodeInput('');
      setCodeError('Неверный код');
      triggerHaptic(40);
    }
  };

  const handleTabSelect = (tab: TabId, isPro = false) => {
    if (isPro && !proUnlocked) {
      setLockModalOpen(true);
      triggerHaptic(12);
      return;
    }
    setActiveTab(tab);
    triggerHaptic(8);
  };

  const handleTogglePower = async () => {
    const next = !engineSnap.powered;
    triggerHaptic(20);
    await engineRef.current?.setPower(next);
    if (next) {
      await wakeLock.requestLock();
    }
  };

  const activatePA = useCallback(async () => {
    setMicStatusMsg('');
    await engineRef.current?.setMode('pa');
    const ok = await engineRef.current?.startMic();
    if (!ok) {
      setMicStatusMsg('Доступ к микрофону запрещён или недоступен в этом браузере.');
    }
  }, []);

  const handleSelectMode = async (mode: SirenMode) => {
    triggerHaptic(12);
    if (mode === 'pa') {
      if (engineSnap.mode === 'pa' && engineSnap.powered) {
        engineRef.current?.stopMic();
        await engineRef.current?.setMode('standby');
        return;
      }
      if (!micConfirmed) {
        setMicPendingAction('pa');
        setMicWarningOpen(true);
        return;
      }
      await activatePA();
      return;
    }
    if (engineSnap.mode === 'pa') {
      engineRef.current?.stopMic();
    }
    await engineRef.current?.setMode(mode);
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    engineRef.current?.setVolume(v);
  };

  const handleModeKnobChange = (v: number) => {
    const idx = Math.min(KNOB_MODES.length - 1, Math.max(0, Math.round(v * (KNOB_MODES.length - 1))));
    const chosen = KNOB_MODES[idx];
    if (chosen !== engineSnap.mode || !engineSnap.powered) {
      triggerHaptic(6);
      if (chosen === 'pa' && !micConfirmed) {
        setMicPendingAction('pa');
        setMicWarningOpen(true);
        return;
      }
      if (engineSnap.mode === 'pa' && chosen !== 'pa') {
        engineRef.current?.stopMic();
      }
      if (chosen === 'pa') {
        void activatePA();
      } else {
        void engineRef.current?.setMode(chosen);
      }
    }
  };

  const onManDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (manPointerRef.current !== null) return;
    manPointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setManPressed(true);
    triggerHaptic(15);
    await engineRef.current?.pressMan();
  };

  const onManUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (manPointerRef.current !== e.pointerId) return;
    manPointerRef.current = null;
    setManPressed(false);
    engineRef.current?.releaseMan();
  };

  const onHornDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (hornPointerRef.current !== null) return;
    hornPointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setHornPressed(true);
    triggerHaptic(18);
    await engineRef.current?.pressHorn();
  };

  const onHornUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (hornPointerRef.current !== e.pointerId) return;
    hornPointerRef.current = null;
    setHornPressed(false);
    engineRef.current?.releaseHorn();
  };

  const onPttDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!micConfirmed) {
      setMicPendingAction('ptt');
      setMicWarningOpen(true);
      return;
    }
    if (pttPointerRef.current !== null) return;
    pttPointerRef.current = e.pointerId;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPttPressed(true);
    triggerHaptic(14);
    const ok = await engineRef.current?.startMic();
    if (!ok) {
      setMicStatusMsg('Нет доступа к микрофону. Разрешите доступ в настройках браузера.');
    }
  };

  const onPttUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pttPointerRef.current !== e.pointerId) return;
    pttPointerRef.current = null;
    setPttPressed(false);
    if (engineSnap.mode !== 'pa') {
      engineRef.current?.stopMic();
    }
  };

  const handleStopAll = async () => {
    hornPointerRef.current = null;
    manPointerRef.current = null;
    pttPointerRef.current = null;
    setHornPressed(false);
    setManPressed(false);
    setPttPressed(false);
    triggerHaptic([24, 36, 24]);
    await engineRef.current?.stopAll();
  };

  const handleLightSelect = (next: LightMode) => {
    triggerHaptic(10);
    if (next === 'w' && !strobeAcknowledged) {
      setStrobeConfirmOpen(true);
      return;
    }
    setLightMode((prev) => (prev === next ? '' : next));
  };

  const handleRadioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRadioError('');
    try {
      await engineRef.current?.loadRadioFile(file);
    } catch {
      setRadioError('Не удалось открыть этот аудиофайл. Попробуйте MP3, WAV или M4A.');
    } finally {
      e.target.value = '';
    }
  };

  const handleCopySingleHtml = async () => {
    setSingleCopyError('');
    try {
      const hasInline = Boolean((window as unknown as { __ALPAN_INLINE__?: unknown }).__ALPAN_INLINE__);
      let html = '';
      if (hasInline) {
        html = '<!doctype html>\n' + document.documentElement.outerHTML;
      } else {
        const res = await fetch('alpan-siren-7007-single.html');
        if (!res.ok) throw new Error('not built');
        html = await res.text();
      }
      await navigator.clipboard.writeText(html);
      setSingleCopied(true);
      setTimeout(() => setSingleCopied(false), 3000);
    } catch {
      setSingleCopyError('Не удалось скопировать в буфер — используйте кнопку скачивания файла.');
    }
  };

  const activePhraseMeta = useMemo(
    () => DPS_PHRASES.find((p) => p.id === engineSnap.activePhrase) ?? null,
    [engineSnap.activePhrase]
  );

  const altTargetMode = ALT_MODE_MAP[engineSnap.mode];
  const displayStatus = useMemo(() => {
    if (!engineSnap.powered) {
      return { title: 'STANDBY', subtitle: 'ПИТАНИЕ ВЫКЛЮЧЕНО' };
    }
    if (activePhraseMeta) {
      return {
        title: 'СГУ · ГОЛОС',
        subtitle: activePhraseMeta.full.toUpperCase(),
      };
    }
    if (hornPressed || engineSnap.hornActive) {
      const under =
        engineSnap.mode !== 'standby' && engineSnap.mode !== 'pa' && engineSnap.mode !== 'radio'
          ? `ПОВЕРХ ${MODE_LABELS[engineSnap.mode]}`
          : 'ВОЗДУШНЫЙ СИГНАЛ';
      return { title: 'AIR HORN', subtitle: under };
    }
    if (engineSnap.wolfActive) {
      return { title: 'ВОЛК', subtitle: 'СИГНАЛ' };
    }
    if (pttPressed || engineSnap.mode === 'pa') {
      return {
        title: 'PA · ЭФИР',
        subtitle: manPressed ? 'РАЗГОН И ТРЕЛЬ' : 'ГРОМКАЯ СВЯЗЬ',
      };
    }
    if (engineSnap.altActive && altTargetMode) {
      return {
        title: MODE_LABELS[altTargetMode],
        subtitle: `MAN · ВМЕСТО ${MODE_LABELS[engineSnap.mode]}`,
      };
    }
    if (manPressed && (engineSnap.mode === 'standby' || engineSnap.mode === 'radio')) {
      return { title: 'MANUAL', subtitle: 'РУЧНАЯ СИРЕНА' };
    }
    if (engineSnap.mode === 'radio') {
      return {
        title: 'RADIO',
        subtitle: engineSnap.radioName ? engineSnap.radioName.toUpperCase() : 'ПИТАНИЕ ВКЛЮЧЕНО',
      };
    }
    return {
      title: MODE_LABELS[engineSnap.mode],
      subtitle: engineSnap.mode === 'standby' ? 'ПИТАНИЕ ВКЛЮЧЕНО' : 'СИРЕНА АКТИВНА',
    };
  }, [engineSnap, hornPressed, manPressed, pttPressed, altTargetMode]);

  const manSubtitle = useMemo(() => {
    if (altTargetMode) {
      return manSiren === 'toggle'
        ? `Смена: ${MODE_LABELS[altTargetMode]}`
        : `Держи: ${MODE_LABELS[altTargetMode]}`;
    }
    if (engineSnap.mode === 'pa') {
      return 'Разгон и трель';
    }
    if (engineSnap.mode === 'standby' || engineSnap.mode === 'radio') {
      return manStyle === 'wolf' ? '«Волк» (держи)' : 'Держи для звука';
    }
    return manSiren === 'toggle' ? 'Переключает' : 'Держи для звука';
  }, [altTargetMode, engineSnap.mode, manSiren, manStyle]);

  const manIsLit = manPressed || (engineSnap.powered && (engineSnap.altActive || engineSnap.wolfActive));

  // 16-segment LED bargraph: shows volume level when idle & powered, and surges dynamically when sounding
  const activeLeds = useMemo(() => {
    if (!engineSnap.powered) return 0;
    if (meterLevel > 0) return Math.min(16, Math.round((meterLevel / 10) * 16));
    return Math.round(volume * 16);
  }, [engineSnap.powered, meterLevel, volume]);

  const knobModeIndex = KNOB_MODES.indexOf(engineSnap.mode);
  const knobModeValue = knobModeIndex >= 0 ? knobModeIndex / (KNOB_MODES.length - 1) : 0;

  return (
    <>
      {/* Hidden iOS 18+ Taptic Switch for haptic feedback */}
      <input
        id="alpan-haptic-sw"
        type="checkbox"
        // @ts-expect-error Safari 18+ native switch attribute
        switch=""
        className="sr-only"
        aria-hidden="true"
        tabIndex={-1}
        readOnly
      />
      <label ref={hapticLabelRef} htmlFor="alpan-haptic-sw" className="sr-only" aria-hidden="true" />

      {/* Background / Active Beacon Reflections */}
      <div className="bg-mesh" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>

      {/* Strobe Overlay */}
      <div className={`flash-overlay ${lightMode}`} aria-hidden="true" />

      {/* Main Application Shell */}
      <div
        id="app-shell"
        className="relative z-10 min-h-dvh mx-auto w-full max-w-5xl px-3 sm:px-6 pt-[calc(env(safe-area-inset-top)+12px)] pb-[calc(94px+env(safe-area-inset-bottom))] lg:pb-12"
      >
        {/* Top Bar */}
        <header className="flex items-center justify-between gap-2.5 mb-3">
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-wider text-white whitespace-nowrap">
            HAZARD <span className="text-[var(--acc)]">7007</span>
          </h1>

          <div className="flex items-center gap-2 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={() => void handleTogglePower()}
              aria-label={engineSnap.powered ? 'Выключить питание пульта' : 'Включить питание пульта'}
              aria-pressed={engineSnap.powered}
              className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                engineSnap.powered
                  ? 'border-[var(--acc)] bg-[#231d0d] text-[var(--acc)] shadow-[0_0_16px_rgba(217,187,102,0.3)]'
                  : 'border-[#252830] bg-[#0b0c10] text-white/60'
              }`}
            >
              <Power className="w-5 h-5 stroke-[2.3]" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic(8);
                setSettingsOpen(true);
              }}
              aria-label="Настройки пульта, темы и музыки в фоне"
              className="w-11 h-11 rounded-xl border border-[#252830] bg-[#0b0c10] text-white/85 flex items-center justify-center cursor-pointer transition-transform active:scale-90"
            >
              <SlidersHorizontal className="w-5 h-5 stroke-[2.2]" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Responsive Grid: 1 column on mobile, 2 columns on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-4 items-start">
          {/* Primary Hardware Siren Console */}
          <section
            aria-label="Пульт сирены"
            className={activeTab === 'siren' ? 'block' : 'hidden lg:block'}
          >
            {/* Status & 16-Segment LED Level Display */}
            <div className="panel-surface px-4 py-3.5 mb-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p
                  className={`text-[11px] font-bold tracking-[0.12em] truncate ${
                    engineSnap.powered ? 'text-[var(--ok)]' : 'text-[var(--dim)]'
                  }`}
                >
                  {displayStatus.subtitle}
                </p>
                <div className="flex items-baseline gap-2.5 mt-1">
                  <span className="text-2xl sm:text-[28px] leading-none font-extrabold tracking-wide text-[var(--acc)] truncate">
                    {displayStatus.title}
                  </span>
                  {engineSnap.hz > 0 && (
                    <span className="mono-nums text-xs font-semibold text-white/70 shrink-0">
                      {engineSnap.hz} Гц
                    </span>
                  )}
                </div>
              </div>

              <div className="text-right shrink-0">
                <span className="text-[10px] font-bold tracking-[0.16em] text-[var(--dim)] block mb-1.5">
                  УРОВЕНЬ
                </span>
                <div className="flex items-center gap-[3px] h-3.5" aria-hidden="true">
                  {Array.from({ length: 16 }).map((_, idx) => {
                    const lit = idx < activeLeds;
                    const colorClass = lit
                      ? idx >= 14
                        ? 'bg-[#ff495c] shadow-[0_0_6px_#ff495c]'
                        : idx >= 12
                        ? 'bg-[#ffd46b] shadow-[0_0_6px_#ffd46b]'
                        : 'bg-[#90d65c] shadow-[0_0_5px_rgba(144,214,92,0.5)]'
                      : 'bg-white/12';
                    return <span key={idx} className={`w-1.5 h-3.5 rounded-[1.5px] ${colorClass}`} />;
                  })}
                </div>
                <span className="mono-nums text-[11px] font-bold text-white/80 block mt-1">
                  {Math.round(volume * 100)}%
                </span>
              </div>
            </div>

            {/* Matte Black Premier Hazard 7007 Faceplate */}
            <div className="chassis-frame">
              <div className="chassis-gold-ring">
                {/* Premier Hazard 7007 Faceplate Header */}
                <div className="flex items-center justify-between mb-3.5 px-0.5">
                  <div className="hazard-badge">
                    <span>PREMIER</span>
                    <span>HAZARD</span>
                  </div>
                  <span className="italic font-extrabold text-xl tracking-wide text-[var(--acc)]">
                    7007
                  </span>
                </div>

                {/* Knurled Rotary Knobs (both circular) */}
                <div className="flex justify-around items-start mb-3">
                  <RotaryKnob
                    label="Громкость"
                    displayValue={`${Math.round(volume * 100)}%`}
                    hint="Тяни по кругу"
                    value={volume}
                    onChange={handleVolumeChange}
                    ariaLabel="Регулятор громкости сирены"
                  />
                  <RotaryKnob
                    label="Режим"
                    displayValue={MODE_LABELS[engineSnap.mode]}
                    hint="Поверни или нажми"
                    value={knobModeValue}
                    steps={KNOB_MODES.length - 1}
                    onTapStep={() => {
                      const nextIdx = (Math.max(0, knobModeIndex) + 1) % KNOB_MODES.length;
                      void handleSelectMode(KNOB_MODES[nextIdx]);
                    }}
                    onChange={handleModeKnobChange}
                    ariaLabel="Поворотный переключатель режимов"
                  />
                </div>

                {/* Convenient Horizontal Volume Slider */}
                <div className="mb-3.5 px-2.5 py-2 rounded-xl bg-black/35 border border-white/10 flex items-center gap-2.5">
                  <Volume2 className="w-4 h-4 text-[var(--acc)] shrink-0" aria-hidden="true" />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(volume * 100)}
                    aria-label="Ползунок громкости"
                    onChange={(e) => handleVolumeChange(Number(e.target.value) / 100)}
                    className="w-full accent-[var(--acc)] cursor-pointer"
                  />
                  <span className="mono-nums text-[11px] font-bold text-white/85 w-9 text-right shrink-0">
                    {Math.round(volume * 100)}%
                  </span>
                </div>

                {/* 6 Primary Hazard 7007 Mode Keys */}
                <div className="grid grid-cols-3 gap-2">
                  {KNOB_MODES.map((m) => {
                    const active = engineSnap.mode === m && engineSnap.powered;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => void handleSelectMode(m)}
                        aria-label={`Режим ${MODE_LABELS[m]}`}
                        aria-pressed={active}
                        className={`siren-btn py-3 px-2 text-xs sm:text-[13px] tracking-wider ${
                          active ? 'active' : ''
                        }`}
                      >
                        {MODE_LABELS[m]}
                      </button>
                    );
                  })}
                </div>

                {/* Signature Gold-Framed Ivory Keys: MAN & HORN */}
                <div className="grid grid-cols-2 gap-2.5 mt-3">
                  <div className="key-bezel">
                    <button
                      type="button"
                      onPointerDown={(e) => void onManDown(e)}
                      onPointerUp={onManUp}
                      onPointerCancel={onManUp}
                      onLostPointerCapture={onManUp}
                      aria-label={`MAN: ${manSubtitle}`}
                      aria-pressed={manIsLit}
                      className={`membrane-key flex flex-col items-center justify-center no-select ${
                        manIsLit ? 'man-lit' : ''
                      } ${manPressed ? 'pressed' : ''}`}
                    >
                      <span className="text-lg sm:text-xl font-extrabold tracking-wide leading-tight">
                        MAN
                      </span>
                      <span className="text-[11px] font-semibold opacity-75 mt-0.5 text-center leading-tight">
                        {manSubtitle}
                      </span>
                    </button>
                  </div>

                  <div className="key-bezel">
                    <button
                      type="button"
                      onPointerDown={(e) => void onHornDown(e)}
                      onPointerUp={onHornUp}
                      onPointerCancel={onHornUp}
                      onLostPointerCapture={onHornUp}
                      aria-label="HORN: воздушный сигнал"
                      aria-pressed={hornPressed || engineSnap.hornActive}
                      className={`membrane-key flex flex-col items-center justify-center no-select ${
                        hornPressed || engineSnap.hornActive ? 'horn-lit' : ''
                      } ${hornPressed ? 'pressed' : ''}`}
                    >
                      <span className="text-lg sm:text-xl font-extrabold tracking-wide leading-tight">
                        HORN
                      </span>
                      <span className="text-[11px] font-semibold opacity-75 mt-0.5 text-center leading-tight">
                        Держи для сигнала
                      </span>
                    </button>
                  </div>
                </div>

                {/* PTT Microphone Bar */}
                <button
                  type="button"
                  onPointerDown={(e) => void onPttDown(e)}
                  onPointerUp={onPttUp}
                  onPointerCancel={onPttUp}
                  onLostPointerCapture={onPttUp}
                  aria-label="PTT: удерживайте, чтобы говорить в громкоговоритель"
                  aria-pressed={pttPressed}
                  className={`siren-btn w-full mt-3 px-4 py-2.5 flex items-center gap-3 text-left no-select ${
                    pttPressed ? 'horn-active pressed' : ''
                  }`}
                >
                  <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                    <Mic className="w-4 h-4 text-white stroke-[2.3]" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold tracking-wide">PTT</span>
                    <span className="block text-[11px] font-medium text-[var(--dim)]">
                      Удерживай, чтобы говорить
                    </span>
                  </span>
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      pttPressed || (engineSnap.mode === 'pa' && engineSnap.powered)
                        ? 'bg-[#ff3b4e] shadow-[0_0_10px_#ff3b4e]'
                        : 'bg-white/20'
                    }`}
                    aria-hidden="true"
                  />
                </button>

                {micStatusMsg && (
                  <p className="mt-2 text-xs text-amber-300 font-medium">{micStatusMsg}</p>
                )}

                {/* Real Officer Megaphone Phrases (СГУ голос ДПС) */}
                <div className="mt-3 pt-2.5 border-t border-white/10">
                  <div className="flex items-center justify-between mb-1.5 px-0.5">
                    <span className="text-[10px] font-bold tracking-[0.14em] uppercase text-[var(--acc)] flex items-center gap-1.5">
                      <Megaphone className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Громкоговоритель (ДПС)</span>
                    </span>
                    <span className="text-[10px] text-[var(--dim)]">Нажми фразу</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DPS_PHRASES.map((phrase) => {
                      const active = engineSnap.activePhrase === phrase.id;
                      return (
                        <button
                          key={phrase.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic(12);
                            void engineRef.current?.playPhrase(phrase.id);
                          }}
                          aria-label={phrase.full}
                          aria-pressed={active}
                          className={`siren-btn min-h-[38px] px-2.5 py-1.5 text-[11px] sm:text-xs flex-1 basis-[30%] whitespace-nowrap truncate ${
                            active ? 'horn-active' : ''
                          }`}
                        >
                          {phrase.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Crimson Cutoff Switch */}
                <button
                  type="button"
                  onClick={() => void handleStopAll()}
                  aria-label="Стоп: выключить все звуки"
                  className="siren-btn stop-switch w-full mt-2.5 py-3 flex items-center justify-center font-extrabold tracking-[0.14em] text-sm"
                >
                  СТОП
                </button>
              </div>
            </div>
          </section>

          {/* Right Column on Desktop / Tab Content on Mobile */}
          <div className="space-y-4">
            {/* Extra Modes Section */}
            <section
              aria-label="Дополнительные режимы сирены"
              className={activeTab === 'modes' ? 'block' : 'hidden lg:block'}
            >
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Waves className="w-4 h-4 text-[var(--acc)] stroke-[2.2]" aria-hidden="true" />
                  <span>Доп. режимы</span>
                </h2>
                {!proUnlocked && (
                  <button
                    type="button"
                    onClick={() => setLockModalOpen(true)}
                    className="text-xs font-semibold text-[var(--acc)] flex items-center gap-1 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Открыть по коду</span>
                  </button>
                )}
              </div>

              <div className="panel-surface p-4 sm:p-5 relative">
                {!proUnlocked && (
                  <div className="hidden lg:flex absolute inset-0 z-10 rounded-[inherit] bg-black/65 backdrop-blur-md items-center justify-center p-4 text-center">
                    <button
                      type="button"
                      onClick={() => setLockModalOpen(true)}
                      className="siren-btn active px-5 py-3 text-sm flex items-center gap-2"
                    >
                      <Lock className="w-4 h-4" aria-hidden="true" />
                      <span>Разблокировать Режимы, Свет и FX</span>
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {EXTRA_MODES.map((m) => {
                    const active = engineSnap.mode === m && engineSnap.powered;
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => void handleSelectMode(m)}
                        aria-label={`Режим ${MODE_LABELS[m]}`}
                        aria-pressed={active}
                        className={`siren-btn py-3 px-2 text-xs sm:text-[13px] ${
                          active ? 'active' : ''
                        }`}
                      >
                        {MODE_LABELS[m]}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Lightbar Section */}
            <section
              aria-label="Световая панель"
              className={activeTab === 'light' ? 'block' : 'hidden lg:block'}
            >
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-2 px-1">
                <Lightbulb className="w-4 h-4 text-[var(--acc)] stroke-[2.2]" aria-hidden="true" />
                <span>Световая панель</span>
              </h2>
              <div className="panel-surface p-4 sm:p-5 relative">
                {!proUnlocked && (
                  <div className="hidden lg:flex absolute inset-0 z-10 rounded-[inherit] bg-black/65 backdrop-blur-md items-center justify-center p-4">
                    <button
                      type="button"
                      onClick={() => setLockModalOpen(true)}
                      className="siren-btn active px-5 py-3 text-sm flex items-center gap-2"
                    >
                      <Lock className="w-4 h-4" aria-hidden="true" />
                      <span>Требуется код доступа</span>
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleLightSelect('r')}
                    aria-label="Красный и синий маяк"
                    aria-pressed={lightMode === 'r'}
                    className={`siren-btn py-3 px-2 text-xs sm:text-sm ${
                      lightMode === 'r' ? 'active' : ''
                    }`}
                  >
                    Красный / синий
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLightSelect('w')}
                    aria-label="Белый стробоскоп"
                    aria-pressed={lightMode === 'w'}
                    className={`siren-btn py-3 px-2 text-xs sm:text-sm ${
                      lightMode === 'w' ? 'active' : ''
                    }`}
                  >
                    Белый строб
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLightSelect('a')}
                    aria-label="Жёлтый проблесковый маяк"
                    aria-pressed={lightMode === 'a'}
                    className={`siren-btn py-3 px-2 text-xs sm:text-sm ${
                      lightMode === 'a' ? 'active' : ''
                    }`}
                  >
                    Жёлтый
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setLightMode('')}
                  aria-label="Выключить световую панель"
                  className="siren-btn stop-switch w-full mt-2.5 py-2.5 text-sm"
                >
                  Выключить свет
                </button>
              </div>
            </section>

            {/* Acoustic FX Section */}
            <section
              aria-label="Эффекты звука"
              className={activeTab === 'fx' ? 'block' : 'hidden lg:block'}
            >
              <h2 className="text-base font-bold text-white flex items-center gap-2 mb-2 px-1">
                <Sliders className="w-4 h-4 text-[var(--acc)] stroke-[2.2]" aria-hidden="true" />
                <span>Эффекты звука (FX)</span>
              </h2>
              <div className="panel-surface p-4 sm:p-5 space-y-4 relative">
                {!proUnlocked && (
                  <div className="hidden lg:flex absolute inset-0 z-10 rounded-[inherit] bg-black/65 backdrop-blur-md items-center justify-center p-4">
                    <button
                      type="button"
                      onClick={() => setLockModalOpen(true)}
                      className="siren-btn active px-5 py-3 text-sm flex items-center gap-2"
                    >
                      <Lock className="w-4 h-4" aria-hidden="true" />
                      <span>Требуется код доступа</span>
                    </button>
                  </div>
                )}

                <div>
                  <div className="flex justify-between text-xs text-[var(--dim)] mb-1.5">
                    <span>Эхо (улица)</span>
                    <span className="mono-nums text-white font-semibold">
                      {Math.round((echoVal / 0.8) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={Math.round(echoVal * 100)}
                    aria-label="Эхо улица"
                    onChange={(e) => {
                      const val = Number(e.target.value) / 100;
                      setEchoVal(val);
                      engineRef.current?.setEcho(val);
                    }}
                    className="w-full accent-[var(--acc)]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-[var(--dim)] mb-1.5">
                    <span>Туннель (объёмное эхо)</span>
                    <span className="mono-nums text-white font-semibold">
                      {Math.round((tunnelVal / 0.8) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={80}
                    value={Math.round(tunnelVal * 100)}
                    aria-label="Туннель объёмное эхо"
                    onChange={(e) => {
                      const val = Number(e.target.value) / 100;
                      setTunnelVal(val);
                      engineRef.current?.setTunnel(val);
                    }}
                    className="w-full accent-[var(--acc)]"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-[var(--dim)] mb-1.5">
                    <span>Резкость звука (глухой → звонкий)</span>
                    <span className="mono-nums text-white font-semibold">{toneVal} Гц</span>
                  </div>
                  <input
                    type="range"
                    min={800}
                    max={6000}
                    step={50}
                    value={toneVal}
                    aria-label="Резкость звука"
                    onChange={(e) => {
                      const freq = Number(e.target.value);
                      setToneVal(freq);
                      engineRef.current?.setTone(freq);
                    }}
                    className="w-full accent-[var(--acc)]"
                  />
                </div>
              </div>
            </section>

            {/* Quick Settings & Background Music Card on Desktop */}
            <section className="hidden lg:block" aria-label="Работа поверх музыки">
              <div className="panel-surface p-4 sm:p-5 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <Volume2 className="w-4 h-4 text-[var(--ok)]" aria-hidden="true" />
                    <span>
                      {bgMusicMode === 'ambient'
                        ? 'Режим: Поверх музыки'
                        : 'Режим: Только сирена'}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--dim)] mt-1">
                    {bgMusicMode === 'ambient'
                      ? 'Включите Яндекс Музыку, Spotify или YouTube — сирена не ставит трек на паузу.'
                      : 'Сирена глушит фоновую музыку, но играет максимально громко.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="siren-btn px-4 py-2.5 text-xs shrink-0"
                >
                  Настроить
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Mobile Bottom Navigation (4 original tabs) */}
      <nav
        aria-label="Разделы пульта"
        className="bottom-dock lg:hidden fixed left-1/2 -translate-x-1/2 bottom-[calc(10px+env(safe-area-inset-bottom))] w-[min(440px,calc(100%-20px))] flex p-1.5 rounded-[24px] z-20"
      >
        {(
          [
            { id: 'siren', label: 'Сирена', icon: Radio, pro: false },
            { id: 'modes', label: 'Режимы', icon: Waves, pro: true },
            { id: 'light', label: 'Свет', icon: Lightbulb, pro: true },
            { id: 'fx', label: 'FX', icon: Sliders, pro: true },
          ] as const
        ).map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          const locked = item.pro && !proUnlocked;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleTabSelect(item.id, item.pro)}
              aria-label={locked ? `${item.label} (закрыто)` : item.label}
              aria-current={isActive ? 'page' : undefined}
              className={`flex-1 min-h-[46px] flex flex-col items-center justify-center rounded-[18px] transition-colors relative cursor-pointer ${
                isActive ? 'bg-white/12 text-[var(--acc)]' : 'text-[var(--dim)]'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5 stroke-[2.2]" aria-hidden="true" />
                {locked && (
                  <Lock
                    className="w-2.5 h-2.5 text-[var(--acc)] absolute -top-1 -right-2.5 stroke-[2.6]"
                    aria-hidden="true"
                  />
                )}
              </div>
              <span className="text-[11px] font-semibold mt-0.5 whitespace-nowrap">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Settings Modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="settings-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSettingsOpen(false);
          }}
        >
          <div className="panel-surface w-full max-w-md max-h-[88dvh] overflow-y-auto p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 id="settings-title" className="text-lg font-extrabold text-white">
                Настройки пульта
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Закрыть настройки"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/80 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. Theme Switcher (Default: Hazard 7007 Matte Black vs Liquid Glass) */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-white">Оформление пульта</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUiTheme('hardware');
                    storage.set('alpan_theme', 'hardware');
                    triggerHaptic(8);
                  }}
                  className={`siren-btn py-2.5 px-3 text-xs leading-tight ${
                    uiTheme === 'hardware' ? 'active' : ''
                  }`}
                >
                  <span className="block font-bold">Hazard 7007</span>
                  <span className="block text-[10px] font-normal text-white/70 mt-0.5">
                    Чёрный пульт
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUiTheme('glass');
                    storage.set('alpan_theme', 'glass');
                    triggerHaptic(8);
                  }}
                  className={`siren-btn py-2.5 px-3 text-xs leading-tight ${
                    uiTheme === 'glass' ? 'active' : ''
                  }`}
                >
                  <span className="block font-bold">Liquid Glass</span>
                  <span className="block text-[10px] font-normal text-white/70 mt-0.5">
                    Стекло и цвет
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Background music mixing (plain Russian) */}
            <div className="space-y-2.5 border-t border-white/10 pt-4">
              <div>
                <h3 className="text-sm font-bold text-white">Музыка в фоне</h3>
                <p className="text-xs text-[var(--dim)] mt-0.5">
                  Работает с Яндекс Музыкой, Spotify и YouTube Music.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setBgMusicMode('playback');
                    storage.set('alpan_session_v2', 'playback');
                    engineRef.current?.setSessionType('playback');
                    triggerHaptic(8);
                  }}
                  className={`siren-btn py-2.5 px-3 text-xs leading-tight ${
                    bgMusicMode === 'playback' ? 'active' : ''
                  }`}
                >
                  <span className="block font-bold">Только сирена</span>
                  <span className="block text-[10px] font-normal text-white/75 mt-0.5">
                    Громко в Safari (без звука сбоку)
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBgMusicMode('ambient');
                    storage.set('alpan_session_v2', 'ambient');
                    engineRef.current?.setSessionType('ambient');
                    triggerHaptic(8);
                  }}
                  className={`siren-btn py-2.5 px-3 text-xs leading-tight ${
                    bgMusicMode === 'ambient' ? 'active' : ''
                  }`}
                >
                  <span className="block font-bold">Поверх музыки</span>
                  <span className="block text-[10px] font-normal text-white/75 mt-0.5">
                    Снимите беззвучный сбоку iPhone
                  </span>
                </button>
              </div>
              <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-[11px] text-white/75 space-y-1">
                <p>1. Если в Safari на iPhone тишина — в режиме «Поверх музыки» проверьте рычажок звука сбоку на телефоне (или оставьте «Только сирена»).</p>
                <p>2. Не нажимайте PA/PTT во время музыки: микрофон всегда ставит плеер на паузу.</p>
                <p>3. На iPhone добавьте сайт на экран «Домой» — так сирена звучит стабильнее.</p>
              </div>
              <p className="text-[11px] text-[var(--ok)] font-medium">
                Записи Hazard 7007 загружены: {engineSnap.loadedCount} из {engineSnap.totalCount}
              </p>
            </div>

            {/* 3. MAN button behavior */}
            <div className="space-y-3 border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-white">Кнопка MAN</h3>

              <div>
                <span className="block text-xs text-[var(--dim)] mb-1.5">
                  Когда включена сирена (HI-LO, WAIL, YELP):
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setManSiren('hold');
                      storage.set('alpan_man_mode', 'hold');
                      engineRef.current?.setManSiren('hold');
                    }}
                    className={`siren-btn py-2.5 px-3 text-xs ${
                      manSiren === 'hold' ? 'active' : ''
                    }`}
                  >
                    Пока держишь
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManSiren('toggle');
                      storage.set('alpan_man_mode', 'toggle');
                      engineRef.current?.setManSiren('toggle');
                    }}
                    className={`siren-btn py-2.5 px-3 text-xs ${
                      manSiren === 'toggle' ? 'active' : ''
                    }`}
                  >
                    Переключает тон
                  </button>
                </div>
              </div>

              <div>
                <span className="block text-xs text-[var(--dim)] mb-1.5">
                  В режиме ожидания (STANDBY / RADIO):
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setManStyle('siren');
                      storage.set('alpan_man_style', 'siren');
                      engineRef.current?.setManStyle('siren');
                    }}
                    className={`siren-btn py-2.5 px-3 text-xs ${
                      manStyle === 'siren' ? 'active' : ''
                    }`}
                  >
                    Ручная сирена
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setManStyle('wolf');
                      storage.set('alpan_man_style', 'wolf');
                      engineRef.current?.setManStyle('wolf');
                    }}
                    className={`siren-btn py-2.5 px-3 text-xs ${
                      manStyle === 'wolf' ? 'active' : ''
                    }`}
                  >
                    «Волк»
                  </button>
                </div>
              </div>
            </div>

            {/* 4. PTT Mic gain & release */}
            <div className="space-y-2.5 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white text-sm">Микрофон (PA / PTT)</span>
                <span className="mono-nums text-[var(--acc)] font-semibold">+{micDb} дБ</span>
              </div>
              <input
                type="range"
                min={0}
                max={36}
                step={2}
                value={micDb}
                aria-label="Усиление микрофона"
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setMicDb(val);
                  storage.set('alpan_mic_db', String(val));
                  engineRef.current?.setMicDb(val);
                }}
                className="w-full accent-[var(--acc)]"
              />
              {engineSnap.micOn && (
                <button
                  type="button"
                  onClick={() => engineRef.current?.disableMic()}
                  className="siren-btn stop-switch w-full py-2.5 px-3 text-xs flex items-center justify-center gap-2"
                >
                  <MicOff className="w-4 h-4" aria-hidden="true" />
                  <span>Отключить микрофон (вернуть музыку)</span>
                </button>
              )}
            </div>

            {/* 5. RADIO custom track */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-white">Своя музыка в кнопке RADIO</h3>
              <input
                ref={radioInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => void handleRadioFileSelect(e)}
                className="hidden"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => radioInputRef.current?.click()}
                  className="siren-btn flex-1 py-2.5 px-3 text-xs flex items-center justify-center gap-2"
                >
                  <FileAudio className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {engineSnap.radioName ? engineSnap.radioName : 'Выбрать трек с телефона'}
                  </span>
                </button>
                {engineSnap.radioName && (
                  <button
                    type="button"
                    onClick={() => engineRef.current?.clearRadioFile()}
                    aria-label="Убрать трек RADIO"
                    className="siren-btn stop-switch px-3.5 py-2.5"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              {radioError && <p className="text-xs text-rose-300">{radioError}</p>}
            </div>

            {/* 6. Feedback & Screen Wake Lock */}
            <div className="space-y-2.5 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-white">Щелчки кнопок пульта</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !beepEnabled;
                    setBeepEnabled(next);
                    storage.set('alpan_beep', next ? '1' : '0');
                    engineRef.current?.setBeepEnabled(next);
                  }}
                  aria-pressed={beepEnabled}
                  className={`siren-btn px-4 py-1.5 text-xs min-h-[36px] ${
                    beepEnabled ? 'active' : ''
                  }`}
                >
                  {beepEnabled ? 'Вкл' : 'Выкл'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-white">Вибро-отклик</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !hapticEnabled;
                    setHapticEnabled(next);
                    storage.set('alpan_haptic', next ? '1' : '0');
                  }}
                  aria-pressed={hapticEnabled}
                  className={`siren-btn px-4 py-1.5 text-xs min-h-[36px] ${
                    hapticEnabled ? 'active' : ''
                  }`}
                >
                  {hapticEnabled ? 'Вкл' : 'Выкл'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="block text-xs font-semibold text-white">Не выключать экран</span>
                  <span className="block text-[10px] text-[var(--dim)]">
                    {wakeLock.supported
                      ? wakeLock.active
                        ? 'Экран активен'
                        : 'Включается при нажатии'
                      : 'Не поддерживается браузером'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => wakeLock.setEnabled(!wakeLock.enabled)}
                  disabled={!wakeLock.supported}
                  aria-pressed={wakeLock.enabled}
                  className={`siren-btn px-4 py-1.5 text-xs min-h-[36px] ${
                    wakeLock.enabled ? 'active' : ''
                  }`}
                >
                  {wakeLock.enabled ? 'Вкл' : 'Выкл'}
                </button>
              </div>
            </div>

            {/* 7. Export standalone single index.html */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-white">Весь сайт в 1 файле (index.html)</h3>
              <p className="text-[11px] text-[var(--dim)] leading-relaxed">
                В обычном файле <span className="text-white">index.html</span> только 27 строк-запускалка. Настоящий готовый файл целиком (весь пульт, стили, сирены и фразы ДПС внутри одного HTML) скачивается или копируется здесь:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href="alpan-siren-7007-single.html"
                  download="index.html"
                  className="siren-btn active py-2.5 px-3 text-xs flex items-center justify-center gap-1.5 no-underline"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Скачать index.html</span>
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopySingleHtml()}
                  className="siren-btn py-2.5 px-3 text-xs flex items-center justify-center gap-1.5"
                >
                  {singleCopied ? (
                    <>
                      <Check className="w-4 h-4 text-[var(--ok)] shrink-0" aria-hidden="true" />
                      <span>Скопировано</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>Скопировать код</span>
                    </>
                  )}
                </button>
              </div>
              {singleCopyError && <p className="text-xs text-rose-300">{singleCopyError}</p>}
            </div>
          </div>
        </div>
      )}

      {/* Gate Modal: Telegram Bot (Алпан ВПН Бот) */}
      {gateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70 backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-title"
        >
          <div className="panel-surface w-full max-w-sm p-6 text-center">
            <div className="mx-auto mb-3.5 w-14 h-14 rounded-full bg-gradient-to-b from-[#2AABEE] to-[#229ED9] flex items-center justify-center shadow-[0_8px_24px_rgba(42,171,238,0.45)] border border-white/25">
              <svg
                viewBox="0 0 24 24"
                className="w-7 h-7 text-white -translate-x-[1px]"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M21.94 3.46a1.5 1.5 0 0 0-1.56-.25L2.64 10.36a1.25 1.25 0 0 0 .06 2.34l4.52 1.53 1.75 5.45a1 1 0 0 0 1.66.41l2.63-2.58 4.4 3.25a1.5 1.5 0 0 0 2.36-.9L22.3 4.82a1.5 1.5 0 0 0-.36-1.36Zm-4.08 4.15-7.43 6.72-.31 3.12-1.15-3.68 8.89-6.16Z" />
              </svg>
            </div>
            <h2 id="gate-title" className="text-xl font-extrabold text-white mb-2">
              Алпан ВПН Бот
            </h2>
            <p className="text-sm text-white/80 mb-4 leading-relaxed">
              Чтобы открыть пульт сирены, перейди в Telegram-бот{' '}
              <strong className="text-white">«Алпан ВПН Бот»</strong>{' '}
              <span className="text-[#56bfff] font-semibold">(@AlpanVPNrobot)</span> и нажми{' '}
              <strong className="text-white">Start</strong>.
            </p>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleBotClick}
              className="flex items-center justify-center gap-2.5 w-full py-3.5 px-4 rounded-xl font-bold text-white bg-gradient-to-b from-[#2AABEE] to-[#1d8ec9] border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_24px_rgba(42,171,238,0.45)] no-underline"
            >
              <svg
                viewBox="0 0 24 24"
                className="w-5 h-5 shrink-0"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M21.94 3.46a1.5 1.5 0 0 0-1.56-.25L2.64 10.36a1.25 1.25 0 0 0 .06 2.34l4.52 1.53 1.75 5.45a1 1 0 0 0 1.66.41l2.63-2.58 4.4 3.25a1.5 1.5 0 0 0 2.36-.9L22.3 4.82a1.5 1.5 0 0 0-.36-1.36Zm-4.08 4.15-7.43 6.72-.31 3.12-1.15-3.68 8.89-6.16Z" />
              </svg>
              <span>Открыть Алпан ВПН Бот</span>
            </a>
            <button
              type="button"
              disabled={!botClicked || gateCountdown > 0}
              onClick={() => void handleEnterApp()}
              className="siren-btn w-full mt-3 py-3.5 text-sm disabled:opacity-40 disabled:pointer-events-none"
            >
              {!botClicked
                ? 'Я перешёл в бота'
                : gateCountdown > 0
                ? `Подожди ${gateCountdown} сек...`
                : 'Я перешёл в бота'}
            </button>
          </div>
        </div>
      )}

      {/* Pro Unlock Modal (SHA-256 numeric code) */}
      {lockModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70 backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lock-title"
        >
          <div className="panel-surface w-full max-w-sm p-6 text-center">
            <h2 id="lock-title" className="text-xl font-extrabold text-white mb-2">
              Закрытый раздел
            </h2>
            <p className="text-sm text-white/80 mb-4 leading-relaxed">
              Пригласи 3 человек по ссылке бота, скинь скриншот в Telegram{' '}
              <strong className="text-white">@aitral</strong> и получи код.
            </p>

            <button
              type="button"
              onClick={() => void handleCopyBotLink()}
              className="siren-btn w-full py-3 px-4 text-sm flex items-center justify-center gap-2"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-[var(--ok)]" aria-hidden="true" />
                  <span>Ссылка скопирована</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" aria-hidden="true" />
                  <span>Скопировать ссылку для друзей</span>
                </>
              )}
            </button>

            <a
              href={SUPPORT_TG_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="siren-btn block w-full mt-2.5 py-3 px-4 text-sm leading-6 no-underline"
            >
              Написать @aitral
            </a>

            <form onSubmit={(e) => void handleUnlockSubmit(e)} className="mt-3.5">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                value={codeInput}
                onChange={(e) => {
                  setCodeInput(e.target.value.replace(/\D/g, '').slice(0, 4));
                  if (codeError) setCodeError('');
                }}
                placeholder="4-значный код"
                aria-label="Введите 4-значный код доступа"
                autoComplete="off"
                className="mono-nums w-full py-3.5 px-4 rounded-xl border border-white/25 bg-black/45 text-white text-center text-lg tracking-[0.35em] outline-none focus:border-[var(--acc)]"
              />
              {codeError && (
                <p className="text-xs text-rose-400 font-semibold mt-2">{codeError}</p>
              )}
              <button
                type="submit"
                className="w-full mt-3 py-3.5 rounded-xl font-bold text-white bg-gradient-to-b from-[#4d8dff] to-[#2467e8] border border-white/30 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_24px_rgba(47,123,255,0.45)] cursor-pointer"
              >
                Открыть
              </button>
            </form>

            <button
              type="button"
              onClick={() => setLockModalOpen(false)}
              className="mt-2 py-2.5 w-full text-sm text-[var(--dim)] hover:text-white cursor-pointer"
            >
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* Microphone Audio Session Warning Modal */}
      {micWarningOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/70 backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mic-warn-title"
        >
          <div className="panel-surface w-full max-w-sm p-6 text-left">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 id="mic-warn-title" className="text-lg font-extrabold text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-[var(--acc)] shrink-0" aria-hidden="true" />
                <span>Запрос микрофона (PA / PTT)</span>
              </h2>
              <button
                type="button"
                onClick={() => setMicWarningOpen(false)}
                aria-label="Закрыть предупреждение"
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white/80"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-white/80 leading-relaxed mb-4">
              Микрофон может остановить музыку в других приложениях (на iPhone система переключает звук в режим записи). Все остальные режимы сирены работают поверх музыки без микрофона.
            </p>
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => {
                  setMicConfirmed(true);
                  setMicWarningOpen(false);
                  if (micPendingAction === 'pa') {
                    void activatePA();
                  }
                  setMicPendingAction(null);
                }}
                className="siren-btn active w-full py-3 text-sm"
              >
                Включить микрофон
              </button>
              <button
                type="button"
                onClick={() => {
                  setMicWarningOpen(false);
                  setMicPendingAction(null);
                }}
                className="w-full py-2 text-xs text-[var(--dim)] hover:text-white"
              >
                Отмена
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photosensitive Epilepsy Warning Modal for White Strobe */}
      {strobeConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/75 backdrop-blur-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="strobe-warn-title"
        >
          <div className="panel-surface w-full max-w-sm p-6 text-left">
            <h2 id="strobe-warn-title" className="text-lg font-extrabold text-white flex items-center gap-2 mb-2">
              <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0" aria-hidden="true" />
              <span>Предупреждение о стробоскопе</span>
            </h2>
            <p className="text-sm text-white/80 leading-relaxed mb-4">
              Белый строб создаёт высокочастотные вспышки (&gt;10 Гц), которые могут вызвать дискомфорт или приступ у людей с фотосенситивной эпилепсией.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setStrobeConfirmOpen(false)}
                className="siren-btn flex-1 py-3 text-sm"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setStrobeAcknowledged(true);
                  setStrobeConfirmOpen(false);
                  setLightMode('w');
                }}
                className="siren-btn horn-active flex-1 py-3 text-sm"
              >
                Включить
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
