import React from 'react';
import { ExternalLink, Zap, Globe, Layers, Puzzle, Users, Boxes, GitBranch } from 'lucide-react';
import { PANEL_URL } from '../config';
import { ZoomImage } from './ZoomImage';

const EXTENSIONS = [
  { icon: Globe, name: 'Subdomain', text: 'Give your server a clean, easy-to-share address.' },
  { icon: Layers, name: 'Versions', text: 'Switch your server software and Minecraft version.' },
  { icon: Puzzle, name: 'Plugins Installer', text: 'Find and install plugins without leaving the panel.' },
  { icon: Users, name: 'Players', text: 'See who is online and manage your players.' },
  { icon: GitBranch, name: 'Splitter', text: 'Divide your plan’s resources across more than one server.' },
  { icon: Puzzle, name: 'Plugins', text: 'Manage every plugin installed on your server.' },
  { icon: Boxes, name: 'Mods', text: 'Browse Modrinth and install mods straight from the panel.' },
];

const PANEL_FEATURES = [
  'Live console with power controls',
  'Real-time CPU, memory & disk usage',
  'File manager',
  'Databases',
  'Backups',
  'Network & allocations',
  'Schedules',
  'Sub-users',
  'Startup settings',
  'Activity log',
];

export const ShowcasePage: React.FC = () => {
  return (
    <>
      <section className="mx-auto max-w-7xl px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center">
          <div className="font-mono text-xs text-red-400">PANEL SHOWCASE</div>
          <h1 className="mt-2 font-display text-3xl sm:text-5xl font-bold tracking-tight text-white">
            See The Panel Before You Buy
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm text-slate-400">
            Every Areex Cloud server comes with our custom control panel: live console, file manager, backups and
            one-click mod and plugin installers, all in one place.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href={PANEL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-[0_0_25px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-500"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open the Panel</span>
            </a>
            <a
              href="/plans"
              className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#120a0e] px-6 py-3 text-xs sm:text-sm font-semibold text-slate-100 transition-colors hover:border-red-500/50 hover:text-white"
            >
              <Zap className="h-4 w-4" />
              <span>View Plans</span>
            </a>
          </div>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-10">
          <figure>
            <ZoomImage
              src="/img/panel/panel-servers.webp"
              alt="Areex Cloud panel dashboard listing servers with live CPU, RAM and disk usage"
              width={1846}
              height={827}
            />
            <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-200">Your servers at a glance.</span> Status, CPU, RAM and
              disk for every server on one dashboard. (Customer server names and addresses are hidden for privacy.)
            </figcaption>
          </figure>

          <figure>
            <ZoomImage
              src="/img/panel/panel-console.webp"
              alt="Areex Cloud panel live console with CPU, memory and disk usage cards and a sidebar of management tools"
              width={1770}
              height={891}
            />
            <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-200">Live console and resource monitor.</span> Start, restart
              or stop your server, watch usage in real time and run commands instantly.
            </figcaption>
          </figure>

          <figure>
            <ZoomImage
              src="/img/panel/panel-mods.webp"
              alt="Areex Cloud panel mod browser with Modrinth provider, mod loader and Minecraft version filters"
              width={1326}
              height={488}
            />
            <figcaption className="mt-3 text-xs leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-200">Mods installed from the panel.</span> Search Modrinth,
              filter by mod loader and Minecraft version, and install without uploading files by hand.
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[#0d070a] py-14 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center">
            <div className="font-mono text-xs text-red-400">EXTENSIONS INCLUDED</div>
            <h2 className="mt-2 font-display text-2xl sm:text-4xl font-bold tracking-tight text-white">
              Powerful Add-ons Built In
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-xs sm:text-sm text-slate-400">
              These extensions are part of the panel on your server.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_260px]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {EXTENSIONS.map((ext) => (
                <div
                  key={ext.name}
                  className="flex gap-4 rounded-2xl border border-white/10 bg-[#120a0e] p-5 transition-colors hover:border-red-500/50"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-600/20 text-red-400">
                    <ext.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white">{ext.name}</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{ext.text}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mx-auto w-full max-w-[260px]">
              <ZoomImage
                src="/img/panel/panel-extensions.webp"
                alt="Extensions menu in the Areex Cloud panel listing Subdomain, Versions, Plugins Installer, Players, Splitter, Plugins and Mods"
                width={250}
                height={326}
              />
              <p className="mt-2 text-center text-[11px] text-slate-500">The Extensions menu in the panel</p>
            </div>
          </div>

          <div className="mx-auto mt-12 max-w-4xl rounded-2xl border border-white/10 bg-[#120a0e] p-6 sm:p-8">
            <h3 className="font-display text-lg font-bold text-white">Also in every panel</h3>
            <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 text-xs text-slate-300 sm:grid-cols-2">
              {PANEL_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-12 text-center">
            <p className="text-xs text-slate-400">
              Log in to the panel with the same email and password you use on this website.
            </p>
            <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href="/plans"
                className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-6 py-3 text-xs sm:text-sm font-semibold text-white shadow-[0_0_25px_rgba(220,38,38,0.35)] transition-colors hover:bg-red-500"
              >
                <Zap className="h-4 w-4" />
                <span>Deploy Your Server</span>
              </a>
              <a
                href={PANEL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-[#0d070a] px-6 py-3 text-xs sm:text-sm font-semibold text-slate-100 transition-colors hover:border-red-500/50 hover:text-white"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open the Panel</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};
