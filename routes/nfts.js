const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth-middleware');

// List NFTs
router.get('/', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { tier } = req.query;
    let query = supabase.from('nfts').select('*').order('created_at', { ascending: false });
    if (tier) query = query.eq('tier', tier);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch NFTs' });
  }
});

// Mint NFT (record in DB — actual minting happens client-side via contract)
router.post('/mint', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  const { token_id, contract_address, tier, metadata_uri, image_url, tx_hash } = req.body;

  try {
    // Get user wallet
    const { data: profile } = await supabase.from('profiles').select('wallet_address').eq('id', req.user.id).single();
    if (!profile?.wallet_address) return res.status(400).json({ error: 'Wallet not linked' });

    const { data, error } = await supabase
      .from('nfts')
      .insert({
        token_id,
        contract_address,
        owner_address: profile.wallet_address,
        tier: tier || 'supporter',
        metadata_uri,
        image_url,
        user_id: req.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Mint error:', err.message);
    res.status(500).json({ error: 'Failed to record NFT' });
  }
});

// NFT metadata endpoint (for on-chain tokenURI)
router.get('/metadata/:tokenId', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { data, error } = await supabase.from('nfts').select('*').eq('token_id', req.params.tokenId).single();
    if (error || !data) return res.status(404).json({ error: 'NFT not found' });

    const tierColors = { supporter: '#6c5ce7', builder: '#a29bfe', architect: '#f0c040', genesis: '#ff3838' };
    res.json({
      name: `WWWIII ${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)} #${data.token_id}`,
      description: `WWWIII membership NFT — ${data.tier} tier`,
      image: data.image_url || `https://image.pollinations.ai/prompt/WWWIII+${data.tier}+membership+badge+cyberpunk+digital+art?width=512&height=512&nologo=true`,
      attributes: [
        { trait_type: 'Tier', value: data.tier },
        { trait_type: 'Member Since', value: data.created_at },
      ],
      background_color: tierColors[data.tier] || '#6c5ce7',
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch metadata' });
  }
});

module.exports = router;
