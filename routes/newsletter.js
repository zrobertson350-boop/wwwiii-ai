const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');

router.post('/subscribe', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });

  const { email, source } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    // Upsert to avoid duplicates
    const { data, error } = await supabase
      .from('newsletter_subscribers')
      .upsert(
        { email: email.toLowerCase(), source: source || 'website', user_id: req.user?.id || null },
        { onConflict: 'email' }
      )
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, message: 'Subscribed successfully' });
  } catch (err) {
    console.error('Newsletter error:', err.message);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

module.exports = router;
