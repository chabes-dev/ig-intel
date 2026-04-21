const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "igintel2024";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-password");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const password = req.headers["x-access-password"];
  if (password !== ACCESS_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: "GROQ_API_KEY not configured" });

  const { contents } = req.body;
  if (!contents) return res.status(400).json({ error: "contents required" });

  const messages = contents.map(c => ({
    role: c.role === "model" ? "assistant" : "user",
    content: c.parts.map(p => p.text || "").join(""),
  }));

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + groqKey,
      },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages,
        max_tokens: 2048,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data?.error?.message || "Groq error " + r.status);
    return res.status(200).json({
      candidates: [{ content: { parts: [{ text: data.choices[0].message.content }] } }]
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
