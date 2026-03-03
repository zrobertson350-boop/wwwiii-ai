const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth-middleware');

// Get token balance for address (on-chain lookup placeholder)
router.get('/balance/:address', async (req, res) => {
  // In production, this would query the blockchain
  // For now, return database balance
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { data } = await supabase
      .from('profiles')
      .select('token_balance, wallet_address')
      .eq('wallet_address', req.params.address.toLowerCase())
      .single();
    res.json({ address: req.params.address, balance: data?.token_balance || 0 });
  } catch (err) {
    res.json({ address: req.params.address, balance: 0 });
  }
});

// Get claimable token rewards
router.get('/claims', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { data, error } = await supabase
      .from('token_claims')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

// Claim tokens
router.post('/claim/:id', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { data: claim, error } = await supabase
      .from('token_claims')
      .select('*')
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .eq('status', 'pending')
      .single();

    if (error || !claim) return res.status(404).json({ error: 'Claim not found or already processed' });

    const { tx_hash } = req.body;

    // Update claim status
    await supabase
      .from('token_claims')
      .update({ status: 'claimed', tx_hash: tx_hash || null })
      .eq('id', claim.id);

    // Update user token balance
    const { data: profile } = await supabase.from('profiles').select('token_balance').eq('id', req.user.id).single();
    await supabase
      .from('profiles')
      .update({ token_balance: (profile?.token_balance || 0) + claim.amount })
      .eq('id', req.user.id);

    res.json({ success: true, amount: claim.amount });
  } catch (err) {
    console.error('Claim error:', err.message);
    res.status(500).json({ error: 'Failed to claim tokens' });
  }
});

module.exports = router;
