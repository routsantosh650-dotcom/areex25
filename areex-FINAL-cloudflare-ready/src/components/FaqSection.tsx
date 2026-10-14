import React from 'react';
import { ChevronDown, MessageCircle, Ticket } from 'lucide-react';
import { FAQ_ITEMS } from '../data/faq';
import type { FaqItem } from '../data/faq';

interface FaqSectionProps {
  discordUrl: string;
  onOpenSupport: () => void;
  asPage?: boolean; // true on /faq (all questions, grouped); false on the home page (first 6)
  limit?: number;
}

const GROUPS: FaqItem['group'][] = ['Buying & Payments', 'Refunds & Billing', 'Servers', 'Support'];

const Question: React.FC<{ item: FaqItem; discordUrl: string; onOpenSupport: () => void }> = ({
  item,
  discordUrl,
  onOpenSupport,
}) => (
  <details className="group rounded-xl border border-white/10 bg-[#120a0e] transition-colors open:border-red-500/40 hover:border-white/20">
    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-sm font-semibold text-white [&::-webkit-details-marker]:hidden">
      <span>{item.q}</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-red-400 transition-transform duration-200 group-open:rotate-180" />
    </summary>
    <div className="px-5 pb-5 text-xs sm:text-sm leading-relaxed text-slate-300">
      <p>{item.a}</p>
      {item.cta === 'ticket' && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenSupport}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-500"
          >
            <Ticket className="h-3.5 w-3.5" />
            Open a ticket
          </button>
          <a
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-red-500/50 hover:text-white"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Ask on Discord
          </a>
        </div>
      )}
    </div>
  </details>
);

export const FaqSection: React.FC<FaqSectionProps> = ({ discordUrl, onOpenSupport, asPage = false, limit = 6 }) => {
  const Heading = asPage ? 'h1' : 'h2';

  return (
    <section className="mx-auto max-w-4xl px-4 sm:px-6 py-14 sm:py-20">
      <div className="text-center">
        <div className="font-mono text-xs text-red-400">FAQ</div>
        <Heading className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
          Frequently Asked Questions
        </Heading>
        <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm text-slate-400">
          Everything you need to know before you buy. Can&apos;t find your answer? Open a ticket and we&apos;ll help.
        </p>
      </div>

      {asPage ? (
        <div className="mt-10 space-y-10">
          {GROUPS.map((group) => {
            const items = FAQ_ITEMS.filter((i) => i.group === group);
            if (!items.length) return null;
            return (
              <div key={group}>
                <h2 className="mb-3 font-mono text-xs font-semibold uppercase tracking-widest text-slate-400">
                  {group}
                </h2>
                <div className="space-y-2.5">
                  {items.map((item) => (
                    <Question key={item.q} item={item} discordUrl={discordUrl} onOpenSupport={onOpenSupport} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <div className="mt-10 space-y-2.5">
            {FAQ_ITEMS.slice(0, limit).map((item) => (
              <Question key={item.q} item={item} discordUrl={discordUrl} onOpenSupport={onOpenSupport} />
            ))}
          </div>
          <div className="mt-6 text-center">
            <a
              href="/faq"
              className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#120a0e] px-5 py-3 text-xs sm:text-sm font-semibold text-slate-100 transition-colors hover:border-red-500/50 hover:text-white"
            >
              View all questions
            </a>
          </div>
        </>
      )}

      {asPage && (
        <div className="mt-12 rounded-2xl border border-white/10 bg-[#120a0e] p-6 text-center">
          <h3 className="font-display text-lg font-bold text-white">Still have a question?</h3>
          <p className="mt-1 text-xs text-slate-400">Our team is online 24/7 in the support chat and on Discord.</p>
          <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={onOpenSupport}
              className="flex items-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-[0_0_25px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-500"
            >
              <Ticket className="h-4 w-4" />
              Open a ticket
            </button>
            <a
              href={discordUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-white/15 px-6 py-3 text-xs sm:text-sm font-semibold text-slate-100 transition-colors hover:border-red-500/50 hover:text-white"
            >
              <MessageCircle className="h-4 w-4" />
              Join our Discord
            </a>
          </div>
        </div>
      )}
    </section>
  );
};
