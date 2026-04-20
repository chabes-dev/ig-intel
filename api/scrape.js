const APIFY_ACTOR = "apify~instagram-scraper";
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || "igintel2024";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-access-password");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const password = req.headers["x-access-password"];
  if (password !== ACCESS_PASSWORD) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) return res.status(500).json({ error: "APIFY_TOKEN not configured" });

  const { handle, maxPosts = 50, dateFrom, dateTo } = req.body;
  if (!handle) return res.status(400).json({ error: "handle is required" });

  try {
    const cleanHandle = handle.replace("@", "").trim();
    const runUrl = "https://api.apify.com/v2/acts/" + APIFY_ACTOR + "/runs?token=" + token;
    const input = {
      directUrls: ["https://www.instagram.com/" + cleanHandle + "/"],
      resultsType: "posts",
      resultsLimit: maxPosts,
      addParentData: false,
    };
    if (dateFrom) input.onlyPostsNewerThan = dateFrom;
    if (dateTo) input.onlyPostsOlderThan = dateTo;

    const runRes = await fetch(runUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!runRes.ok) throw new Error("Apify run error: " + runRes.status);
    const { data: run } = await runRes.json();

    let status = run.status;
    let attempts = 0;
    while (!["SUCCEEDED", "FAILED", "ABORTED"].includes(status) && attempts < 60) {
      await new Promise((r) => setTimeout(r, 3000));
      const poll = await fetch("https://api.apify.com/v2/actor-runs/" + run.id + "?token=" + token);
      const { data } = await poll.json();
      status = data.status;
      attempts++;
    }

    if (status !== "SUCCEEDED") throw new Error("Run ended with status: " + status);

    const itemsRes = await fetch(
      "https://api.apify.com/v2/datasets/" + run.defaultDatasetId + "/items?token=" + token + "&format=json&clean=true"
    );
    if (!itemsRes.ok) throw new Error("Dataset fetch error");
    const items = await itemsRes.json();
    return res.status(200).json(items);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
