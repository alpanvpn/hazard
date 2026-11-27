import React, { useState } from 'react';

interface DagestanEagleStickerProps {
  className?: string;
}

interface InlineWithSticker {
  eagleStickerUri?: string;
}

const RELATIVE_SRC = 'assets/aistudio/image_a1953bb7.png';
const ROOT_SRC = '/assets/aistudio/image_a1953bb7.png';

/**
 * Vinyl die-cut emblem sticker featuring the Coat of Arms of Dagestan
 * provided by the user, resolving reliably in dev, subpath builds, PWA, and single-file export.
 */
export const DagestanEagleSticker: React.FC<DagestanEagleStickerProps> = ({ className = '' }) => {
  const inline =
    typeof window !== 'undefined'
      ? (window as unknown as { __ALPAN_INLINE__?: InlineWithSticker }).__ALPAN_INLINE__
      : undefined;

  const initialSrc = inline?.eagleStickerUri || RELATIVE_SRC;
  const [imgSrc, setImgSrc] = useState<string>(initialSrc);
  const [failed, setFailed] = useState(false);

  const handleImgError = () => {
    if (imgSrc === RELATIVE_SRC) {
      setImgSrc(ROOT_SRC);
    } else {
      setFailed(true);
    }
  };

  return (
    <div
      className={`pointer-events-none select-none rounded-full bg-white p-[3px] border-[2px] border-[#eab308] overflow-hidden ${className}`}
      aria-hidden="true"
      style={{
        boxShadow:
          '0 6px 14px rgba(0, 0, 0, 0.88), 0 0 12px rgba(234, 179, 8, 0.42), inset 0 1px 2px rgba(255, 255, 255, 0.92)',
      }}
    >
      <div className="relative w-full h-full rounded-full overflow-hidden bg-white flex items-center justify-center">
        {!failed ? (
          <img
            src={imgSrc}
            alt="Герб Республики Дагестан"
            referrerPolicy="no-referrer"
            onError={handleImgError}
            className="block w-full h-full object-contain scale-[1.03]"
            draggable={false}
          />
        ) : (
          <span className="text-[10px] font-extrabold text-[#b45309] tracking-tight">РД</span>
        )}
        <div
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background:
              'linear-gradient(135deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 48%, rgba(0,0,0,0.06) 100%)',
          }}
        />
      </div>
    </div>
  );
};
