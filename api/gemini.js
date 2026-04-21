export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-password");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "igintel2024";
  const password = req.headers["x-access-password"];
  if (password !== ACCESS_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const GEMINI_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_KEY) return res.status(500).json({ error: "GEMINI_API_KEY not configured" });

  const { contents } = req.body;
  if (!contents) return res.status(400).json({ error: "contents required" });

  try {
    const geminiRes = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=" + GEMINI_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
      }
    );
    const data = await geminiRes.json();
    if (!geminiRes.ok) return res.status(geminiRes.status).json({ error: data?.error?.message || "Gemini error" });
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
