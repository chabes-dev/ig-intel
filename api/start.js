const APIFY_ACTOR = "apify~instagram-scraper";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "igintel2024";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-password");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const password = req.headers["x-access-password"];
  if (password !== ACCESS_PASSWORD) return res.status(401).json({ error: "Unauthorized" });

  const token = process.env.APIFY_TOKEN;
  if (!token) return res.status(500).json({ error: "APIFY_TOKEN not configured" });

  const { handle, maxPosts = 50, dateFrom, dateTo } = req.body;
  if (!handle) return res.status(400).json({ error: "handle is required" });

  try {
    const cleanHandle = handle.replace("@", "").trim();
    const url = "https://api.apify.com/v2/acts/" + APIFY_ACTOR + "/runs?token=" + token;
    const input = {
      directUrls: ["https://www.instagram.com/" + cleanHandle + "/"],
      resultsType: "posts",
      resultsLimit: maxPosts,
      addParentData: false,
    };
    if (dateFrom) input.onlyPostsNewerThan = dateFrom;
    if (dateTo) input.onlyPostsOlderThan = dateTo;

    const runRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!runRes.ok) throw new Error("Apify error: " + runRes.status);
    const { data: run } = await runRes.json();
    return res.status(200).json({ runId: run.id, datasetId: run.defaultDatasetId });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
