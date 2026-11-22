import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen,
  Check, ChevronDown, CircleHelp, CloudUpload, Command, Compass, Download,
  ExternalLink, FileArchive, FileImage, FileText, Filter, FolderOpen, Grid2X2,
  Heart, LayoutDashboard, LogIn, LogOut, Menu, Plus, Search, Settings, ShieldCheck,
  Sparkles, Star, Trash2, Upload, X
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./supabase";

const CATEGORIES = ["All", "PDF Notes", "Books", "Templates", "Presets", "AI Prompts", "Apps & Tools", "Other"];
const DEMO = [
  { id:"demo-1", title:"Creator Starter Pack", category:"Templates", description:"A clean collection of editable creator templates to kick-start your next project.", poster_url:"https://images.unsplash.com/photo-1558655146-d09347e92766?w=900&q=85", file_url:"#", file_name:"creator-starter-pack.zip", file_size:0, downloads:128, featured:true },
  { id:"demo-2", title:"The Design Handbook", category:"PDF Notes", description:"A practical visual guide to layout, typography, spacing and composition.", poster_url:"https://images.unsplash.com/photo-1544947950-fa07a98d237f?w=900&q=85", file_url:"#", file_name:"design-handbook.pdf", file_size:0, downloads:94, featured:true },
  { id:"demo-3", title:"Analog Film Presets", category:"Presets", description:"Warm tones and subtle grain for a consistent photo-editing workflow.", poster_url:"https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=900&q=85", file_url:"#", file_name:"analog-film-presets.zip", file_size:0, downloads:76, featured:false },
  { id:"demo-4", title:"AI Prompt Field Guide", category:"AI Prompts", description:"A useful prompt collection for research, writing, planning and creative work.", poster_url:"https://images.unsplash.com/photo-1677442136019-21780ecad995?w=900&q=85", file_url:"#", file_name:"prompt-field-guide.pdf", file_size:0, downloads:211, featured:true },
  { id:"demo-5", title:"Focus Toolkit", category:"Apps & Tools", description:"A curated collection of lightweight tools for getting meaningful work done.", poster_url:"https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=900&q=85", file_url:"#", file_name:"focus-toolkit.zip", file_size:0, downloads:53, featured:false },
  { id:"demo-6", title:"Study Notes Vol. 01", category:"PDF Notes", description:"Structured study notes with a clear, easy-to-scan reading layout.", poster_url:"https://images.unsplash.com/photo-1455390582262-044cjons?auto=format&fit=crop&w=900&q=80", file_url:"#", file_name:"study-notes.pdf", file_size:0, downloads:167, featured:false }
];

const formatSize = (bytes) => {
  if (!bytes) return "FILE";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes, index = 0;
  while (size >= 1024 && index < units.length - 1) { size /= 1024; index++; }
  return `${size.toFixed(index ? 1 : 0)} ${units[index]}`;
};
const safeFileName = (name = "assetly-download") => name.replace(/[\\/:*?"<>|]+/g, "-");

function App() {
  const [resources, setResources] = useState(DEMO);
  const [category, setCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("featured");
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("home");
  const [session, setSession] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title:"", category:"PDF Notes", description:"", featured:false });
  const [posterFile, setPosterFile] = useState(null);
  const [resourceFile, setResourceFile] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState("login");
  const posterInput = useRef(null);
  const resourceInput = useRef(null);

  const flash = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(flash.timer);
    flash.timer = window.setTimeout(() => setNotice(""), 4200);
  }, []);

  const loadResources = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.from("resources").select("*").eq("published", true).order("created_at", { ascending:false });
    if (error) flash(`Could not load resources: ${error.message}`);
    else setResources(data || []);
    setLoading(false);
  }, [flash]);

  const checkAdmin = useCallback(async (user) => {
    if (!supabase || !user) { setIsAdmin(false); return; }
    const { data, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    setIsAdmin(!error && data?.role === "admin");
  }, []);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }

    let alive = true;

    // Load public resources once. Auth initialization is handled by the
    // INITIAL_SESSION event below, avoiding a competing getSession() call.
    loadResources();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!alive) return;

      setSession(nextSession);

      if (!nextSession) {
        setIsAdmin(false);
        if (event === "SIGNED_OUT") setView("home");
        return;
      }

      // Never await Supabase queries inside onAuthStateChange. Defer the
      // profile lookup so it cannot block the auth client's internal lock.
      Promise.resolve().then(() => {
        if (alive) checkAdmin(nextSession.user);
      });
    });

    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [checkAdmin, loadResources]);

  const visible = useMemo(() => {
    let list = [...resources];
    if (category !== "All") list = list.filter(item => item.category === category);
    const term = query.trim().toLowerCase();
    if (term) list = list.filter(item => [item.title, item.description, item.category].some(v => (v || "").toLowerCase().includes(term)));
    if (sort === "popular") list.sort((a,b) => (b.downloads || 0) - (a.downloads || 0));
    else if (sort === "az") list.sort((a,b) => a.title.localeCompare(b.title));
    else list.sort((a,b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)));
    return list;
  }, [resources, category, query, sort]);

  const featured = visible.filter(item => item.featured).slice(0, 3);
  const downloadResource = async (item) => {
    if (String(item.id).startsWith("demo-") || item.file_url === "#") {
      flash("Demo item only — connect Supabase and upload your own file to enable downloads.");
      return;
    }
    try {
      if (supabase) {
        const { error } = await supabase.rpc("increment_resource_downloads", { resource_id: item.id });
        if (error) console.warn("Download counter was not updated:", error.message);
      }
      const link = document.createElement("a");
      link.href = item.file_url;
      link.download = safeFileName(item.file_name || item.title || "assetly-download");
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setResources(prev => prev.map(r => r.id === item.id ? { ...r, downloads:(r.downloads || 0) + 1 } : r));
    } catch (error) {
      flash(`Download could not start: ${error.message}`);
    }
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    if (!supabase) return flash("Add your Supabase URL and anon key in .env first.");
    setAuthBusy(true);
    try {
      const result = authMode === "login"
        ? await supabase.auth.signInWithPassword({ email:email.trim(), password })
        : await supabase.auth.signUp({ email:email.trim(), password });
      if (result.error) throw result.error;
      if (authMode === "signup" && !result.data.session) flash("Check your email to confirm your account, then sign in.");
      else flash("Signed in successfully.");
      setAuthOpen(false);
      setPassword("");
    } catch (error) { flash(error.message || "Authentication failed."); }
    finally { setAuthBusy(false); }
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) flash(error.message);
    else { setView("home"); flash("Signed out."); }
  };

  const resetForm = () => {
    setEditing(null);
    setForm({ title:"", category:"PDF Notes", description:"", featured:false });
    setPosterFile(null); setResourceFile(null);
    if (posterInput.current) posterInput.current.value = "";
    if (resourceInput.current) resourceInput.current.value = "";
  };

  const startEdit = (item) => {
    setEditing(item);
    setForm({ title:item.title || "", category:item.category || "Other", description:item.description || "", featured:Boolean(item.featured) });
    setPosterFile(null); setResourceFile(null);
    setView("admin");
    window.scrollTo({ top:0, behavior:"smooth" });
  };

  const uploadFile = async (file, folder) => {
    const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
    const path = `${folder}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("assetly-files").upload(path, file, { cacheControl:"3600", upsert:false });
    if (error) throw error;
    const { data } = supabase.storage.from("assetly-files").getPublicUrl(path);
    return { url:data.publicUrl, path };
  };

  const saveResource = async (event) => {
    event.preventDefault();
    if (!supabase || !isAdmin) return flash("Admin access is required.");
    if (!form.title.trim()) return flash("Please enter a resource title.");
    if (!editing && (!posterFile || !resourceFile)) return flash("Choose both a poster image and a downloadable file.");
    setSaving(true);
    let posterPath = editing?.poster_path || null;
    let filePath = editing?.file_path || null;
    try {
      let posterUrl = editing?.poster_url || "";
      let fileUrl = editing?.file_url || "";
      if (posterFile) { const uploaded = await uploadFile(posterFile, "posters"); posterUrl = uploaded.url; posterPath = uploaded.path; }
      if (resourceFile) { const uploaded = await uploadFile(resourceFile, "downloads"); fileUrl = uploaded.url; filePath = uploaded.path; }
      const payload = {
        title:form.title.trim(), category:form.category, description:form.description.trim(),
        featured:form.featured, poster_url:posterUrl, poster_path:posterPath,
        file_url:fileUrl, file_path:filePath, file_name:resourceFile?.name || editing?.file_name || "",
        file_size:resourceFile?.size ?? editing?.file_size ?? 0, published:true
      };
      const result = editing
        ? await supabase.from("resources").update(payload).eq("id", editing.id).select().single()
        : await supabase.from("resources").insert(payload).select().single();
      if (result.error) throw result.error;
      flash(editing ? "Resource updated." : "Resource published.");
      resetForm();
      await loadResources();
      setView("manage");
    } catch (error) {
      flash(`Upload failed: ${error.message}`);
    } finally { setSaving(false); }
  };

  const deleteResource = async (item) => {
    if (!supabase || !isAdmin || !window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    const paths = [item.poster_path, item.file_path].filter(Boolean);
    try {
      if (paths.length) {
        const { error: storageError } = await supabase.storage.from("assetly-files").remove(paths);
        if (storageError) console.warn("Storage cleanup warning:", storageError.message);
      }
      const { error } = await supabase.from("resources").delete().eq("id", item.id);
      if (error) throw error;
      setResources(prev => prev.filter(r => r.id !== item.id));
      if (selected?.id === item.id) setSelected(null);
      flash("Resource deleted.");
    } catch (error) { flash(`Delete failed: ${error.message}`); }
  };

  const goAdmin = () => {
    if (!session) { setAuthOpen(true); return; }
    if (!isAdmin) { flash("This account does not have admin access."); return; }
    setView("admin");
    setMenuOpen(false);
  };

  const openResource = (item) => setSelected(item);
  const isDemo = !isSupabaseConfigured;

  return (
    <div className="site-shell">
      <header className="topbar">
        <button className="brand" onClick={() => { setView("home"); setCategory("All"); }} aria-label="ASSETLY home"><img src="/assets/assetly-logo.png" alt="ASSETLY"/></button>
        <nav className="desktop-nav">
          <button onClick={() => { setView("home"); setCategory("All"); }}>Explore</button>
          <a href="#categories">Categories</a>
          <a href="#about">About</a>
          {isAdmin && <button onClick={() => setView("manage")}>Manage</button>}
        </nav>
        <div className="top-actions">
          <button className="icon-btn mobile-menu" onClick={() => setMenuOpen(v => !v)} aria-label="Open menu"><Menu size={18}/></button>
          {isAdmin && <button className="admin-pill" onClick={() => setView("admin")}><LayoutDashboard size={14}/> Admin</button>}
          {session ? <button className="join-btn" onClick={signOut}><LogOut size={14}/> Sign out</button> : <button className="join-btn" onClick={() => setAuthOpen(true)}>Join / Login <ArrowUpRight size={14}/></button>}
        </div>
      </header>

      {menuOpen && <div className="mobile-nav"><button onClick={() => { setView("home"); setMenuOpen(false); }}>Explore</button><a href="#categories" onClick={() => setMenuOpen(false)}>Categories</a><a href="#about" onClick={() => setMenuOpen(false)}>About</a>{isAdmin && <button onClick={() => { setView("manage"); setMenuOpen(false); }}>Manage resources</button>}</div>}

      {view === "home" && <>
        <main>
          <section className="hero">
            <div className="hero-topline"><span>THE DIGITAL RESOURCE LIBRARY</span><span className="live-dot">CURATED FOR THE CURIOUS</span></div>
            <div className="hero-layout">
              <div className="hero-copy">
                <p className="eyebrow">LESS SEARCHING. MORE CREATING.</p>
                <h1>GOOD STUFF.<br/><em>READY TO</em><br/>DOWNLOAD<span className="yellow-dot">.</span></h1>
                <p className="hero-description">A growing collection of useful digital resources — notes, templates, presets, prompts, tools and more.</p>
                <button className="black-button" onClick={() => document.getElementById("library")?.scrollIntoView({ behavior:"smooth" })}>Explore the library <ArrowDown size={16}/></button>
              </div>
              <div className="hero-art">
                <div className="hero-stamp"><Sparkles size={17}/><b>FRESH<br/>DROPS</b><span>✳ ✳ ✳</span></div>
                <div className="hero-poster poster-one"><span>01 / CREATIVE KIT</span><strong>MAKE<br/>THINGS<br/>HAPPEN.</strong><div className="poster-orb">✳</div></div>
                <div className="hero-poster poster-two"><span>02 / IDEAS INSIDE</span><strong>THINK<br/>BETTER.</strong><div className="poster-lines">✳<br/>✳<br/>✳</div></div>
                <div className="hero-note"><span>HANDPICKED DIGITAL GOODNESS</span><b>OPEN THE VAULT <ArrowUpRight size={13}/></b></div>
              </div>
            </div>
            <div className="hero-bottom"><span>01 — DISCOVER</span><span>02 — PICK YOUR DROP</span><span>03 — DOWNLOAD IN A CLICK</span></div>
          </section>

          <section className="ticker" aria-label="Resource categories"><div>PDF NOTES ✳ TEMPLATES ✳ PRESETS ✳ AI PROMPTS ✳ BOOKS ✳ APPS & TOOLS ✳ PDF NOTES ✳ TEMPLATES ✳ PRESETS ✳</div></section>

          <section className="library-section" id="library">
            <div className="section-heading">
              <div><p className="eyebrow">THE GOOD STUFF</p><h2>THE <span>LIBRARY</span><sup>✳</sup></h2></div>
              <div className="library-count"><b>{resources.length.toString().padStart(2,"0")}</b><span>RESOURCES<br/>AND COUNTING</span></div>
            </div>
            <div className="toolbar">
              <div className="searchbox"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search resources..." aria-label="Search resources"/>{query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={15}/></button>}</div>
              <label className="sort-select"><Filter size={15}/><select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort resources"><option value="featured">Featured first</option><option value="popular">Most downloaded</option><option value="az">Name A–Z</option></select><ChevronDown size={14}/></label>
            </div>
            <div className="category-row" id="categories">
              {CATEGORIES.map(cat => <button key={cat} className={category === cat ? "category-chip active" : "category-chip"} onClick={() => setCategory(cat)}>{cat}</button>)}
            </div>
            {loading ? <div className="empty-state"><div className="loader"/><p>Loading the library...</p></div> : visible.length === 0 ? <div className="empty-state"><FolderOpen size={34}/><h3>No resources found</h3><p>Try another search or category.</p><button className="text-button" onClick={() => { setQuery(""); setCategory("All"); }}>Clear filters <ArrowRight size={14}/></button></div> :
              <div className="resource-grid">
                {visible.map((item,index) => <ResourceCard key={item.id} item={item} index={index} onOpen={() => openResource(item)} onDownload={() => downloadResource(item)}/>)}
              </div>}
            <div className="library-foot"><span>SHOWING {visible.length} OF {resources.length} RESOURCES</span><span>MADE FOR YOUR NEXT BIG IDEA ↗</span></div>
          </section>

          <section className="manifesto" id="about"><div className="manifesto-mark">A<span>✳</span></div><div><p className="eyebrow">A LITTLE LESS SCROLLING</p><h2>MORE MAKING.<br/><i>THAT'S THE IDEA.</i></h2></div><p className="manifesto-text">ASSETLY brings useful digital things together in one place. Find what you need, grab your download, and get back to making something great.</p></section>
        </main>
        <footer><button className="brand footer-brand" onClick={() => window.scrollTo({top:0,behavior:"smooth"})}><img src="/assets/assetly-logo.png" alt="ASSETLY"/></button><span>DISCOVER GOOD THINGS. MAKE GREAT THINGS.</span><span>© {new Date().getFullYear()} ASSETLY</span></footer>
      </>}

      {(view === "admin" || view === "manage") && isAdmin && <main className="admin-page">
        <div className="admin-header"><div><p className="eyebrow">PRIVATE WORKSPACE</p><h1>ADMIN <em>STUDIO.</em></h1><p>Upload a poster and its file. Publish it to the public library.</p></div><button className="outline-button" onClick={() => setView("home")}><ArrowLeft size={15}/> View website</button></div>
        <div className="admin-tabs"><button className={view === "admin" ? "active" : ""} onClick={() => { resetForm(); setView("admin"); }}><Plus size={15}/> Add resource</button><button className={view === "manage" ? "active" : ""} onClick={() => setView("manage")}><Grid2X2 size={15}/> Manage resources <span>{resources.length}</span></button></div>
        {view === "admin" ? <form className="upload-form" onSubmit={saveResource}>
          <div className="form-main">
            <div className="form-card"><div className="form-card-head"><span>01 / RESOURCE DETAILS</span><span>REQUIRED FIELDS *</span></div>
              <label>Resource title *<input required maxLength={90} value={form.title} onChange={e => setForm({...form,title:e.target.value})} placeholder="e.g. Minimal Resume Template"/></label>
              <label>Category *<select value={form.category} onChange={e => setForm({...form,category:e.target.value})}>{CATEGORIES.filter(c => c !== "All").map(c => <option key={c}>{c}</option>)}</select></label>
              <label>Description<textarea rows="4" maxLength={350} value={form.description} onChange={e => setForm({...form,description:e.target.value})} placeholder="What is this resource and who is it useful for?"/></label>
              <label className="checkline"><input type="checkbox" checked={form.featured} onChange={e => setForm({...form,featured:e.target.checked})}/> Feature this resource on the library</label>
            </div>
            <div className="form-card"><div className="form-card-head"><span>02 / FILES</span><span>POSTER + DOWNLOAD</span></div>
              <div className="file-pickers">
                <div className="file-pick"><input ref={posterInput} type="file" accept="image/png,image/jpeg,image/webp,image/avif" onChange={e => setPosterFile(e.target.files?.[0] || null)}/><div className="pick-visual"><FileImage size={24}/><b>{posterFile?.name || (editing ? "Replace poster (optional)" : "Choose poster image *")}</b><span>JPG, PNG, WEBP · max 8 MB</span></div><button type="button" className="outline-button" onClick={() => posterInput.current?.click()}><Upload size={14}/> Browse poster</button></div>
                <div className="file-pick"><input ref={resourceInput} type="file" onChange={e => setResourceFile(e.target.files?.[0] || null)}/><div className="pick-visual"><FileArchive size={24}/><b>{resourceFile?.name || (editing ? "Replace download file (optional)" : "Choose resource file *")}</b><span>PDF, ZIP, PNG, PSD and more · max 50 MB</span></div><button type="button" className="outline-button" onClick={() => resourceInput.current?.click()}><Upload size={14}/> Browse file</button></div>
              </div>
              <p className="hint">Tip: use a portrait or square poster for the best gallery display. Files are stored privately from the admin controls and served as public downloads.</p>
            </div>
          </div>
          <aside className="form-side"><div className="form-card publish-card"><span className="eyebrow">READY WHEN YOU ARE</span><h3>{editing ? "Update this drop." : "Make it live."}</h3><p>Your resource appears in the public gallery as soon as you publish it.</p><button className="black-button full" disabled={saving}>{saving ? "Saving..." : <>{editing ? "Save changes" : "Publish resource"} <ArrowUpRight size={16}/></>}</button><button type="button" className="text-button" onClick={resetForm}>Clear form</button></div><div className="form-card"><ShieldCheck size={22}/><h4>Admin only</h4><p>Only accounts marked as admin in Supabase can publish, edit or delete resources.</p></div></aside>
        </form> : <div className="manage-list">{resources.length === 0 ? <div className="empty-state"><FolderOpen/><h3>No resources yet</h3><p>Upload your first resource to get started.</p><button className="black-button" onClick={() => setView("admin")}>Add resource <Plus size={15}/></button></div> : resources.map(item => <div className="manage-row" key={item.id}><img src={item.poster_url} alt="" onError={e => {e.currentTarget.style.visibility="hidden"}}/><div className="manage-info"><b>{item.title}</b><span>{item.category} · {item.downloads || 0} downloads</span></div><button className="icon-btn" onClick={() => startEdit(item)} aria-label={`Edit ${item.title}`}><Settings size={17}/></button><button className="icon-btn danger" onClick={() => deleteResource(item)} aria-label={`Delete ${item.title}`}><Trash2 size={17}/></button></div>)}</div>}
      </main>}

      {view !== "home" && !isAdmin && !authOpen && <main className="admin-page"><div className="empty-state"><ShieldCheck size={38}/><h2>Admin access required</h2><p>Sign in with the account that has been granted the admin role.</p><button className="black-button" onClick={() => setAuthOpen(true)}>Sign in <LogIn size={15}/></button><button className="text-button" onClick={() => setView("home")}>Back to library</button></div></main>}

      {selected && <div className="modal-backdrop" onMouseDown={e => { if(e.target === e.currentTarget) setSelected(null); }}><div className="detail-modal"><button className="modal-close" onClick={() => setSelected(null)} aria-label="Close"><X size={20}/></button><div className="detail-image"><img src={selected.poster_url} alt={selected.title}/><span>{selected.category}</span></div><div className="detail-copy"><p className="eyebrow">ASSETLY RESOURCE / {String(selected.id).slice(0,6).toUpperCase()}</p><h2>{selected.title}</h2><p>{selected.description || "A useful digital resource, ready for your next project."}</p><div className="detail-meta"><span><Download size={14}/> {(selected.downloads || 0).toLocaleString()} downloads</span><span>{formatSize(selected.file_size)}</span></div><button className="black-button full" onClick={() => downloadResource(selected)}>Download now <ArrowDownToLine size={17}/></button><small>By downloading, you agree to use this resource according to its license.</small></div></div></div>}

      {authOpen && <div className="modal-backdrop" onMouseDown={e => {if(e.target===e.currentTarget)setAuthOpen(false);}}><form className="auth-modal" onSubmit={handleAuth}><button type="button" className="modal-close" onClick={() => setAuthOpen(false)} aria-label="Close"><X size={19}/></button><div className="auth-mark">A✳</div><p className="eyebrow">WELCOME TO ASSETLY</p><h2>{authMode === "login" ? "Good to have you back." : "Create your account."}</h2><label>Email address<input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com"/></label><label>Password<input type="password" required minLength={6} autoComplete={authMode === "login" ? "current-password" : "new-password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters"/></label><button className="black-button full" disabled={authBusy}>{authBusy ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"} <ArrowRight size={16}/></button><button type="button" className="text-button" onClick={() => setAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "New here? Create an account" : "Already registered? Sign in"}</button></form></div>}

      {!isSupabaseConfigured && <div className="setup-banner"><CircleHelp size={16}/><span><b>Preview mode:</b> connect Supabase to enable real uploads, admin login and downloads. See <code>README.md</code>.</span></div>}
      {notice && <div className="toast" role="status"><Check size={16}/>{notice}<button onClick={() => setNotice("")} aria-label="Dismiss"><X size={14}/></button></div>}
    </div>
  );
}

function ResourceCard({ item, index, onOpen, onDownload }) {
  return <article className={`resource-card card-${index % 4}`}>
    <button className="poster-button" onClick={onOpen} aria-label={`View ${item.title}`}>
      <div className="poster-frame"><img src={item.poster_url} alt={item.title} loading="lazy" onError={e => {e.currentTarget.src="https://images.unsplash.com/photo-1558655146-d09347e92766?w=900&q=80";}}/>
        <span className="poster-index">{String(index + 1).padStart(2,"0")} / ASSETLY</span><span className="poster-category">{item.category}</span><span className="poster-open"><ArrowUpRight size={19}/></span>
      </div>
    </button>
    <div className="resource-info"><div><span className="resource-type">{item.category}</span><h3>{item.title}</h3><p>{item.description || "A useful resource, ready to download."}</p></div><button className="download-circle" onClick={onDownload} aria-label={`Download ${item.title}`} title="Download"><ArrowDownToLine size={18}/></button></div>
    <div className="resource-foot"><span>{(item.downloads || 0).toLocaleString()} DOWNLOADS</span><button onClick={onOpen}>VIEW DETAILS <ArrowUpRight size={12}/></button></div>
  </article>;
}

export default App;
