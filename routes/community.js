const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth } = require('../lib/auth-middleware');

// List members
router.get('/members', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const { data, error, count } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, bio, tier, joined_at', { count: 'exact' })
      .order('joined_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    res.json({ members: data, total: count });
  } catch (err) {
    console.error('Members error:', err.message);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// Leaderboard
router.get('/leaderboard', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const { data, error } = await supabase
      .from('contributor_leaderboard')
      .select('*')
      .limit(50);

    if (error) {
      // View might not exist yet, fall back to profiles
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, tier, token_balance')
        .order('token_balance', { ascending: false })
        .limit(50);
      if (pErr) throw pErr;
      return res.json(profiles);
    }
    res.json(data);
  } catch (err) {
    console.error('Leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// Submit contribution
router.post('/contributions', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { type, title, description, proof_url } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'Type and title required' });

  const validTypes = ['code', 'data', 'research', 'documentation', 'community', 'other'];
  if (!validTypes.includes(type)) return res.status(400).json({ error: 'Invalid contribution type' });

  try {
    const { data, error } = await supabase
      .from('contributions')
      .insert({
        user_id: req.user.id,
        type,
        title,
        description: description || '',
        proof_url: proof_url || null,
        status: 'pending',
        tokens_awarded: 0,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Contribution error:', err.message);
    res.status(500).json({ error: 'Failed to submit contribution' });
  }
});

// Get public profile
router.get('/profile/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, bio, tier, token_balance, joined_at')
      .eq('id', req.params.id)
      .single();

    if (error || !profile) return res.status(404).json({ error: 'Profile not found' });

    // Get their contributions
    const { data: contributions } = await supabase
      .from('contributions')
      .select('id, type, title, status, tokens_awarded, created_at')
      .eq('user_id', req.params.id)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(20);

    // Get their discussion count
    const { count: discussionCount } = await supabase
      .from('discussions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', req.params.id);

    res.json({ ...profile, contributions: contributions || [], discussion_count: discussionCount || 0 });
  } catch (err) {
    console.error('Profile error:', err.message);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;
