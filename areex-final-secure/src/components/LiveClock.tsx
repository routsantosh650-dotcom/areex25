import React, { useEffect, useState } from 'react';
import { Clock3 } from 'lucide-react';

// Areex runs its Indian datacenters on IST, so the site always shows that clock — even for a
// visitor whose laptop is set to another timezone.
const TIME_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour12: true,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const DAY_FORMAT = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

export const LiveClock: React.FC<{ className?: string }> = ({ className = '' }) => {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span
      data-testid="live-ist-clock"
      title="Live datacenter time — India Standard Time (UTC+5:30)"
      className={`flex items-center gap-1.5 rounded-xl border border-white/15 bg-[#120a0e] px-3 py-2 font-mono text-[11px] font-semibold text-slate-200 whitespace-nowrap ${className}`}
    >
      <Clock3 className="h-3.5 w-3.5 shrink-0 text-red-400" />
      <span>{TIME_FORMAT.format(now)}</span>
      <span className="text-red-400">IST</span>
      <span className="hidden text-slate-400 sm:inline">{DAY_FORMAT.format(now)}</span>
    </span>
  );
};
