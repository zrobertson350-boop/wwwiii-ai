require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ──
app.use('/api', require('./routes/payments'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/newsletter', require('./routes/newsletter'));
app.use('/api/posts', require('./routes/blog'));
app.use('/api/community', require('./routes/community'));
app.use('/api/discussions', require('./routes/discussions'));
app.use('/api/store', require('./routes/store'));
app.use('/api/art', require('./routes/ai-art'));
app.use('/api/nfts', require('./routes/nfts'));
app.use('/api/tokens', require('./routes/tokens'));
app.use('/api/synth', require('./routes/model-builder'));

// SPA fallback — serve index.html for unmatched routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`wwwiii.ai running on :${PORT}`));
