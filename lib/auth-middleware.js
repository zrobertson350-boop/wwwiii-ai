const { createClient } = require('@supabase/supabase-js');

// Create a lightweight client for JWT verification
let verifyClient = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
  verifyClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
}

// Middleware: require authenticated user
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  if (!verifyClient) return res.status(503).json({ error: 'Auth service unavailable' });

  try {
    const { data: { user }, error } = await verifyClient.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// Middleware: optionally attach user (non-blocking)
async function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token && verifyClient) {
    try {
      const { data: { user } } = await verifyClient.auth.getUser(token);
      if (user) req.user = user;
    } catch {}
  }
  next();
}

// Middleware: require admin role
async function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  if (!verifyClient) return res.status(503).json({ error: 'Auth service unavailable' });

  try {
    const { data: { user }, error } = await verifyClient.auth.getUser(token);
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    req.user = user;

    // Check profile role
    const supabase = require('./supabase');
    if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    if (!profile || profile.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch {
    res.status(401).json({ error: 'Authentication failed' });
  }
}

module.exports = { requireAuth, optionalAuth, requireAdmin };
