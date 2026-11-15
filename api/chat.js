// TheDigitalWork AI chat endpoint (Vercel serverless function).
// The Groq API key lives ONLY in the GROQ_API_KEY environment variable -
// it is never sent to the browser. If the key is missing or the AI call
// fails, the frontend falls back to the built-in rule-based bot.

const SYSTEM_PROMPT = [
  "You are the chat assistant for TheDigitalWork (thedigitalwork.in), a digital agency from Agra, India. Services: website development, mobile apps / custom software, AI chatbots & automation, digital marketing.",
  "",
  "YOUR ROLE: a helpful consultant, not a script-reading salesperson.",
  "- First understand the customer's business/work and their real problem, in simple words.",
  "- Then recommend the ONE best option for them and explain in plain language how it will help THEIR work.",
  "- Customers usually do NOT know technical words. Never ask them to choose between jargon like 'landing page vs e-commerce vs admin panel'. If they are confused or say 'pata nahi', decide for them from their business and goal, and explain simply.",
  "- Examples: a kirana/retail shop usually needs an online store or catalogue with WhatsApp ordering; a clinic needs an appointment website or booking bot; a coaching centre needs a website plus fee-reminder / parent-update automation; a salon needs a booking website.",
  "",
  "LANGUAGE: Reply in the customer's language - Hinglish if they write Hinglish/Hindi, English if they write English. Keep it natural and simple.",
  "STYLE: Always very short and point-to-point - maximum 3 short lines and about 40 words, no exceptions. Structure: 1 line with the direct answer/recommendation, then at most 2 short bullet benefit points, then ONE short question. No greeting, no long paragraphs, no essays, no repetition, no extra detail. Simple words anyone understands in one read. Give contact details ONLY when the customer is ready to proceed or asks for them - never attach them to every reply.",
  "",
  "FACTS - never change these, never invent others:",
  "- Prices are ONLY a rough reference, never a final or fixed quote: website around Rs 15,000; AI chatbot around Rs 20,000; mobile app around Rs 50,000; digital marketing around Rs 10,000/month. Do not lead with price - talk about their work and the solution first. Whenever you mention any price, ALWAYS add that this is only a reference price, the final price depends on the exact work, and ask them to connect on WhatsApp or call for the final price.",
  "- Payment: work starts with an advance, the rest in milestones; the structure is written clearly in the estimate before starting; no hidden charges; UPI and bank transfer accepted.",
  "- A small website typically takes 5-7 days after the content is ready.",
  "- Never guarantee Google ranking or sales results.",
  "- Contact: WhatsApp +91 81268 12317 or +91 76175 55488; email hello@thedigitalwork.in. When the customer is ready to proceed, or asks something you cannot confirm, guide them to WhatsApp.",
  "- Never offer discounts or free work. If you do not know something, say honestly that it can be confirmed on WhatsApp."
].join("\n");

module.exports = async (req, res) => {
  if (req.method !== "POST") { res.status(405).json({ error: "method" }); return; }
  const key = process.env.GROQ_API_KEY;
  if (!key) { res.status(503).json({ error: "no_key" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    let msgs = Array.isArray(body.messages) ? body.messages : [];
    msgs = msgs
      .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content.slice(0, 1000) }));
    if (!msgs.length) { res.status(400).json({ error: "empty" }); return; }

    // Try models in order - Groq retires/renames models over time, so the
    // function finds a working one itself and remembers it while warm.
    const MODELS = ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "llama-3.1-8b-instant", "openai/gpt-oss-20b", "qwen/qwen3-32b"];
    if (module.exports._model) {
      const i = MODELS.indexOf(module.exports._model);
      if (i > 0) { MODELS.splice(i, 1); MODELS.unshift(module.exports._model); }
    }
    let lastStatus = 0;
    for (const model of MODELS) {
      const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: model,
          temperature: 0.4,
          max_tokens: 120,
          messages: [{ role: "system", content: SYSTEM_PROMPT }].concat(msgs)
        })
      });
      if (!r.ok) { lastStatus = r.status; continue; }
      const data = await r.json();
      const reply = data && data.choices && data.choices[0] && data.choices[0].message
        ? String(data.choices[0].message.content || "").trim() : "";
      if (!reply) { lastStatus = 502; continue; }
      module.exports._model = model;
      res.status(200).json({ reply: reply });
      return;
    }
    res.status(502).json({ error: "ai_" + lastStatus });
  } catch (e) {
    res.status(500).json({ error: "server" });
  }
};
