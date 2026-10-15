// FAQ shown on /faq and (first 6) on the home page.
// To add or change a question, just edit this list. The first 6 appear on the home page.

export interface FaqItem {
  group: 'Buying & Payments' | 'Refunds & Billing' | 'Servers' | 'Support';
  q: string;
  a: string;
  cta?: 'ticket'; // shows "Open a ticket" + Discord buttons under the answer
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    group: 'Buying & Payments',
    q: 'How fast is my server ready after I pay?',
    a: 'Your server is created automatically as soon as your payment is confirmed, usually within about a minute. Your server address and panel link appear on screen right after you pay.',
  },
  {
    group: 'Buying & Payments',
    q: 'Which payment methods do you accept?',
    a: 'Checkout is powered by Razorpay in INR: UPI (Google Pay, PhonePe, Paytm, BHIM), RuPay / Visa / Mastercard cards and net banking. We never see or store your card or UPI details.',
  },
  {
    group: 'Buying & Payments',
    q: 'Can I pay with crypto, BDT, PKR or another currency?',
    a: 'Yes, but not through the website checkout. Crypto, Bangladeshi Taka (BDT), Pakistani Rupees (PKR) and other currencies are handled manually: open a ticket in our support chat or on Discord, tell us which plan you want, and our team will guide you through the payment and set up your server.',
    cta: 'ticket',
  },
  {
    group: 'Refunds & Billing',
    q: 'What is your refund policy?',
    a: 'We have a 24-hour refund window. If you are not satisfied with your server within the first 24 hours of deployment, open a Billing & Refund ticket and we will process a full 100% refund. Domain registrations and dedicated IPv4 allocations cannot be refunded once provisioned. The full terms are on our Legal & ToS page.',
  },
  {
    group: 'Buying & Payments',
    q: 'Do I need an account, and how do I log in to the panel?',
    a: 'Yes. Create a free account on the website with your email and a password. The same email and password also log you in to our game panel at panel.areexcloud.site, where you manage your server.',
  },
  {
    group: 'Servers',
    q: 'Which locations can I choose?',
    a: 'You pick a location at checkout: Mumbai, Noida or Singapore. Choose the one closest to your players for the lowest ping.',
  },
  {
    group: 'Buying & Payments',
    q: 'How do coupon codes work?',
    a: 'Type your code into the coupon box at checkout and press Apply before you pay. Active codes are shown on the offer banner at the top of the plans pages.',
  },
  {
    group: 'Servers',
    q: 'Can I run mods and plugins?',
    a: 'Yes. The panel includes Mods, Plugins, Plugins Installer and Versions tools, so you can install mods and plugins and switch Minecraft versions without uploading files by hand. For heavy modpacks we recommend our Premium or Exclusive plans.',
  },
  {
    group: 'Servers',
    q: 'How do Discord bot plans work?',
    a: 'Choose Python or Node.js when you order. Once your server is created, upload your bot files in the panel (Files tab), set the start file, and press Start.',
  },
  {
    group: 'Refunds & Billing',
    q: 'What happens if I do not renew on time?',
    a: 'Plans are prepaid. If a renewal is not paid on time, your server is archived for 72 hours and permanently deleted after 7 days, so please renew before the due date.',
  },
  {
    group: 'Refunds & Billing',
    q: 'Can I upgrade my plan later?',
    a: 'Yes. You can move from Budget to Premium, Exclusive or VPS at any time with prorated billing. Open a ticket and our team will handle the upgrade for you.',
  },
  {
    group: 'Support',
    q: 'Can you move my server from my old host?',
    a: 'Yes, we offer free migration help. Open a ticket and select Free World Migration, and our team will help move your worlds, plugins and databases.',
  },
  {
    group: 'Support',
    q: 'Who is the founder of Areex Cloud?',
    a: 'Areex Cloud was founded by Piyush Garai. You can read more about him on our Founder page.',
  },
  {
    group: 'Support',
    q: 'How do I get help?',
    a: 'Use the 24/7 support chat on this website or open a ticket in our Discord community (1,000+ members). Include your server address so we can help faster.',
  },
];
