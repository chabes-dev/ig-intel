const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "igintel2024";
const GEMINI_MODELS = ["gemini-2.5-flash-lite-preview-06-17", "gemini-2.5-flash"];
const BASE_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : "https://ig-intel-five.vercel.app";

async function fetchImageAsBase64(thumbnailUrl) {
  try {
    const proxied = `${BASE_URL}/api/img?url=${encodeURIComponent(thumbnailUrl)}`;
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

  // Thumbnail URL pattern in text parts (Apify fields)
  const thumbPattern = /https?:\/\/[^\s"]+(?:cdninstagram|fbcdn)[^\s"]+/g;

  const geminiContents = await Promise.all(contents.map(async (c) => {
    if (c.role === "model") {
      return { role: "model", parts: [{ text: c.parts.map(p => p.text || "").join("") }] };
    }

    // Build parts, injecting images inline before each post text
    const parts = [];
    for (const p of c.parts) {
      const text = p.text || "";
      const urls = [...new Set(text.match(thumbPattern) || [])];

      // Fetch up to 5 images per turn (cap to control token usage)
      const imageResults = await Promise.all(
        urls.slice(0, 5).map(url => fetchImageAsBase64(url))
      );

      for (const img of imageResults) {
        if (img) {
          parts.push({ inlineData: { mimeType: img.mimeType, data: img.b64 } });
        }
      }

      if (text) parts.push({ text });
    }

    return { role: "user", parts: parts.length ? parts : [{ text: "" }] };
  }));

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[0]}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1500, temperature: 0.7 }
        })
      }
    );

    let data = await response.json();
    if (!response.ok && data.error?.message?.includes("high demand")) {
      // Retry with fallback model
      const r2 = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODELS[1]}:generateContent?key=${geminiKey}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: geminiContents, generationConfig: { maxOutputTokens: 1500, temperature: 0.7 } }) }
      );
      data = await r2.json();
      if (!r2.ok) return res.status(500).json({ error: data.error?.message || "Gemini API error" });
    } else if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || "Gemini API error" });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
