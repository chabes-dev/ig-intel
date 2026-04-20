import { useState, useEffect } from "react";

const SEARCHES_KEY = "ig_intel_searches";
const ACCESS_PASSWORD_KEY = "ig_intel_password";
const fmt = (n) => n?.toLocaleString("pt-BR") ?? "-";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "-";
const typeLabel = { Image: "Foto", Video: "Video", Sidecar: "Carrossel" };
const typeColor = { Image: "#3b82f6", Video: "#f5a020", Sidecar: "#10b981" };

async function runScrape(password, handle, maxPosts, dateFrom, dateTo) {
  const res = await fetch("/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-password": password },
    body: JSON.stringify({ handle, maxPosts, dateFrom, dateTo }),
  });
  if (res.status === 401) throw new Error("Senha incorreta");
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || "Erro ao buscar dados");
  }
  return res.json();
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
  const [password, setPassword] = useState(() => localStorage.getItem(ACCESS_PASSWORD_KEY) || "");
  const [unlocked, setUnlocked] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
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
    if (password) setUnlocked(true);
  }, []);

  useEffect(() => {
    if (!keyword.trim()) { setFiltered(posts); return; }
    const kw = keyword.toLowerCase();
    setFiltered(posts.filter((p) => (p.caption || "").toLowerCase().includes(kw)));
  }, [keyword, posts]);

  function handleUnlock(e) {
    e.preventDefault();
    if (!passwordInput.trim()) return;
    setPassword(passwordInput);
    localStorage.setItem(ACCESS_PASSWORD_KEY, passwordInput);
    setUnlocked(true);
    setError("");
  }

  async function handleSearch(e) {
    e.preventDefault();
    if (!handle) return;
    setLoading(true); setError(""); setPosts([]); setFiltered([]);
    try {
      const data = await runScrape(password, handle, maxPosts, dateFrom, dateTo);
      setPosts(data);
      setFiltered(data);
      const entry = { handle, date: new Date().toISOString(), count: data.length };
      const updated = [entry, ...searches.slice(0, 9)];
      setSearches(updated);
      localStorage.setItem(SEARCHES_KEY, JSON.stringify(updated));
    } catch (err) {
      if (err.message === "Senha incorreta") {
        setUnlocked(false);
        setPassword("");
        localStorage.removeItem(ACCESS_PASSWORD_KEY);
      }
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const totalLikes = filtered.reduce((s, p) => s + (p.likesCount || 0), 0);
  const totalComments = filtered.reduce((s, p) => s + (p.commentsCount || 0), 0);
  const avgLikes = filtered.length ? Math.round(totalLikes / filtered.length) : 0;
  const avgComments = filtered.length ? Math.round(totalComments / filtered.length) : 0;

  const st = {
    app: { minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", padding: "24px", display: "flex", flexDirection: "column", alignItems: unlocked ? "stretch" : "center", justifyContent: unlocked ? "flex-start" : "center" },
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
    lockCard: { background: "#1e2d4a", borderRadius: 16, padding: "40px 48px", width: "100%", maxWidth: 380, textAlign: "center" },
  };

  if (!unlocked) {
    return (
      <div style={st.app}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet" />
        <div style={st.lockCard}>
          <div style={{ ...st.logo, fontSize: 36, marginBottom: 8 }}>IG Intel</div>
          <div style={{ color: "#475569", fontSize: 14, marginBottom: 28 }}>Instagram Analytics</div>
          {error && <div style={{ ...st.errorBox, marginBottom: 16 }}>{error}</div>}
          <form onSubmit={handleUnlock}>
            <div style={{ marginBottom: 16 }}>
              <label style={st.label}>Senha de acesso</label>
              <input style={st.input} type="password" placeholder="••••••••" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} autoFocus />
            </div>
            <button type="submit" style={{ ...st.btn, width: "100%" }}>Entrar</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...st.app, alignItems: "stretch", justifyContent: "flex-start" }}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={st.header}>
        <span style={st.logo}>IG Intel</span>
        <span style={{ color: "#475569", fontSize: 13 }}>Instagram Analytics</span>
        <button style={{ ...st.btnSm, marginLeft: "auto", fontSize: 12 }} onClick={() => { setUnlocked(false); setPassword(""); localStorage.removeItem(ACCESS_PASSWORD_KEY); }}>Sair</button>
      </div>

      <div style={st.card}>
        <form onSubmit={handleSearch}>
          <div style={{ ...st.grid2, marginBottom: 14 }}>
            <div>
              <label style={st.label}>@handle</label>
              <input style={st.input} placeholder="@username" value={handle} onChange={(e) => setHandle(e.target.value)} />
            </div>
            <div>
              <label style={st.label}>Max posts</label>
              <input style={st.input} type="number" min={1} max={500} value={maxPosts} onChange={(e) => setMaxPosts(+e.target.value)} />
            </div>
          </div>
          <div style={{ ...st.grid2, marginBottom: 14 }}>
            <div>
              <label style={st.label}>De (data)</label>
              <input style={st.input} type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <label style={st.label}>Ate (data)</label>
              <input style={st.input} type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
          <button type="submit" style={st.btn} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>
      </div>

      {error && <div style={st.errorBox}>{error}</div>}

      {posts.length > 0 && (
        <>
          <div style={st.grid4}>
            <div style={st.statCard}><div style={st.statVal}>{fmt(filtered.length)}</div><div style={st.statLbl}>Posts</div></div>
            <div style={st.statCard}><div style={st.statVal}>{fmt(totalLikes)}</div><div style={st.statLbl}>Likes totais</div></div>
            <div style={st.statCard}><div style={st.statVal}>{fmt(avgLikes)}</div><div style={st.statLbl}>Media likes</div></div>
            <div style={st.statCard}><div style={st.statVal}>{fmt(avgComments)}</div><div style={st.statLbl}>Media comentarios</div></div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
            <input style={{ ...st.input, maxWidth: 280 }} placeholder="Filtrar por keyword..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <button style={st.btnSm} onClick={() => exportCSV(filtered, handle)}>Exportar CSV</button>
          </div>

          <div style={st.postGrid}>
            {filtered.map((p, i) => {
              const postUrl = p.url || (p.shortCode && "https://www.instagram.com/p/" + p.shortCode + "/");
              return (
                <div key={i} style={st.postCard} onClick={() => postUrl && window.open(postUrl, "_blank")}>
                  {p.displayUrl ? (
                    <img src={p.displayUrl} alt="" style={st.thumb} loading="lazy" />
                  ) : (
                    <div style={{ ...st.thumb, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 12 }}>sem thumb</div>
                  )}
                  <div style={{ padding: "10px 12px" }}>
                    <span style={{ ...st.tag, background: typeColor[p.type] || "#475569", color: "#fff" }}>{typeLabel[p.type] || p.type}</span>
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
        <div style={st.card}>
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
