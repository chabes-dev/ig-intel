import { useState, useEffect, useRef } from "react";

const SEARCHES_KEY = "ig_intel_searches";
const ACCESS_PASSWORD_KEY = "ig_intel_password";
const fmt = (n) => n?.toLocaleString("pt-BR") ?? "-";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "-";
const typeLabel = { Image: "Foto", Video: "Video", Sidecar: "Carrossel" };
const typeColor = { Image: "#3b82f6", Video: "#f5a020", Sidecar: "#10b981" };

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

async function callGemini(password, contents) {
  const res = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-access-password": password },
    body: JSON.stringify({ contents }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Gemini error");
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "Sem resposta";
}

async function buildAnalysisContents(posts, handle) {
  const postsData = posts.slice(0, 50).map((p, i) => ({
    index: i + 1,
    type: p.type,
    date: p.timestamp ? new Date(p.timestamp).toLocaleDateString("pt-BR") : "?",
    likes: p.likesCount || 0,
    comments: p.commentsCount || 0,
    caption: (p.caption || "").slice(0, 300),
    imageUrl: p.displayUrl || null,
  }));

  const parts = [];
  const textSummary = postsData.map(p =>
    `[Post ${p.index}] ${p.type} | ${p.date} | Likes: ${p.likes} | Comments: ${p.comments}\nCaption: ${p.caption}`
  ).join("\n\n");

  parts.push({
    text: `Você é um assistente especialista em análise de Instagram. Analise os ${postsData.length} posts do perfil @${handle}.\n\nDADOS:\n${textSummary}\n\nIMAGENS abaixo. Para cada imagem identifique: subjects, tipo de conteúdo, produtos, tom visual, texto presente.\n\nAo final responda: "Análise concluída! Tenho ${postsData.length} posts em contexto. Pergunte o que quiser sobre @${handle}."`
  });

  // Fetch images via proxy and encode as base64
  for (const p of postsData) {
    if (!p.imageUrl) continue;
    try {
      const r = await fetch("/api/img?url=" + encodeURIComponent(p.imageUrl));
      if (!r.ok) continue;
      const blob = await r.blob();
      const b64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(blob);
      });
      parts.push({ text: `[Post ${p.index} - ${p.date} - Likes:${p.likes}]:` });
      parts.push({ inlineData: { mimeType: blob.type || "image/jpeg", data: b64 } });
    } catch {}
  }

  return [{ parts }];
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
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [posts, setPosts] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [searches, setSearches] = useState(() => { try { return JSON.parse(localStorage.getItem(SEARCHES_KEY) || "[]"); } catch { return []; } });
  const pollRef = useRef(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisContents, setAnalysisContents] = useState(null);
  const [chatHistory, setChatHistory] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => { if (password) setUnlocked(true); }, []);
  useEffect(() => {
    if (!keyword.trim()) { setFiltered(posts); return; }
    const kw = keyword.toLowerCase();
    setFiltered(posts.filter((p) => (p.caption || "").toLowerCase().includes(kw)));
  }, [keyword, posts]);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory]);

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
    if (pollRef.current) clearInterval(pollRef.current);
    setLoading(true); setError(""); setStatus("Iniciando scraper..."); setPosts([]); setFiltered([]); setChatHistory([]); setAnalysisContents(null);
    try {
      const startRes = await fetch("/api/start", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-password": password },
        body: JSON.stringify({ handle, maxPosts, dateFrom, dateTo }),
      });
      if (startRes.status === 401) { setUnlocked(false); setPassword(""); localStorage.removeItem(ACCESS_PASSWORD_KEY); throw new Error("Senha incorreta"); }
      if (!startRes.ok) { const e = await startRes.json().catch(() => ({})); throw new Error(e.error || "Erro ao iniciar"); }
      const { runId, datasetId } = await startRes.json();
      setStatus("Scraper rodando...");
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const pollRes = await fetch("https://api.apify.com/v2/actor-runs/" + runId);
          const { data } = await pollRes.json();
          const runStatus = data.status;
          if (runStatus === "SUCCEEDED") {
            clearInterval(pollRef.current);
            setStatus("Buscando resultados...");
            const resultsRes = await fetch("/api/results?datasetId=" + datasetId, { headers: { "x-access-password": password } });
            if (!resultsRes.ok) { const e = await resultsRes.json().catch(() => ({})); throw new Error(e.error || "Erro"); }
            const items = await resultsRes.json();
            setPosts(items); setFiltered(items); setStatus(""); setLoading(false);
            const entry = { handle, date: new Date().toISOString(), count: items.length };
            const updated = [entry, ...searches.slice(0, 9)];
            setSearches(updated);
            localStorage.setItem(SEARCHES_KEY, JSON.stringify(updated));
          } else if (["FAILED","ABORTED","TIMED-OUT"].includes(runStatus)) {
            clearInterval(pollRef.current);
            setError("Run " + runStatus); setStatus(""); setLoading(false);
          } else {
            setStatus("Scraper rodando... " + attempts * 5 + "s (" + runStatus + ")");
          }
        } catch (pollErr) {
          if (pollErr.message.startsWith("Run ")) { clearInterval(pollRef.current); setError(pollErr.message); setStatus(""); setLoading(false); }
        }
        if (attempts >= 120) { clearInterval(pollRef.current); setError("Timeout"); setStatus(""); setLoading(false); }
      }, 5000);
    } catch (err) { setError(err.message); setStatus(""); setLoading(false); }
  }

  async function handleAnalyze() {
    setAnalyzing(true);
    setChatHistory([]);
    try {
      const contents = await buildAnalysisContents(posts, handle);
      setAnalysisContents(contents);
      const reply = await callGemini(password, contents);
      setChatHistory([{ role: "assistant", text: reply }]);
    } catch (err) {
      setChatHistory([{ role: "assistant", text: "Erro: " + err.message }]);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleChat(e) {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    const newHistory = [...chatHistory, { role: "user", text: userMsg }];
    setChatHistory(newHistory);
    setChatLoading(true);
    try {
      // Build full conversation contents
      const baseContents = analysisContents || [];
      const conversationContents = [
        ...baseContents,
        ...newHistory.map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.text }],
        })),
      ];
      const reply = await callGemini(password, conversationContents);
      setChatHistory([...newHistory, { role: "assistant", text: reply }]);
    } catch (err) {
      setChatHistory([...newHistory, { role: "assistant", text: "Erro: " + err.message }]);
    } finally {
      setChatLoading(false);
    }
  }

  const totalLikes = filtered.reduce((s, p) => s + (p.likesCount || 0), 0);
  const totalComments = filtered.reduce((s, p) => s + (p.commentsCount || 0), 0);
  const avgLikes = filtered.length ? Math.round(totalLikes / filtered.length) : 0;
  const avgComments = filtered.length ? Math.round(totalComments / filtered.length) : 0;

  const st = {
    app: { minHeight: "100vh", background: "#0f172a", color: "#e2e8f0", fontFamily: "'Barlow Condensed', sans-serif", padding: "24px" },
    header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 24 },
    logo: { fontSize: 28, fontWeight: 700, color: "#f5a020", letterSpacing: 1 },
    card: { background: "#1e2d4a", borderRadius: 12, padding: "20px 24px", marginBottom: 20 },
    label: { fontSize: 13, color: "#94a3b8", marginBottom: 4, display: "block" },
    input: { width: "100%", background: "#0f172a", border: "1px solid #334155", borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontSize: 15, fontFamily: "inherit", boxSizing: "border-box" },
    btn: { background: "#f5a020", color: "#0f172a", border: "none", borderRadius: 8, padding: "10px 24px", fontWeight: 700, fontSize: 16, cursor: "pointer", fontFamily: "inherit" },
    btnSm: { background: "#1B2D5B", color: "#e2e8f0", border: "1px solid #334155", borderRadius: 6, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
    btnAI: { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 15, cursor: "pointer", fontFamily: "inherit" },
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
    statusBox: { background: "#1B2D5B", border: "1px solid #334155", borderRadius: 8, padding: "10px 16px", marginBottom: 16, color: "#94a3b8", display: "flex", alignItems: "center", gap: 10 },
    lockWrap: { minHeight: "100vh", background: "#0f172a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Barlow Condensed', sans-serif" },
    lockCard: { background: "#1e2d4a", borderRadius: 16, padding: "40px 48px", width: "100%", maxWidth: 380, textAlign: "center" },
    chatWrap: { background: "#1e2d4a", borderRadius: 12, marginBottom: 20, overflow: "hidden" },
    chatHeader: { background: "#1B2D5B", padding: "12px 20px", display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid #334155" },
    chatMessages: { padding: "16px 20px", maxHeight: 400, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12 },
    msgUser: { alignSelf: "flex-end", background: "#f5a020", color: "#0f172a", borderRadius: "12px 12px 2px 12px", padding: "8px 14px", maxWidth: "80%", fontSize: 14, fontWeight: 600 },
    msgAI: { alignSelf: "flex-start", background: "#0f172a", color: "#e2e8f0", borderRadius: "12px 12px 12px 2px", padding: "10px 14px", maxWidth: "85%", fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" },
    chatInputWrap: { display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid #334155" },
  };

  if (!unlocked) {
    return (
      <div style={st.lockWrap}>
        <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet" />
        <div style={st.lockCard}>
          <div style={{ ...st.logo, fontSize: 36, marginBottom: 8 }}>IG Intel</div>
          <div style={{ color: "#475569", fontSize: 14, marginBottom: 28 }}>Instagram Analytics</div>
          {error && <div style={{ ...st.errorBox, marginBottom: 16 }}>{error}</div>}
          <form onSubmit={handleUnlock}>
            <div style={{ marginBottom: 16 }}>
              <label style={st.label}>Senha de acesso</label>
              <input style={st.input} type="password" placeholder="..." value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} autoFocus />
            </div>
            <button type="submit" style={{ ...st.btn, width: "100%" }}>Entrar</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={st.app}>
      <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;600;700&display=swap" rel="stylesheet" />
      <div style={st.header}>
        <span style={st.logo}>IG Intel</span>
        <span style={{ color: "#475569", fontSize: 13 }}>Instagram Analytics</span>
        <button style={{ ...st.btnSm, marginLeft: "auto" }} onClick={() => { setUnlocked(false); setPassword(""); localStorage.removeItem(ACCESS_PASSWORD_KEY); }}>Sair</button>
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
          <button type="submit" style={{ ...st.btn, opacity: loading ? 0.6 : 1 }} disabled={loading}>
            {loading ? "Buscando..." : "Buscar"}
          </button>
        </form>
      </div>

      {status && <div style={st.statusBox}><span style={{ fontSize: 18 }}>⏳</span><span>{status}</span></div>}
      {error && <div style={st.errorBox}>{error}</div>}

      {posts.length > 0 && (
        <>
          <div style={st.grid4}>
            <div style={st.statCard}><div style={st.statVal}>{fmt(filtered.length)}</div><div style={st.statLbl}>Posts</div></div>
            <div style={st.statCard}><div style={st.statVal}>{fmt(totalLikes)}</div><div style={st.statLbl}>Likes totais</div></div>
            <div style={st.statCard}><div style={st.statVal}>{fmt(avgLikes)}</div><div style={st.statLbl}>Media likes</div></div>
            <div style={st.statCard}><div style={st.statVal}>{fmt(avgComments)}</div><div style={st.statLbl}>Media comentarios</div></div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...st.input, maxWidth: 240 }} placeholder="Filtrar por keyword..." value={keyword} onChange={(e) => setKeyword(e.target.value)} />
            <button style={st.btnSm} onClick={() => exportCSV(filtered, handle)}>Exportar CSV</button>
            <button style={{ ...st.btnAI, opacity: analyzing ? 0.6 : 1 }} onClick={handleAnalyze} disabled={analyzing}>
              {analyzing ? "Analisando..." : "✨ Analisar com AI"}
            </button>
          </div>

          {(chatHistory.length > 0 || analyzing) && (
            <div style={st.chatWrap}>
              <div style={st.chatHeader}>
                <span style={{ fontSize: 18 }}>✨</span>
                <span style={{ fontWeight: 700, color: "#e2e8f0" }}>AI Assistant</span>
                <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>@{handle} · {posts.length} posts</span>
              </div>
              <div style={st.chatMessages}>
                {analyzing && <div style={st.msgAI}><span style={{ opacity: 0.6 }}>Analisando {posts.length} posts e imagens... aguarde ⏳</span></div>}
                {chatHistory.map((m, i) => (
                  <div key={i} style={m.role === "user" ? st.msgUser : st.msgAI}>{m.text}</div>
                ))}
                {chatLoading && <div style={st.msgAI}><span style={{ opacity: 0.6 }}>Pensando...</span></div>}
                <div ref={chatBottomRef} />
              </div>
              {chatHistory.length > 0 && (
                <form onSubmit={handleChat} style={st.chatInputWrap}>
                  <input style={{ ...st.input, flex: 1 }} placeholder="Pergunte qualquer coisa sobre os posts..." value={chatInput} onChange={(e) => setChatInput(e.target.value)} disabled={chatLoading || analyzing} />
                  <button type="submit" style={{ ...st.btn, padding: "8px 16px", fontSize: 14 }} disabled={chatLoading || analyzing}>Enviar</button>
                </form>
              )}
            </div>
          )}

          <div style={st.postGrid}>
            {filtered.map((p, i) => {
              const postUrl = p.url || (p.shortCode && "https://www.instagram.com/p/" + p.shortCode + "/");
              return (
                <div key={i} style={st.postCard} onClick={() => postUrl && window.open(postUrl, "_blank")}>
                  {p.displayUrl ? <img src={"/api/img?url=" + encodeURIComponent(p.displayUrl)} alt="" style={st.thumb} loading="lazy" /> : <div style={{ ...st.thumb, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 12 }}>sem thumb</div>}
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

      {searches.length > 0 && posts.length === 0 && !loading && (
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
