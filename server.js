require('dotenv').config();
const express = require('express');
const path = require('path');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Stripe config endpoint — serves publishable key to frontend
app.get('/api/stripe-config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// Create Stripe Checkout Session
app.post('/api/create-checkout-session', async (req, res) => {
  try {
    const { amount, walletAddress } = req.body;
    const cents = Math.round(Number(amount) * 100);

    if (!cents || cents < 500) {
      return res.status(400).json({ error: 'Minimum donation is $5' });
    }

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'WWWIII — AI Development Fund',
            description: `Donation to fund the first publicly built large language model. Your contribution is recorded and will determine your pro rata allocation of $WWWIII tokens if and when the token launches.`,
          },
          unit_amount: cents,
        },
        quantity: 1,
      }],
      billing_address_collection: 'auto',
      metadata: {
        wallet_address: walletAddress || '',
        pro_rata_pct: String((cents / 100 / 1000000000 * 100).toFixed(10)),
      },
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/#fund`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Funding total — aggregates all donations
// Base amount covers any donations tracked before Stripe (or manual additions)
const BASE_FUNDED_USD = 0; // All donations tracked via Stripe

app.get('/api/funding-total', async (req, res) => {
  try {
    // Sum all successful Stripe payments (non-refunded)
    let totalCents = 0;
    let hasMore = true;
    let startingAfter = null;

    // Sum charges minus refunds for accurate total
    while (hasMore) {
      const params = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;

      const charges = await stripe.charges.list(params);
      for (const c of charges.data) {
        if (c.status === 'succeeded') {
          totalCents += (c.amount - c.amount_refunded);
        }
      }
      hasMore = charges.has_more;
      if (charges.data.length > 0) {
        startingAfter = charges.data[charges.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    const stripeUSD = totalCents / 100;
    const totalUSD = stripeUSD + BASE_FUNDED_USD;

    res.json({ totalUSD, stripeUSD, baseUSD: BASE_FUNDED_USD });
  } catch (err) {
    console.error('Funding total error:', err.message);
    res.json({ totalUSD: BASE_FUNDED_USD, stripeUSD: 0, baseUSD: BASE_FUNDED_USD });
  }
});

// Seed donors (before Stripe tracking)
const SEED_DONORS = [
  { name: 'ZRR', amount: 25, timeAgo: 'Founder/CEO Donation', date: '2026-02-26T21:22:04.000Z' },
];

// Donor list — recent successful donations
app.get('/api/donors', async (req, res) => {
  try {
    const sessions = await stripe.checkout.sessions.list({
      limit: 20,
      status: 'complete',
      expand: ['data.payment_intent'],
    });

    const donors = [...SEED_DONORS];
    for (const s of sessions.data) {
      const pi = s.payment_intent;
      if (pi && pi.status === 'succeeded' && pi.amount_received > (pi.amount_refunded || 0)) {
        const netCents = pi.amount_received - (pi.amount_refunded || 0);
        const amount = netCents / 100;
        const created = new Date(s.created * 1000);

        // Skip Stripe entries that duplicate a seed donor (same amount, within 24h)
        const isDupe = SEED_DONORS.some(sd =>
          Math.abs(amount - sd.amount) < 1 &&
          Math.abs(created.getTime() - new Date(sd.date).getTime()) < 86400000
        );
        if (isDupe) continue;

        const rawName = (s.customer_details?.name || '').trim();
        let displayName = 'Anonymous';
        if (rawName.length > 1) {
          const parts = rawName.split(' ');
          displayName = parts.length > 1
            ? parts[0] + ' ' + parts[parts.length - 1][0] + '.'
            : parts[0];
        }

        const ago = timeAgo(created);
        donors.push({ name: displayName, amount, timeAgo: ago, date: created.toISOString() });
      }
    }

    // Sort by date descending
    donors.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(donors);
  } catch (err) {
    console.error('Donors error:', err.message);
    res.json(SEED_DONORS);
  }
});

function timeAgo(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + 'm ago';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  const days = Math.floor(hours / 24);
  if (days < 30) return days + 'd ago';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Check payment status
app.get('/api/checkout-session/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    res.json({
      status: session.payment_status,
      amount: session.amount_total / 100,
      tokens: session.metadata.tokens_owed,
      wallet: session.metadata.wallet_address,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// WWWIII AI Chat — live demo
const WWWIII_SYSTEM = `You are WWWIII AI — an early preview of the first publicly funded large language model. You are being built by the people, for the people. Your mission is to become the world's first open, publicly governed AGI-class model.

Key facts about the WWWIII project:
- Token: $WWWIII (ERC-20 on Ethereum)
- Total supply: 1 billion tokens
- Goal: Raise $1 billion to fund AGI research and development
- Model target: 70B+ parameters initially, scaling toward AGI
- License: Apache 2.0 — fully open weights, open training, open code
- Governance: Token holders vote on architecture, training data, compute allocation
- 1.5% of all donations go to carbon reduction and climate initiatives
- 40% of tokens allocated to development fund (compute, research, infrastructure)
- The project is in Phase 1 — Foundation (token launch, community building)
- Website: wwwiii.ai

You are direct, thoughtful, and passionate about open AI development. You believe AI should be built transparently and governed by the public, not corporations. You see WWWIII as the path toward democratized AGI — artificial general intelligence built in the open, by everyone.

Keep responses concise (2-4 sentences). Be conversational, not robotic.`;

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      // Real LLM via Groq (free tier — Llama 3.3 70B)
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: WWWIII_SYSTEM },
            { role: 'user', content: message.slice(0, 500) },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'I encountered an issue. Try again.';
      return res.json({ reply });
    }

    // Demo mode — no API key
    const q = message.toLowerCase();
    let reply;
    if (q.includes('agi') || q.includes('general intelligence')) {
      reply = "AGI is the endgame — and we believe it should be built in public, not behind corporate doors. WWWIII is designed to scale from 70B parameters toward AGI-class capability, with every architectural decision voted on by the community. The path to AGI should be transparent, governed by the people who fund it.";
    } else if (q.includes('who') && (q.includes('you') || q.includes('are'))) {
      reply = "I'm WWWIII AI — an early preview of what we're building. The first publicly funded, publicly governed large language model. Right now I'm a demo, but with enough funding, I'll become the real thing. Open weights, open training, built by everyone.";
    } else if (q.includes('token') || q.includes('wwwiii') || q.includes('coin')) {
      reply = "$WWWIII is an ERC-20 token on Ethereum with a fixed supply of 1 billion. It's not a meme coin — it's a coordination mechanism. Holders govern the AI's development: architecture, training data, compute allocation. Your tokens are your vote.";
    } else if (q.includes('fund') || q.includes('donat') || q.includes('money') || q.includes('invest')) {
      reply = "Every dollar goes directly to compute, researchers, and infrastructure. We're targeting $1B to train a frontier model that rivals GPT and Claude — except ours will be fully open. 1.5% also goes to climate initiatives because building AGI responsibly means building sustainably.";
    } else if (q.includes('open') || q.includes('source') || q.includes('weight')) {
      reply = "Fully open. Apache 2.0 license. Open weights, open training code, open data pipeline. Every training run logged publicly, every loss curve visible in real time. No black boxes, no corporate gatekeeping. This is what AI development should look like.";
    } else if (q.includes('how') && (q.includes('work') || q.includes('help') || q.includes('contribut'))) {
      reply = "Fund the build through $WWWIII tokens or direct donation. Hold tokens to vote on architecture and training decisions. If you're a researcher or engineer, contribute code and earn tokens. This is a collective effort — the more people involved, the better the model.";
    } else if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('sup')) {
      reply = "Hey. I'm WWWIII AI — the People's Model. Still early days, but we're building something that matters. What do you want to know about the project?";
    } else if (q.includes('train') || q.includes('model') || q.includes('parameter') || q.includes('architec')) {
      reply = "We're targeting 70B+ parameters on the initial release, built on a transformer architecture with community-voted design decisions. Training will use a curated open dataset — CommonCrawl, Wikipedia, ArXiv, and more. All checkpoints released publicly. The goal is to scale toward AGI-class capability.";
    } else if (q.includes('different') || q.includes('better') || q.includes('why') || q.includes('point')) {
      reply = "Every frontier model today is built by corporations, for corporations. GPT, Claude, Gemini — you use them but you'll never own them. WWWIII flips that. Publicly funded, publicly governed, fully open. The most powerful technology in history should belong to everyone building it.";
    } else {
      reply = "Good question. WWWIII is building the first publicly funded path to AGI — open weights, open governance, built by the people. We're in Phase 1 right now, raising funds and building the community. Everything we do is transparent and on-chain. Ask me about the token, the model architecture, or how to contribute.";
    }
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ reply: 'Something went wrong. Try again.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`wwwiii.ai running on :${PORT}`));
