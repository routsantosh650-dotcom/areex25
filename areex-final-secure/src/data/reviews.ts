// REAL customer reviews, copied word-for-word from the Areex Cloud Discord review channel
// (posted through the ReviewHub bot). Do not edit the wording of a review.
// To add a new one: copy a block, change the fields, keep the newest first.

export interface CustomerReview {
  id: string;
  name: string; // Discord username exactly as shown
  rating: 1 | 2 | 3 | 4 | 5;
  date: string; // YYYY-MM-DD (date posted on Discord)
  text: string;
}

export const CUSTOMER_REVIEWS: CustomerReview[] = [
  {
    id: 'starafder-2026-09-18',
    name: 'starafder',
    rating: 5,
    date: '2026-09-18',
    text: `I’ve been using AreexCloud for around 20 days for our Minecraft server, and so far the experience has been really good.

We’re on the ₹199 plan with 8 GB DDR4 RAM, 600% AMD EPYC CPU, and 150 GB shared NVMe storage. I was initially unsure how well such a cheap plan would handle our heavily modded server, but it has performed surprisingly well.

We have 6 players and run mods like Create, Epic Fight, Weapons of Miracles, Bosses Rise, Nightfall, Naturalist, Enhanced AI, and several others. We also pre-generated a 2500-block radius with Chunky, and the server has handled everything quite well overall.

There have been a few issues occasionally, but the support has been excellent. The support is always been very responsive and helpful in resolving problems quickly.

For my case, I’m very satisfied with the service and the value it provides.`,
  },
  {
    id: 'itsmevictus-2026-09-08',
    name: 'itsmevictus.',
    rating: 5,
    date: '2026-09-08',
    text: 'Stress tested my new server 100 players with 0 litreally 0 lag can even push to 200 to 300 players in 12gb ram and 400% cpu best hosting ever and main thing is cheap prices so anyone can afford the server',
  },
  {
    id: 'itsme_ansh-2026-08-23',
    name: 'itsme_ansh',
    rating: 5,
    date: '2026-08-23',
    text: '70 players on 24gb ram server, chilling on endwar',
  },
  {
    id: 'mustbesteve1-2026-08-22',
    name: 'mustbesteve1',
    rating: 5,
    date: '2026-08-22',
    text: 'This server is very trustworthy. I’ve been playing on it and buying servers from them for the past year. The prices are very affordable, the ping is extremely stable, and I’ve never faced any issues.',
  },
  {
    id: 'bk_clutch_god_7-2026-08-13',
    name: 'bk_clutch_god_7',
    rating: 5,
    date: '2026-08-13',
    text: `Still Buying servers from them
2 years
Trustable
Reliable
They should add more new nodes this will make a 10 on 10 hosting of India 😋🙏`,
  },
  {
    id: 'crowngamer-2026-08-13',
    name: 'crowngamer',
    rating: 4,
    date: '2026-08-13',
    text: 'Areex Cloud is a good hosting service with very low downtime and smooth server performance. The servers run quite smoothly overall. The only downside is that the support could be better and more responsive. Overall, a good hosting service.',
  },
];

export const REVIEW_COUNT = CUSTOMER_REVIEWS.length;
export const REVIEW_AVERAGE =
  Math.round((CUSTOMER_REVIEWS.reduce((s, r) => s + r.rating, 0) / CUSTOMER_REVIEWS.length) * 10) / 10;
