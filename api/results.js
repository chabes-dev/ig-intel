const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "igintel2024";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-password");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const password = req.headers["x-access-password"];
  if (password !== ACCESS_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const token = process.env.APIFY_TOKEN;
  if (!token) return res.status(500).json({ error: "APIFY_TOKEN not configured" });

  const { datasetId } = req.query;
  if (!datasetId) return res.status(400).json({ error: "datasetId is required" });

  try {
    const url = "https://api.apify.com/v2/datasets/" + datasetId + "/items?token=" + token + "&format=json&clean=true";
    const itemsRes = await fetch(url);
    if (!itemsRes.ok) throw new Error("Dataset fetch error: " + itemsRes.status);
    const items = await itemsRes.json();
    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
