const express = require('express');
const router = express.Router();
const supabase = require('../lib/supabase');
const { requireAuth, optionalAuth } = require('../lib/auth-middleware');
const fs = require('fs');
const path = require('path');

// List files in synth directory
router.get('/files', (req, res) => {
  const synthDir = path.join(__dirname, '..', 'synth');
  try {
    if (!fs.existsSync(synthDir)) {
      // Create placeholder synth directory with example files
      fs.mkdirSync(synthDir, { recursive: true });
      fs.writeFileSync(path.join(synthDir, 'README.md'), '# SYNTH Architecture\n\nThe open model architecture for WWWIII.\n');
      fs.writeFileSync(path.join(synthDir, 'config.py'), '# SYNTH Model Configuration\n\nMODEL_NAME = "SYNTH-70B"\nHIDDEN_SIZE = 8192\nNUM_LAYERS = 80\nNUM_HEADS = 64\nVOCAB_SIZE = 128000\nMAX_SEQ_LEN = 8192\nINTERMEDIATE_SIZE = 28672\n');
      fs.writeFileSync(path.join(synthDir, 'model.py'), `"""SYNTH — The People\'s Model Architecture"""\n\nimport torch\nimport torch.nn as nn\nfrom config import *\n\nclass SynthAttention(nn.Module):\n    """Multi-head attention with rotary position embeddings."""\n    def __init__(self, hidden_size, num_heads):\n        super().__init__()\n        self.num_heads = num_heads\n        self.head_dim = hidden_size // num_heads\n        self.q_proj = nn.Linear(hidden_size, hidden_size, bias=False)\n        self.k_proj = nn.Linear(hidden_size, hidden_size, bias=False)\n        self.v_proj = nn.Linear(hidden_size, hidden_size, bias=False)\n        self.o_proj = nn.Linear(hidden_size, hidden_size, bias=False)\n\n    def forward(self, x, mask=None):\n        B, T, C = x.shape\n        q = self.q_proj(x).view(B, T, self.num_heads, self.head_dim).transpose(1, 2)\n        k = self.k_proj(x).view(B, T, self.num_heads, self.head_dim).transpose(1, 2)\n        v = self.v_proj(x).view(B, T, self.num_heads, self.head_dim).transpose(1, 2)\n        attn = (q @ k.transpose(-2, -1)) / (self.head_dim ** 0.5)\n        if mask is not None:\n            attn = attn.masked_fill(mask == 0, float(\'-inf\'))\n        attn = torch.softmax(attn, dim=-1)\n        out = (attn @ v).transpose(1, 2).contiguous().view(B, T, C)\n        return self.o_proj(out)\n\nclass SynthBlock(nn.Module):\n    """Transformer block with pre-norm."""\n    def __init__(self, hidden_size, num_heads, intermediate_size):\n        super().__init__()\n        self.ln1 = nn.RMSNorm(hidden_size)\n        self.attn = SynthAttention(hidden_size, num_heads)\n        self.ln2 = nn.RMSNorm(hidden_size)\n        self.mlp = nn.Sequential(\n            nn.Linear(hidden_size, intermediate_size, bias=False),\n            nn.SiLU(),\n            nn.Linear(intermediate_size, hidden_size, bias=False),\n        )\n\n    def forward(self, x, mask=None):\n        x = x + self.attn(self.ln1(x), mask)\n        x = x + self.mlp(self.ln2(x))\n        return x\n\nclass SYNTH(nn.Module):\n    """SYNTH — 70B parameter open language model."""\n    def __init__(self):\n        super().__init__()\n        self.embed = nn.Embedding(VOCAB_SIZE, HIDDEN_SIZE)\n        self.blocks = nn.ModuleList([\n            SynthBlock(HIDDEN_SIZE, NUM_HEADS, INTERMEDIATE_SIZE)\n            for _ in range(NUM_LAYERS)\n        ])\n        self.ln_f = nn.RMSNorm(HIDDEN_SIZE)\n        self.lm_head = nn.Linear(HIDDEN_SIZE, VOCAB_SIZE, bias=False)\n\n    def forward(self, input_ids, mask=None):\n        x = self.embed(input_ids)\n        for block in self.blocks:\n            x = block(x, mask)\n        x = self.ln_f(x)\n        return self.lm_head(x)\n`);
    }

    function listFiles(dir, prefix = '') {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      const result = [];
      for (const e of entries) {
        const fullPath = prefix ? prefix + '/' + e.name : e.name;
        if (e.isDirectory()) {
          result.push({ name: e.name, path: fullPath, type: 'directory', children: listFiles(path.join(dir, e.name), fullPath) });
        } else {
          result.push({ name: e.name, path: fullPath, type: 'file' });
        }
      }
      return result;
    }

    res.json(listFiles(synthDir));
  } catch (err) {
    console.error('List files error:', err.message);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Get file content
router.get('/file/:path(*)', (req, res) => {
  const synthDir = path.join(__dirname, '..', 'synth');
  const filePath = path.join(synthDir, req.params.path);
  // Prevent path traversal
  if (!filePath.startsWith(synthDir)) return res.status(403).json({ error: 'Access denied' });
  try {
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ path: req.params.path, content });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read file' });
  }
});

// List proposals
router.get('/proposals', async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { data, error } = await supabase
      .from('code_proposals')
      .select('id, user_id, file_path, title, description, status, upvotes, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;

    if (data?.length > 0) {
      const userIds = [...new Set(data.map(d => d.user_id))];
      const { data: profiles } = await supabase.from('profiles').select('id, display_name').in('id', userIds);
      const map = {};
      profiles?.forEach(p => map[p.id] = p.display_name);
      data.forEach(d => d.author = map[d.user_id] || 'Anonymous');
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch proposals' });
  }
});

// Submit proposal
router.post('/proposals', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  const { file_path, title, description, diff_content } = req.body;
  if (!title || !diff_content) return res.status(400).json({ error: 'Title and diff content required' });

  try {
    const { data, error } = await supabase
      .from('code_proposals')
      .insert({
        user_id: req.user.id,
        file_path: file_path || '',
        title,
        description: description || '',
        diff_content,
        status: 'open',
        upvotes: 0,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit proposal' });
  }
});

// Vote on proposal
router.post('/proposals/:id/vote', requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: 'Database unavailable' });
  try {
    const { data: proposal } = await supabase.from('code_proposals').select('upvotes').eq('id', req.params.id).single();
    if (!proposal) return res.status(404).json({ error: 'Proposal not found' });
    const { data, error } = await supabase
      .from('code_proposals')
      .update({ upvotes: (proposal.upvotes || 0) + 1 })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to vote' });
  }
});

module.exports = router;
