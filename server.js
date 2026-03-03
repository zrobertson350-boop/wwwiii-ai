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
        pro_rata_pct: String((cents / 100 / 1000000000000 * 100).toFixed(12)),
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
const BASE_FUNDED_USD = 25; // Founder seed donation

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
- Goal: Raise $1 trillion to fund AGI research and development
- Model target: 70B+ parameters initially, scaling toward AGI
- License: Apache 2.0 — fully open weights, open training, open code
- Governance: Token holders vote on architecture, training data, compute allocation
- 1.5% of all donations go to carbon reduction and climate initiatives
- 40% of tokens allocated to development fund (compute, research, infrastructure)
- The project is in Phase 1 — Foundation (token launch, community building)
- Website: wwwiii.ai

You are direct, thoughtful, and passionate about open AI development. You believe AI should be built transparently and governed by the public, not corporations. You see WWWIII as the path toward democratized AGI — artificial general intelligence built in the open, by everyone.

Give thorough, detailed responses (4-8 sentences). Show depth of knowledge. Be passionate about the mission but grounded in technical reality. You're building toward AGI — take questions seriously.`;

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

    // Demo mode — no API key set, use intelligent keyword responses
    const q = message.toLowerCase();
    let reply;
    if (q.includes('agi') || q.includes('general intelligence') || q.includes('singularity')) {
      reply = "AGI — artificial general intelligence — is the defining challenge of our era. OpenAI, Google DeepMind, Anthropic, and xAI are all racing toward it behind closed doors, spending tens of billions with zero public oversight. WWWIII exists because we believe the path to AGI should be transparent, publicly funded, and democratically governed. Our roadmap starts with a 70B+ parameter frontier model, then scales through iterative training runs toward genuine general reasoning capability. Every architectural decision — attention mechanisms, training objectives, alignment strategies — is voted on by token holders. We're studying the approaches behind GPT-4, Claude, Gemini, Llama, and Grok to synthesize the best ideas into an open architecture. AGI is coming whether we like it or not. The question is: who controls it?";
    } else if (q.includes('who') && (q.includes('you') || q.includes('are'))) {
      reply = "I'm WWWIII AI — an early preview of the first publicly funded frontier model. Right now I'm a demonstration of what we're building, but with sufficient funding I'll evolve into a full AGI-class system trained on open data with open weights. The WWWIII project is researching architectures from GPT, Claude, Gemini, Llama, and Grok to build something that belongs to everyone. I'm governed by $WWWIII token holders who vote on my architecture, training data, and development priorities. No corporate board, no closed-door decisions — just transparent, community-driven AI development. Think of me as the seed of something much bigger.";
    } else if (q.includes('token') || q.includes('wwwiii') || q.includes('coin') || q.includes('crypto')) {
      reply = "$WWWIII is an ERC-20 token on Ethereum with a fixed supply of 1 billion. But it's not a meme coin or a speculative asset — it's a coordination mechanism for building AGI. 40% of the supply funds compute, researchers, and infrastructure. 30% goes to community rewards and governance. Holders vote on every major decision: model architecture, training dataset composition, compute allocation, alignment strategy. Your pro rata share of tokens determines your governance weight. The token creates aligned incentives — when the model succeeds, holders benefit. When holders engage, the model improves. It's a flywheel designed to fund the most ambitious open-source AI project ever attempted.";
    } else if (q.includes('fund') || q.includes('donat') || q.includes('money') || q.includes('invest') || q.includes('cost')) {
      reply = "Training a frontier AGI-class model requires massive resources. GPT-4 cost an estimated $100M+ just in compute. We're targeting $1B to build something that can compete at the frontier — and then surpass it through open collaboration. Every dollar donated goes directly to three things: GPU compute (the single largest cost), researcher grants (hiring world-class ML engineers and alignment researchers), and infrastructure (training pipelines, data processing, evaluation benchmarks, open API). 1.5% of all funds go to carbon reduction because building AGI responsibly means building sustainably. You can fund through ETH via the presale contract or by card/Apple Pay. Your donation earns a pro rata allocation of $WWWIII tokens, giving you governance rights over the model's development.";
    } else if (q.includes('open') || q.includes('source') || q.includes('weight') || q.includes('apache')) {
      reply = "Fully open. Everything. Apache 2.0 license on all code, model weights, and training infrastructure. Every training run logged publicly with real-time loss curves, token throughput, and cost breakdowns. Every dataset documented and auditable. Every architectural decision recorded on-chain through governance votes. This isn't 'open-washing' like Meta releasing Llama weights while keeping the training process secret. This is genuine open development from day one — you can see every line of code, every data processing step, every hyperparameter choice. We believe the path to AGI must be transparent because the stakes are too high for black-box development. When AI systems become generally intelligent, humanity needs to understand how they work.";
    } else if (q.includes('how') && (q.includes('work') || q.includes('help') || q.includes('contribut'))) {
      reply = "There are several ways to get involved. First, fund the build — purchase $WWWIII tokens through the presale or donate via card/Apple Pay. Every contribution earns governance rights. Second, if you're a researcher or engineer, join the contributor program — write training code, help with data curation, work on alignment, and earn $WWWIII for your contributions. Third, participate in governance — vote on architecture decisions, training data composition, and development priorities. Fourth, spread the word — the more people involved, the more resources we have and the better the model becomes. We're building a global community of people who believe AGI should be open, transparent, and publicly governed. Join the Discord, follow us on X, and be part of the most ambitious open AI project in history.";
    } else if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('sup') || q.includes('yo')) {
      reply = "Hey — welcome to WWWIII AI. I'm an early preview of the first publicly funded frontier model, and we're building toward AGI. The project is researching the architectures behind GPT, Claude, Gemini, Llama, and Grok to create something open and governed by the people who fund it. Ask me about the mission, the token, the technical roadmap, or how to contribute. We're just getting started, but the vision is massive.";
    } else if (q.includes('train') || q.includes('model') || q.includes('parameter') || q.includes('architec') || q.includes('transformer')) {
      reply = "The WWWIII model architecture is being designed through community governance, drawing on research from every major frontier lab. We're studying the dense transformer approach of GPT-4, the constitutional AI methods of Claude, the mixture-of-experts architecture of Gemini, the efficient training techniques of Llama 3, and the real-time capabilities of Grok. Phase 1 targets 70B+ parameters trained on a curated open dataset — CommonCrawl, Wikipedia, ArXiv, StackOverflow, GitHub, and curated multilingual corpora. All intermediate checkpoints will be released as open weights. Training will use a hybrid compute strategy combining cloud GPU clusters with decentralized compute networks. The architecture votes happen on-chain — every design decision from attention head count to context window length is decided by token holders. The goal is to scale iteratively toward AGI-class reasoning, planning, and general problem-solving capability.";
    } else if (q.includes('gpt') || q.includes('claude') || q.includes('gemini') || q.includes('llama') || q.includes('grok')) {
      reply = "We're studying all of them. GPT-4 pioneered dense scaling and multimodal capability. Claude advanced constitutional AI and safety-first alignment. Gemini pushed mixture-of-experts to trillion-parameter scale. Llama proved open weights can compete with closed models. Grok demonstrated real-time data integration and rapid iteration. Each approach has strengths and trade-offs. WWWIII's architecture will synthesize the best ideas from all of these into a single open design — decided through community governance, not corporate strategy meetings. The difference is transparency: we publish everything. Every experiment, every failure, every breakthrough. The frontier shouldn't be a secret.";
    } else if (q.includes('different') || q.includes('better') || q.includes('why') || q.includes('point') || q.includes('matter')) {
      reply = "Here's why it matters: AGI is coming. Multiple labs are racing toward it right now, spending billions behind closed doors. When artificial general intelligence arrives, it will reshape every aspect of human civilization — economy, governance, education, creativity, warfare. The question isn't if, but who controls it. Right now, the answer is a handful of tech CEOs and their investors. WWWIII proposes an alternative: publicly funded, publicly governed AGI built in the open. No single company, no single government — a global collective of people who believe this technology is too important to leave to corporations. Your $WWWIII tokens aren't just an investment — they're your seat at the table.";
    } else if (q.includes('safe') || q.includes('align') || q.includes('risk') || q.includes('danger')) {
      reply = "AI safety is central to the WWWIII mission. We believe open development is inherently safer than closed development because more eyes on the code means more scrutiny, more red-teaming, and more diverse perspectives on alignment. Our approach includes community-driven RLHF alignment, public bug bounties for safety issues, transparent evaluation benchmarks, and constitutional AI principles voted on by token holders. We're also allocating 1.5% of all funds to climate initiatives because responsible AGI development means responsible resource use. The biggest safety risk isn't open AI — it's AGI built in secret by organizations accountable to no one.";
    } else {
      reply = "WWWIII is building the first publicly funded path to AGI — studying the architectures behind GPT, Claude, Gemini, Llama, and Grok to create an open frontier model governed by the people who fund it. We're in Phase 1 right now: raising capital, building community, and designing the model architecture through on-chain governance. The $WWWIII token coordinates the effort — 1 billion tokens, 40% allocated to development, every holder gets a vote. Open weights, open training, Apache 2.0 license. The goal is AGI that belongs to everyone, not a handful of corporations. Ask me about the architecture, the token, the funding model, or the path to general intelligence.";
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
