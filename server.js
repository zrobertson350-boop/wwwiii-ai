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
const BASE_FUNDED_USD = 0; // Tracks from Stripe only

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

// Donor list — recent successful donations
app.get('/api/donors', async (req, res) => {
  try {
    const sessions = await stripe.checkout.sessions.list({
      limit: 20,
      status: 'complete',
      expand: ['data.payment_intent'],
    });

    const donors = [];
    for (const s of sessions.data) {
      // Skip refunded payments
      const pi = s.payment_intent;
      if (pi && pi.status === 'succeeded' && pi.amount_received > pi.amount_refunded) {
        const netCents = pi.amount_received - (pi.amount_refunded || 0);
        const name = s.customer_details?.name || 'Anonymous';
        // Show first name + last initial for privacy
        const parts = name.trim().split(' ');
        const displayName = parts.length > 1
          ? parts[0] + ' ' + parts[parts.length - 1][0] + '.'
          : parts[0];

        const created = new Date(s.created * 1000);
        const ago = timeAgo(created);

        donors.push({
          name: displayName,
          amount: netCents / 100,
          timeAgo: ago,
          date: created.toISOString(),
        });
      }
    }

    res.json(donors);
  } catch (err) {
    console.error('Donors error:', err.message);
    res.json([]);
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

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`wwwiii.ai running on :${PORT}`));
