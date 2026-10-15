import React from 'react';

interface AreexLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showBadgeText?: boolean;
}

// The official Areex Cloud logo (cloud + server icon). File: public/logo-icon.png
export const AreexLogo: React.FC<AreexLogoProps> = ({ size = 'md', showBadgeText = false }) => {
  const dimensions =
    size === 'sm' ? 'h-9 w-9 rounded-lg' : size === 'lg' ? 'h-14 w-14 rounded-2xl' : 'h-10 w-10 rounded-xl';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      <img
        src="/logo-icon.png"
        alt="Areex Cloud logo"
        width={160}
        height={160}
        className={`${dimensions} shrink-0 border border-white/10 object-cover shadow-[0_0_18px_rgba(56,189,248,0.18)]`}
      />
      {showBadgeText && (
        <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-red-400">
          OFFICIAL CLOUD
        </span>
      )}
    </div>
  );
};
