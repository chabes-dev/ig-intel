const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "igintel2024";

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

  // Build Gemini-format messages, including inline images where available
  const geminiContents = contents.map(c => {
    if (c.role === "model") {
      return { role: "model", parts: [{ text: c.parts.map(p => p.text || "").join("") }] };
    }
    // User turn: attach image parts for posts that have thumbnails
    const parts = [];
    c.parts.forEach(p => {
      if (p.text) parts.push({ text: p.text });
      if (p.imageUrl) {
        // Pass as image URL via inline_data is not supported — use fileData or just describe
        // We'll include the URL as context text since Gemini Flash accepts URLs in newer API
        parts.push({ text: "[image: " + p.imageUrl + "]" });
      }
      if (p.inlineImage) {
        parts.push({ inlineData: { mimeType: p.mimeType || "image/jpeg", data: p.inlineImage } });
      }
    });
    return { role: "user", parts };
  });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: geminiContents,
          generationConfig: { maxOutputTokens: 1500, temperature: 0.7 }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || "Gemini API error" });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response";
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
