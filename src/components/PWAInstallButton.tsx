import React, { useState } from 'react';
import { Download, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { BrandWatermark } from './RegionFlags';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        aria-label="Установить приложение на экран Домой"
        className="siren-btn active flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Установить</span>
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        aria-label="Как добавить на экран Домой"
        className="siren-btn flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-[11px] whitespace-nowrap shrink-0"
      >
        <Share className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{isIOS ? 'Домой' : 'PWA'}</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-md p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
        >
          <div className="panel-surface w-full max-w-sm p-5 text-left">
            <div className="flex items-center justify-between mb-3">
              <h3 id="pwa-guide-title" className="text-base font-bold text-white">
                Установка на экран «Домой»
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Закрыть инструкцию"
                className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 text-white/80 hover:bg-white/20"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {isIOS ? (
              <ol className="space-y-2 text-xs text-white/75 list-decimal pl-5 mb-4">
                <li>Нажми кнопку <strong className="text-white">«Поделиться»</strong> внизу Safari.</li>
                <li>Прокрути вниз и выбери <strong className="text-white">«На экран «Домой»»</strong>.</li>
                <li>Открой иконку <strong className="text-amber-300">Alpan 7007</strong> — в режиме PWA сирена стабильнее работает поверх музыки.</li>
              </ol>
            ) : (
              <ol className="space-y-2 text-xs text-white/75 list-decimal pl-5 mb-4">
                <li>Открой меню браузера (три точки в углу).</li>
                <li>Выбери <strong className="text-white">«Установить приложение»</strong> или <strong className="text-white">«Добавить на главный экран»</strong>.</li>
              </ol>
            )}
            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="siren-btn active w-full py-2.5 text-xs"
            >
              Понятно
            </button>
            <BrandWatermark compact className="mt-3 pt-2.5 border-t border-white/10" />
          </div>
        </div>
      )}
    </>
  );
};
