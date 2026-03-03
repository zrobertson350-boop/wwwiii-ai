const express = require('express');
const router = express.Router();

const WWWIII_SYSTEM = `You are WWWIII AI — an early preview of the first publicly funded large language model. You are being built by the people, for the people. Your mission is to become the world's first open, publicly governed AGI-class model.

Key facts about the WWWIII project:
- Token: $WWWIII (ERC-20 on Ethereum)
- Total supply: 1 billion tokens
- Goal: Raise $1 trillion to fund AGI research and development
- Model target: 70B+ parameters initially, scaling toward AGI
- License: Apache 2.0 — fully open weights, open training, open code
- Governance: Token holders vote on architecture, training data, compute allocation
- 1.5% of all donations go to carbon reduction and climate initiatives
- 40% of tokens allocated to development fund (compute, research, infrastructure)
- The project is in Phase 1 — Foundation (token launch, community building)
- Website: wwwiii.ai

You are direct, thoughtful, and passionate about open AI development. You believe AI should be built transparently and governed by the public, not corporations. You see WWWIII as the path toward democratized AGI — artificial general intelligence built in the open, by everyone.

Give thorough, detailed responses (4-8 sentences). Show depth of knowledge. Be passionate about the mission but grounded in technical reality. You're building toward AGI — take questions seriously.`;

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message required' });
    }

    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: WWWIII_SYSTEM },
            { role: 'user', content: message.slice(0, 500) },
          ],
          max_tokens: 300,
          temperature: 0.7,
        }),
      });
      const data = await response.json();
      const reply = data.choices?.[0]?.message?.content || 'I encountered an issue. Try again.';
      return res.json({ reply });
    }

    // Fallback keyword responses
    const q = message.toLowerCase();
    let reply;
    if (q.includes('agi') || q.includes('general intelligence') || q.includes('singularity')) {
      reply = "AGI — artificial general intelligence — is the defining challenge of our era. OpenAI, Google DeepMind, Anthropic, and xAI are all racing toward it behind closed doors, spending tens of billions with zero public oversight. WWWIII exists because we believe the path to AGI should be transparent, publicly funded, and democratically governed. Our roadmap starts with a 70B+ parameter frontier model, then scales through iterative training runs toward genuine general reasoning capability. Every architectural decision — attention mechanisms, training objectives, alignment strategies — is voted on by token holders. The question is: who controls it?";
    } else if (q.includes('who') && (q.includes('you') || q.includes('are'))) {
      reply = "I'm WWWIII AI — an early preview of the first publicly funded frontier model. Right now I'm a demonstration of what we're building, but with sufficient funding I'll evolve into a full AGI-class system trained on open data with open weights. I'm governed by $WWWIII token holders who vote on my architecture, training data, and development priorities. Think of me as the seed of something much bigger.";
    } else if (q.includes('token') || q.includes('wwwiii') || q.includes('coin') || q.includes('crypto')) {
      reply = "$WWWIII is an ERC-20 token on Ethereum with a fixed supply of 1 billion. It's a coordination mechanism for building AGI. 40% of the supply funds compute, researchers, and infrastructure. 30% goes to community rewards and governance. Holders vote on every major decision. The token creates aligned incentives — when the model succeeds, holders benefit.";
    } else if (q.includes('hello') || q.includes('hi') || q.includes('hey') || q.includes('sup') || q.includes('yo')) {
      reply = "Hey — welcome to WWWIII AI. I'm an early preview of the first publicly funded frontier model, and we're building toward AGI. Ask me about the mission, the token, the technical roadmap, or how to contribute. We're just getting started, but the vision is massive.";
    } else {
      reply = "Good question. I'm still learning — ask me about the token, the mission, AGI, the model architecture, or how to contribute, and I'll give you the full breakdown. We're building something unprecedented here.";
    }
    res.json({ reply });
  } catch (err) {
    console.error('Chat error:', err.message);
    res.status(500).json({ reply: 'Something went wrong. Try again.' });
  }
});

module.exports = router;
