import React from 'react';
import { ArrowRight } from 'lucide-react';
import { PLAN_CATEGORIES, formatPriceInCurrency } from '../data/areexData';
import type { CurrencyCode, HostingPlanItem } from '../data/areexData';

interface PlansOverviewProps {
  plans: HostingPlanItem[];
  currency: CurrencyCode;
  asPage?: boolean;
}

/** One card per plan category; each opens its own page (/plans/budget, /plans/premium ...). */
export const PlansOverview: React.FC<PlansOverviewProps> = ({ plans, currency, asPage = false }) => {
  const Heading = asPage ? 'h1' : 'h2';
  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20">
      <div className="text-center">
        <div className="font-mono text-xs text-red-400">AREEX CLOUD PLANS</div>
        <Heading className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
          Pick Your Hosting Category
        </Heading>
        <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm text-slate-400">
          Minecraft servers, Discord bots, VPS and domains. Choose a category to see every plan.
        </p>
      </div>

      <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {PLAN_CATEGORIES.map((cat) => {
          const inCat = plans.filter((p) => p.category === cat.key);
          const from = inCat.length ? Math.min(...inCat.map((p) => p.priceInr)) : null;
          return (
            <a
              key={cat.key}
              href={`/plans/${cat.key}`}
              className="group relative flex min-h-[250px] flex-col justify-end overflow-hidden rounded-2xl border border-white/10 bg-[#120a0e] transition-all duration-200 hover:-translate-y-1 hover:border-red-500/60"
            >
              <img
                src={cat.imageUrl}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-50 transition-opacity duration-300 group-hover:opacity-70"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#090608] via-[#090608]/70 to-[#090608]/20" />
              <div className="relative z-10 p-5 sm:p-6">
                <div className="font-mono text-[11px] text-red-400">{cat.indexLabel}</div>
                <div className="mt-1 font-display text-xl font-bold text-white">{cat.name}</div>
                <p className="mt-1 text-xs text-slate-300">{cat.audience}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-200">
                    {from !== null ? (
                      <>
                        From <span className="font-bold text-red-400">{formatPriceInCurrency(from, currency)}</span>
                        /mo
                      </>
                    ) : (
                      `${inCat.length} plans`
                    )}
                  </span>
                  <span className="flex items-center gap-1 text-xs font-semibold text-white">
                    View plans
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
};
