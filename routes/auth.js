const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth-middleware');

// Link wallet address to profile
router.post('/link-wallet', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { wallet_address } = req.body;
  if (!wallet_address || !/^0x[a-fA-F0-9]{40}$/.test(wallet_address)) {
    return res.status(400).json({ error: 'Invalid Ethereum address' });
  }

  try {
    // Check if wallet already linked to another account
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('wallet_address', wallet_address.toLowerCase())
      .neq('id', req.user.id)
      .single();

    if (existing) {
      return res.status(409).json({ error: 'Wallet already linked to another account' });
    }

    const { data, error } = await supabase
      .from('profiles')
      .update({ wallet_address: wallet_address.toLowerCase() })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Link wallet error:', err.message);
    res.status(500).json({ error: 'Failed to link wallet' });
  }
});

// Get current user profile
router.get('/profile', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error && error.code === 'PGRST116') {
      // Profile doesn't exist yet — create it
      const { data: newProfile, error: createErr } = await supabase
        .from('profiles')
        .insert({
          id: req.user.id,
          email: req.user.email,
          display_name: req.user.email?.split('@')[0] || 'Anonymous',
          role: 'member',
          tier: 'none',
          token_balance: 0,
        })
        .select()
        .single();

      if (createErr) throw createErr;
      return res.json(newProfile);
    }

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Profile error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Update profile
router.patch('/profile', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const allowed = ['display_name', 'avatar_url', 'bio'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }

  try {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
