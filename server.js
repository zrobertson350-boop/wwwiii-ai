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
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'WWWIII — Fund the People\'s AI',
            description: `Donation of $${(cents / 100).toLocaleString()} to fund the first publicly built LLM. Tokens will be distributed to your wallet.`,
          },
          unit_amount: cents,
        },
        quantity: 1,
      }],
      metadata: {
        wallet_address: walletAddress || '',
        tokens_owed: String(Math.floor((cents / 100) * 500)),
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

// Funding total — aggregates Stripe payments
app.get('/api/funding-total', async (req, res) => {
  try {
    // Sum all successful Stripe payments
    let totalCents = 0;
    let hasMore = true;
    let startingAfter = null;

    while (hasMore) {
      const params = { limit: 100, status: 'complete' };
      if (startingAfter) params.starting_after = startingAfter;

      const sessions = await stripe.checkout.sessions.list(params);
      for (const s of sessions.data) {
        if (s.payment_status === 'paid') {
          totalCents += s.amount_total || 0;
        }
      }
      hasMore = sessions.has_more;
      if (sessions.data.length > 0) {
        startingAfter = sessions.data[sessions.data.length - 1].id;
      } else {
        hasMore = false;
      }
    }

    const totalUSD = totalCents / 100;

    // TODO: Also add ETH presale value by reading contract totalRaised and converting via price API

    res.json({ totalUSD, stripeUSD: totalUSD });
  } catch (err) {
    console.error('Funding total error:', err.message);
    res.json({ totalUSD: 0, stripeUSD: 0 });
  }
});

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
