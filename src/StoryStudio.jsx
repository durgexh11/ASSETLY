import React, { useEffect, useMemo, useRef, useState } from "react";
import { Instagram } from "lucide-react";

/* ------------------------------------------------------------------
   ASSETLY Story Studio
   One renderer (renderStory) draws the poster onto a 1080 x 1920 canvas.
   The canvas shown in the page IS the canvas that gets exported, so the
   downloaded PNG is pixel-identical to the live preview.
   Nothing here touches the database: counts are display-only.
------------------------------------------------------------------- */

const W = 1080;
const H = 1920;
const M = 88;              // side safe margin
const CW = W - M * 2;      // content width (904)
const LOGO_SRC = "/assets/assetly-logo.png";
// Visible area of the logo file (the PNG has transparent padding around it)
const LOGO_CROP = { x: 107, y: 153, w: 1986, h: 326 };

const SANS = '"Space Grotesk", Arial, Helvetica, sans-serif';
const DISPLAY = '"Anton", Impact, "Arial Narrow", sans-serif';
const MONO = '"DM Mono", "Courier New", monospace';

export const STORY_STYLES = [
  { id: "editorial", label: "Minimal Editorial" },
  { id: "midnight", label: "Midnight" },
  { id: "cobalt", label: "Electric Cobalt" },
  { id: "vermilion", label: "Vermilion" }
];

const PAPER = "#f6f5f1";
const INK = "#171719";
const RED = "#b80f25";
const RED_BRIGHT = "#e21d36";

/* ---------------------------- text helpers ---------------------------- */

const setFont = (ctx, weight, size, family) => { ctx.font = `${weight} ${size}px ${family}`; };
const setTracking = (ctx, px) => { if ("letterSpacing" in ctx) ctx.letterSpacing = `${px}px`; };

// Split a string into lines no wider than maxW. Very long words are broken by characters.
function wrapText(ctx, text, maxW) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  const pushWord = (word) => {
    let rest = word;
    while (ctx.measureText(rest).width > maxW && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && ctx.measureText(rest.slice(0, cut)).width > maxW) cut--;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxW) { line = next; continue; }
    if (line) lines.push(line);
    line = "";
    pushWord(word);
  }
  if (line) lines.push(line);
  return lines;
}

function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// Shrink the font until the text fits maxW x maxH in at most maxLines lines.
function fitBlock(ctx, { text, weight, family, maxW, maxH, maxLines, max, min, lineHeight, tracking = 0 }) {
  let size = max;
  let lines = [];
  for (; size >= min; size -= 2) {
    setFont(ctx, weight, size, family);
    setTracking(ctx, tracking * size);
    lines = wrapText(ctx, text, maxW);
    if (lines.length <= maxLines && lines.length * size * lineHeight - (lineHeight - 1) * size <= maxH) {
      return { size, lines, lineHeight };
    }
  }
  size = min;
  setFont(ctx, weight, size, family);
  setTracking(ctx, tracking * size);
  lines = wrapText(ctx, text, maxW);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = ellipsize(ctx, `${lines[maxLines - 1]}…`, maxW);
  }
  return { size, lines, lineHeight };
}

// Height of capital letters in the current font, used to align text by its visual top edge.
function capHeight(ctx) {
  const m = ctx.measureText("H");
  return m.actualBoundingBoxAscent || parseFloat(ctx.font.match(/(\d+(\.\d+)?)px/)?.[1] || 20) * 0.72;
}

// Draw fitted lines so the visual top of the first line sits at topY. Returns the bottom y.
function drawBlock(ctx, block, { weight, family, x, topY, color, tracking = 0, upper = false, align = "left" }) {
  setFont(ctx, weight, block.size, family);
  setTracking(ctx, tracking * block.size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const cap = capHeight(ctx);
  let y = topY + cap;
  for (const line of block.lines) {
    ctx.fillText(line, x, y);
    y += block.size * block.lineHeight;
  }
  ctx.textAlign = "left";
  return y - block.size * block.lineHeight + (block.size - cap);
}

function label(ctx, text, x, topY, { size = 24, color, align = "left", tracking = 0.14, weight = 500 }) {
  setFont(ctx, weight, size, MONO);
  setTracking(ctx, tracking * size);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  const cap = capHeight(ctx);
  ctx.fillText(text, x, topY + cap);
  ctx.textAlign = "left";
  setTracking(ctx, 0);
  return topY + cap;
}

// Single-line label that is shrunk (never clipped) to fit maxW.
function fitLabel(ctx, text, x, topY, maxW, opts) {
  let size = opts.size || 24;
  const tracking = opts.tracking ?? 0.14;
  for (; size > 14; size -= 1) {
    setFont(ctx, opts.weight || 500, size, MONO);
    setTracking(ctx, tracking * size);
    if (ctx.measureText(text).width <= maxW) break;
  }
  setFont(ctx, opts.weight || 500, size, MONO);
  setTracking(ctx, tracking * size);
  const out = ellipsize(ctx, text, maxW);
  return label(ctx, out, x, topY, { ...opts, size });
}

/* --------------------------- drawing helpers --------------------------- */

function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }

function drawCover(ctx, img, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale, sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2, sy = (img.naturalHeight - sh) / 2;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  ctx.restore();
}

// Original poster uploaded for the resource; neutral typographic panel only if there is none.
function drawPoster(ctx, img, x, y, w, h, fallback) {
  if (img) { drawCover(ctx, img, x, y, w, h); return; }
  rect(ctx, x, y, w, h, fallback.bg);
  const label1 = (fallback.category || "ASSETLY").toUpperCase();
  fitLabel(ctx, label1, x + 28, y + 28, w - 56, { size: 22, color: fallback.fg });
  setFont(ctx, 700, Math.min(w, h) * 0.5, DISPLAY);
  setTracking(ctx, 0);
  ctx.fillStyle = fallback.fg;
  ctx.textAlign = "center";
  const initial = (fallback.title || "A").trim().charAt(0).toUpperCase() || "A";
  ctx.textBaseline = "alphabetic";
  const cap = capHeight(ctx);
  ctx.fillText(initial, x + w / 2, y + h / 2 + cap / 2);
  ctx.textAlign = "left";
}

function drawLogo(ctx, logo, x, y, height, plate) {
  if (!logo) return { w: 0, h: height };
  const w = height * (LOGO_CROP.w / LOGO_CROP.h);
  if (plate) {
    const px = 28, py = 22;
    ctx.fillStyle = PAPER;
    ctx.beginPath();
    ctx.roundRect(x, y, w + px * 2, height + py * 2, 6);
    ctx.fill();
    ctx.drawImage(logo, LOGO_CROP.x, LOGO_CROP.y, LOGO_CROP.w, LOGO_CROP.h, x + px, y + py, w, height);
    return { w: w + px * 2, h: height + py * 2 };
  }
  ctx.drawImage(logo, LOGO_CROP.x, LOGO_CROP.y, LOGO_CROP.w, LOGO_CROP.h, x, y, w, height);
  return { w, h: height };
}

const hline = (ctx, y, color, weight = 2, x1 = M, x2 = W - M) => rect(ctx, x1, y, x2 - x1, weight, color);

function fitNumber(ctx, text, family, weight, maxW, max, min, tracking = 0) {
  let size = max;
  for (; size > min; size -= 2) {
    setFont(ctx, weight, size, family);
    setTracking(ctx, tracking * size);
    if (ctx.measureText(text).width <= maxW) break;
  }
  setFont(ctx, weight, size, family);
  setTracking(ctx, tracking * size);
  return size;
}

function drawNumber(ctx, text, { family, weight, x, topY, maxW, max, min, color, tracking = 0 }) {
  const size = fitNumber(ctx, text, family, weight, maxW, max, min, tracking);
  ctx.fillStyle = color;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  const cap = capHeight(ctx);
  ctx.fillText(text, x, topY + cap);
  return { size, bottom: topY + cap };
}

/* ------------------------------ the styles ------------------------------ */

function styleEditorial(ctx, d) {
  const c = { ink: INK, mute: "#77777b", line: "rgba(23,23,25,.9)", red: RED };
  rect(ctx, 0, 0, W, H, PAPER);

  drawLogo(ctx, d.logo, M, 150, 64, false);
  label(ctx, d.date, W - M, 150 + 32 - 9, { size: 22, color: c.mute, align: "right" });
  hline(ctx, 262, c.line, 2);

  label(ctx, `TOTAL ${d.metric}`, M, 330, { size: 26, color: c.red });
  const n = drawNumber(ctx, d.number, { family: SANS, weight: 700, x: M - 6, topY: 400, maxW: CW + 6, max: 280, min: 120, color: c.ink, tracking: -0.05 });
  setTracking(ctx, 0);
  rect(ctx, M, n.bottom + 56, 120, 10, c.red);

  // resource row: image + text
  const rowY = 790, imgW = 400, imgH = 500;
  drawPoster(ctx, d.poster, M, rowY, imgW, imgH, { bg: "#e4e2dc", fg: c.ink, category: d.category, title: d.title });
  ctx.strokeStyle = c.ink; ctx.lineWidth = 2; ctx.strokeRect(M + 1, rowY + 1, imgW - 2, imgH - 2);

  const tx = M + imgW + 48, tw = W - M - tx;
  fitLabel(ctx, (d.category || "RESOURCE").toUpperCase(), tx, rowY, tw, { size: 22, color: c.red });
  const block = fitBlock(ctx, { text: d.title, weight: 700, family: SANS, maxW: tw, maxH: imgH - 70, maxLines: 4, max: 66, min: 28, lineHeight: 1.08, tracking: -0.03 });
  drawBlock(ctx, block, { weight: 700, family: SANS, x: tx, topY: rowY + 62, color: c.ink, tracking: -0.03 });
  setTracking(ctx, 0);

  if (d.headline) {
    hline(ctx, 1400, c.line, 2);
    const hb = fitBlock(ctx, { text: d.headline, weight: 500, family: SANS, maxW: CW, maxH: 150, maxLines: 2, max: 48, min: 28, lineHeight: 1.18, tracking: -0.02 });
    drawBlock(ctx, hb, { weight: 500, family: SANS, x: M, topY: 1446, color: c.ink, tracking: -0.02 });
    setTracking(ctx, 0);
  }

  hline(ctx, 1700, c.line, 2);
  label(ctx, "EVERYTHING YOU NEED. ONE LIBRARY.", M, 1740, { size: 22, color: c.mute });
  label(ctx, "ASSETLY", W - M, 1740, { size: 22, color: c.ink, align: "right", weight: 500 });
}

function styleMidnight(ctx, d) {
  const mute = "#9a9aa2";
  rect(ctx, 0, 0, W, H, "#121214");

  // full-bleed original poster
  const imgH = 1000;
  drawPoster(ctx, d.poster, 0, 0, W, imgH, { bg: "#232327", fg: PAPER, category: d.category, title: d.title });
  rect(ctx, 0, imgH, W, 12, RED_BRIGHT);
  drawLogo(ctx, d.logo, M, 150, 58, true);

  // category tag on image
  setFont(ctx, 500, 22, MONO); setTracking(ctx, 0.14 * 22);
  const tag = ellipsize(ctx, (d.category || "RESOURCE").toUpperCase(), 520);
  const tw = ctx.measureText(tag).width + 44;
  rect(ctx, M, imgH - 40 - 54, tw, 54, "#121214");
  label(ctx, tag, M + 22, imgH - 40 - 54 + 15, { size: 22, color: PAPER });

  label(ctx, d.metric, M, 1086, { size: 26, color: RED_BRIGHT });
  const n = drawNumber(ctx, d.number, { family: SANS, weight: 700, x: M - 5, topY: 1140, maxW: CW + 5, max: 240, min: 110, color: PAPER, tracking: -0.05 });
  setTracking(ctx, 0);

  const ty = n.bottom + 52;
  const block = fitBlock(ctx, { text: d.title, weight: 600, family: SANS, maxW: CW, maxH: Math.min(230, 1640 - ty), maxLines: 3, max: 58, min: 28, lineHeight: 1.1, tracking: -0.02 });
  const bottom = drawBlock(ctx, block, { weight: 600, family: SANS, x: M, topY: ty, color: PAPER, tracking: -0.02 });
  setTracking(ctx, 0);

  if (d.headline) {
    const hy = Math.min(Math.max(bottom + 28, 1676), 1700);
    fitLabel(ctx, d.headline.toUpperCase(), M, hy, CW, { size: 26, color: mute });
  }
  hline(ctx, 1760, "rgba(246,245,241,.22)", 2);
  label(ctx, "ASSETLY — EVERYTHING YOU NEED. ONE LIBRARY.", M, 1796, { size: 20, color: mute });
}

function styleCobalt(ctx, d) {
  const BG = "#1b3db8", YEL = "#ffd84d", WHITE = "#ffffff", SOFT = "#c9d4ff";
  rect(ctx, 0, 0, W, H, BG);

  drawLogo(ctx, d.logo, M, 150, 58, true);
  label(ctx, d.date, W - M, 150 + 51 - 8, { size: 22, color: SOFT, align: "right" });

  const n = drawNumber(ctx, d.number, { family: DISPLAY, weight: 400, x: M - 4, topY: 320, maxW: CW + 4, max: 400, min: 150, color: WHITE });
  const mt = n.bottom + 40;
  rect(ctx, M, mt, 18, 18, YEL);
  label(ctx, d.metric, M + 38, mt - 4, { size: 30, color: YEL, weight: 500 });

  // image with hard offset block
  const imgW = 448, imgH = 560, ix = W - M - imgW - 24, iy = 790;
  rect(ctx, ix + 24, iy + 24, imgW, imgH, YEL);
  drawPoster(ctx, d.poster, ix, iy, imgW, imgH, { bg: "#122a85", fg: WHITE, category: d.category, title: d.title });

  // left column: category + optional headline
  const lw = ix - M - 40;
  fitLabel(ctx, (d.category || "RESOURCE").toUpperCase(), M, iy, lw, { size: 22, color: SOFT });
  rect(ctx, M, iy + 46, 60, 6, YEL);
  if (d.headline) {
    const hb = fitBlock(ctx, { text: d.headline, weight: 700, family: SANS, maxW: lw, maxH: imgH - 150, maxLines: 6, max: 52, min: 26, lineHeight: 1.1, tracking: -0.03 });
    drawBlock(ctx, hb, { weight: 700, family: SANS, x: M, topY: iy + 96, color: WHITE, tracking: -0.03 });
    setTracking(ctx, 0);
  }

  const ty = iy + imgH + 24 + 56;
  const block = fitBlock(ctx, { text: d.title.toUpperCase(), weight: 400, family: DISPLAY, maxW: CW, maxH: 1700 - ty, maxLines: 3, max: 88, min: 38, lineHeight: 1.04 });
  drawBlock(ctx, block, { weight: 400, family: DISPLAY, x: M, topY: ty, color: WHITE, upper: true });

  hline(ctx, 1760, "rgba(255,255,255,.35)", 2);
  label(ctx, "ASSETLY — EVERYTHING YOU NEED. ONE LIBRARY.", M, 1796, { size: 20, color: SOFT });
}

function styleVermilion(ctx, d) {
  rect(ctx, 0, 0, W, H, RED);

  drawLogo(ctx, d.logo, M, 150, 58, true);
  label(ctx, d.date, W - M, 150 + 51 - 8, { size: 22, color: "#f6c9cf", align: "right" });

  // title first, large display type
  const block = fitBlock(ctx, { text: d.title.toUpperCase(), weight: 400, family: DISPLAY, maxW: CW, maxH: 470, maxLines: 3, max: 150, min: 56, lineHeight: 1.0 });
  const tb = drawBlock(ctx, block, { weight: 400, family: DISPLAY, x: M, topY: 340, color: PAPER, upper: true });
  setTracking(ctx, 0);

  // poster with paper frame
  const fy = 930, fw = 456, fh = 580, b = 10;
  rect(ctx, M, fy, fw, fh, PAPER);
  drawPoster(ctx, d.poster, M + b, fy + b, fw - b * 2, fh - b * 2, { bg: "#8f0b1c", fg: PAPER, category: d.category, title: d.title });

  // ink panel with number
  const px = M + fw + 28, pw = W - M - px;
  rect(ctx, px, fy, pw, fh, INK);
  const pad = 34;
  fitLabel(ctx, (d.category || "RESOURCE").toUpperCase(), px + pad, fy + pad, pw - pad * 2, { size: 20, color: "#9a9aa2" });
  label(ctx, d.metric, px + pad, fy + fh - pad - 20, { size: 26, color: PAPER });
  const n = drawNumber(ctx, d.number, { family: DISPLAY, weight: 400, x: px + pad, topY: fy + fh - pad - 20 - 40 - 150, maxW: pw - pad * 2, max: 170, min: 60, color: PAPER });
  rect(ctx, px + pad, fy + fh - pad - 20 - 22 - 4, 70, 6, RED_BRIGHT);

  if (d.headline) {
    const hb = fitBlock(ctx, { text: d.headline, weight: 600, family: SANS, maxW: CW, maxH: 120, maxLines: 2, max: 44, min: 26, lineHeight: 1.15, tracking: -0.02 });
    drawBlock(ctx, hb, { weight: 600, family: SANS, x: M, topY: 1566, color: PAPER, tracking: -0.02 });
    setTracking(ctx, 0);
  }
  hline(ctx, 1760, "rgba(246,245,241,.4)", 2);
  label(ctx, "ASSETLY — EVERYTHING YOU NEED. ONE LIBRARY.", M, 1796, { size: 20, color: "#f6c9cf" });
}

const RENDERERS = { editorial: styleEditorial, midnight: styleMidnight, cobalt: styleCobalt, vermilion: styleVermilion };

export function renderStory(canvas, data) {
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.save();
  ctx.textBaseline = "alphabetic";
  setTracking(ctx, 0);
  (RENDERERS[data.style] || styleEditorial)(ctx, data);
  ctx.restore();
}

/* ------------------------------ UI component ------------------------------ */

const loadImage = (src, cors) => new Promise((resolve, reject) => {
  const img = new Image();
  if (cors) img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error("image failed"));
  img.src = src;
});

const metricValue = (item, metric) => (item ? Number(metric === "visits" ? item.visits : item.downloads) || 0 : "");
const safeName = (s = "") => s.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-").slice(0, 60);

export default function StoryStudio({ resources, flash }) {
  const first = resources[0];
  const [resourceId, setResourceId] = useState(first ? String(first.id) : "");
  const [metric, setMetric] = useState("downloads");
  const [count, setCount] = useState(first ? String(metricValue(first, "downloads")) : "");
  const [title, setTitle] = useState(first?.title || "");
  const [headline, setHeadline] = useState("MADE POSSIBLE BY YOU.");
  const [style, setStyle] = useState("editorial");
  const [poster, setPoster] = useState({ src: "", img: null, failed: false });
  const [logo, setLogo] = useState(null);
  const [fontsTick, setFontsTick] = useState(0);
  const canvasRef = useRef(null);

  const resource = useMemo(() => resources.find(r => String(r.id) === String(resourceId)), [resources, resourceId]);

  // If the list loads after this tab opened, pick the first resource automatically.
  useEffect(() => {
    if (!resource && resources[0]) {
      setResourceId(String(resources[0].id));
      setTitle(resources[0].title || "");
      setCount(String(metricValue(resources[0], metric)));
    }
  }, [resources, resource, metric]);

  useEffect(() => { loadImage(LOGO_SRC, false).then(setLogo).catch(() => setLogo(null)); }, []);

  useEffect(() => {
    let cancelled = false;
    const src = resource?.poster_url || "";
    if (!src) { setPoster({ src: "", img: null, failed: false }); return; }
    loadImage(src, true)
      .then(img => { if (!cancelled) setPoster({ src, img, failed: false }); })
      .catch(() => { if (!cancelled) setPoster({ src, img: null, failed: true }); });
    return () => { cancelled = true; };
  }, [resource?.poster_url]);

  // Make sure brand fonts are ready, then re-render once.
  useEffect(() => {
    if (!document.fonts?.load) return;
    Promise.all([
      document.fonts.load(`700 100px "Space Grotesk"`), document.fonts.load(`500 100px "Space Grotesk"`),
      document.fonts.load(`400 100px "Anton"`), document.fonts.load(`500 20px "DM Mono"`)
    ]).catch(() => {}).then(() => setFontsTick(t => t + 1));
  }, []);

  const countNumber = Math.max(0, parseInt(String(count).replace(/[^\d]/g, ""), 10) || 0);
  const posterImg = poster.src === (resource?.poster_url || "") ? poster.img : null;

  useEffect(() => {
    if (!canvasRef.current) return;
    renderStory(canvasRef.current, {
      style,
      title: (title || resource?.title || "ASSETLY RESOURCE").trim(),
      category: resource?.category || "",
      number: countNumber.toLocaleString("en-IN"),
      metric: metric === "visits" ? "VISITS" : "DOWNLOADS",
      headline: headline.trim(),
      date: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase(),
      poster: posterImg,
      logo
    });
  }, [style, title, resource, countNumber, metric, headline, posterImg, logo, fontsTick]);

  const changeResource = (id) => {
    const item = resources.find(r => String(r.id) === id);
    setResourceId(id);
    setTitle(item?.title || "");
    setCount(String(metricValue(item, metric)));
  };
  const changeMetric = (m) => {
    setMetric(m);
    if (resource) setCount(String(metricValue(resource, m)));
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas || !resource) return flash("Select a resource first.");
    try {
      canvas.toBlob((blob) => {
        if (!blob) return flash("Could not create the PNG.");
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `ASSETLY-${safeName(title || resource.title)}-${metric}-${countNumber}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        flash("Your Instagram Story PNG (1080 × 1920) is ready.");
      }, "image/png");
    } catch (error) {
      flash("The poster image blocks export (CORS). Re-upload the poster or enable public access on the storage bucket.");
    }
  };

  const posterNote = !resource ? "" : !resource.poster_url
    ? "This resource has no poster image, so a neutral placeholder is used."
    : poster.failed ? "The poster image could not be loaded, so a placeholder is shown." : "";

  return (
    <section className="story-studio">
      <div className="story-studio-intro"><p className="eyebrow">MAKE IT SHAREABLE</p><h2>YOUR NUMBERS.<br/><em>YOUR STORY.</em></h2><p>Create a clean Instagram Story poster for any resource. Enter any count you want — this tool only creates an image and never changes your database.</p></div>
      <div className="story-studio-grid">
        <div className="story-controls">
          <label>Choose resource<select value={resourceId} onChange={e => changeResource(e.target.value)}><option value="">Select a resource</option>{resources.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
          <label>Title on poster<input value={title} maxLength={120} onChange={e => setTitle(e.target.value)} placeholder="Resource title"/></label>
          <label>Count type<select value={metric} onChange={e => changeMetric(e.target.value)}><option value="downloads">Downloads</option><option value="visits">Visits</option></select></label>
          <label>Count to display<input type="number" min="0" step="1" inputMode="numeric" value={count} onChange={e => setCount(e.target.value)} placeholder="e.g. 1250"/></label>
          <label>Optional headline<input maxLength={60} value={headline} onChange={e => setHeadline(e.target.value)} placeholder="MADE POSSIBLE BY YOU."/></label>
          <label>Poster style<select value={style} onChange={e => setStyle(e.target.value)}>{STORY_STYLES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
          <div className="story-style-chips" role="group" aria-label="Poster style">{STORY_STYLES.map(s => <button type="button" key={s.id} className={style === s.id ? "active" : ""} onClick={() => setStyle(s.id)}>{s.label}</button>)}</div>
          <button type="button" className="black-button full" onClick={download} disabled={!resource}><Instagram size={17}/> Download PNG</button>
          <p className="hint">1080 × 1920 px · 9:16 Instagram Story · PNG · The preview is the exact image you download · No database changes</p>
          {posterNote && <p className="hint story-note">{posterNote}</p>}
        </div>
        <div className="story-preview-panel"><canvas ref={canvasRef} width={W} height={H} aria-label="Live Instagram Story preview"/></div>
      </div>
    </section>
  );
}
