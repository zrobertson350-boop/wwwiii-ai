const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth, optionalAuth } = require('../lib/auth-middleware');

// List discussions
router.get('/', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { page = 1, limit = 20, category, sort = 'newest' } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('discussions')
      .select('id, title, content, user_id, category, pinned, upvotes, reply_count, created_at', { count: 'exact' });

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }

    if (sort === 'top') {
      query = query.order('upvotes', { ascending: false });
    } else {
      query = query.order('pinned', { ascending: false }).order('created_at', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);
    const { data, error, count } = await query;
    if (error) throw error;

    // Get author profiles
    if (data && data.length > 0) {
      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, tier')
        .in('id', userIds);
      const profileMap = {};
      profiles?.forEach(p => profileMap[p.id] = p);
      data.forEach(d => d.author = profileMap[d.user_id] || { display_name: 'Anonymous' });
    }

    res.json({ discussions: data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('List discussions error:', err.message);
    res.status(500).json({ error: 'Failed to fetch discussions' });
  }
});

// Get single discussion with replies
router.get('/:id', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const { data: discussion, error } = await supabase
      .from('discussions')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !discussion) return res.status(404).json({ error: 'Discussion not found' });

    // Get author
    const { data: author } = await supabase
      .from('profiles')
      .select('id, display_name, avatar_url, tier')
      .eq('id', discussion.user_id)
      .single();
    discussion.author = author || { display_name: 'Anonymous' };

    // Get replies
    const { data: replies } = await supabase
      .from('discussion_replies')
      .select('id, content, parent_id, upvotes, created_at, user_id')
      .eq('discussion_id', req.params.id)
      .order('created_at', { ascending: true });

    // Get reply author profiles
    if (replies && replies.length > 0) {
      const userIds = [...new Set(replies.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url, tier')
        .in('id', userIds);
      const profileMap = {};
      profiles?.forEach(p => profileMap[p.id] = p);
      replies.forEach(r => r.author = profileMap[r.user_id] || { display_name: 'Anonymous' });
    }

    res.json({ ...discussion, replies: replies || [] });
  } catch (err) {
    console.error('Get discussion error:', err.message);
    res.status(500).json({ error: 'Failed to fetch discussion' });
  }
});

// Create discussion
router.post('/', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { title, content, category } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

  const validCategories = ['general', 'architecture', 'governance', 'research'];
  const cat = validCategories.includes(category) ? category : 'general';

  try {
    const { data, error } = await supabase
      .from('discussions')
      .insert({
        title,
        content,
        category: cat,
        user_id: req.user.id,
        upvotes: 0,
        reply_count: 0,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Create discussion error:', err.message);
    res.status(500).json({ error: 'Failed to create discussion' });
  }
});

// Add reply
router.post('/:id/replies', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { content, parent_id } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Reply content required' });

  try {
    const { data, error } = await supabase
      .from('discussion_replies')
      .insert({
        discussion_id: req.params.id,
        user_id: req.user.id,
        content: content.trim(),
        parent_id: parent_id || null,
        upvotes: 0,
      })
      .select()
      .single();

    if (error) throw error;

    // Increment reply count
    await supabase.rpc('increment_reply_count', { discussion_id_param: req.params.id }).catch(() => {
      // If RPC doesn't exist, do manual update
      supabase.from('discussions').update({ reply_count: supabase.raw('reply_count + 1') }).eq('id', req.params.id);
    });

    res.status(201).json(data);
  } catch (err) {
    console.error('Add reply error:', err.message);
    res.status(500).json({ error: 'Failed to add reply' });
  }
});

// Upvote discussion or reply
router.post('/upvote', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { target_type, target_id } = req.body;
  if (!target_type || !target_id) return res.status(400).json({ error: 'target_type and target_id required' });
  if (!['discussion', 'reply'].includes(target_type)) return res.status(400).json({ error: 'Invalid target_type' });

  try {
    // Check if already voted
    const { data: existing } = await supabase
      .from('upvotes')
      .select('user_id')
      .eq('user_id', req.user.id)
      .eq('target_type', target_type)
      .eq('target_id', target_id)
      .single();

    if (existing) {
      // Remove upvote
      await supabase
        .from('upvotes')
        .delete()
        .eq('user_id', req.user.id)
        .eq('target_type', target_type)
        .eq('target_id', target_id);

      const table = target_type === 'discussion' ? 'discussions' : 'discussion_replies';
      const { data: target } = await supabase.from(table).select('upvotes').eq('id', target_id).single();
      const newCount = Math.max(0, (target?.upvotes || 1) - 1);
      await supabase.from(table).update({ upvotes: newCount }).eq('id', target_id);

      return res.json({ voted: false, upvotes: newCount });
    }

    // Add upvote
    await supabase
      .from('upvotes')
      .insert({ user_id: req.user.id, target_type, target_id });

    const table = target_type === 'discussion' ? 'discussions' : 'discussion_replies';
    const { data: target } = await supabase.from(table).select('upvotes').eq('id', target_id).single();
    const newCount = (target?.upvotes || 0) + 1;
    await supabase.from(table).update({ upvotes: newCount }).eq('id', target_id);

    res.json({ voted: true, upvotes: newCount });
  } catch (err) {
    console.error('Upvote error:', err.message);
    res.status(500).json({ error: 'Failed to upvote' });
  }
});

module.exports = router;
