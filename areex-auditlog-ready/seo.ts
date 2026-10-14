// Server-side SEO: gives every page its own title, description, canonical link, structured data
// and a plain-text copy of its content for search engines and AI crawlers that do not run JavaScript.
// Visitors never see any of this: React replaces it as soon as the page loads.

import type { CategoryMeta, HostingPlanItem, PlanCategoryKey } from './src/data/areexData';
import type { FaqItem } from './src/data/faq';
import type { PageKey } from './src/router';

const SITE = 'https://areexcloud.site';

export interface SeoReview {
  name: string;
  rating: number;
  date: string;
  text: string;
}

export interface SeoInput {
  html: string;
  page: PageKey;
  category?: PlanCategoryKey;
  plans: HostingPlanItem[];
  categories: CategoryMeta[];
  faq: FaqItem[];
  reviews: SeoReview[];
  site: { discordUrl: string; youtubeUrl: string; instagramUrl: string; founderName: string; founderQuote?: string };
}

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);

const jsonLd = (obj: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;

const NAV: [string, string][] = [
  ['/', 'Home'],
  ['/plans', 'Plans'],
  ['/showcase', 'Panel Showcase'],
  ['/features', 'Features'],
  ['/network', 'Network'],
  ['/founder', 'Founder'],
  ['/reviews', 'Reviews'],
  ['/faq', 'FAQ'],
  ['/legal', 'Legal'],
  ['/contact', 'Contact'],
];

export function renderSeoPage(i: SeoInput): { status: number; html: string } {
  const { page, category, plans, categories, faq, reviews, site } = i;
  const inr = (n: number) => `₹${n}`;
  const minOf = (keys: PlanCategoryKey[]) => {
    const prices = plans.filter((p) => keys.includes(p.category)).map((p) => p.priceInr);
    return prices.length ? Math.min(...prices) : null;
  };
  const mc = minOf(['budget', 'premium', 'exclusive']);
  const reviewCount = reviews.length;
  const reviewAvg = reviewCount
    ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10
    : 0;
  const cat = categories.find((c) => c.key === category);
  const catMin = category ? minOf([category]) : null;

  // ---------- title, description, heading per page ----------
  let title = 'Areex Cloud | Minecraft, Bot & VPS Hosting in India';
  let desc =
    'Minecraft server hosting, Discord bot hosting, KVM VPS and domains built in India. Automatic setup and a 24-hour refund window.';
  let h1 = 'Areex Cloud: Minecraft, Bot & VPS Hosting in India';
  let path = '/';
  let status = 200;

  switch (page) {
    case 'home':
      title = `Areex Cloud | Minecraft Server Hosting India${mc ? ` from ${inr(mc)}/mo` : ''}`;
      desc = `Minecraft server hosting in India${mc ? ` from ${inr(mc)}/mo` : ''}. Automatic setup in Mumbai, Noida or Singapore, plus bot hosting and VPS. 24-hour refund window.`;
      h1 = 'Minecraft Server Hosting in India';
      break;
    case 'plans':
      path = '/plans';
      title = 'Minecraft, Bot & VPS Hosting Plans | Areex Cloud';
      desc =
        'Compare every Areex Cloud plan: Budget, Premium and Exclusive Minecraft hosting, Discord bot hosting, KVM VPS and domains. Pay in INR with UPI, cards or net banking.';
      h1 = 'Hosting Plans';
      break;
    case 'category': {
      path = `/plans/${category}`;
      const from = catMin ? ` from ${inr(catMin)}/mo` : '';
      const names: Record<string, string> = {
        budget: `Budget Minecraft Server Hosting India${from}`,
        premium: `Premium Minecraft Server Hosting India${from}`,
        exclusive: `Exclusive Minecraft Server Hosting India${from}`,
        bot: `Discord Bot Hosting India${from}`,
        vps: `KVM VPS Hosting India${from}`,
        domain: 'Domain Registration & DNS Hosting',
      };
      h1 = names[category || ''] || cat?.name || 'Hosting Plans';
      title = `${h1} | Areex Cloud`;
      const f = catMin ? ` from ${inr(catMin)}/mo` : '';
      const descs: Record<string, string> = {
        budget: `Affordable Minecraft server hosting in India${f}. NVMe storage, panel access and automatic setup for survival SMPs and friend groups.`,
        premium: `Premium Minecraft server hosting in India${f} for modpacks and bigger communities. Fast CPUs, NVMe storage and a full game panel.`,
        exclusive: `Exclusive Minecraft server hosting in India${f} on Ryzen 9 9950X hardware for large modpacks and big communities.`,
        bot: `Discord bot hosting in India${f}. Choose Python or Node.js, upload your files in the panel and start your bot.`,
        vps: `KVM VPS hosting in India${f}. Pay in INR with UPI, cards or net banking.`,
        domain: 'Register and manage domains with DNS hosting from Areex Cloud. Pay in INR with UPI, cards or net banking.',
      };
      desc = descs[category || ''] || cat?.description || desc;
      break;
    }
    case 'showcase':
      path = '/showcase';
      title = 'Panel Showcase: Live Console, Mods & Plugins | Areex Cloud';
      desc =
        'See the Areex Cloud game panel before you buy: live console, file manager, backups and one-click mod and plugin installers.';
      h1 = 'Panel Showcase';
      break;
    case 'features':
      path = '/features';
      title = 'Features & Hardware | Areex Cloud';
      desc = 'The hardware, locations and features behind Areex Cloud Minecraft, Discord bot and VPS hosting built in India.';
      h1 = 'Features & Hardware';
      break;
    case 'network':
      path = '/network';
      title = 'Global Network: Mumbai, Noida & Singapore | Areex Cloud';
      desc =
        'Areex Cloud servers run in Mumbai, Noida and Singapore. Choose the location closest to your players for lower ping.';
      h1 = 'Global Network';
      break;
    case 'founder':
      path = '/founder';
      title = `${site.founderName} | Founder of Areex Cloud`;
      desc = `${site.founderName} is the founder of Areex Cloud, an Indian Minecraft, Discord bot and VPS hosting company.`;
      h1 = `${site.founderName}, Founder of Areex Cloud`;
      break;
    case 'reviews':
      path = '/reviews';
      title = 'Customer Reviews | Areex Cloud';
      desc = `Real customer reviews of Areex Cloud, posted in our Discord community.${
        reviewCount ? ` Average ${reviewAvg} out of 5 from ${reviewCount} reviews.` : ''
      }`;
      h1 = 'Customer Reviews';
      break;
    case 'faq':
      path = '/faq';
      title = 'FAQ: Payments, Refunds & Setup | Areex Cloud';
      desc =
        'Answers about payments, the 24-hour refund window, server locations, mods and bot hosting, and how to order with crypto, BDT or PKR.';
      h1 = 'Frequently Asked Questions';
      break;
    case 'legal':
      path = '/legal';
      title = 'Legal, Terms & Refund Policy | Areex Cloud';
      desc = 'Areex Cloud terms of service, privacy policy, community guidelines and refund policy.';
      h1 = 'Legal & Terms';
      break;
    case 'contact':
      path = '/contact';
      title = 'Contact & Community | Areex Cloud';
      desc = 'Contact Areex Cloud through Discord, YouTube and Instagram, or open a support ticket.';
      h1 = 'Contact & Community';
      break;
    default:
      title = 'Page not found | Areex Cloud';
      desc = 'This page does not exist.';
      h1 = 'Page not found';
      status = 404;
  }
  title = clip(title, 70);
  desc = clip(desc, 160);
  const url = `${SITE}${path === '/' ? '/' : path}`;

  // ---------- plain-text copy of the page ----------
  const nav = `<nav>${NAV.map(([h, l]) => `<a href="${h}">${l}</a>`).join(' ')}</nav>`;
  const planItem = (p: HostingPlanItem) =>
    `<li><strong>${esc(p.name)}</strong>: ${esc(p.ram)}, ${esc(p.cpu)}, ${esc(p.storage)}, ${inr(p.priceInr)}${esc(
      p.billingPeriod
    )}</li>`;
  const categoryList = `<ul>${categories
    .map((c) => {
      const m = minOf([c.key]);
      return `<li><a href="/plans/${c.key}">${esc(c.name)}</a>: ${esc(c.headline)}. ${esc(c.description)}${
        m ? ` From ${inr(m)}/mo.` : ''
      }</li>`;
    })
    .join('')}</ul>`;
  const faqHtml = (list: FaqItem[]) =>
    list.map((f) => `<h3>${esc(f.q)}</h3><p>${esc(f.a)}</p>`).join('');

  let body = `<h1>${esc(h1)}</h1><p>${esc(desc)}</p>`;
  if (page === 'home') {
    body +=
      `<p>Areex Cloud was founded by ${esc(site.founderName)}.</p>` +
      `<p>Areex Cloud is an Indian hosting company offering Minecraft server hosting, Discord bot hosting (Python and Node.js), KVM VPS and domains. ` +
      `Servers are created automatically after payment in Mumbai, Noida or Singapore. Pay in INR with UPI, cards or net banking. ` +
      `We offer a 24-hour refund window. Each customer gets a game panel with a live console, file manager, backups and mod and plugin installers.</p>` +
      `<h2>Plans</h2>${categoryList}<h2>Frequently asked questions</h2>${faqHtml(faq.slice(0, 6))}`;
  } else if (page === 'plans') {
    body += `<h2>Plan categories</h2>${categoryList}`;
  } else if (page === 'category') {
    const list = plans.filter((p) => p.category === category);
    body += `<h2>${esc(cat?.name || 'Plans')}</h2><p>${esc(cat?.headline || '')}. ${esc(cat?.audience || '')}.</p>`;
    body += list.length ? `<ul>${list.map(planItem).join('')}</ul>` : '';
    body += `<p><a href="/plans">See all plan categories</a></p>`;
  } else if (page === 'faq') {
    body += faqHtml(faq);
  } else if (page === 'reviews') {
    body += reviews
      .map(
        (r) =>
          `<blockquote><p>${esc(r.text)}</p><footer>${esc(r.name)}, ${esc(r.rating)} out of 5, ${esc(r.date)}</footer></blockquote>`
      )
      .join('');
  } else if (page === 'founder') {
    body +=
      `<p>${esc(site.founderName)} is the founder of Areex Cloud, an Indian hosting company for Minecraft servers, Discord bots and VPS.</p>` +
      (site.founderQuote ? `<blockquote><p>${esc(site.founderQuote)}</p><footer>${esc(site.founderName)}, Founder of Areex Cloud</footer></blockquote>` : '') +
      `<p><a href="/">Areex Cloud home</a> · <a href="/plans">Plans</a> · <a href="/contact">Contact</a></p>`;
  } else if (page === 'network') {
    body += `<p>Server locations: Mumbai, Noida and Singapore.</p>`;
  } else if (page === 'contact') {
    body += `<ul><li><a href="${esc(site.discordUrl)}">Discord</a></li><li><a href="${esc(site.youtubeUrl)}">YouTube</a></li><li><a href="${esc(site.instagramUrl)}">Instagram</a></li></ul>`;
  }
  const content =
    `<div id="seo-content" style="position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">` +
    `<header>${nav}</header><main>${body}</main></div>`;

  // ---------- structured data ----------
  const ld: string[] = [
    jsonLd({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'Areex Cloud',
      url: SITE,
      logo: `${SITE}/icon-512.png`,
      founder: { '@type': 'Person', name: site.founderName },
      sameAs: [site.discordUrl, site.youtubeUrl, site.instagramUrl],
    }),
  ];
  if (page === 'home') {
    ld.push(jsonLd({ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Areex Cloud', url: SITE }));
  }
  if (page === 'founder') {
    ld.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'Person',
        name: site.founderName,
        jobTitle: 'Founder',
        url: `${SITE}/founder`,
        worksFor: { '@type': 'Organization', name: 'Areex Cloud', url: SITE },
      })
    );
  }
  if (page === 'faq') {
    ld.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      })
    );
  }
  if (page === 'category' && cat) {
    ld.push(
      jsonLd({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: 'Plans', item: `${SITE}/plans` },
          { '@type': 'ListItem', position: 3, name: cat.name, item: url },
        ],
      })
    );
  }

  // ---------- put it into index.html ----------
  let html = i.html;
  const setMeta = (attr: 'name' | 'property', key: string, value: string) => {
    const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
    const re = new RegExp(`<meta ${attr}="${key}" content="[^"]*"\\s*/?>`);
    html = re.test(html) ? html.replace(re, () => tag) : html.replace('</head>', () => `${tag}\n  </head>`);
  };
  html = html.replace(/<title>[\s\S]*?<\/title>/, () => `<title>${esc(title)}</title>`);
  setMeta('name', 'description', desc);
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', desc);
  setMeta('property', 'og:url', url);
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', desc);

  const extraHead = [
    status === 404 ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${esc(url)}" />`,
    ...ld,
  ].join('\n    ');
  html = html.replace('</head>', () => `    ${extraHead}\n  </head>`);
  html = html.replace('<div id="root"></div>', () => `<div id="root">${content}</div>`);

  return { status, html };
}
