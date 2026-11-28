import React, { useState } from 'react';
import { Music, Play, Plus, Save, Square, Trash2 } from 'lucide-react';
import {
  BUILTIN_MELODY_PRESETS,
  MelodyPreset,
  formatMelodyLabel,
} from '../types/melody';

interface MelodyPresetsEditorProps {
  activePresetId: string;
  notes: number[];
  stepMs: number;
  sharp: boolean;
  isSweep: boolean;
  customPresets: MelodyPreset[];
  isPlayingMelody: boolean;
  onSelectPreset: (preset: MelodyPreset) => void;
  onChangeNotes: (notes: number[]) => void;
  onChangeStepMs: (stepMs: number) => void;
  onChangeSharp: (sharp: boolean) => void;
  onSaveCustomPreset: (name: string) => void;
  onDeleteCustomPreset: (id: string) => void;
  onTogglePlayMelody: () => void;
}

export const MelodyPresetsEditor: React.FC<MelodyPresetsEditorProps> = ({
  activePresetId,
  notes,
  stepMs,
  sharp,
  isSweep,
  customPresets,
  isPlayingMelody,
  onSelectPreset,
  onChangeNotes,
  onChangeStepMs,
  onChangeSharp,
  onSaveCustomPreset,
  onDeleteCustomPreset,
  onTogglePlayMelody,
}) => {
  const [newName, setNewName] = useState('');

  const updateNoteAt = (idx: number, rawVal: number) => {
    const clamped = Math.max(250, Math.min(2400, Math.round(rawVal)));
    const next = [...notes];
    next[idx] = clamped;
    onChangeNotes(next);
  };

  const nudgeNoteAt = (idx: number, delta: number) => {
    updateNoteAt(idx, (notes[idx] ?? 600) + delta);
  };

  const addStep = () => {
    if (notes.length >= 10) return;
    const last = notes[notes.length - 1] ?? 800;
    const nextVal = last >= 1000 ? 600 : last + 200;
    onChangeNotes([...notes, nextVal]);
  };

  const removeStepAt = (idx: number) => {
    if (notes.length <= 2) return;
    onChangeNotes(notes.filter((_, i) => i !== idx));
  };

  const handleSave = () => {
    const trimmed = newName.trim();
    const fallbackName = `Мэн ${notes.slice(0, 4).join('-')}`;
    onSaveCustomPreset(trimmed || fallbackName);
    setNewName('');
  };

  const allPresets = [...BUILTIN_MELODY_PRESETS, ...customPresets];

  return (
    <div className="space-y-3 border-t border-white/10 pt-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
            <Music className="w-4 h-4 text-[var(--acc)] shrink-0" aria-hidden="true" />
            <span>Пресеты кнопки «Мэн»</span>
          </h3>
          <p className="text-[11px] text-[var(--dim)] mt-0.5 truncate">
            {formatMelodyLabel(notes, isSweep)}
            {isSweep ? '' : ` · ${stepMs} мс`}
          </p>
        </div>
        <button
          type="button"
          onClick={onTogglePlayMelody}
          className={`siren-btn min-h-[36px] px-3 py-1.5 text-xs font-extrabold flex items-center gap-1.5 shrink-0 ${
            isPlayingMelody ? 'horn-active' : 'active'
          }`}
        >
          {isPlayingMelody ? (
            <>
              <Square className="w-3 h-3 fill-current" aria-hidden="true" />
              <span>Стоп</span>
            </>
          ) : (
            <>
              <Play className="w-3 h-3 fill-current" aria-hidden="true" />
              <span>Тест</span>
            </>
          )}
        </button>
      </div>

      {/* Presets Grid */}
      <div className="space-y-1.5">
        <span className="block text-[11px] font-bold uppercase tracking-wider text-[var(--dim)]">
          Выбор режима при удержании MAN
        </span>
        <div className="grid grid-cols-1 gap-1.5">
          {allPresets.map((preset) => {
            const selected = activePresetId === preset.id;
            return (
              <div key={preset.id} className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onSelectPreset(preset)}
                  aria-pressed={selected}
                  className={`siren-btn flex-1 min-h-[38px] px-3 py-1.5 text-left flex items-center justify-between gap-2 ${
                    selected ? 'active' : ''
                  }`}
                >
                  <span className="font-mono text-xs font-bold truncate">{preset.name}</span>
                  <span className="font-mono text-[10.5px] text-white/70 shrink-0">
                    {preset.isSweep
                      ? 'Вверх-вниз'
                      : `${preset.stepMs} мс${preset.sharp ? ' · рез.' : ''}`}
                  </span>
                </button>
                {preset.custom && (
                  <button
                    type="button"
                    onClick={() => onDeleteCustomPreset(preset.id)}
                    aria-label={`Удалить пресет ${preset.name}`}
                    className="siren-btn stop-switch min-h-[38px] px-2.5 flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Frequency Builder */}
      <div className="rounded-xl border border-white/10 bg-black/35 p-2.5 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--dim)]">
            Своя последовательность MAN (Гц)
          </span>
          {notes.length < 10 && (
            <button
              type="button"
              onClick={addStep}
              className="text-xs font-bold text-[var(--acc)] flex items-center gap-1 hover:underline cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Добавить шаг</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {notes.map((hz, idx) => (
            <div
              key={`${idx}-${notes.length}`}
              className="rounded-lg border border-white/12 bg-[#0e1016] px-2 py-1.5 space-y-1"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="font-mono text-[10px] font-bold text-[var(--dim)]">
                  #{idx + 1}
                </span>
                {notes.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeStepAt(idx)}
                    aria-label={`Удалить шаг ${idx + 1}`}
                    className="text-white/50 hover:text-rose-400 text-xs px-1 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => nudgeNoteAt(idx, -50)}
                  aria-label={`Уменьшить частоту шага ${idx + 1}`}
                  className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 font-mono text-xs font-bold text-white shrink-0 cursor-pointer"
                >
                  −
                </button>
                <input
                  type="number"
                  min={250}
                  max={2400}
                  step={25}
                  value={hz}
                  aria-label={`Частота шага ${idx + 1} в Гц`}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v)) updateNoteAt(idx, v);
                  }}
                  className="w-full min-w-0 bg-transparent text-center font-mono text-xs font-extrabold text-[var(--acc)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => nudgeNoteAt(idx, 50)}
                  aria-label={`Увеличить частоту шага ${idx + 1}`}
                  className="w-7 h-7 rounded bg-white/10 hover:bg-white/20 font-mono text-xs font-bold text-white shrink-0 cursor-pointer"
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Speed slider + Glide/Step mode */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-[var(--dim)]">Скорость (быстрее ← → плавнее)</span>
            <span className="mono-nums font-bold text-white">
              {isSweep ? 'Стандарт' : `${stepMs} мс / шаг`}
            </span>
          </div>
          <input
            type="range"
            min={70}
            max={500}
            step={10}
            value={Math.min(500, Math.max(70, stepMs))}
            aria-label="Скорость смены частот при удержании MAN"
            onChange={(e) => onChangeStepMs(Number(e.target.value))}
            className="w-full accent-[var(--acc)]"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onChangeSharp(false)}
            aria-pressed={!sharp}
            className={`siren-btn min-h-[36px] py-1.5 px-2 text-xs ${!sharp ? 'active' : ''}`}
          >
            Плавный перелив
          </button>
          <button
            type="button"
            onClick={() => onChangeSharp(true)}
            aria-pressed={sharp}
            className={`siren-btn min-h-[36px] py-1.5 px-2 text-xs ${sharp ? 'active' : ''}`}
          >
            Чёткие ступени
          </button>
        </div>

        {/* Save as custom preset */}
        <div className="flex gap-1.5 pt-1">
          <input
            type="text"
            value={newName}
            maxLength={32}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Название пресета кнопки «Мэн»..."
            aria-label="Название нового пресета кнопки Мэн"
            className="flex-1 min-w-0 rounded-lg border border-white/15 bg-black/55 px-2.5 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-[var(--acc)]"
          />
          <button
            type="button"
            onClick={handleSave}
            className="siren-btn active min-h-[36px] px-3 py-1.5 text-xs flex items-center gap-1 shrink-0"
          >
            <Save className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Сохранить</span>
          </button>
        </div>
      </div>
    </div>
  );
};
