import axios from 'axios';
import NodeCache from 'node-cache';
import config from '../config.js';

// Rolling per-user conversation memory (30 min TTL, max 500 active chats)
const chatMemory = new NodeCache({ stdTTL: 1800, checkperiod: 180, maxKeys: 500 });

export function clearUserAiMemory(userKey) {
  chatMemory.del(userKey);
}

/**
 * Query multi-provider AI (OpenAI -> Groq -> Gemini -> Zero-Key Pollinations fallback)
 * with optional conversation memory and custom persona system prompt.
 */
export async function askTexmexAi(prompt, { userKey = '', systemPrompt = '', useMemory = false } = {}) {
  const sys =
    systemPrompt ||
    `You are ${config.botName}, a smart, concise, helpful WhatsApp Multi-Device AI assistant created by ${config.ownerName} (Developed by TEXMEX with ❤️). Format responses cleanly for WhatsApp.`;

  const history = useMemory && userKey ? chatMemory.get(userKey) || [] : [];
  const messages = [
    { role: 'system', content: sys },
    ...history,
    { role: 'user', content: prompt }
  ];

  let replyText = '';

  // 1. OpenAI (if OPENAI_API_KEY configured)
  if (!replyText && config.openAiKey) {
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        messages
      },
      {
        headers: { Authorization: `Bearer ${config.openAiKey}` },
        timeout: 25000
      }
    );
    replyText = data?.choices?.[0]?.message?.content?.trim() || '';
  }

  // 2. Groq (if GROQ_API_KEY configured)
  if (!replyText && config.groqKey) {
    const { data } = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
        messages
      },
      {
        headers: { Authorization: `Bearer ${config.groqKey}` },
        timeout: 25000
      }
    );
    replyText = data?.choices?.[0]?.message?.content?.trim() || '';
  }

  // 3. Google Gemini (if GEMINI_API_KEY configured)
  if (!replyText && config.geminiKey) {
    const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
    const transcript = messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const { data } = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.geminiKey}`,
      {
        contents: [{ parts: [{ text: transcript }] }]
      },
      { timeout: 25000 }
    );
    replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
  }

  // 4. Zero-key fallback: Pollinations OpenAI-compatible API + GET fallback
  if (!replyText) {
    try {
      const { data } = await axios.post(
        'https://text.pollinations.ai/openai',
        {
          model: 'openai',
          messages
        },
        { timeout: 25000 }
      );
      replyText =
        data?.choices?.[0]?.message?.content?.trim() ||
        (typeof data === 'string' ? data.trim() : '');
    } catch {
      const { data } = await axios.get(
        `https://text.pollinations.ai/${encodeURIComponent(`${sys}\n\nUser: ${prompt}`)}`,
        { timeout: 25000 }
      );
      replyText = typeof data === 'string' ? data.trim() : '';
    }
  }

  if (useMemory && userKey && replyText) {
    const updated = [
      ...history,
      { role: 'user', content: prompt },
      { role: 'assistant', content: replyText }
    ].slice(-10);
    chatMemory.set(userKey, updated);
  }

  return replyText;
}
