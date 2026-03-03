const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Stripe config endpoint
router.get('/stripe-config', (req, res) => {
  res.json({ publishableKey: process.env.STRIPE_PUBLISHABLE_KEY });
});

// Create Stripe Checkout Session
router.post('/create-checkout-session', async (req, res) => {
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
            description: 'Donation to fund the first publicly built large language model. Your contribution is recorded and will determine your pro rata allocation of $WWWIII tokens if and when the token launches.',
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

// Funding total
const BASE_FUNDED_USD = 25;

router.get('/funding-total', async (req, res) => {
  try {
    let totalCents = 0;
    let hasMore = true;
    let startingAfter = null;

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

// Seed donors
const SEED_DONORS = [
  { name: 'ZRR', amount: 25, timeAgo: 'Founder/CEO Donation', date: '2026-02-26T21:22:04.000Z' },
];

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

// Donor list
router.get('/donors', async (req, res) => {
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

        donors.push({ name: displayName, amount, timeAgo: timeAgo(created), date: created.toISOString() });
      }
    }

    donors.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(donors);
  } catch (err) {
    console.error('Donors error:', err.message);
    res.json(SEED_DONORS);
  }
});

// Check payment status
router.get('/checkout-session/:id', async (req, res) => {
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

module.exports = router;
