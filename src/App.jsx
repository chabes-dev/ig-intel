import { useState, useEffect } from "react";

const APIFY_ACTOR = "apify~instagram-scraper";
const STORAGE_KEY = "ig_intel_token";
const SEARCHES_KEY = "ig_intel_searches";
const fmt = (n) => n?.toLocaleString("pt-BR") ?? "-";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "-";
const typeLabel = { Image: "Foto", Video: "Video", Sidecar: "Carrossel" };
const typeColor = { Image: "#3b82f6", Video: "#f5a020", Sidecar: "#10b981" };

async function runApifyScraper(token, handle, maxPosts, dateFrom, dateTo) {
  const cleanHandle = handle.replace("@", "").trim();
  const url = "https://api.apify.com/v2/acts/" + APIFY_ACTOR + "/runs?token=" + token;
  const input = { directUrls: ["https://www.instagram.com/" + cleanHandle + "/"], resultsType: "posts", resultsLimit: maxPosts, addParentData: false };
  if (dateFrom) input.onlyPostsNewerThan = dateFrom;
  if (dateTo) input.onlyPostsOlderThan = dateTo;
  const runRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!runRes.ok) throw new Error("Apify error: " + runRes.status);
  const { data: run } = await runRes.json();
  let status = run.status, attempts = 0;
  while (!["SUCCEEDED","FAILED","ABORTED"].includes(status) && attempts < 60) {
    await new Promise((r) => setTimeout(r, 3000));
    const s = await fetch("https://api.apify.com/v2/actor-runs/" + run.id + "?token=" + token);
    const { data } = await s.json();
    status = data.status; attempts++;
  }
  if (status !== "SUCCEEDED") throw new Error("Run " + status);
  const items = await fetch("https://api.apify.com/v2/datasets/" + run.defaultDatasetId + "/items?token=" + token + "&format=json&clean=true");
  if (!items.ok) throw new Error("Dataset error");
  return items.json();
}

function exportCSV(posts, handle) {
  const headers = ["url","type","timestamp","likes","comments","caption"];
  const rows = posts.map((p) => headers.map((h) => {
    const val = h === "url" ? (p.url || (p.shortCode && "https://www.instagram.com/p/" + p.shortCode + "/")) : h === "type" ? p.type : h === "timestamp" ? p.timestamp : h === "likes" ? p.likesCount : h === "comments" ? p.commentsCount : (p.caption || "").replace(/"/g, "'");
    return '"' + String(val ?? "").replace(/"/g, "'") + '"';
  }).join(","));
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ig_intel_" + handle + "_" + new Date().toISOString().slice(0,10) + ".csv";
  a.click();
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [handle, setHandle] = useState("");
  const [maxPosts, setMaxPosts] = useState(50);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [posts, setPosts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [searches, setSearches] = useState(() => { try { return JSON.parse(localStorage.getItem(SEARCHES_KEY) || "[]"); } catch { return []; } });

  useEffect(() => {
    if (!keyword.trim()) { setFiltered(posts); return; }
    const kw = keyword.toLowerCase();
    setFiltered(posts.filter((p) => (p.caption || "").toLowerCase().includes(kw)));
  }, [keyword, posts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, token);
  }, [token]);

  async function handleSearch(e) {
    e.preventDefault();
    if (!token || !handle) return;
    setLoading(true); setError(""); setPosts([]); setFiltered([]);
    try {
      const data = await runApifyScraper(token, handle, maxPosts, dateFrom, dateTo);
      setPosts(data);
      setFiltered(data);
      const entry = { handle, date: new Date().toISOString(), count: data.length };
      const updated = [entry, ...searches.slice(0, 9)];
      setSearches(updated);
      localStorage.setItem(SEARCHES_KEY, JSON.stringify(updated));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const totalLikes = filtered.reduce((s, p) => s + (p.likesCount || 0), 0);
  const totalComments = filtered.reduce((s, p) => s + (p.commentsCount || 0), 0);
  const avgLikes = filtered.length ? Math.round(totalLikes / filtered.length) : 0;
  const avgComments = filtered.length ? Math.round(totalComments / filtered.length) : 0;

  const styles = {
    app: { minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", padding: "24px" },
    header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
    logo: { fontSize: 28, fontWeight: 700, color: "#f5a020", letterSpacing: 1 },
    card: { background: "#1e2d4a", borderRadius: 12, padding: "20px 24px", marginBottom: 20 },
    label: { fontSize: 13, color: "#94a3b8", marginBottom: 4, display: "block" },
    input: { width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" },
    btn: { background: "#f5a020", color: "#0f172a", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "inherit" },
    btnSm: { background: "#1B2D5B", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
    grid2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
    grid4: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 },
    statCard: { background: "#1B2D5B", borderRadius: 10, padding: "14px 18px", textAlign: "center" },
    statVal: { fontSize: 26, fontWeight: 700, color: "#f5a020" },
    statLbl: { fontSize: 12, color: "#94a3b8", marginTop: 2 },
    postGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px,1fr))", gap: 14 },
    postCard: { background: "#1e2d4a", borderRadius: 10, overflow: "hidden", cursor: "pointer" },
    thumb: { width: "100%", aspectRatio: "1", objectFit: "cover", background: "#0f172a" },
    tag: { display: "inline-block", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 700, marginBottom: 6 },
    errorBox: { background: "#7f1d1d", border: "1px solid #ef4444", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#fca5a5" },
  };

  return (
    <div style={styles.app}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={styles.header}>
        <span style={styles.logo}>IG Intel</span>
        <span style={{ color: "#475569", fontSize: 13 }}>Instagram Analytics via Apify</span>
      </div>

      <div style={styles.card}>
        <form onSubmit={handleSearch}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.label}>Apify API Token</label>
            <input style={styles.input} type="password" placeholder="apify_api_..." value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <div style={{ ...styles.grid2, marginBottom: 14 }}>
            <div>
              <label style={styles.label}>@handle</label>
              <input style={styles.input} placeholder="@username" value={handle} onChange={(e) => setHandle(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>Max posts</label>
              <input style={styles.input} type="number" min={1} max={500} value={maxPosts} onChange={(e) => setMaxPosts(+e.target.value)} />
            </div>
          </div>
          <div style={{ ...styles.grid2, marginBottom: 14 }}>
            <div>
              <label style={styles.label}>De (data)</label>
              <input style={styles.input} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={styles.label}>Ate (data)</label>
              <input style={styles.input} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <button type="submit" style={styles.btn} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>
      </div>

      {error && <div style={styles.errorBox}>{error}</div>}

      {posts.length > 0 && (
        <>
          <div style={styles.grid4}>
            <div style={styles.statCard}><div style={styles.statVal}>{fmt(filtered.length)}</div><div style={styles.statLbl}>Posts</div></div>
            <div style={styles.statCard}><div style={styles.statVal}>{fmt(totalLikes)}</div><div style={styles.statLbl}>Likes totais</div></div>
            <div style={styles.statCard}><div style={styles.statVal}>{fmt(avgLikes)}</div><div style={styles.statLbl}>Media likes</div></div>
            <div style={styles.statCard}><div style={styles.statVal}>{fmt(avgComments)}</div><div style={styles.statLbl}>Media comentarios</div></div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
            <input style={{ ...styles.input, maxWidth: 280 }} placeholder="Filtrar por keyword..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <button style={styles.btnSm} onClick={() => exportCSV(filtered, handle)}>Exportar CSV</button>
          </div>

          <div style={styles.postGrid}>
            {filtered.map((p, i) => {
              const postUrl = p.url || (p.shortCode && "https://www.instagram.com/p/" + p.shortCode + "/");
              return (
                <div key={i} style={styles.postCard} onClick={() => postUrl && window.open(postUrl, "_blank")}>
                  {p.displayUrl ? (
                    <img src={p.displayUrl} alt="" style={styles.thumb} loading="lazy" />
                  ) : (
                    <div style={{ ...styles.thumb, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 12 }}>sem thumb</div>
                  )}
                  <div style={{ padding: "10px 12px" }}>
                    <span style={{ ...styles.tag, background: typeColor[p.type] || "#475569", color: "#fff" }}>{typeLabel[p.type] || p.type}</span>
                    <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 4 }}>{fmtDate(p.timestamp)}</div>
                    <div style={{ display: "flex", gap: 10, fontSize: 13, color: "#cbd5e1" }}>
                      <span>Likes {fmt(p.likesCount)}</span>
                      <span>Com {fmt(p.commentsCount)}</span>
                    </div>
                    {p.caption && <div style={{ fontSize: 12, color: "#64748b", marginTop: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.caption}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {searches.length > 0 && posts.length === 0 && (
        <div style={styles.card}>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>Buscas recentes</div>
          {searches.map((s2, i) => (
            <div key={i} style={{ display: "flex", gap: 12, fontSize: 13, color: "#94a3b8", padding: "4px 0", borderBottom: "1px solid #1e2d4a" }}>
              <span style={{ color: "#f5a020" }}>@{s2.handle}</span>
              <span>{s2.count} posts</span>
              <span>{fmtDate(s2.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
