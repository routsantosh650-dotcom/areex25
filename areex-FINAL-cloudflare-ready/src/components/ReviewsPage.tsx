import React from 'react';
import { Star, MessageCircle } from 'lucide-react';
import { CUSTOMER_REVIEWS, REVIEW_AVERAGE, REVIEW_COUNT } from '../data/reviews';
import { ZoomImage } from './ZoomImage';

interface ReviewsPageProps {
  discordUrl: string;
}

const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const Stars: React.FC<{ rating: number; size?: string }> = ({ rating, size = 'h-4 w-4' }) => (
  <div className="flex items-center gap-0.5" aria-label={`${rating} out of 5 stars`}>
    {[1, 2, 3, 4, 5].map((n) => (
      <Star key={n} className={`${size} ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`} />
    ))}
  </div>
);

export const ReviewsPage: React.FC<ReviewsPageProps> = ({ discordUrl }) => {
  return (
    <>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center">
          <div className="font-mono text-xs text-red-400">COMMUNITY LOVE</div>
          <h1 className="mt-2 font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">
            What Server Owners Are Saying
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm text-slate-400">
            Real reviews posted by our customers in our Discord server, shown exactly as they wrote them.
          </p>

          <div className="mx-auto mt-8 inline-flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-[#120a0e] px-8 py-5 sm:flex-row sm:gap-5">
            <div className="font-display text-4xl font-extrabold text-white">{REVIEW_AVERAGE.toFixed(1)}</div>
            <div className="flex flex-col items-center gap-1 sm:items-start">
              <Stars rating={Math.round(REVIEW_AVERAGE)} size="h-5 w-5" />
              <div className="text-xs text-slate-400">
                Average of {REVIEW_COUNT} customer reviews on Discord
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 sm:mt-12 columns-1 gap-5 md:columns-2 lg:columns-3 [&>*]:mb-5">
          {CUSTOMER_REVIEWS.map((rev) => (
            <article
              key={rev.id}
              className="break-inside-avoid rounded-2xl border border-white/10 bg-[#120a0e] p-6 transition-colors duration-200 hover:border-red-500/50"
            >
              <Stars rating={rev.rating} />
              <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-200">{rev.text}</p>
              <div className="mt-5 flex items-center gap-3 border-t border-white/10 pt-4">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-600/20 font-mono text-xs font-bold uppercase text-red-400">
                  {rev.name.slice(0, 2)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-white">{rev.name}</div>
                  <div className="font-mono text-[11px] text-slate-400">
                    {formatDate(rev.date)} · via Discord
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 text-center">
          <a
            href={discordUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-[#120a0e] px-5 py-3 text-xs sm:text-sm font-semibold text-slate-100 transition-colors hover:border-red-500/50 hover:text-white"
          >
            <MessageCircle className="h-4 w-4" />
            <span>Read more reviews in our Discord</span>
          </a>
        </div>
      </section>

      {/* PERFORMANCE PROOF */}
      <section className="border-t border-white/10 bg-[#0d070a] py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center">
            <div className="font-mono text-xs text-red-400">PERFORMANCE PROOF</div>
            <h2 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Tested With 100+ Players
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm text-slate-400">
              Screenshots from real servers on Areex Cloud. Tap any image to enlarge.
            </p>
          </div>

          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { big: '103', small: 'simulated players in a stress test' },
              { big: '20.0', small: 'TPS held during that test (the maximum)' },
              { big: '57', small: 'real players on one Elite Plan server' },
            ].map((s) => (
              <div key={s.big} className="rounded-2xl border border-white/10 bg-[#120a0e] p-5 text-center">
                <div className="font-display text-3xl font-extrabold text-red-500">{s.big}</div>
                <div className="mt-1 text-xs text-slate-300">{s.small}</div>
              </div>
            ))}
          </div>

          <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2">
            <figure>
              <ZoomImage
                src="/img/proof/stress-test-console.webp"
                alt="Server console during a stress test showing 103 online players, 20.0 TPS and 339% CPU of 600%"
                width={1184}
                height={518}
              />
              <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-200">Stress test, console view.</span> 103 players online,
                TPS steady at 20.0, CPU at 339% of 600%, memory 9.84 GiB. The players are test bots.
              </figcaption>
            </figure>

            <figure>
              <ZoomImage
                src="/img/proof/stress-test-ingame.webp"
                alt="In-game player list during the stress test showing 103 connected players, 0 ms ping and server TPS 20.0"
                width={1521}
                height={788}
              />
              <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-200">Same test, in-game view.</span> 103 connected,
                0 ms ping, server TPS 20.0.
              </figcaption>
            </figure>

            <figure className="lg:col-span-2 lg:mx-auto lg:max-w-3xl">
              <ZoomImage
                src="/img/proof/players-60.webp"
                alt="Lifesteal SMP player list with 57 players online and 60 across the network on an Elite Plan"
                width={1241}
                height={760}
              />
              <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">
                <span className="font-semibold text-slate-200">Real players on an Elite Plan.</span> 57 players on
                this Lifesteal SMP (60 across the network), running on a shared-resources node.
              </figcaption>
            </figure>
          </div>
        </div>
      </section>
    </>
  );
};
