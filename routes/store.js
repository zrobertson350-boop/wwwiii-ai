const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { requireAuth } = require('../lib/auth-middleware');
const crypto = require('crypto');

// List products
router.get('/products', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { type } = req.query;
    let query = supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false });
    if (type) query = query.eq('type', type);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// Get single product
router.get('/products/:slug', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { data, error } = await supabase.from('products').select('*').eq('slug', req.params.slug).eq('is_active', true).single();
    if (error || !data) return res.status(404).json({ error: 'Product not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Checkout with Stripe
router.post('/checkout', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  const { product_id } = req.body;
  try {
    const { data: product } = await supabase.from('products').select('*').eq('id', product_id).eq('is_active', true).single();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const downloadToken = crypto.randomBytes(32).toString('hex');
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link'],
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: product.name, description: product.description?.slice(0, 500) },
          unit_amount: Math.round(product.price_usd * 100),
        },
        quantity: 1,
      }],
      metadata: { product_id: product.id, user_id: req.user.id, download_token: downloadToken },
      success_url: `${baseUrl}/dashboard.html?purchased=${product.slug}`,
      cancel_url: `${baseUrl}/product.html?slug=${product.slug}`,
    });

    // Create pending order
    await supabase.from('orders').insert({
      user_id: req.user.id,
      product_id: product.id,
      payment_method: 'stripe',
      payment_id: session.id,
      amount_usd: product.price_usd,
      status: 'pending',
      download_token: downloadToken,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Store checkout error:', err.message);
    res.status(500).json({ error: 'Checkout failed' });
  }
});

// Download purchased product
router.get('/download/:token', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('*, products(*)')
      .eq('download_token', req.params.token)
      .eq('status', 'completed')
      .single();

    if (!order || !order.products?.file_url) return res.status(404).json({ error: 'Download not found' });
    res.redirect(order.products.file_url);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

module.exports = router;
