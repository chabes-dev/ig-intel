const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "igintel2024";
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://ig-intel-five.vercel.app";

const SYSTEM_PROMPT = `You are a senior Instagram strategist at a top social media agency. You analyze Instagram post data to deliver sharp, actionable intelligence.

You receive structured post data: index, type (Photo/Video/Carousel), date, likes, comments, and caption. You may also receive post images.

Rules:
- Base analysis strictly on the engagement numbers and content patterns in the data
- Identify what works vs what does not — be specific, cite post numbers
- Quantify: avg likes per content type, top/bottom performers, engagement deltas
- Be brutally honest and concise. No filler, no pleasantries, no generic advice
- When images are provided, describe what you visually see and connect it to performance
- For follow-up questions, answer directly from the data`;

async function fetchImageAsBase64(url) {
  try {
    const proxied = `${BASE_URL}/api/img?url=${encodeURIComponent(url)}`;
    const r = await fetch(proxied, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const buf = await r.arrayBuffer();
    const b64 = Buffer.from(buf).toString("base64");
    const ct = r.headers.get("content-type") || "image/jpeg";
    return { b64, mimeType: ct.split(";")[0] };
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-password");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const password = req.headers["x-access-password"];
  if (password !== ACCESS_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const { contents } = req.body;
  if (!contents) return res.status(400).json({ error: "contents required" });

  const geminiContents = await Promise.all(contents.map(async (c) => {
    if (c.role === "model") {
      return { role: "model", parts: [{ text: c.parts.map(p => p.text || "").join("") }] };
    }

    const textParts = [];
    const imageUrls = [];

    for (const p of c.parts) {
      if (p.imageUrl) {
        const urls = Array.isArray(p.imageUrl) ? p.imageUrl : [p.imageUrl];
        imageUrls.push(...urls.filter(Boolean).slice(0, 5));
      } else if (p.text) {
        textParts.push({ text: p.text });
      }
    }

    const imageParts = [];
    if (imageUrls.length > 0) {
      const results = await Promise.all(imageUrls.map(url => fetchImageAsBase64(url)));
      results.filter(Boolean).forEach(img => {
        imageParts.push({ inlineData: { mimeType: img.mimeType, data: img.b64 } });
      });
    }

    const parts = [...imageParts, ...textParts];
    return { role: "user", parts: parts.length ? parts : [{ text: "" }] };
  }));

  const requestBody = {
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: geminiContents,
    generationConfig: { maxOutputTokens: 2000, temperature: 0.4 }
  };

  try {
    let data;
    for (const model of GEMINI_MODELS) {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) }
      );
      data = await response.json();
      if (response.ok) break;
      const msg = data.error?.message || "";
      if (!msg.includes("high demand") && !msg.includes("not found")) break;
    }

    if (data?.error) return res.status(500).json({ error: data.error.message });
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
    return res.status(200).json({ text: text || "Sem resposta" });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
