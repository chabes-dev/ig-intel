import { useState, useEffect } from "react";

const APIFY_ACTOR = "apify~instagram-scraper";
const STORAGE_KEY = "ig_intel_token";
const SEARCHES_KEY = "ig_intel_searches";
const fmt = (n) => n?.toLocaleString("pt-BR") ?? "—";
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
const typeLabel = { Image: "Foto", Video: "Video", Sidecar: "Carrossel" };
const typeColor = { Image: "#3b82f6", Video: "#f5a020", Sidecar: "#10b981" };

async function runApifyScraper(token, handle, maxPosts, dateFrom, dateTo) {
  const cleanHandle = handle.replace("@", "").trim();
  const url = "https://api.apify.com/v2/acts/" + APIFY_ACTOR + "/runs?token=" + token;
  const input = { directUrls: ["https://www.instagram.com/" + cleanHandle + "/"], resultsType: "posts", resultsLimit: maxPosts, addParentData: false };
  const runRes = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  if (!runRes.ok) throw new Error("Apify error: " + runRes.status);
  const { data: run } = await runRes.json();
  let status = run.status, attempts = 0;
  while (!["SUCCEEDED","FAILED","ABORTED"].includes(status) && attempts < 60) {
    await new Promise(r => setTimeout(r, 3000));
    const s = await fetch("https://api.apify.com/v2/actor-runs/" + run.id + "?token=" + token);
    const { data } = await s.json();
    status = data.status; attempts++;
  }
  if (status !== "SUCCEEDED") throw new Error("Run " + status);
  const dataRes = await fetch("https://api.apify.com/v2/actor-runs/" + run.id + "/dataset/items?token=" + token + "&limit=1000");
  const items = await dataRes.json();
  return items.filter(post => {
    if (!post.timestamp) return true;
    const d = new Date(post.timestamp);
    if (dateFrom && d < new Date(dateFrom)) return false;
    if (dateTo && d > new Date(dateTo + "T23:59:59")) return false;
    return true;
  });
}

function exportCSV(posts, handle) {
  const rows = posts.map(p => [fmtDate(p.timestamp), typeLabel[p.type]||p.type, p.likesCount||"", p.commentsCount||"", p.videoViewCount||"", p.videoPlayCount||"", '"'+(p.caption||"").replace(/"/g,'""').replace(/
/g," ")+'"', p.url]);
  const csv = [["Data","Tipo","Likes","Comentarios","Views","Plays","Caption","URL"], ...rows].map(r=>r.join(";")).join("
");
  const blob = new Blob(["﻿"+csv], {type:"text/csv;charset=utf-8;"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = handle+"_"+new Date().toISOString().slice(0,10)+".csv"; a.click();
}

const NAVY="#1B2D5B", AMBER="#f5a020";
const iStyle={background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.12)",color:"#fff",fontSize:14,padding:"10px 14px",outline:"none",borderRadius:6,width:"100%",boxSizing:"border-box",fontFamily:"system-ui"};
const lStyle={fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"rgba(255,255,255,0.35)",marginBottom:6,display:"block"};
const btnP={background:AMBER,color:NAVY,border:"none",cursor:"pointer",fontFamily:"'Barlow Condensed',sans-serif",fontSize:14,fontWeight:800,letterSpacing:2,textTransform:"uppercase",padding:"12px 24px",borderRadius:6};
const btnS={background:"transparent",color:"rgba(255,255,255,0.5)",border:"1px solid rgba(255,255,255,0.15)",cursor:"pointer",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:700,letterSpacing:2,textTransform:"uppercase",padding:"10px 18px",borderRadius:6};

const Pill=({label,color})=><span style={{background:color+"22",color,border:"1px solid "+color+"44",fontSize:10,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",padding:"2px 8px",borderRadius:3,whiteSpace:"nowrap"}}>{label}</span>;
const StatBox=({label,value,sub})=><div style={{background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",padding:"14px 16px",borderRadius:6,minWidth:100}}><div style={{fontSize:22,fontWeight:800,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif"}}>{value}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:1.5,textTransform:"uppercase",marginTop:2}}>{label}</div>{sub&&<div style={{fontSize:11,color:AMBER,marginTop:3}}>{sub}</div>}</div>;

const PostCard=({post,keyword})=>{
  const [err,setErr]=useState(false);
  const cap=post.caption||"", prev=cap.slice(0,200);
  return <div onClick={()=>window.open(post.url,"_blank")} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,overflow:"hidden",cursor:"pointer"}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(245,160,32,0.4)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}>
    <div style={{position:"relative",height:160,background:"#0d1829",overflow:"hidden"}}>
      {!err&&post.displayUrl?<img src={post.displayUrl} alt="" onError={()=>setErr(true)} style={{width:"100%",height:"100%",objectFit:"cover",opacity:0.85}}/>:<div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"linear-gradient(135deg,#0b1929,#1B2D5B)"}}><span style={{fontSize:32}}>{post.type==="Video"?"🎬":post.type==="Sidecar"?"📎":"🖼"}</span></div>}
      <div style={{position:"absolute",top:8,left:8}}><Pill label={typeLabel[post.type]||post.type} color={typeColor[post.type]||"#888"}/></div>
      {post.videoPlayCount&&<div style={{position:"absolute",bottom:8,right:8,background:"rgba(0,0,0,0.7)",padding:"2px 7px",borderRadius:4,fontSize:11,color:"#fff",fontWeight:600}}>{"▶ "+fmt(post.videoPlayCount)}</div>}
    </div>
    <div style={{padding:"12px 14px"}}>
      <div style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:1,marginBottom:6}}>{fmtDate(post.timestamp)}</div>
      <div style={{fontSize:12,lineHeight:1.5,marginBottom:10,minHeight:54,color:"rgba(255,255,255,0.55)"}}>{keyword?prev.split(new RegExp("("+keyword+")","gi")).map((p,i)=>new RegExp(keyword,"gi").test(p)?<mark key={i} style={{background:"#f5a02055",color:AMBER}}>{p}</mark>:<span key={i}>{p}</span>):prev+""}</div>
      <div style={{display:"flex",gap:12,borderTop:"1px solid rgba(255,255,255,0.06)",paddingTop:10}}>
        {[["LIKES",post.likesCount],["COMENT.",post.commentsCount],post.videoViewCount&&["VIEWS",post.videoViewCount]].filter(Boolean).map(([l,v])=><div key={l} style={{textAlign:"center"}}><div style={{fontSize:14,fontWeight:700,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif"}}>{fmt(v)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:1}}>{l}</div></div>)}
        <div style={{marginLeft:"auto",textAlign:"right"}}><div style={{fontSize:11,color:AMBER,fontWeight:600}}>{(post.likesCount||0)+(post.commentsCount||0)}</div><div style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:1}}>ENG.</div></div>
      </div>
    </div>
  </div>;
};

export default function App(){
  const[token,setToken]=useState(()=>localStorage.getItem(STORAGE_KEY)||"");
  const[tokenInput,setTokenInput]=useState(()=>localStorage.getItem(STORAGE_KEY)||"");
  const[tokenSaved,setTokenSaved]=useState(!!localStorage.getItem(STORAGE_KEY));
  const[handle,setHandle]=useState("");
  const[maxPosts,setMaxPosts]=useState(50);
  const[dateFrom,setDateFrom]=useState(()=>{const d=new Date();d.setFullYear(d.getFullYear()-2);return d.toISOString().slice(0,10)});
  const[dateTo,setDateTo]=useState(new Date().toISOString().slice(0,10));
  const[keyword,setKeyword]=useState("");
  const[posts,setPosts]=useState([]);
  const[filteredPosts,setFilteredPosts]=useState([]);
  const[loading,setLoading]=useState(false);
  const[loadingMsg,setLoadingMsg]=useState("");
  const[error,setError]=useState("");
  const[searches,setSearches]=useState(()=>{try{return JSON.parse(localStorage.getItem(SEARCHES_KEY)||"[]")}catch{return[]}});
  const[sortBy,setSortBy]=useState("date");
  const[filterType,setFilterType]=useState("all");
  const[activeTab,setActiveTab]=useState("search");

  const saveToken=()=>{localStorage.setItem(STORAGE_KEY,tokenInput);setToken(tokenInput);setTokenSaved(true)};

  useEffect(()=>{
    let r=[...posts];
    if(filterType!=="all") r=r.filter(p=>p.type===filterType);
    if(keyword) r=r.filter(p=>(p.caption||"").toLowerCase().includes(keyword.toLowerCase()));
    r.sort((a,b)=>{
      if(sortBy==="date") return new Date(b.timestamp)-new Date(a.timestamp);
      if(sortBy==="likes") return(b.likesCount||0)-(a.likesCount||0);
      if(sortBy==="views") return(b.videoPlayCount||b.videoViewCount||0)-(a.videoPlayCount||a.videoViewCount||0);
      if(sortBy==="comments") return(b.commentsCount||0)-(a.commentsCount||0);
      if(sortBy==="engagement") return((b.likesCount||0)+(b.commentsCount||0))-((a.likesCount||0)+(a.commentsCount||0));
      return 0;
    });
    setFilteredPosts(r);
  },[posts,keyword,sortBy,filterType]);

  const runSearch=async()=>{
    if(!token){setError("Configure seu Apify token primeiro.");return}
    if(!handle){setError("Digite um @ para buscar.");return}
    setError("");setLoading(true);setPosts([]);setActiveTab("results");
    try{
      setLoadingMsg("Iniciando scraper...");
      const results=await runApifyScraper(token,handle,maxPosts,dateFrom,dateTo);
      setPosts(results);
      const entry={handle:handle.replace("@",""),date:new Date().toISOString(),count:results.length,dateFrom,dateTo};
      const updated=[entry,...searches.slice(0,9)];
      setSearches(updated);localStorage.setItem(SEARCHES_KEY,JSON.stringify(updated));
    }catch(e){setError(e.message);setActiveTab("search")}
    finally{setLoading(false);setLoadingMsg("")}
  };

  const stats=posts.length?{totalLikes:posts.reduce((s,p)=>s+(p.likesCount||0),0),totalComments:posts.reduce((s,p)=>s+(p.commentsCount||0),0),totalViews:posts.reduce((s,p)=>s+(p.videoPlayCount||p.videoViewCount||0),0),byType:posts.reduce((a,p)=>{a[p.type]=(a[p.type]||0)+1;return a},{})}:null;
  const avgLikes=stats?Math.round(stats.totalLikes/filteredPosts.length):0;
  const avgComments=stats?Math.round(stats.totalComments/filteredPosts.length):0;
  const cleanHandle=handle.replace("@","").trim();

  return <div style={{background:"#080f1c",minHeight:"100vh",color:"#fff",fontFamily:"system-ui,sans-serif"}}>
    <style>{"*{box-sizing:border-box;margin:0;padding:0}@keyframes spin{to{transform:rotate(360deg)}}select option{background:#1B2D5B}"}</style>
    <div style={{background:"rgba(27,45,91,0.8)",borderBottom:"1px solid rgba(245,160,32,0.2)",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56,position:"sticky",top:0,zIndex:100}}>
      <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:800,letterSpacing:3,color:"#fff"}}>IG INTEL <span style={{fontSize:10,color:"rgba(255,255,255,0.3)",letterSpacing:2}}>v1.0</span></span>
      <div style={{display:"flex",gap:2}}>{[["search","Busca"],["results","Resultados"+(posts.length?" ("+filteredPosts.length+")":"")],["history","Historico"]].map(([id,label])=><button key={id} onClick={()=>setActiveTab(id)} style={{background:activeTab===id?"rgba(245,160,32,0.15)":"transparent",color:activeTab===id?AMBER:"rgba(255,255,255,0.4)",border:"none",cursor:"pointer",padding:"6px 16px",fontFamily:"'Barlow Condensed',sans-serif",fontSize:12,fontWeight:700,letterSpacing:1.5,textTransform:"uppercase",borderBottom:activeTab===id?"2px solid "+AMBER:"2px solid transparent",height:56}}>{label}</button>)}</div>
      <div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:6,height:6,borderRadius:"50%",background:tokenSaved?"#10b981":"#ef4444"}}/><span style={{fontSize:10,color:"rgba(255,255,255,0.35)"}}>{tokenSaved?"Token OK":"Sem token"}</span></div>
    </div>
    <div style={{maxWidth:1100,margin:"0 auto",padding:"28px 24px"}}>
      {activeTab==="search"&&<div style={{display:"grid",gridTemplateColumns:"1fr 300px",gap:24}}>
        <div style={{display:"flex",flexDirection:"column",gap:16}}>
          <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:28,fontWeight:900}}>Analise de <span style={{color:AMBER}}>Instagram</span></div>
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:20,display:"flex",flexDirection:"column",gap:14}}>
            <div><label style={lStyle}>@ do perfil</label><input value={handle} onChange={e=>setHandle(e.target.value)} placeholder="solvelservicossolares" style={iStyle} onKeyDown={e=>e.key==="Enter"&&runSearch()}/></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
              <div><label style={lStyle}>De</label><input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={iStyle}/></div>
              <div><label style={lStyle}>Ate</label><input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={iStyle}/></div>
              <div><label style={lStyle}>Max. posts</label><select value={maxPosts} onChange={e=>setMaxPosts(Number(e.target.value))} style={iStyle}>{[20,50,100,200,500].map(n=><option key={n} value={n}>{n} posts</option>)}</select></div>
            </div>
            <div><label style={lStyle}>Keyword</label><input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="manutencao, entrega..." style={iStyle}/></div>
            {error&&<div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:6,padding:"10px 14px",fontSize:13,color:"#ef4444"}}>{error}</div>}
            <button onClick={runSearch} disabled={loading} style={{...btnP,opacity:loading?0.6:1,display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>{loading?loadingMsg||"Buscando...":"Buscar Posts"}</button>
          </div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <div style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:10,padding:16}}>
            <div style={{fontSize:11,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:AMBER,marginBottom:12}}>Apify Token</div>
            <input type="password" value={tokenInput} onChange={e=>setTokenInput(e.target.value)} placeholder="apify_api_..." style={{...iStyle,marginBottom:10}}/>
            <button onClick={saveToken} style={{...btnS,width:"100%",textAlign:"center"}}>{tokenSaved?"Token Salvo":"Salvar Token"}</button>
          </div>
        </div>
      </div>}
      {activeTab==="results"&&<div>
        {loading?<div style={{textAlign:"center",padding:"80px 0"}}><div style={{width:40,height:40,border:"3px solid rgba(245,160,32,0.2)",borderTopColor:AMBER,borderRadius:"50%",margin:"0 auto 20px",animation:"spin 0.8s linear infinite"}}/><div style={{fontSize:14,color:"rgba(255,255,255,0.5)"}}>{loadingMsg}</div></div>
        :posts.length===0?<div style={{textAlign:"center",padding:"80px 0"}}><div style={{fontSize:40,marginBottom:16}}>🔍</div><div style={{fontSize:16,color:"rgba(255,255,255,0.4)"}}>Nenhum resultado</div><button onClick={()=>setActiveTab("search")} style={{...btnP,marginTop:20}}>Fazer busca</button></div>
        :<>
          {stats&&<div style={{marginBottom:20}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:20,fontWeight:900}}>{"@"+cleanHandle} <span style={{fontSize:13,color:"rgba(255,255,255,0.35)"}}>{filteredPosts.length} posts</span></span>
              <button onClick={()=>exportCSV(filteredPosts,cleanHandle)} style={btnS}>Exportar CSV</button>
            </div>
            <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
              <StatBox label="Posts" value={filteredPosts.length}/>
              <StatBox label="Likes" value={fmt(stats.totalLikes)} sub={"~"+fmt(avgLikes)+"/post"}/>
              <StatBox label="Comentarios" value={fmt(stats.totalComments)}/>
              {stats.totalViews>0&&<StatBox label="Views" value={fmt(stats.totalViews)}/>}
              {Object.entries(stats.byType).map(([t,c])=><StatBox key={t} label={typeLabel[t]||t} value={c}/>)}
            </div>
          </div>}
          <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            {["all","Image","Video","Sidecar"].map(t=><button key={t} onClick={()=>setFilterType(t)} style={{...btnS,padding:"5px 10px",fontSize:10,background:filterType===t?"rgba(245,160,32,0.15)":"transparent",color:filterType===t?AMBER:"rgba(255,255,255,0.4)"}}>{t==="all"?"Todos":typeLabel[t]||t}</button>)}
            <input value={keyword} onChange={e=>setKeyword(e.target.value)} placeholder="Keyword..." style={{...iStyle,width:180,padding:"6px 10px",fontSize:12}}/>
            <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{...iStyle,width:"auto",padding:"6px 10px",fontSize:11}}><option value="date">Data</option><option value="likes">Likes</option><option value="views">Views</option><option value="engagement">Engajamento</option></select>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14}}>{filteredPosts.map(p=><PostCard key={p.id} post={p} keyword={keyword}/>)}</div>
        </>}
      </div>}
      {activeTab==="history"&&<div>
        <div style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:22,fontWeight:900,marginBottom:16}}>Buscas Anteriores</div>
        {searches.length===0?<div style={{textAlign:"center",padding:60,color:"rgba(255,255,255,0.3)"}}>Nenhuma busca</div>
        :searches.map((s,i)=><div key={i} onClick={()=>{setHandle(s.handle);setDateFrom(s.dateFrom);setDateTo(s.dateTo);setActiveTab("search")}} style={{background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:8,padding:"12px 16px",display:"flex",alignItems:"center",gap:14,cursor:"pointer",marginBottom:8}} onMouseEnter={e=>e.currentTarget.style.borderColor="rgba(245,160,32,0.3)"} onMouseLeave={e=>e.currentTarget.style.borderColor="rgba(255,255,255,0.08)"}><span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:16,fontWeight:800}}>{"@"+s.handle}</span><span style={{fontSize:11,color:"rgba(255,255,255,0.35)"}}>{s.dateFrom+" → "+s.dateTo}</span><Pill label={s.count+" posts"} color={AMBER}/><span style={{marginLeft:"auto",fontSize:11,color:AMBER}}>Repetir →</span></div>)}
      </div>}
    </div>
  </div>;
}
