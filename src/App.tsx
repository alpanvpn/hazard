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
import { LiveHzReadout, LiveLedBar } from './components/LevelTelemetry';
import { PWAInstallButton } from './components/PWAInstallButton';
import { BrandWatermark, RegionFlags, SITE_URL } from './components/RegionFlags';
import { RotaryKnob } from './components/RotaryKnob';
import { useWakeLock } from './hooks/useWakeLock';
import { SGU_LIST, SGU_SYSTEMS, SguSystemId } from './types/sgu';

type TabId = 'siren' | 'modes' | 'light' | 'fx';
type LightMode = '' | 'r' | 'w' | 'a';
type UiTheme = 'hardware' | 'glass';
type ManSirenBehavior = 'toggle' | 'hold';
type ManStandbyStyle = 'siren' | 'wolf';

const BOT_URL = 'https://t.me/AlpanVPNrobot?start=alpan';
const SUPPORT_TG_URL = 'https://t.me/aitral';
// SHA-256 hex of the 4-digit unlock code
const UNLOCK_CODE_HASH = 'dd3fac072357758b41aabe831c4abf01de1cd7cc16065c48c7525c0b43f80042';

const MODE_LABELS: Record<SirenMode, string> = {
  standby: 'STANDBY',
  hilo: 'HILO',
  yelp: 'YELP',
  wail: 'WAIL',
  pa: 'PA',
  radio: 'RADIO',
  phaser: 'PHASER',
  piercer: 'PIERCER',
  rumbler: 'ТРИТОН',
  usa: 'МЕГА-МИКС',
  airraid: 'СИГНАЛ',
  fast: 'FAST WAIL',
  grach: 'ГРАЧ',
  elina: 'ЭЛИНА',
  smerch: 'СМЕРЧ',
  bars: 'БАРС',
  patriot: 'ПАТРИОТ',
  mega: 'МЕГА-МИКС',
};

const ALT_MODE_MAP: Partial<Record<SirenMode, SirenMode>> = {
  hilo: 'wail',
  wail: 'yelp',
  yelp: 'phaser',
  grach: 'smerch',
  smerch: 'grach',
  elina: 'phaser',
  phaser: 'elina',
  bars: 'patriot',
  patriot: 'bars',
  rumbler: 'bars',
};

const DPS_PHRASES: { id: PhraseId; label: string; full: string }[] = [
  { id: 'obochina', label: 'К обочине!', full: 'К обочине прижимаемся!' },
  { id: 'vpravo_stop', label: 'Вправо, стоп!', full: 'Вправо прижимаемся, останавливаемся!' },
  { id: 'prizhatsa', label: 'Прижаться!', full: 'Вправо прижаться, остановиться!' },
  { id: 'ostanavlivaemsya', label: 'Остановка!', full: 'Останавливаемся!' },
  { id: 'strelyat', label: 'Стрелять!', full: 'Останавливаемся, стрелять будем!' },
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
  const [gateOpen, setGateOpen] = useState<boolean>(false);
  const [botClicked, setBotClicked] = useState(false);
  const [gateCountdown, setGateCountdown] = useState<number>(0);

  const [proUnlocked, setProUnlocked] = useState<boolean>(() => storage.get('alpan_pro') === '1');
  const [lockModalOpen, setLockModalOpen] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const [sguSystem, setSguSystem] = useState<SguSystemId>(() => {
    const saved = storage.get('alpan_sgu') as SguSystemId | null;
    return saved && SGU_SYSTEMS[saved] ? saved : 'hazard';
  });

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
  const telemetrySubsRef = useRef<Set<(hz: number, level: number) => void>>(new Set());
  const hornPointerRef = useRef<number | null>(null);
  const manPointerRef = useRef<number | null>(null);
  const pttPointerRef = useRef<number | null>(null);
  const hapticLabelRef = useRef<HTMLLabelElement | null>(null);
  const radioInputRef = useRef<HTMLInputElement | null>(null);

  const wakeLock = useWakeLock();
  const sguSpec = SGU_SYSTEMS[sguSystem];

  const subscribeTelemetry = useCallback((fn: (hz: number, level: number) => void) => {
    telemetrySubsRef.current.add(fn);
    return () => {
      telemetrySubsRef.current.delete(fn);
    };
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', uiTheme);
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', uiTheme === 'hardware' ? '#07080b' : '#070a12');
    }
  }, [uiTheme]);

  const triggerHaptic = useCallback(
    (pattern: number | number[] = 12) => {
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

  useEffect(() => {
    const engine = new SirenAudioEngine(
      (snap) => setEngineSnap(snap),
      (hz, level) => {
        telemetrySubsRef.current.forEach((cb) => cb(hz, level));
      }
    );
    engine.setSessionType(bgMusicMode);
    engine.setSguSystem(sguSystem);
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

  // Show Telegram bot gate after 3.5s so user sees the real console first
  useEffect(() => {
    if (storage.get('alpan_ok') === '1') return;
    const timer = window.setTimeout(() => {
      setGateOpen(true);
    }, 3500);
    return () => window.clearTimeout(timer);
  }, []);

  const isSirenSounding = useMemo(
    () =>
      engineSnap.powered &&
      (hornPressed ||
        engineSnap.hornActive ||
        manPressed ||
        engineSnap.wolfActive ||
        (engineSnap.mode !== 'standby' &&
          engineSnap.mode !== 'pa' &&
          engineSnap.mode !== 'radio')),
    [engineSnap.powered, engineSnap.mode, engineSnap.hornActive, engineSnap.wolfActive, hornPressed, manPressed]
  );

  useEffect(() => {
    document.body.classList.toggle('siren-active', isSirenSounding);
  }, [isSirenSounding]);

  useEffect(() => {
    if (!botClicked || gateCountdown <= 0) return;
    const t = window.setTimeout(() => setGateCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [botClicked, gateCountdown]);

  // Global safeguard so held buttons NEVER stick even after missed pointerup/touchcancel
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
    window.addEventListener('pointerup', releaseAllHeld);
    window.addEventListener('pointercancel', releaseAllHeld);
    window.addEventListener('blur', releaseAllHeld);
    return () => {
      window.removeEventListener('pointerup', releaseAllHeld);
      window.removeEventListener('pointercancel', releaseAllHeld);
      window.removeEventListener('blur', releaseAllHeld);
    };
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
    triggerHaptic(14);
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

  const handleSelectSguSystem = (id: SguSystemId) => {
    if (!proUnlocked && id !== 'hazard') {
      setLockModalOpen(true);
      return;
    }
    triggerHaptic(14);
    setSguSystem(id);
    storage.set('alpan_sgu', id);
    engineRef.current?.setSguSystem(id);
    if (engineSnap.powered && engineSnap.mode !== 'standby') {
      // Reset back cleanly to standby of the new unit
      void engineRef.current?.setMode('standby');
    } else {
      engineRef.current?.playClick(true);
    }
  };

  const handleTogglePower = () => {
    const next = !engineSnap.powered;
    triggerHaptic(16);
    void engineRef.current?.setPower(next);
    if (next) {
      void wakeLock.requestLock();
    }
  };

  const activatePA = useCallback(async () => {
    setMicStatusMsg('');
    void engineRef.current?.setMode('pa');
    const ok = await engineRef.current?.startMic();
    if (!ok) {
      setMicStatusMsg('Доступ к микрофону запрещён в браузере.');
    }
  }, []);

  const handleSelectMode = (mode: SirenMode) => {
    triggerHaptic(10);
    if (mode === 'pa') {
      if (engineSnap.mode === 'pa' && engineSnap.powered) {
        engineRef.current?.stopMic();
        void engineRef.current?.setMode('standby');
        return;
      }
      if (!micConfirmed) {
        setMicPendingAction('pa');
        setMicWarningOpen(true);
        return;
      }
      void activatePA();
      return;
    }
    if (engineSnap.mode === 'pa') {
      engineRef.current?.stopMic();
    }
    void engineRef.current?.setMode(mode);
  };

  const handleVolumeChange = (v: number) => {
    setVolume(v);
    engineRef.current?.setVolume(v);
    if (v <= 0.02 && engineSnap.powered) {
      void engineRef.current?.setPower(false);
    } else if (v > 0.05 && !engineSnap.powered) {
      void engineRef.current?.setPower(true);
    }
  };

  // Circular horseshoe order from bottom-left (-125°) around top to bottom-right (+125°):
  // 0: STANDBY (-125°), 1: HILO (-75°), 2: YELP (-25°), 3: WAIL (+25°), 4: PA (+75°), 5: RADIO (+125°)
  const knobOrder = useMemo(() => sguSpec.modes.map((m) => m.mode), [sguSpec]);

  const knobModeIndex = knobOrder.indexOf(engineSnap.mode);
  const knobModeValue =
    knobModeIndex >= 0 ? knobModeIndex / (knobOrder.length - 1) : 0;

  const handleModeKnobChange = (v: number) => {
    const idx = Math.min(knobOrder.length - 1, Math.max(0, Math.round(v * (knobOrder.length - 1))));
    const chosen = knobOrder[idx];
    if (chosen !== engineSnap.mode || !engineSnap.powered) {
      handleSelectMode(chosen);
    }
  };

  const onManDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    manPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore on unsupported touch browsers
    }
    setManPressed(true);
    triggerHaptic(12);
    void engineRef.current?.pressMan();
  };

  const onManUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (manPointerRef.current !== e.pointerId && manPointerRef.current !== null) return;
    manPointerRef.current = null;
    setManPressed(false);
    engineRef.current?.releaseMan();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  };

  const onHornDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    hornPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    setHornPressed(true);
    triggerHaptic(15);
    void engineRef.current?.pressHorn();
  };

  const onHornUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (hornPointerRef.current !== e.pointerId && hornPointerRef.current !== null) return;
    hornPointerRef.current = null;
    setHornPressed(false);
    engineRef.current?.releaseHorn();
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }
  };

  const onPttDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!micConfirmed) {
      setMicPendingAction('ptt');
      setMicWarningOpen(true);
      return;
    }
    pttPointerRef.current = e.pointerId;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
    setPttPressed(true);
    triggerHaptic(12);
    const ok = await engineRef.current?.startMic();
    if (!ok) {
      setMicStatusMsg('Нет доступа к микрофону.');
    }
  };

  const onPttUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (pttPointerRef.current !== e.pointerId && pttPointerRef.current !== null) return;
    pttPointerRef.current = null;
    setPttPressed(false);
    if (engineRef.current?.getSnapshot().mode !== 'pa') {
      engineRef.current?.stopMic();
    }
  };

  const handleStopAll = () => {
    hornPointerRef.current = null;
    manPointerRef.current = null;
    pttPointerRef.current = null;
    setHornPressed(false);
    setManPressed(false);
    setPttPressed(false);
    triggerHaptic([18, 28, 18]);
    void engineRef.current?.stopAll();
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
      setRadioError('Не удалось открыть аудиофайл.');
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
      setSingleCopyError('Используйте кнопку скачивания файла.');
    }
  };

  const activePhraseMeta = useMemo(
    () => DPS_PHRASES.find((p) => p.id === engineSnap.activePhrase) ?? null,
    [engineSnap.activePhrase]
  );

  const altTargetMode = ALT_MODE_MAP[engineSnap.mode];
  const displayStatus = useMemo(() => {
    if (!engineSnap.powered) {
      return { title: 'ВЫКЛЮЧЕНО', subtitle: sguSpec.shortName };
    }
    if (hornPressed || engineSnap.hornActive) {
      return { title: sguSpec.hornLabel, subtitle: sguSpec.shortName };
    }
    if (engineSnap.wolfActive) {
      return { title: 'ВОЛК', subtitle: sguSpec.shortName };
    }
    if (pttPressed || engineSnap.mode === 'pa') {
      return { title: 'ЭФИР (PA)', subtitle: 'ГРОМКАЯ СВЯЗЬ' };
    }
    if (engineSnap.altActive && altTargetMode) {
      return { title: MODE_LABELS[altTargetMode], subtitle: `${sguSpec.manLabel} · СМЕНА` };
    }
    if (manPressed && (engineSnap.mode === 'standby' || engineSnap.mode === 'radio')) {
      return { title: 'РУЧНАЯ', subtitle: sguSpec.shortName };
    }
    if (activePhraseMeta && engineSnap.mode === 'standby') {
      return { title: 'ГОЛОС СГУ', subtitle: activePhraseMeta.label.toUpperCase() };
    }
    if (engineSnap.mode === 'radio') {
      return { title: 'RADIO', subtitle: engineSnap.radioName || sguSpec.shortName };
    }
    const foundLabel =
      sguSpec.modes.find((x) => x.mode === engineSnap.mode)?.label || MODE_LABELS[engineSnap.mode];
    return {
      title: foundLabel,
      subtitle: engineSnap.mode === 'standby' ? `${sguSpec.shortName} · ГОТОВ` : `${sguSpec.shortName} · АКТИВНО`,
    };
  }, [engineSnap, hornPressed, manPressed, pttPressed, altTargetMode, activePhraseMeta, sguSpec]);

  const manIsLit = manPressed || (engineSnap.powered && (engineSnap.altActive || engineSnap.wolfActive));
  const hornIsLit = hornPressed || engineSnap.hornActive;

  // Circular positions matching -125°, -75°, -25°, +25°, +75°, +125° around knob center (112, 98)
  const ARC_ANGLES = [-125, -75, -25, 25, 75, 125] as const;

  return (
    <>
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

      <div className="bg-mesh" aria-hidden="true" />
      <div className={`flash-overlay ${lightMode}`} aria-hidden="true" />

      {/* Main Compact Application Shell (fits comfortably on phone without unnecessary scrolling) */}
      <div
        id="app-shell"
        data-sgu={sguSystem}
        className="relative z-10 min-h-dvh mx-auto w-full max-w-4xl px-3 sm:px-5 pt-[calc(env(safe-area-inset-top)+8px)] pb-[calc(78px+env(safe-area-inset-bottom))] lg:pb-8"
      >
        {/* Top Bar */}
        <header className="flex items-center justify-between gap-2 mb-2">
          <h1 className="text-lg sm:text-xl font-extrabold tracking-tight text-white whitespace-nowrap shrink-0">
            {sguSpec.brandBottom} <span style={{ color: sguSpec.accentColor }}>{sguSpec.modelCode}</span>
          </h1>

          <div className="flex-1 flex justify-center min-w-0 px-1">
            <RegionFlags compact />
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <PWAInstallButton />

            <button
              type="button"
              onClick={handleTogglePower}
              aria-label={engineSnap.powered ? 'Выключить питание' : 'Включить питание'}
              aria-pressed={engineSnap.powered}
              className={`w-10 h-10 rounded-xl border flex items-center justify-center cursor-pointer active:scale-90 transition-transform ${
                engineSnap.powered
                  ? 'border-[var(--acc)] bg-[#231d0d] text-[var(--acc)]'
                  : 'border-[#2b303a] bg-[#12141a] text-white/65'
              }`}
            >
              <Power className="w-4.5 h-4.5 stroke-[2.3]" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic(8);
                setSettingsOpen(true);
              }}
              aria-label="Настройки пульта"
              className="w-10 h-10 rounded-xl border border-[#2b303a] bg-[#12141a] text-white/85 flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
            >
              <SlidersHorizontal className="w-4.5 h-4.5 stroke-[2.2]" aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* Responsive Grid: 1 column on mobile, 2 columns on desktop */}
        <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-3 items-start">
          {/* Primary Real SGU Console Unit */}
          <section
            aria-label="Пульт сирены"
            className={activeTab === 'siren' ? 'block' : 'hidden lg:block'}
          >
            {/* Compact Status + Isolated Live LED Meter Bar */}
            <div className="panel-surface px-3.5 py-2 mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p
                  className={`text-[11px] font-bold tracking-wider truncate ${
                    engineSnap.powered ? 'text-[var(--ok)]' : 'text-[var(--dim)]'
                  }`}
                >
                  {activePhraseMeta ? `СГУ: ${activePhraseMeta.label}` : displayStatus.subtitle}
                </p>
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-xl sm:text-2xl font-extrabold tracking-wide truncate"
                    style={{ color: sguSpec.accentColor }}
                  >
                    {displayStatus.title}
                  </span>
                  <LiveHzReadout powered={engineSnap.powered} subscribe={subscribeTelemetry} />
                </div>
              </div>

              <div className="text-right shrink-0">
                <LiveLedBar
                  powered={engineSnap.powered}
                  volume={volume}
                  subscribe={subscribeTelemetry}
                />
                <span className="mono-nums text-xs font-bold text-white/85 block mt-0.5">
                  {engineSnap.powered ? `${Math.round(volume * 100)}%` : 'OFF'}
                </span>
              </div>
            </div>

            {/* Authentic Compact Premier Hazard 7007 (or Selected SGU) Molded ABS Box */}
            <div className="sgu-chassis-wrap px-0 sm:px-2">
              <div className="mounting-ear mounting-ear-left" aria-hidden="true" />
              <div className="mounting-ear mounting-ear-right" aria-hidden="true" />

              <div className="sgu-chassis">
                <div className="sgu-faceplate">
                  {/* TOP SECTION: OFF/VOL Knob (Left) + True Circular 6-Mode Selector Dial (Right) */}
                  <div className="grid grid-cols-[29%_71%] gap-1 items-center pb-1.5">
                    {/* Left: Smaller Fluted OFF/VOL Knob */}
                    <div className="flex flex-col items-center justify-center">
                      <RotaryKnob
                        size="sm"
                        value={engineSnap.powered ? volume : 0}
                        onChange={handleVolumeChange}
                        ariaLabel="Громкость и включение OFF/VOL"
                        displayText={engineSnap.powered ? `${Math.round(volume * 100)}%` : 'OFF'}
                      />
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full transition-colors shrink-0"
                          style={{
                            backgroundColor: engineSnap.powered ? sguSpec.accentColor : '#4b5563',
                            boxShadow: engineSnap.powered ? `0 0 8px ${sguSpec.accentColor}` : 'none',
                          }}
                          aria-hidden="true"
                        />
                        <span
                          className="text-[11px] sm:text-xs font-extrabold tracking-wide"
                          style={{ color: sguSpec.accentColor }}
                        >
                          OFF/VOL
                        </span>
                      </div>
                      <span className="mono-nums text-[11px] font-bold text-white/80 mt-0.5">
                        {engineSnap.powered ? `${Math.round(volume * 100)}%` : 'ВЫКЛ'}
                      </span>
                    </div>

                    {/* Right: Circular Selector Dial with 6 Radial Buttons & Glowing Dots */}
                    <div className="relative w-full max-w-[244px] h-[156px] mx-auto">
                      {/* Circular Track Ring & 6 Radial Indicator Dots */}
                      <svg
                        viewBox="0 0 238 156"
                        className="pointer-events-none absolute inset-0 w-full h-full"
                        aria-hidden="true"
                      >
                        <path
                          d="M 86.2 121.0 A 40 40 0 1 1 151.8 121.0"
                          fill="none"
                          stroke="rgba(255,255,255,0.18)"
                          strokeWidth="1.5"
                          strokeDasharray="3 3"
                        />
                        {sguSpec.modes.map((item, idx) => {
                          const rad = ((ARC_ANGLES[idx] - 90) * Math.PI) / 180;
                          const dx = 119 + 40 * Math.cos(rad);
                          const dy = 98 + 40 * Math.sin(rad);
                          const active = engineSnap.powered && engineSnap.mode === item.mode;
                          return (
                            <circle
                              key={item.mode}
                              cx={dx}
                              cy={dy}
                              r={active ? 4.4 : 3}
                              fill={active ? '#ffffff' : sguSpec.accentColor}
                              opacity={active ? 1 : 0.65}
                            />
                          );
                        })}
                      </svg>

                      {/* Centered Circular Selector Knob */}
                      <div className="absolute left-1/2 top-[98px] -translate-x-1/2 -translate-y-1/2 z-[2]">
                        <RotaryKnob
                          size="lg"
                          value={knobModeValue}
                          steps={knobOrder.length - 1}
                          onTapStep={() => {
                            const nextIdx = (Math.max(0, knobModeIndex) + 1) % knobOrder.length;
                            handleSelectMode(knobOrder[nextIdx]);
                          }}
                          onChange={handleModeKnobChange}
                          ariaLabel="Круговой переключатель режимов СГУ"
                          displayText={MODE_LABELS[engineSnap.mode]}
                        />
                      </div>

                      {/* 6 Crisp Tactile Mode Keys Arranged Circularly Around the Knob */}
                      {sguSpec.modes.map((item, idx) => {
                        const active = engineSnap.powered && engineSnap.mode === item.mode;
                        const posStyles: React.CSSProperties[] = [
                          { right: 'calc(50% + 41px)', top: '115px' }, // 0: STANDBY (-125°)
                          { right: 'calc(50% + 45px)', top: '72px' },  // 1: HILO (-75°)
                          { right: '52%', top: '14px' },               // 2: YELP (-25°)
                          { left: '52%', top: '14px' },                // 3: WAIL (+25°)
                          { left: 'calc(50% + 45px)', top: '72px' },   // 4: PA (+75°)
                          { left: 'calc(50% + 41px)', top: '115px' },  // 5: RADIO (+125°)
                        ];
                        return (
                          <button
                            key={item.mode}
                            type="button"
                            onClick={() => handleSelectMode(item.mode)}
                            aria-pressed={active}
                            style={posStyles[idx]}
                            className={`arc-mode-btn z-[3] ${active ? 'active' : ''}`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* MIDDLE STRIP: [PREMIER/HAZARD] · Flags + Bigger Anti-Theft Link · [7007] */}
                  <div className="flex items-center justify-between gap-2 py-2 border-y border-white/15">
                    <div className="hazard-badge shrink-0">
                      <span
                        className="text-[8.5px] font-extrabold tracking-[0.18em]"
                        style={{ color: sguSpec.accentColor }}
                      >
                        {sguSpec.brandTop}
                      </span>
                      <span
                        className="text-xs font-extrabold tracking-[0.12em]"
                        style={{ color: sguSpec.accentColor }}
                      >
                        {sguSpec.brandBottom}
                      </span>
                    </div>

                    <div className="flex flex-col items-center justify-center min-w-0 px-1">
                      <RegionFlags compact />
                      <a
                        href={SITE_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mono-nums text-[10.5px] sm:text-xs font-extrabold leading-tight tracking-tight hover:underline no-underline truncate max-w-full mt-1"
                        style={{ color: sguSpec.accentColor }}
                      >
                        {SITE_URL}
                      </a>
                    </div>

                    <span
                      className="text-xl sm:text-2xl font-extrabold italic tracking-wide shrink-0"
                      style={{ color: sguSpec.accentColor }}
                    >
                      {sguSpec.modelCode}
                    </span>
                  </div>

                  {/* BOTTOM SECTION: Left RJ45 Mic Port (PTT) + Right Stepped Yellow Box with White MAN & HORN Keys */}
                  <div className="grid grid-cols-[34%_66%] gap-2 items-end pt-2">
                    {/* Left: Recessed RJ45 Mic Port -> Tap/Hold for PTT */}
                    <div className="flex flex-col items-center justify-end">
                      <button
                        type="button"
                        onPointerDown={(e) => void onPttDown(e)}
                        onPointerUp={onPttUp}
                        onPointerCancel={onPttUp}
                        onLostPointerCapture={onPttUp}
                        aria-label={`${sguSpec.pttLabel}: удерживайте для громкой связи`}
                        aria-pressed={pttPressed}
                        className={`mic-socket no-select ${pttPressed ? 'pressed' : ''}`}
                      >
                        <div className="mic-socket-pins" aria-hidden="true">
                          <span /><span /><span /><span /><span /><span />
                        </div>
                        <span
                          className={`text-[10px] font-extrabold tracking-wider ${
                            pttPressed ? 'text-rose-400' : 'text-white/80'
                          }`}
                        >
                          {sguSpec.pttLabel} · МИКР
                        </span>
                      </button>
                    </div>

                    {/* Right: Signature Stepped Outline + Two Chunky White Silicone Keys */}
                    <div
                      className="rounded-md p-1.5 pt-1"
                      style={{ border: `2px solid ${sguSpec.accentColor}` }}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col items-center">
                          <span
                            className="text-xs sm:text-[13px] font-extrabold tracking-wider mb-1"
                            style={{ color: sguSpec.accentColor }}
                          >
                            {sguSpec.manLabel}
                          </span>
                          <button
                            type="button"
                            onPointerDown={onManDown}
                            onPointerUp={onManUp}
                            onPointerCancel={onManUp}
                            onLostPointerCapture={onManUp}
                            aria-label={`${sguSpec.manLabel}: ручная сирена / смена`}
                            aria-pressed={manIsLit}
                            className={`hw-white-key no-select ${manIsLit ? 'man-lit' : ''} ${
                              manPressed ? 'pressed' : ''
                            }`}
                          >
                            <span className="text-[11px] font-extrabold tracking-wider opacity-75">
                              {sguSpec.manLabel}
                            </span>
                          </button>
                        </div>

                        <div className="flex flex-col items-center">
                          <span
                            className="text-xs sm:text-[13px] font-extrabold tracking-wider mb-1"
                            style={{ color: sguSpec.accentColor }}
                          >
                            {sguSpec.hornLabel}
                          </span>
                          <button
                            type="button"
                            onPointerDown={onHornDown}
                            onPointerUp={onHornUp}
                            onPointerCancel={onHornUp}
                            onLostPointerCapture={onHornUp}
                            aria-label={`${sguSpec.hornLabel}: воздушный сигнал`}
                            aria-pressed={hornIsLit}
                            className={`hw-white-key no-select ${hornIsLit ? 'horn-lit' : ''} ${
                              hornPressed ? 'pressed' : ''
                            }`}
                          >
                            <span className="text-[11px] font-extrabold tracking-wider opacity-75">
                              {sguSpec.hornLabel}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {micStatusMsg && (
              <p className="mt-1.5 text-xs text-amber-300 font-semibold px-1">{micStatusMsg}</p>
            )}

            {/* Uniform Balanced 3x2 Grid: 5 Officer Megaphone Phrases + СТОП ВСЁ */}
            <div className="panel-surface mt-2.5 p-3 space-y-2">
              <div className="flex items-center justify-between px-0.5">
                <span className="text-xs font-extrabold tracking-wide text-[var(--acc)] flex items-center gap-1.5">
                  <Megaphone className="w-4 h-4" aria-hidden="true" />
                  <span>Голос ДПС (поверх сирены)</span>
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {DPS_PHRASES.map((phrase) => {
                  const active = engineSnap.activePhrase === phrase.id;
                  return (
                    <button
                      key={phrase.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic(10);
                        void engineRef.current?.playPhrase(phrase.id);
                      }}
                      aria-label={phrase.full}
                      aria-pressed={active}
                      className={`siren-btn min-h-[44px] px-2.5 py-2 text-xs sm:text-[13px] whitespace-nowrap truncate ${
                        active ? 'horn-active' : ''
                      }`}
                    >
                      {phrase.label}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={handleStopAll}
                  className="siren-btn stop-switch min-h-[44px] px-2.5 py-2 text-xs sm:text-[13px] font-extrabold tracking-wider"
                >
                  СТОП ВСЁ
                </button>
              </div>
            </div>
          </section>

          {/* Right Column on Desktop / Tab Content on Mobile */}
          <div className="space-y-3">
            {/* СГУ System Selector Section (Default: Premier Hazard 7007 -> Switchable to ГРАЧ, ЭЛИНА, БАРС!) */}
            <section
              aria-label="Выбор системы СГУ"
              className={activeTab === 'modes' ? 'block' : 'hidden lg:block'}
            >
              <div className="flex items-center justify-between mb-1.5 px-1">
                <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                  <Waves className="w-4 h-4 text-[var(--acc)] stroke-[2.2]" aria-hidden="true" />
                  <span>Система СГУ (блок)</span>
                </h2>
                {!proUnlocked && (
                  <button
                    type="button"
                    onClick={() => setLockModalOpen(true)}
                    className="text-xs font-bold text-[var(--acc)] flex items-center gap-1 cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Открыть по коду</span>
                  </button>
                )}
              </div>

              <div className="panel-surface p-3 sm:p-4 relative space-y-2">
                {!proUnlocked && (
                  <div className="hidden lg:flex absolute inset-0 z-10 rounded-[inherit] bg-black/65 items-center justify-center p-4 text-center">
                    <button
                      type="button"
                      onClick={() => setLockModalOpen(true)}
                      className="siren-btn active px-5 py-3 text-sm flex items-center gap-2"
                    >
                      <Lock className="w-4 h-4" aria-hidden="true" />
                      <span>Разблокировать СГУ, Свет и FX</span>
                    </button>
                  </div>
                )}

                <p className="text-xs text-[var(--dim)] leading-snug">
                  Выбранная система меняет сам пульт, кнопки и звучание во вкладке «Сирена». Сейчас активен:{' '}
                  <strong className="text-white">{sguSpec.name}</strong>.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SGU_LIST.map((sys) => {
                    const selected = sguSystem === sys.id;
                    return (
                      <button
                        key={sys.id}
                        type="button"
                        onClick={() => handleSelectSguSystem(sys.id)}
                        aria-pressed={selected}
                        className={`siren-btn text-left p-3 flex flex-col justify-between gap-1 ${
                          selected ? 'active' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 w-full">
                          <span className="text-sm font-extrabold text-white">{sys.name}</span>
                          {selected && (
                            <span
                              className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-black/50"
                              style={{ color: sys.accentColor }}
                            >
                              ВЫБРАНО
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-[var(--dim)] leading-snug">
                          {sys.tagline}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {activeTab === 'modes' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('siren')}
                    className="siren-btn active lg:hidden w-full py-2.5 text-sm mt-1"
                  >
                    Открыть пульт {sguSpec.shortName}
                  </button>
                )}
              </div>
            </section>

            {/* Lightbar Section */}
            <section
              aria-label="Световая панель"
              className={activeTab === 'light' ? 'block' : 'hidden lg:block'}
            >
              <h2 className="text-base font-extrabold text-white flex items-center gap-2 mb-1.5 px-1">
                <Lightbulb className="w-4 h-4 text-[var(--acc)] stroke-[2.2]" aria-hidden="true" />
                <span>Световая панель</span>
              </h2>
              <div className="panel-surface p-3.5 sm:p-4 relative">
                {!proUnlocked && (
                  <div className="hidden lg:flex absolute inset-0 z-10 rounded-[inherit] bg-black/65 items-center justify-center p-4">
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
                    aria-pressed={lightMode === 'r'}
                    className={`siren-btn py-2.5 px-2 text-xs sm:text-sm ${
                      lightMode === 'r' ? 'active' : ''
                    }`}
                  >
                    Красн / син
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLightSelect('w')}
                    aria-pressed={lightMode === 'w'}
                    className={`siren-btn py-2.5 px-2 text-xs sm:text-sm ${
                      lightMode === 'w' ? 'active' : ''
                    }`}
                  >
                    Белый строб
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLightSelect('a')}
                    aria-pressed={lightMode === 'a'}
                    className={`siren-btn py-2.5 px-2 text-xs sm:text-sm ${
                      lightMode === 'a' ? 'active' : ''
                    }`}
                  >
                    Жёлтый
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setLightMode('')}
                  className="siren-btn stop-switch w-full mt-2 py-2.5 text-sm"
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
              <h2 className="text-base font-extrabold text-white flex items-center gap-2 mb-1.5 px-1">
                <Sliders className="w-4 h-4 text-[var(--acc)] stroke-[2.2]" aria-hidden="true" />
                <span>Эффекты звука (FX)</span>
              </h2>
              <div className="panel-surface p-3.5 sm:p-4 space-y-3 relative">
                {!proUnlocked && (
                  <div className="hidden lg:flex absolute inset-0 z-10 rounded-[inherit] bg-black/65 items-center justify-center p-4">
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
                  <div className="flex justify-between text-xs text-[var(--dim)] mb-1">
                    <span>Эхо (улица)</span>
                    <span className="mono-nums text-white font-bold">
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
                  <div className="flex justify-between text-xs text-[var(--dim)] mb-1">
                    <span>Туннель (объёмное эхо)</span>
                    <span className="mono-nums text-white font-bold">
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
                  <div className="flex justify-between text-xs text-[var(--dim)] mb-1">
                    <span>Резкость звука (глухой → звонкий)</span>
                    <span className="mono-nums text-white font-bold">{toneVal} Гц</span>
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
          </div>
        </div>

        {/* Global Persistent Footer */}
        <footer className="mt-3 pt-2 border-t border-white/10 flex justify-center">
          <BrandWatermark compact />
        </footer>
      </div>

      {/* Compact Mobile Bottom Navigation */}
      <nav
        aria-label="Разделы пульта"
        className="bottom-dock lg:hidden fixed left-1/2 -translate-x-1/2 bottom-[calc(6px+env(safe-area-inset-bottom))] w-[min(420px,calc(100%-16px))] flex p-1 rounded-[18px] z-20"
      >
        {(
          [
            { id: 'siren', label: 'Сирена', icon: Radio, pro: false },
            { id: 'modes', label: 'СГУ', icon: Waves, pro: true },
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
              className={`flex-1 min-h-[44px] flex flex-col items-center justify-center rounded-[14px] transition-colors relative cursor-pointer ${
                isActive ? 'bg-white/15 text-[var(--acc)]' : 'text-[var(--dim)]'
              }`}
            >
              <div className="relative">
                <Icon className="w-4.5 h-4.5 stroke-[2.2]" aria-hidden="true" />
                {locked && (
                  <Lock
                    className="w-2.5 h-2.5 text-[var(--acc)] absolute -top-1 -right-2.5 stroke-[2.6]"
                    aria-hidden="true"
                  />
                )}
              </div>
              <span className="text-[11px] font-bold mt-0.5 whitespace-nowrap">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Settings Modal */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
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

            {/* 1. Theme Switcher */}
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-white">Оформление</h3>
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
                  <span className="block font-bold">Реальный пульт</span>
                  <span className="block text-[11px] font-normal text-white/70 mt-0.5">
                    Чёрный корпус ABS
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
                  <span className="block text-[11px] font-normal text-white/70 mt-0.5">
                    Стекло и цвет
                  </span>
                </button>
              </div>
            </div>

            {/* 2. Background music mixing */}
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
                  <span className="block text-[11px] font-normal text-white/75 mt-0.5">
                    Громко в Safari
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
                  <span className="block text-[11px] font-normal text-white/75 mt-0.5">
                    Снимите беззвучный
                  </span>
                </button>
              </div>
              <p className="text-xs text-[var(--ok)] font-medium">
                Записи загружены: {engineSnap.loadedCount} из {engineSnap.totalCount}
              </p>
            </div>

            {/* 3. MAN button behavior */}
            <div className="space-y-3 border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-white">Кнопка MAN / СМЕНА</h3>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManSiren('hold');
                    storage.set('alpan_man_mode', 'hold');
                    engineRef.current?.setManSiren('hold');
                  }}
                  className={`siren-btn py-2.5 px-3 text-xs ${manSiren === 'hold' ? 'active' : ''}`}
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
                  className={`siren-btn py-2.5 px-3 text-xs ${manSiren === 'toggle' ? 'active' : ''}`}
                >
                  Переключает тон
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManStyle('siren');
                    storage.set('alpan_man_style', 'siren');
                    engineRef.current?.setManStyle('siren');
                  }}
                  className={`siren-btn py-2.5 px-3 text-xs ${manStyle === 'siren' ? 'active' : ''}`}
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
                  className={`siren-btn py-2.5 px-3 text-xs ${manStyle === 'wolf' ? 'active' : ''}`}
                >
                  «Волк»
                </button>
              </div>
            </div>

            {/* 4. PTT Mic gain */}
            <div className="space-y-2.5 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-white text-sm">Микрофон (PA / PTT)</span>
                <span className="mono-nums text-[var(--acc)] font-bold">+{micDb} дБ</span>
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
                  <span>Отключить микрофон</span>
                </button>
              )}
            </div>

            {/* 5. RADIO custom track */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-white">Своя музыка в RADIO</h3>
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
                    {engineSnap.radioName ? engineSnap.radioName : 'Выбрать трек'}
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

            {/* 6. Feedback & Wake Lock */}
            <div className="space-y-2.5 border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-white">Щелчки кнопок</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = !beepEnabled;
                    setBeepEnabled(next);
                    storage.set('alpan_beep', next ? '1' : '0');
                    engineRef.current?.setBeepEnabled(next);
                  }}
                  aria-pressed={beepEnabled}
                  className={`siren-btn px-4 py-1.5 text-xs min-h-[36px] ${beepEnabled ? 'active' : ''}`}
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
                  className={`siren-btn px-4 py-1.5 text-xs min-h-[36px] ${hapticEnabled ? 'active' : ''}`}
                >
                  {hapticEnabled ? 'Вкл' : 'Выкл'}
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="block text-xs font-semibold text-white">Не выключать экран</span>
                  <span className="block text-[11px] text-[var(--dim)]">
                    {wakeLock.supported
                      ? wakeLock.active
                        ? 'Экран активен'
                        : 'Включается при нажатии'
                      : 'Не поддерживается'}
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

            {/* 7. Single-File Export */}
            <div className="space-y-2 border-t border-white/10 pt-4">
              <h3 className="text-sm font-bold text-white">Весь сайт в 1 файле (index.html)</h3>
              <div className="grid grid-cols-2 gap-2">
                <a
                  href="alpan-siren-7007-single.html"
                  download="index.html"
                  className="siren-btn active py-2.5 px-3 text-xs flex items-center justify-center gap-1.5 no-underline"
                >
                  <Download className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Скачать</span>
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
                      <span>Копировать код</span>
                    </>
                  )}
                </button>
              </div>
              {singleCopyError && <p className="text-xs text-rose-300">{singleCopyError}</p>}
            </div>

            <BrandWatermark compact className="pt-2 border-t border-white/10" />
          </div>
        </div>
      )}

      {/* Gate Modal: Telegram Bot (opens after 3.5s with soft light blur so unit remains visible) */}
      {gateOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="gate-title"
        >
          <div className="panel-surface w-full max-w-xs p-5 text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-gradient-to-b from-[#2AABEE] to-[#229ED9] flex items-center justify-center shadow-[0_8px_20px_rgba(42,171,238,0.4)] border border-white/25">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-white -translate-x-[1px]" fill="currentColor" aria-hidden="true">
                <path d="M21.94 3.46a1.5 1.5 0 0 0-1.56-.25L2.64 10.36a1.25 1.25 0 0 0 .06 2.34l4.52 1.53 1.75 5.45a1 1 0 0 0 1.66.41l2.63-2.58 4.4 3.25a1.5 1.5 0 0 0 2.36-.9L22.3 4.82a1.5 1.5 0 0 0-.36-1.36Zm-4.08 4.15-7.43 6.72-.31 3.12-1.15-3.68 8.89-6.16Z" />
              </svg>
            </div>
            <h2 id="gate-title" className="text-lg font-extrabold text-white mb-1.5">
              Алпан ВПН Бот
            </h2>
            <p className="text-xs text-white/85 mb-3.5 leading-relaxed">
              Чтобы продолжить пользоваться пультом, перейди в Telegram-бот{' '}
              <strong className="text-white">«Алпан ВПН Бот»</strong>{' '}
              <span className="text-[#56bfff] font-semibold">(@AlpanVPNrobot)</span> и нажми{' '}
              <strong className="text-white">Start</strong>.
            </p>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleBotClick}
              className="flex items-center justify-center gap-2 w-full py-3 px-3.5 rounded-xl text-xs font-bold text-white bg-gradient-to-b from-[#2AABEE] to-[#1d8ec9] border border-white/30 no-underline"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="currentColor" aria-hidden="true">
                <path d="M21.94 3.46a1.5 1.5 0 0 0-1.56-.25L2.64 10.36a1.25 1.25 0 0 0 .06 2.34l4.52 1.53 1.75 5.45a1 1 0 0 0 1.66.41l2.63-2.58 4.4 3.25a1.5 1.5 0 0 0 2.36-.9L22.3 4.82a1.5 1.5 0 0 0-.36-1.36Zm-4.08 4.15-7.43 6.72-.31 3.12-1.15-3.68 8.89-6.16Z" />
              </svg>
              <span>Открыть Алпан ВПН Бот</span>
            </a>
            <button
              type="button"
              disabled={!botClicked || gateCountdown > 0}
              onClick={() => void handleEnterApp()}
              className="siren-btn w-full mt-2.5 py-2.5 text-xs disabled:opacity-40 disabled:pointer-events-none"
            >
              {!botClicked
                ? 'Я перешёл в бота'
                : gateCountdown > 0
                ? `Подожди ${gateCountdown} сек...`
                : 'Я перешёл в бота'}
            </button>
            <BrandWatermark compact className="mt-3 pt-2.5 border-t border-white/10" />
          </div>
        </div>
      )}

      {/* Pro Unlock Modal */}
      {lockModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/75"
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
                className="w-full mt-3 py-3.5 rounded-xl font-bold text-white bg-gradient-to-b from-[#4d8dff] to-[#2467e8] border border-white/30 cursor-pointer"
              >
                Открыть
              </button>
            </form>

            <button
              type="button"
              onClick={() => setLockModalOpen(false)}
              className="mt-2 py-2 w-full text-xs text-[var(--dim)] hover:text-white cursor-pointer"
            >
              Закрыть
            </button>
            <BrandWatermark compact className="mt-2.5 pt-2.5 border-t border-white/10" />
          </div>
        </div>
      )}

      {/* Microphone Audio Session Warning Modal */}
      {micWarningOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mic-warn-title"
        >
          <div className="panel-surface w-full max-w-sm p-5 text-left">
            <div className="flex items-start justify-between gap-3 mb-2">
              <h2 id="mic-warn-title" className="text-base font-extrabold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[var(--acc)] shrink-0" aria-hidden="true" />
                <span>Запрос микрофона (PA / PTT)</span>
              </h2>
              <button
                type="button"
                onClick={() => setMicWarningOpen(false)}
                aria-label="Закрыть предупреждение"
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/80"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-white/80 leading-relaxed mb-3.5">
              Микрофон может остановить музыку в других приложениях. Все остальные режимы сирены работают поверх музыки без микрофона.
            </p>
            <div className="space-y-2">
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
                className="siren-btn active w-full py-2.5 text-xs"
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
            <BrandWatermark compact className="mt-3 pt-2.5 border-t border-white/10" />
          </div>
        </div>
      )}

      {/* Photosensitive Epilepsy Warning Modal */}
      {strobeConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/80"
          role="dialog"
          aria-modal="true"
          aria-labelledby="strobe-warn-title"
        >
          <div className="panel-surface w-full max-w-sm p-5 text-left">
            <h2 id="strobe-warn-title" className="text-base font-extrabold text-white flex items-center gap-2 mb-2">
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />
              <span>Предупреждение о стробоскопе</span>
            </h2>
            <p className="text-xs text-white/80 leading-relaxed mb-3.5">
              Белый строб создаёт высокочастотные вспышки (&gt;10 Гц), которые могут вызвать дискомфорт у людей с фотосенситивной эпилепсией.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStrobeConfirmOpen(false)}
                className="siren-btn flex-1 py-2.5 text-xs"
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
                className="siren-btn horn-active flex-1 py-2.5 text-xs"
              >
                Включить
              </button>
            </div>
            <BrandWatermark compact className="mt-3 pt-2.5 border-t border-white/10" />
          </div>
        </div>
      )}
    </>
  );
}
