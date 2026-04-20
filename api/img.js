export default async function handler(req, res) {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing url");

  try {
    const decoded = decodeURIComponent(url);
    const imgRes = await fetch(decoded, {
      headers: {
        "Referer": "https://www.instagram.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!imgRes.ok) return res.status(imgRes.status).send("Image fetch failed");

    const contentType = imgRes.headers.get("content-type") || "image/jpeg";
    const buffer = await imgRes.arrayBuffer();

    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(Buffer.from(buffer));
  } catch (err) {
    res.status(500).send(err.message);
  }
}
