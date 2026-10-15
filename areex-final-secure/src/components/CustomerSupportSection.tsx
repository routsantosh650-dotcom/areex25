import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import {
  Headphones,
  Send,
  ExternalLink,
  X,
  RotateCcw,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  showDiscordCta?: boolean;
  timestamp: string;
}

interface CustomerSupportChatProps {
  discordUrl: string;
  open: boolean;
  onToggleOpen: (open: boolean) => void;
}

const INITIAL_MESSAGES: ChatMessage[] = [
  {
    id: 'msg_welcome',
    sender: 'bot',
    text:
      'Welcome to Areex Cloud Support. I answer plan, pricing, hardware, ping, payment and setup questions instantly — in English, हिन्दी, বাংলা, தமிழ், తెలుగు, मराठी or any other language you prefer.\n\nFor refunds, billing disputes and live server incidents, open a ticket in our official Discord so a human engineer can act on your account.',
    showDiscordCta: false,
    timestamp: '',
  },
];

const QUICK_DOUBTS = [
  'Which plan fits my server?',
  'Plans & pricing',
  'Payment, UPI & coupons',
  'Ping & datacenter location',
  'Refund or server issue',
];

const stamp = () =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

// Questions that must reach a human, whatever the answering engine is.
const ESCALATION_WORDS = [
  'refund',
  'money back',
  'cancel',
  'problem',
  'issue',
  'error',
  'bug',
  'crash',
  'not working',
  'down',
  'lag',
  'stuck',
  'deducted',
  'payment fail',
  'ticket',
  'complaint',
  'migrate',
  'migration',
  'transfer',
  'password',
  'hacked',
  'dikkat',
  'kharab',
  'paisa',
  'wapas',
  'samadhaan',
  'সমস্যা',
  'समस्या',
];

const needsHuman = (text: string) =>
  ESCALATION_WORDS.some((word) => text.toLowerCase().includes(word));

/**
 * Offline answers. They are also the safety net when the AI endpoint is not configured or
 * the network fails, so the chat never goes silent.
 */
function generateSupportReply(input: string): { text: string; showDiscordCta: boolean } {
  const q = input.toLowerCase().trim();

  if (needsHuman(q)) {
    return {
      text:
        'Refunds, billing disputes and live server incidents are handled by our engineers on the official Discord support ticket. Open a ticket there with your account email and order ID, and you will get a response within a few hours — that channel is also where free world migrations are done.',
      showDiscordCta: true,
    };
  }

  if (
    /plan|price|pricing|cost|rate|cheap|budget|kitne|कितने|দাম|konsa/.test(q)
  ) {
    return {
      text:
        'Areex Cloud price ranges (per month unless noted):\n' +
        '• Discord / Telegram bot hosting — from ₹29\n' +
        '• Budget Minecraft — ₹69 (4 GB) to ₹449 (32 GB)\n' +
        '• Premium — ₹399 (24 GB) to ₹2,499 (256 GB)\n' +
        '• Exclusive Ryzen 9 9950X — from ₹1,499\n' +
        '• KVM VPS — ₹149 to ₹1,999\n' +
        '• Domains — ₹449 (.in), ₹899 (.com), ₹1,299 (.gg) per year',
      showDiscordCta: false,
    };
  }

  if (/smp|modpack|rlcraft|atm|player|ram|best|which|konsa|कौन|কোন/.test(q)) {
    return {
      text:
        'Recommendation by workload:\n' +
        '• 5–15 friends, vanilla or Paper SMP — 8 GB (₹129) or 12 GB (₹199)\n' +
        '• Heavy modpacks (RLCraft, ATM9) or 30+ players — 24 GB (₹399) or 32 GB (₹499)\n' +
        '• Networks, multiple worlds or plugin development — Premium Enterprise and above\n' +
        'Every plan runs on Ryzen 9 / EPYC with NVMe storage and keeps 20 TPS when sized correctly.',
      showDiscordCta: false,
    };
  }

  if (/pay|upi|coupon|promo|discount|code|gpay|phonepe|razorpay|buy|card|भुगतान|পেমেন্ট/.test(q)) {
    return {
      text:
        'Checkout runs on Razorpay: UPI, Google Pay, PhonePe, Paytm, cards and net banking. Enter a coupon code on the checkout screen for an instant discount — the codes shown on the site’s offer board are active. The server is created automatically once payment is confirmed.',
      showDiscordCta: false,
    };
  }

  if (/ping|location|mumbai|noida|singapore|india|ddos|cpu|hardware|ryzen|node|পিং|lokeshan/.test(q)) {
    return {
      text:
        'Three datacenters: Mumbai (about 4 ms Indian ping), Noida (about 9 ms) and Singapore (about 28 ms). All nodes use AMD Ryzen 9 9950X or EPYC CPUs, NVMe SSDs, unmetered 1 Gbps uplinks and always-on enterprise DDoS protection.',
      showDiscordCta: false,
    };
  }

  if (/vps|root|ssh|bot|domain|node\.?js|python|java|docker|সার্ভার/.test(q)) {
    return {
      text:
        'Yes. KVM VPS plans (from ₹149) include full root SSH access, and bot plans (from ₹29) keep Node.js, Python or Java bots online 24/7. Domain plans come with automatic SRV record setup for Minecraft Java servers.',
      showDiscordCta: false,
    };
  }

  if (/^(hi|hello|hey|namaste|nomaskar|assalam|yo|sup|कैसे हो|হ্যালো)\b/.test(q) || q.length <= 4) {
    return {
      text:
        'Hello. I am the Areex Cloud assistant — ask me anything about plans, pricing, RAM, ping, payments, coupons, VPS root access, bots or domains, in the language you are most comfortable with.',
      showDiscordCta: false,
    };
  }

  return {
      text:
        'Areex Cloud spins up Minecraft, bot and VPS servers automatically after payment, starting at ₹29 per month, with Pterodactyl panel access and free daily backups. I may not have a verified answer for that specific question — our Discord support team does, and they can look into refunds, custom setups and account issues directly.',
    showDiscordCta: true,
  };
}

export const CustomerSupportChat: React.FC<CustomerSupportChatProps> = ({
  discordUrl,
  open,
  onToggleOpen,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [aiLive, setAiLive] = useState<boolean | null>(null);

  const chatBoxRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open && chatBoxRef.current) {
      gsap.fromTo(
        chatBoxRef.current,
        { opacity: 0, y: 18, scale: 0.95 },
        { opacity: 1, y: 0, scale: 1, duration: 0.22, ease: 'power3.out' }
      );
      setTimeout(() => {
        inputRef.current?.focus();
      }, 150);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing, open]);

  const pushBotReply = (text: string, showDiscordCta: boolean) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `b_${Date.now()}`,
        sender: 'bot',
        text,
        showDiscordCta,
        timestamp: stamp(),
      },
    ]);
  };

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || typing) return;

    const conversation = messages.slice(-6);
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}`, sender: 'user', text: trimmed, timestamp: stamp() },
    ]);
    setInput('');
    setTyping(true);

    let reply = { text: '', showDiscordCta: needsHuman(trimmed) };
    try {
      const res = await fetch('/api/support/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          history: conversation.map((m) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text,
          })),
        }),
      });
      const data = (await res.json().catch(() => null)) as { answer?: string } | null;
      const answer = (data?.answer || '').replace(/\*\*/g, '').trim();
      if (res.ok && answer) {
        setAiLive(true);
        reply = { text: answer, showDiscordCta: needsHuman(trimmed) };
      } else {
        setAiLive(false);
        reply = generateSupportReply(trimmed);
      }
    } catch {
      setAiLive(false);
      reply = generateSupportReply(trimmed);
    }

    pushBotReply(reply.text, reply.showDiscordCta);
    setTyping(false);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
  };

  return (
    <>
      {/* Floating Bottom-Right 24/7 Support Chat Trigger Button */}
      <div className="fixed bottom-4 right-3 sm:right-4 z-40">
        <button
          type="button"
          onClick={() => onToggleOpen(!open)}
          aria-expanded={open}
          aria-label="Open 24/7 Areex Cloud support chat"
          className="flex items-center gap-2 rounded-full border border-red-500/60 bg-gradient-to-r from-red-600 to-[#991b1b] px-3.5 sm:px-4 py-2.5 sm:py-3 text-xs font-semibold text-white shadow-[0_0_30px_rgba(220,38,38,0.5)] transition-transform hover:scale-105 whitespace-nowrap"
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          <Headphones className="h-4 w-4" />
          <span>24/7 Support</span>
        </button>
      </div>

      {/* Compact Pop-Up Support Chat */}
      {open && (
        <div
          ref={chatBoxRef}
          role="dialog"
          aria-label="Areex Cloud 24/7 support chat"
          className="fixed bottom-18 sm:bottom-20 right-3 sm:right-4 z-50 flex w-[calc(100vw-1.5rem)] max-w-[385px] flex-col overflow-hidden rounded-2xl border border-red-500/45 bg-[#10070b]/95 text-slate-100 shadow-[0_25px_65px_rgba(0,0,0,0.92)] backdrop-blur-xl"
        >
          {/* Chat Header */}
          <div className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-red-950/80 via-[#19090f] to-[#10070b] px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white shadow-[0_0_15px_rgba(220,38,38,0.4)]">
                <Headphones className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-white">
                  Areex Cloud Support
                </h3>
                <div className="flex items-center gap-1.5 font-mono text-[10px] font-semibold text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span>
                    ONLINE 24/7 · ANY LANGUAGE
                    {aiLive === true && ' · AI ASSISTANT'}
                    {aiLive === false && ' · INSTANT REPLIES'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setMessages(INITIAL_MESSAGES);
                  setAiLive(null);
                }}
                title="New conversation"
                aria-label="Start a new support conversation"
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 hover:text-white"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onToggleOpen(false)}
                aria-label="Close support chat"
                className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3.5 max-h-[330px] bg-[#0a0507]/90">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${
                  m.sender === 'user' ? 'items-end' : 'items-start'
                }`}
              >
                <div
                  className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line ${
                    m.sender === 'user'
                      ? 'rounded-br-sm bg-red-600 text-white font-medium'
                      : 'rounded-bl-sm border border-white/10 bg-[#160b10] text-slate-200'
                  }`}
                >
                  {m.text}

                  {/* Human escalation button */}
                  {m.showDiscordCta && (
                    <div className="mt-2.5 border-t border-white/10 pt-2.5">
                      <a
                        href={discordUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#5865F2] px-3 py-2 text-[11px] font-semibold text-white transition-colors hover:bg-[#4752C4]"
                      >
                        <span>Open a Discord support ticket</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}
                </div>
                <span className="mt-1 px-1 font-mono text-[9px] text-slate-500">
                  {m.sender === 'user' ? 'You' : 'Areex Support'}
                  {m.timestamp ? ` · ${m.timestamp} IST` : ''}
                </span>
              </div>
            ))}

            {typing && (
              <div className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#160b10] px-3 py-2 w-fit text-[11px] text-slate-400 font-mono">
                <Sparkles className="h-3.5 w-3.5 text-red-400 animate-pulse" />
                <span>Areex Support is typing…</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Doubt Pills */}
          <div className="border-t border-white/10 bg-[#0d0609] px-3 py-2">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {QUICK_DOUBTS.map((qText) => (
                <button
                  key={qText}
                  type="button"
                  onClick={() => void sendQuestion(qText)}
                  disabled={typing}
                  className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-medium text-slate-300 transition-colors hover:border-red-500/50 hover:bg-red-600/15 hover:text-white whitespace-nowrap disabled:opacity-40"
                >
                  {qText}
                </button>
              ))}
            </div>
          </div>

          {/* Input Bar + Discord Escalation Footer */}
          <form
            onSubmit={handleFormSubmit}
            className="border-t border-white/10 bg-[#12080d] p-3"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={600}
                placeholder="Ask in English, हिन्दी, বাংলা, தமிழ்…"
                aria-label="Type your question for Areex Cloud support"
                className="flex-1 rounded-xl border border-white/15 bg-[#090507] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-red-500 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Send question"
                disabled={typing || !input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white transition-colors hover:bg-red-500 disabled:opacity-40"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400">
              <span className="flex items-center gap-1">
                <ShieldAlert className="h-3 w-3 text-amber-400" />
                <span>Refunds & server incidents go to Discord:</span>
              </span>
              <a
                href={discordUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono font-semibold text-[#7289da] hover:underline whitespace-nowrap"
              >
                <span>Support ticket</span>
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            </div>
          </form>
        </div>
      )}
    </>
  );
};
