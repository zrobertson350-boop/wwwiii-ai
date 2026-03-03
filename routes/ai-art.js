const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth, optionalAuth } = require('../lib/auth-middleware');

const STYLES = ['cyberpunk', 'abstract', 'photorealistic', 'anime', 'oil-painting', 'digital-art', 'vaporwave', 'surreal'];

// Generate art via Groq prompt enhancement + Pollinations.ai
router.post('/generate', requireAuth, async (req, res) => {
  const { prompt, style } = req.body;
  if (!prompt || !prompt.trim()) return res.status(400).json({ error: 'Prompt required' });

  const selectedStyle = STYLES.includes(style) ? style : 'digital-art';

  try {
    // Use Groq to enhance the prompt
    let enhancedPrompt = `${prompt}, ${selectedStyle} style, highly detailed, WWWIII AI generated`;
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      try {
        const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'llama-3.3-70b-versatile',
            messages: [{
              role: 'system',
              content: 'You are an expert image prompt engineer. Given a user prompt and style, create a detailed, vivid image generation prompt. Output ONLY the enhanced prompt, nothing else. Keep it under 200 words.'
            }, {
              role: 'user',
              content: `Style: ${selectedStyle}\nPrompt: ${prompt}`
            }],
            max_tokens: 200,
            temperature: 0.8,
          }),
        });
        const groqData = await groqRes.json();
        if (groqData.choices?.[0]?.message?.content) {
          enhancedPrompt = groqData.choices[0].message.content;
        }
      } catch {}
    }

    // Generate via Pollinations.ai (free, no key needed)
    const encodedPrompt = encodeURIComponent(enhancedPrompt);
    const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=1024&height=1024&nologo=true`;

    // Save to database
    let artwork = null;
    if (supabase) {
      const { data } = await supabase
        .from('ai_artworks')
        .insert({
          user_id: req.user.id,
          prompt: prompt.trim(),
          image_url: imageUrl,
          is_public: true,
          style: selectedStyle,
        })
        .select()
        .single();
      artwork = data;
    }

    res.json({ image_url: imageUrl, enhanced_prompt: enhancedPrompt, artwork });
  } catch (err) {
    console.error('Art generation error:', err.message);
    res.status(500).json({ error: 'Failed to generate art' });
  }
});

// Gallery of community art
router.get('/gallery', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  const { page = 1, limit = 24, style } = req.query;
  const offset = (page - 1) * limit;
  try {
    let query = supabase
      .from('ai_artworks')
      .select('id, prompt, image_url, style, created_at, user_id', { count: 'exact' })
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (style && STYLES.includes(style)) query = query.eq('style', style);
    const { data, error, count } = await query;
    if (error) throw error;

    // Get creator names
    if (data?.length > 0) {
      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', userIds);
      const map = {};
      profiles?.forEach(p => map[p.id] = p.display_name);
      data.forEach(d => d.creator = map[d.user_id] || 'Anonymous');
    }

    res.json({ artworks: data, total: count, page: Number(page) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

module.exports = router;
