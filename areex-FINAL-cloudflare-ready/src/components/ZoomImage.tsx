import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface ZoomImageProps {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
}

/** Screenshot that opens full-size when clicked (Esc / click outside to close). */
export const ZoomImage: React.FC<ZoomImageProps> = ({ src, alt, width, height, className = '' }) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Enlarge: ${alt}`}
        className="group block w-full cursor-zoom-in overflow-hidden rounded-xl border border-white/10 bg-[#0d070a] transition-colors hover:border-red-500/50"
      >
        <img
          src={src}
          alt={alt}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          className={`h-auto w-full transition-transform duration-300 group-hover:scale-[1.01] ${className}`}
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-[80] flex cursor-zoom-out items-center justify-center bg-black/90 p-3 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-black/60 text-white hover:border-red-500/60"
          >
            <X className="h-4 w-4" />
          </button>
          <img src={src} alt={alt} className="max-h-[92vh] max-w-full rounded-lg object-contain" />
        </div>
      )}
    </>
  );
};
