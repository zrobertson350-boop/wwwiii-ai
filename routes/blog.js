const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth, optionalAuth, requireAdmin } = require('../lib/auth-middleware');

// List posts
router.get('/', optionalAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { page = 1, limit = 12, tag } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('posts')
      .select('id, slug, title, excerpt, cover_image_url, author_id, status, is_token_gated, min_tier, tags, published_at', { count: 'exact' })
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (tag) {
      query = query.contains('tags', [tag]);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ posts: data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    console.error('List posts error:', err.message);
    res.status(500).json({ error: 'Failed to fetch posts' });
  }
});

// Get single post by slug
router.get('/:slug', optionalAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  try {
    const { data: post, error } = await supabase
      .from('posts')
      .select('*')
      .eq('slug', req.params.slug)
      .eq('status', 'published')
      .single();

    if (error || !post) return res.status(404).json({ error: 'Post not found' });

    // Check token gating
    if (post.is_token_gated && req.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tier')
        .eq('id', req.user.id)
        .single();

      const tiers = ['none', 'supporter', 'builder', 'architect', 'genesis'];
      const userTierIdx = tiers.indexOf(profile?.tier || 'none');
      const requiredIdx = tiers.indexOf(post.min_tier || 'supporter');
      if (userTierIdx < requiredIdx) {
        return res.json({ ...post, content: null, gated: true });
      }
    } else if (post.is_token_gated && !req.user) {
      return res.json({ ...post, content: null, gated: true });
    }

    // Get author info
    const { data: author } = await supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', post.author_id)
      .single();

    // Get comments
    const { data: comments } = await supabase
      .from('post_comments')
      .select('id, content, parent_id, created_at, user_id')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true });

    // Get commenter profiles
    if (comments && comments.length > 0) {
      const userIds = [...new Set(comments.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, display_name, avatar_url')
        .in('id', userIds);
      const profileMap = {};
      profiles?.forEach(p => profileMap[p.id] = p);
      comments.forEach(c => c.author = profileMap[c.user_id] || { display_name: 'Anonymous' });
    }

    res.json({ ...post, author, comments: comments || [] });
  } catch (err) {
    console.error('Get post error:', err.message);
    res.status(500).json({ error: 'Failed to fetch post' });
  }
});

// Create post (admin only)
router.post('/', requireAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { title, slug, excerpt, content, cover_image_url, is_token_gated, min_tier, tags, status } = req.body;
  if (!title || !content) return res.status(400).json({ error: 'Title and content required' });

  const postSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  try {
    const { data, error } = await supabase
      .from('posts')
      .insert({
        slug: postSlug,
        title,
        excerpt: excerpt || content.slice(0, 200),
        content,
        cover_image_url,
        author_id: req.user.id,
        status: status || 'draft',
        is_token_gated: is_token_gated || false,
        min_tier: min_tier || 'supporter',
        tags: tags || [],
        published_at: status === 'published' ? new Date().toISOString() : null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Create post error:', err.message);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// Update post (admin only)
router.patch('/:id', requireAdmin, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const updates = {};
  const allowed = ['title', 'slug', 'excerpt', 'content', 'cover_image_url', 'is_token_gated', 'min_tier', 'tags', 'status'];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.status === 'published') {
    updates.published_at = new Date().toISOString();
  }

  try {
    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Update post error:', err.message);
    res.status(500).json({ error: 'Failed to update post' });
  }
});

// Add comment
router.post('/:id/comments', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { content, parent_id } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ error: 'Comment content required' });

  try {
    const { data, error } = await supabase
      .from('post_comments')
      .insert({
        post_id: req.params.id,
        user_id: req.user.id,
        content: content.trim(),
        parent_id: parent_id || null,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('Add comment error:', err.message);
    res.status(500).json({ error: 'Failed to add comment' });
  }
});

module.exports = router;
