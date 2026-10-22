/* 火場避難動態指引系統 — interactive deck */
(() => {
"use strict";
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const NS = "http://www.w3.org/2000/svg";
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
function el(tag, attrs, parent){ const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
let D = null;   // data.json

/* ================= deck chrome ================= */
const slides = $$(".slide");
let cur = -1;
const hooks = {};       // name -> {enter, leave}
function fit(){
  const vp = $("#viewport"); const r = vp.getBoundingClientRect();
  const cs = getComputedStyle(vp); const w = r.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight); const h = r.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const k = Math.min(w/1600, h/900); $("#stage").style.transform = `scale(${k})`;
  $("#stage").style.margin = `${(900*k-900)/2}px ${(1600*k-1600)/2}px`;
}
addEventListener("resize", fit); fit();
const ticks = $("#ticks");
slides.forEach((s, i) => { const b = document.createElement("button"); b.setAttribute("aria-label", `第 ${i+1} 頁`); b.onclick = () => go(i); ticks.appendChild(b); });
function go(i){
  i = Math.max(0, Math.min(slides.length-1, i)); if (i === cur) return;
  const prev = slides[cur]; if (prev){ prev.classList.remove("on"); const h = hooks[prev.dataset.name]; if (h && h.leave) h.leave(); }
  cur = i; const s = slides[i]; s.classList.add("on");
  [...ticks.children].forEach((b, k) => { b.className = k < i ? "done" : k === i ? "cur" : ""; });
  $("#count").textContent = `${i+1} / ${slides.length}`;
  try { history.replaceState(null, "", "#" + s.dataset.name); } catch (e) {}
  const h = hooks[s.dataset.name]; if (h && h.enter && D) h.enter();
  attach3D(s);
}
$("#prev").onclick = () => go(cur-1); $("#next").onclick = () => go(cur+1);
$("#fs").onclick = () => { try { const d = document.documentElement; const p = document.fullscreenElement ? document.exitFullscreen() : d.requestFullscreen ? d.requestFullscreen() : null; if (p && p.catch) p.catch(() => {}); } catch (e) {} };
addEventListener("keydown", e => {
  if (e.target.closest("input,select,textarea,iframe")) return;
  if (["ArrowRight","PageDown"," "].includes(e.key)){ e.preventDefault(); go(cur+1); }
  if (["ArrowLeft","PageUp"].includes(e.key)){ e.preventDefault(); go(cur-1); }
  if (e.key === "Home") go(0); if (e.key === "End") go(slides.length-1);
});

/* ================= floor graph, hazards, routing (same model as the console) ================= */
const JN = {"-1,1":"西北角","0,1":"北口","1,1":"東北角","-1,0":"西口","0,0":"中央","1,0":"東口","-1,-1":"西南角","0,-1":"南口","1,-1":"東南角"};
const DIRN = {N:"往北", S:"往南", E:"往東", W:"往西", DOWN:"下樓", UP:"上樓", X:"無安全路線"};
const Fl = (st, f) => st.floors[String(f)];
const jpos = (st, f, i, j) => { const c = Fl(st, f).ringc; return [i*c, j*c]; };
function segHw(st, s){ const f = Fl(st, s.floor); const h = s.a[1] === s.b[1]; const ring = h ? Math.abs(s.a[1]) === 1 : Math.abs(s.a[0]) === 1; return ring ? f.ring_hw : f.cross_hw; }
function segGeom(st, s){ const [ax, ay] = jpos(st, s.floor, ...s.a), [bx, by] = jpos(st, s.floor, ...s.b); return {ax, ay, bx, by, hw:segHw(st, s), L:Math.hypot(bx-ax, by-ay), mx:(ax+bx)/2, my:(ay+by)/2, horiz:ay === by}; }
function locate(st, fl, x, y, pad = 6){ let best = null, bd = 1e9;
  for (const s of st.segments){ if (s.floor !== fl) continue; const q = segGeom(st, s); const vx = q.bx-q.ax, vy = q.by-q.ay;
    const t = Math.max(0, Math.min(1, ((x-q.ax)*vx+(y-q.ay)*vy)/(q.L*q.L))); const d = Math.hypot(x-(q.ax+t*vx), y-(q.ay+t*vy));
    if (d <= q.hw+pad && d < bd){ best = s; bd = d; } } return best; }
const exitDoor = (st, e) => { const [ax, ay] = jpos(st, e.floor, ...e.a), [bx, by] = jpos(st, e.floor, ...e.b); return [Math.sign(ax+bx)*117, (ay+by)/2]; };
const stairDoor = (st, fl, t) => { const [x, y] = jpos(st, fl, ...st.stairs[t]); return [Math.sign(x)*117, y]; };
const dirOf = (a, b) => { const dx = b[0]-a[0], dy = b[1]-a[1]; return dx > 0 ? "E" : dx < 0 ? "W" : dy > 0 ? "N" : "S"; };
const dirTo = (a, b) => { const dx = b[0]-a[0], dy = b[1]-a[1]; if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return "HERE"; return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "E" : "W") : (dy > 0 ? "N" : "S"); };
function isExitSeg(st, s){ return Object.entries(st.exits).find(([k, e]) => e.floor === s.floor && ((e.a+"" === s.a+"" && e.b+"" === s.b+"") || (e.a+"" === s.b+"" && e.b+"" === s.a+""))); }
const W0 = () => ({block:.55, obs:2.5, smoke:8, pred:4, fire:5, predict:true});
function analyse(st, W, prev){
  const blocked = s => s.gate || s.rate >= W.block; st.blocked = blocked;
  for (const s of st.segments){
    let p = s.smoke;
    if (W.predict){ for (const o of st.segments) if (o !== s && o.floor === s.floor && [o.a+"", o.b+""].some(k => k === s.a+"" || k === s.b+"")) p = Math.max(p, o.smoke*(blocked(o) ? .45 : .65));
      if (prev){ const ps = prev.segments.find(x => x.id === s.id); if (ps && s.smoke > ps.smoke+.05) p = Math.min(1, p+.15); } }
    s.pred = Math.min(1, p); const q = segGeom(st, s);
    s.fireNear = st.fire && st.fire.floor === s.floor ? Math.max(0, 1-Math.hypot(q.mx-st.fire.x, q.my-st.fire.y)/90) : 0;
    s.risk = Math.min(1, .55*s.smoke + .3*Math.max(0, s.pred-s.smoke) + .45*s.rate + .35*s.fireNear + (s.gate ? .4 : 0));
  }
  const cost = s => { const q = segGeom(st, s); let m = (1+W.obs*s.rate)*(1+W.smoke*s.smoke+W.pred*Math.max(0, s.pred-s.smoke)+W.fire*s.fireNear); if (s.smoke >= .85) m *= 3; return q.L*m; };
  st.cost = cost;
  const G = new Map(); const link = (a, b, w) => (G.get(a) || G.set(a, []).get(a)).push([b, w]); const add = (a, b, w) => { link(a, b, w); link(b, a, w); };
  const key = (f, i, j) => `${f},${i},${j}`; const exOpen = st.exitsOpen || {}; const stOpen = st.stairsOpen || {};
  for (const s of st.segments){ if (blocked(s)) continue; const w = cost(s), a = key(s.floor, ...s.a), b = key(s.floor, ...s.b); const ex = isExitSeg(st, s);
    if (ex && exOpen[ex[0]] !== false){ add(a, ex[0], w/2); add(b, ex[0], w/2); } else add(a, b, w); }
  for (const [t, ij] of Object.entries(st.stairs)) if (stOpen[t] !== false){ link(key(1, ...ij), key(2, ...ij), 60); link(key(2, ...ij), key(1, ...ij), 600); }
  const dist = new Map(), nxt = new Map(), order = []; const pq = Object.keys(st.exits).filter(e => exOpen[e] !== false).map(e => [0, e, null]);
  while (pq.length){ pq.sort((p, q) => p[0]-q[0]); const [d, u, via] = pq.shift(); if (dist.has(u)) continue; dist.set(u, d); nxt.set(u, via); order.push(u);
    for (const [v, w] of (G.get(u) || [])) if (!dist.has(v)) pq.push([d+w, v, u]); }
  const leds = {};
  for (const fl of [1, 2]) for (const i of [-1,0,1]) for (const j of [-1,0,1]){ const n = key(fl, i, j), h = nxt.get(n);
    if (h == null){ leds[n] = "X"; continue; }
    if (st.exits[h]){ const e = st.exits[h]; leds[n] = dirOf([i, j], (e.a[0] === i && e.a[1] === j) ? e.b : e.a); continue; }
    const [hf, hi, hj] = h.split(",").map(Number); leds[n] = hf !== fl ? (hf < fl ? "DOWN" : "UP") : dirOf([i, j], [hi, hj]); }
  Object.assign(st, {leds, dist, nxt, order});
  return st;
}
function personRoute(st, fl, x, y){
  const key = (f, i, j) => `${f},${i},${j}`; const seg = locate(st, fl, x, y, 10); let start = null, best = Infinity, viaExit = null;
  if (seg){ const q = segGeom(st, seg); const vx = q.bx-q.ax, vy = q.by-q.ay; const t = Math.max(0, Math.min(1, ((x-q.ax)*vx+(y-q.ay)*vy)/(q.L*q.L)));
    for (const [end, frac] of [[seg.a, t], [seg.b, 1-t]]){ const dn = st.dist.get(key(fl, ...end)); if (dn != null && dn+frac*q.L < best){ best = dn+frac*q.L; start = end; } }
    const ex = isExitSeg(st, seg); if (ex && !st.blocked(seg) && Math.abs(t-.5)*q.L < best){ best = 0; viaExit = ex[0]; start = null; } }
  else { let bd = 1e9; for (const i of [-1,0,1]) for (const j of [-1,0,1]){ const [px, py] = jpos(st, fl, i, j); const d = Math.hypot(x-px, y-py); if (d < bd){ bd = d; start = [i, j]; } } best = st.dist.get(key(fl, ...start)) ?? Infinity; }
  if (best === Infinity) return {ok:false, parts:[{floor:fl, pts:[[x, y]]}]};
  const parts = [{floor:fl, pts:[[x, y]]}]; let curp = parts[0];
  if (viaExit) curp.pts.push(exitDoor(st, st.exits[viaExit]));
  else { let n = key(fl, ...start); curp.pts.push(jpos(st, fl, ...start));
    for (let k = 0; k < 24; k++){ const h = st.nxt.get(n); if (h == null) break; const [nf, ni, nj] = n.split(",").map(Number);
      if (st.exits[h]){ curp.pts.push(exitDoor(st, st.exits[h])); break; }
      const [hf, hi, hj] = h.split(",").map(Number);
      if (hf !== nf){ const t = Object.keys(st.stairs).find(s => st.stairs[s][0] === ni && st.stairs[s][1] === nj); curp.pts.push(stairDoor(st, nf, t)); curp = {floor:hf, pts:[stairDoor(st, hf, t), jpos(st, hf, hi, hj)]}; parts.push(curp); }
      else curp.pts.push(jpos(st, hf, hi, hj));
      n = h; } }
  return {ok:true, parts};
}
const clone = o => JSON.parse(JSON.stringify(o));

/* ================= 2D map drawing (shared by detect / routing / sim slides) ================= */
const heat = r => r < .3 ? "#d8c13a" : r < .6 ? "#f08a3c" : "#ff4a3d";
function glyphSign(p, d){ const g = el("g", {}, p);
  el("rect", {x:-7.5, y:-7.5, width:15, height:15, rx:3.5, fill:"#07120c", stroke:d === "X" ? "#ff4a3d" : (d === "DOWN" || d === "UP") ? "#9dc8ff" : "#4be79a", "stroke-width":1.3}, g);
  if (d === "X") el("path", {d:"M-3.5,-3.5L3.5,3.5M-3.5,3.5L3.5,-3.5", stroke:"#ff4a3d", "stroke-width":2.3, "stroke-linecap":"round"}, g);
  else if (d === "DOWN" || d === "UP") el("path", {d:d === "DOWN" ? "M-4.5,-4h3v3h3v3h3" : "M-4.5,4h3v-3h3v-3h3", fill:"none", stroke:"#9dc8ff", "stroke-width":1.9}, g);
  else el("path", {transform:`rotate(${{N:0, E:90, S:180, W:270}[d]})`, d:"M0,-5.5L4.6,-0.5H1.6V5H-1.6V-0.5H-4.6Z", fill:"#4be79a"}, g);
  return g; }
const place = (p, x, y, ex = "") => el("g", {transform:`translate(${x},${y}) scale(1,-1) ${ex}`}, p);
function drawMap(svg, st, fl, o = {}){
  svg.innerHTML = ""; const id = svg.id;
  const defs = el("defs", {}, svg);
  el("feGaussianBlur", {stdDeviation:4.5}, el("filter", {id:id+"b", x:"-60%", y:"-60%", width:"220%", height:"220%"}, defs));
  const hp = el("pattern", {id:id+"h", width:6, height:6, patternUnits:"userSpaceOnUse", patternTransform:"rotate(45)"}, defs);
  el("rect", {width:6, height:6, fill:"#ff4a3d", opacity:.3}, hp); el("rect", {width:3, height:6, fill:"#ff4a3d"}, hp);
  const root = el("g", {transform:"scale(1,-1)"}, svg);
  const L = {}; for (const n of ["base","heat","smoke","flow","route","haz","fix","sign","fire","dots","ppl","hit"]) L[n] = el("g", {}, root);
  el("rect", {x:-122, y:-122, width:244, height:244, rx:4, fill:"#7e8d99"}, L.base);
  el("rect", {x:-117, y:-117, width:234, height:234, fill:"#18222c"}, L.base);
  const segs = st.segments.filter(s => s.floor === fl); const blocked = st.blocked;
  const rect = (q, inset) => ({x:Math.min(q.ax, q.bx)-q.hw+inset, y:Math.min(q.ay, q.by)-q.hw+inset, width:Math.abs(q.bx-q.ax)+2*q.hw-2*inset, height:Math.abs(q.by-q.ay)+2*q.hw-2*inset});
  for (const s of segs) el("rect", {...rect(segGeom(st, s), 0), fill:"#3a4a59"}, L.base);
  for (const s of segs){ const q = segGeom(st, s);
    if (blocked(s)) el("rect", {...rect(q, 1), rx:3, fill:`url(#${id}h)`}, L.heat);
    else if (s.risk >= .08) el("rect", {...rect(q, 1), rx:3, fill:heat(s.risk), opacity:(.25+.5*s.risk).toFixed(2)}, L.heat); }
  const sg = el("g", {filter:`url(#${id}b)`}, L.smoke);
  for (const s of segs){ if (s.smoke < .05) continue; const q = segGeom(st, s); const n = Math.max(3, Math.round(q.L/13));
    for (let k = 0; k <= n; k++){ const t = k/n; el("circle", {cx:q.ax+(q.bx-q.ax)*t, cy:q.ay+(q.by-q.ay)*t, r:q.hw*(.75+.55*s.smoke), fill:"#b5c2cf", opacity:(.2+.55*s.smoke).toFixed(2)}, sg); } }
  if (o.flow !== false){ const key = (i, j) => `${fl},${i},${j}`;
    const line = (x0, y0, x1, y1) => { const L2 = Math.hypot(x1-x0, y1-y0); if (L2 < 4) return; const d = `M${x0},${y0}L${x1},${y1}`; el("path", {d, class:"flow"}, L.flow);
      if (!reduce){ const n = Math.max(1, Math.round(L2/40)); for (let k = 0; k < n; k++){ const c = el("path", {d:"M-2.6,-2.6L0,0L-2.6,2.6", fill:"none", stroke:"#2fd27f", "stroke-width":2, "stroke-linecap":"round"}, L.flow);
        el("animateMotion", {dur:`${(L2/26).toFixed(2)}s`, begin:`${(-k*L2/26/n).toFixed(2)}s`, repeatCount:"indefinite", rotate:"auto", path:d}, c); } } };
    for (const s of segs){ if (blocked(s)) continue; const q = segGeom(st, s); const ex = isExitSeg(st, s);
      if (ex){ const [dx, dy] = exitDoor(st, st.exits[ex[0]]); let any = false;
        if (st.nxt.get(key(...s.a)) === ex[0]){ line(q.ax, q.ay, q.mx, q.my); any = true; } if (st.nxt.get(key(...s.b)) === ex[0]){ line(q.bx, q.by, q.mx, q.my); any = true; }
        if (any) line(q.mx, q.my, dx, dy); continue; }
      const da = st.dist.get(key(...s.a)), db = st.dist.get(key(...s.b)); if (da == null && db == null) continue;
      if ((da ?? Infinity) > (db ?? Infinity)) line(q.ax, q.ay, q.bx, q.by); else line(q.bx, q.by, q.ax, q.ay); }
    for (const t of Object.keys(st.stairs)){ const ij = st.stairs[t]; const [jx, jy] = jpos(st, fl, ...ij); const [sx, sy] = stairDoor(st, fl, t);
      const h = st.nxt.get(key(...ij)); if (fl === 2 && h && h.startsWith("1,")) line(jx, jy, sx, sy);
      if (fl === 1){ const up = st.nxt.get(`2,${ij[0]},${ij[1]}`); if (up && up.startsWith("1,")) line(sx, sy, jx, jy); } } }
  if (o.route) for (const part of o.route.parts) if (part.floor === fl && part.pts.length > 1){ const d = "M"+part.pts.map(p => p.join(",")).join("L"); el("path", {d, class:"my"}, L.route); }
  for (const s of segs){ const q = segGeom(st, s);
    if (s.gate){ const g = place(L.haz, q.mx, q.my, q.horiz ? "" : "rotate(90)"); el("rect", {x:-3, y:-q.hw+1, width:6, height:2*q.hw-2, rx:1.5, fill:"#ff4a3d"}, g); }
    else if (s.rate > .05){ const g = place(L.haz, q.mx, q.my); el("rect", {x:-5.5, y:-5.5, width:11, height:11, rx:2, fill:blocked(s) ? "#ff4a3d" : "#ffb020", transform:"rotate(45)"}, g);
      el("text", {x:0, y:3, "text-anchor":"middle", style:"font:700 8px var(--body);fill:#111"}, g).textContent = "!";
      el("text", {x:0, y:16, "text-anchor":"middle", class:"lbl8"}, g).textContent = `${Math.round(s.rate*100)}%`; }
    if (s.unknown) el("rect", {...rect(q, 2), fill:"none", stroke:"#e9eff4", "stroke-dasharray":"4 3", "stroke-width":1.2, opacity:.6}, L.haz); }
  for (const [k, e] of Object.entries(st.exits)){ if (e.floor !== fl) continue; const [dx, dy] = exitDoor(st, e); const g = place(L.fix, dx+Math.sign(dx)*6, dy);
    el("rect", {x:-6, y:-9, width:12, height:18, rx:2, fill:"#0a8a4b"}, g); el("text", {x:0, y:3, "text-anchor":"middle", style:"font:700 7px var(--body);fill:#fff"}, g).textContent = "出"; }
  for (const t of Object.keys(st.stairs)){ const [dx, dy] = stairDoor(st, fl, t); const g = place(L.fix, dx+Math.sign(dx)*8, dy);
    el("rect", {x:-7, y:-9, width:14, height:18, rx:2.5, fill:"#1d6bd0"}, g); el("path", {d:"M-4.5,5.5h3v-3h3v-3h3v-3", fill:"none", stroke:"#fff", "stroke-width":1.5}, g); }
  for (const i of [-1,0,1]) for (const j of [-1,0,1]){ const [x, y] = jpos(st, fl, i, j); const g = glyphSign(place(L.sign, x, y), st.leds[`${fl},${i},${j}`]); g.dataset.node = `${fl},${i},${j}`; }
  if (st.fire && st.fire.floor === fl){ const g = place(L.fire, st.fire.x, st.fire.y); el("circle", {r:7, fill:"#ff4a3d", opacity:.4, class:"pulse"}, g);
    el("path", {d:"M0,-8C3,-4 5,-2 5,2A5,5 0 0,1 -5,2C-5,-1 -3,-2 -2,-5C-1,-2 0,-1 1,-1C1,-3 0,-5 0,-8Z", fill:"#ff4a3d", stroke:"#141e29", "stroke-width":1}, g); }
  if (o.people) for (const p of o.people){ if (p.floor !== fl || p.out) continue; const g = place(L.ppl, p.x, p.y);
    el("circle", {r:5.5, fill:{evacuee:"#ffb020", firefighter:"#ff4a3d", bystander:"#95a3ad"}[p.role], stroke:p.trapped ? "#ff4a3d" : "#141e29", "stroke-width":1.6}, g);
    if (o.names) el("text", {x:0, y:13, "text-anchor":"middle", class:"lbl8"}, g).textContent = p.name; }
  if (o.dots) for (const d of o.dots){ if (d.floor !== fl) continue; const g = place(L.dots, d.x, d.y);
    el("circle", {r:4.2, fill:d.color, stroke:"#fff", "stroke-width":1.2}, g); if (d.label) el("text", {x:7, y:3, class:"lbl8"}, g).textContent = d.label; }
  if (o.onSeg) for (const s of segs){ const q = segGeom(st, s); const r = el("rect", {...rect(q, 0), fill:"transparent", style:"cursor:pointer"}, L.hit); r.addEventListener("click", () => o.onSeg(s)); }
  return L;
}

/* ================= 3D ================= */
const T = {ready:false};
function init3D(){
  if (!window.THREE){ return; }
  const R = new THREE.WebGLRenderer({antialias:true, alpha:false}); R.setPixelRatio(Math.min(2, devicePixelRatio)); R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.outputEncoding = THREE.sRGBEncoding; R.setClearColor(0x0f1821, 1);
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x0f1821, 900, 2200);
  const cam = new THREE.PerspectiveCamera(32, 16/9, 5, 5000);
  const ctl = new THREE.OrbitControls(cam, R.domElement); ctl.enableDamping = true; ctl.dampingFactor = .08; ctl.maxPolarAngle = Math.PI*.49; ctl.minDistance = 250; ctl.maxDistance = 1600;
  scene.add(new THREE.HemisphereLight(0xcfe3ff, 0x1a222b, .45));
  const sun = new THREE.DirectionalLight(0xfff4e6, .62); sun.position.set(-300, 700, 400); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {left:-400, right:400, top:400, bottom:-400, near:10, far:2000}); sun.shadow.bias = -.0005; scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9cc7ff, .25); fill.position.set(500, 200, -400); scene.add(fill);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.MeshStandardMaterial({color:0x16212c, roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.position.y = -.5; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(1600, 32, 0x24384a, 0x1c2a37); grid.position.y = 0; scene.add(grid);
  // all model content lives in Blender coordinates (z up, mm) under this root
  const root = new THREE.Group(); root.rotation.x = -Math.PI/2; scene.add(root);
  Object.assign(T, {R, scene, cam, ctl, root, parts:{}, dyn:new THREE.Group(), mode:null, mount:null, clock:new THREE.Clock()});
  root.add(T.dyn);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({color:c, roughness:.75, metalness:0, ...o});
  T.mat = {tray:M(0xc9ced4), lid:M(0x9fb4c9, {transparent:true, opacity:.92}), seal:M(0x5aa2ff), pods:M(0xd9dbd8), boards:M(0xf0e9d6), pcb:M(0x1f7a45, {roughness:.5}),
    spacers:M(0xc8d0d8), stairs:M(0xe8b04a), obsDark:M(0x2a2f36, {roughness:.6}), obsLight:M(0xe9e9e6), gate:M(0xff4a3d, {roughness:.5})};
  // geometry ships as base64 arrays inside a JSON file (no data: URL fetches, no loader plugin)
  const b64 = t => { const bin = atob(t); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  fetch("model.json").then(r => r.json()).then(js => {
    for (const [k, d] of Object.entries(js.parts)){
      const q = new Int16Array(b64(d.v)); const pos = new Float32Array(q.length); for (let i = 0; i < q.length; i++) pos[i] = q[i]*js.scale;
      const idx = d.i32 ? new Uint32Array(b64(d.f)) : new Uint16Array(b64(d.f));
      const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
      const flat = geo.toNonIndexed(); flat.computeVertexNormals();
      const kind = k.startsWith("obs_") ? "obs" : k.split("_").slice(1).join("_") || k;
      const mesh = new THREE.Mesh(flat, k === "obs_gate" ? T.mat.gate : k.startsWith("obs_") ? T.mat.obsDark : (T.mat[kind] || T.mat.tray));
      mesh.castShadow = mesh.receiveShadow = true; const w = new THREE.Group(); w.name = k; w.add(mesh); T.parts[k] = w; if (!k.startsWith("obs_")) root.add(w); }
    T.ready = true; buildDyn(); setMode(T.mode || "sim", true);
  }).catch(err => { console.warn("model failed", err); $$(".view3d .hint, [data-3d] ~ .hint").forEach(h => h.textContent = "3D 模型載入失敗，請重新整理頁面"); });
  let last = 0;
  (function loop(t){ requestAnimationFrame(loop); if (!T.mount) return; const dt = Math.min(.05, (t-last)/1000); last = t;
    ctl.update(); if (T.tick) T.tick(dt, t/1000); R.render(scene, cam); })(0);
  new ResizeObserver(() => size3D()).observe(document.body);
}
function size3D(){ if (!T.mount) return; const r = T.mount.getBoundingClientRect(); const k = r.width/T.mount.offsetWidth || 1;
  const w = T.mount.offsetWidth, h = T.mount.offsetHeight; if (!w || !h) return; T.R.setSize(w, h, false); T.R.domElement.style.width = "100%"; T.R.domElement.style.height = "100%";
  T.R.setPixelRatio(Math.min(2, devicePixelRatio*k)); T.cam.aspect = w/h;
  if (T.mode === "cover" || T.mode === "end") T.cam.setViewOffset(w, h, -w*.2, 0, w, h); else T.cam.clearViewOffset(); T.cam.updateProjectionMatrix(); }
function attach3D(slide){
  const m = slide.querySelector("[data-3d]"); if (!m || !T.R){ if (T.R) T.mount = null; return; }
  m.prepend(T.R.domElement); T.mount = m; setMode(m.dataset["3d"]); size3D();
}
const LIFT = 120;     // cover: extra gap between floors
const SIDE = -300;    // simulation: 2F placed beside 1F (to the west) at ground level
T.lay = {dx:0, dz:LIFT};
function setMode(mode, force){
  if (!T.R) return; if (T.mode === mode && !force) return; T.mode = mode; if (!T.ready) return;
  const P = T.parts; const show = (k, v) => { if (P[k]) P[k].visible = v; };
  for (const k in P) if (!k.startsWith("obs_")){ P[k].visible = true; P[k].position.set(0, 0, 0); }
  T.ctl.autoRotate = false;
  if (mode === "model"){ T.dyn.visible = false; asmApply(asm.k, true); T.cam.position.set(-620, 520, 700); T.ctl.target.set(0, 140, 0); }
  else { // cover + sim
    T.dyn.visible = true; for (const k of ["F1_lid","F1_seal","F2_lid","F2_seal","F1_spacers","stairs"]) show(k, false);
    if (mode === "cover" || mode === "end"){ T.lay = {dx:0, dz:LIFT}; }
    else { T.lay = {dx:SIDE, dz:-150}; for (const k of ["F1_pods","F1_boards","F1_pcb","F2_pods","F2_boards","F2_pcb"]) show(k, false); }
    for (const k of ["F2_tray","F2_pods","F2_boards","F2_pcb"]) if (P[k]) P[k].position.set(T.lay.dx, 0, T.lay.dz);
    if (mode === "cover" || mode === "end"){ T.cam.position.set(-600, 720, 1020); T.ctl.target.set(-60, 230, 0); T.ctl.autoRotate = !reduce; T.ctl.autoRotateSpeed = .45; }
    else { T.cam.position.set(-150, 700, 360); T.ctl.target.set(-150, 0, -30); }
    simApply();
  }
  T.ctl.update();
}

/* --- dynamic scene for the simulation: LEDs, obstacles, smoke, fire, people --- */
const SIM = {k:0, st:null, people:[], walking:false, cams:new Set()};
const fz = f => 8 + (f-1)*150 + (f === 2 ? T.lay.dz : 0);
const fx = f => f === 2 ? T.lay.dx : 0;
function buildDyn(){
  const dyn = T.dyn; dyn.clear();
  // LED arrows on the floor at every junction
  const arrowShape = new THREE.Shape(); [[0,7],[6,0],[2.2,0],[2.2,-7],[-2.2,-7],[-2.2,0],[-6,0]].forEach((p, i) => i ? arrowShape.lineTo(...p) : arrowShape.moveTo(...p)); arrowShape.closePath();
  const aGeo = new THREE.ShapeGeometry(arrowShape); const xGeo = new THREE.PlaneGeometry(14, 3);
  T.leds = {};
  for (const f of [1, 2]) for (const i of [-1,0,1]) for (const j of [-1,0,1]){
    const g = new THREE.Group(); const base = new THREE.Mesh(new THREE.BoxGeometry(17, 17, 1), new THREE.MeshStandardMaterial({color:0x0a140e, roughness:.4}));
    base.position.z = .5; g.add(base);
    const mat = new THREE.MeshBasicMaterial({color:0x4be79a}); const a = new THREE.Mesh(aGeo, mat); a.position.z = 1.2; g.add(a);
    const x1 = new THREE.Mesh(xGeo, mat), x2 = new THREE.Mesh(xGeo, mat); x1.rotation.z = Math.PI/4; x2.rotation.z = -Math.PI/4; x1.position.z = x2.position.z = 1.2; g.add(x1, x2);
    const glow = new THREE.PointLight(0x4be79a, .35, 60, 2); glow.position.z = 8; g.add(glow);
    g.userData = {a, x1, x2, mat, glow, f, i, j}; dyn.add(g); T.leds[`${f},${i},${j}`] = g; }
  // smoke sprites
  const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(.5, "rgba(255,255,255,.35)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); const N = 2600; const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N*3), 3));
  T.smoke = new THREE.Points(geo, new THREE.PointsMaterial({size:34, map:tex, color:0xaab6c3, transparent:true, opacity:.5, depthWrite:false, sizeAttenuation:true}));
  T.smoke.frustumCulled = false; T.smokeSeeds = Array.from({length:N}, () => [Math.random(), Math.random(), Math.random(), Math.random()*6.28]); dyn.add(T.smoke);
  // fire
  T.fire = new THREE.Group(); const fl = new THREE.Mesh(new THREE.ConeGeometry(6, 18, 12), new THREE.MeshBasicMaterial({color:0xff5a2a})); fl.rotation.x = Math.PI/2; fl.position.z = 9; T.fire.add(fl);
  T.fireLight = new THREE.PointLight(0xff5522, 2.2, 220, 2); T.fireLight.position.z = 25; T.fire.add(T.fireLight); dyn.add(T.fire);
  T.obsGroup = new THREE.Group(); dyn.add(T.obsGroup); T.pplGroup = new THREE.Group(); dyn.add(T.pplGroup);
  T.tick = tick3D; simApply();
}
const PLACE = [ [], [], [[1,"Cabinet_B_fallen",99,58,90]], [[1,"Cabinet_B_fallen",99,58,90],[2,"Boxes_B_scattered",40,102,0],[2,"Rubble_A_pile",-60,0,30]] ];
PLACE[4] = PLACE[3]; PLACE[5] = PLACE[3];
const GATES = [[], [], [], [], [[1,-51,-99]], [[1,-51,-99]]];
function simApply(){
  if (!T.ready || !T.leds || !SIM.st) return; const st = SIM.st;
  for (const [k, g] of Object.entries(T.leds)){ const d = st.leds[k]; const u = g.userData; const [x, y] = jpos(st, u.f, u.i, u.j); g.position.set(x+fx(u.f), y, fz(u.f)+.2);
    const isX = d === "X", stair = d === "DOWN" || d === "UP"; u.a.visible = !isX; u.x1.visible = u.x2.visible = isX;
    const col = isX ? 0xff4a3d : stair ? 0x9dc8ff : 0x4be79a; u.mat.color.setHex(col); u.glow.color.setHex(col);
    u.a.rotation.z = {N:0, E:-Math.PI/2, S:Math.PI, W:Math.PI/2, DOWN:Math.PI/2*(u.i < 0 ? 1 : -1), UP:0}[d] || 0; }
  T.obsGroup.clear();
  for (const [f, n, x, y, rz] of PLACE[SIM.k] || []){ const src = T.parts["obs_"+n]; if (!src) continue; const o = src.clone(); o.position.set(x+fx(f), y, fz(f)); o.rotation.z = rz*Math.PI/180; o.visible = true; T.obsGroup.add(o); }
  for (const [f, x, y] of GATES[SIM.k] || []){ const src = T.parts.obs_gate; if (!src) continue; const o = src.clone(); o.position.set(x+fx(f), y, fz(f)); o.visible = true; T.obsGroup.add(o); }
  T.fire.visible = !!st.fire; if (st.fire) T.fire.position.set(st.fire.x+fx(st.fire.floor), st.fire.y, fz(st.fire.floor));
  // smoke particles assigned to segments by density
  const segs = st.segments.filter(s => s.smoke > .04); const tot = segs.reduce((a, s) => a+s.smoke*segGeom(st, s).L, 0);
  T.smokeMap = []; let n = 0; const N = T.smokeSeeds.length;
  for (const s of segs){ const q = segGeom(st, s); const cnt = Math.round(Math.min(N*.9, N*1.1)*(s.smoke*q.L)/Math.max(tot, 400)); for (let k = 0; k < cnt && n < N; k++, n++) T.smokeMap.push([q, s.floor, s.smoke]); }
  T.smokeCount = n; T.smoke.geometry.setDrawRange(0, n);
  drawPeople3D();
}
function drawPeople3D(){
  if (!T.pplGroup) return; T.pplGroup.clear();
  const col = {evacuee:0xffb020, firefighter:0xff4a3d, bystander:0x95a3ad};
  for (const p of SIM.people){ if (p.out) continue; const g = new THREE.Group(); const m = new THREE.MeshStandardMaterial({color:col[p.role], roughness:.5, emissive:col[p.role], emissiveIntensity:.15});
    const body = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 13, 12), m); body.rotation.x = Math.PI/2; body.position.z = 6.5; body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(3.2, 14, 10), m); head.position.z = 16; head.castShadow = true; g.add(body, head);
    g.position.set(p.x+fx(p.floor), p.y, fz(p.floor)); T.pplGroup.add(g); p.mesh = g; }
}
function tick3D(dt, t){
  if (!T.smokeMap) return; const pos = T.smoke.geometry.attributes.position.array;
  for (let i = 0; i < T.smokeCount; i++){ const [q, f, sm] = T.smokeMap[i]; const s = T.smokeSeeds[i];
    const u = (s[0] + .015*Math.sin(t*.4+s[3]))%1, v = s[1]*2-1;
    const x = q.ax+(q.bx-q.ax)*u + (q.horiz ? 0 : v*q.hw*.85), y = q.ay+(q.by-q.ay)*u + (q.horiz ? v*q.hw*.85 : 0);
    const h = 90 - 55*s[2]*(1-sm*.6) + 3*Math.sin(t*.7+s[3]);   // smoke hugs the ceiling and thickens downward
    pos[i*3] = x+fx(f); pos[i*3+1] = y; pos[i*3+2] = fz(f)+h; }
  T.smoke.geometry.attributes.position.needsUpdate = true;
  if (T.fire && T.fire.visible) T.fireLight.intensity = 1.8 + .6*Math.sin(t*13) + .4*Math.sin(t*7.3);
  for (const g of Object.values(T.leds || {})) g.userData.glow.intensity = .3 + .15*Math.sin(t*3 + g.userData.i);
  if (SIM.walking) walkStep(dt);
}

/* ================= slide: problem ================= */
function problemScene(svg, smart){
  svg.innerHTML = ""; const g = el("g", {}, svg);
  el("rect", {x:20, y:20, width:480, height:290, rx:6, fill:"#7e8d99"}, g); el("rect", {x:28, y:28, width:464, height:274, fill:"#18222c"}, g);
  const cor = [[40,40,440,44],[40,246,440,44],[40,40,44,250],[436,40,44,250],[238,40,44,250]]; cor.forEach(c => el("rect", {x:c[0], y:c[1], width:c[2], height:c[3], fill:"#3a4a59"}, g));
  el("rect", {x:12, y:120, width:16, height:44, fill:"#0a8a4b"}, g); el("rect", {x:492, y:120, width:16, height:44, fill:"#0a8a4b"}, g);
  el("text", {x:20, y:112, "text-anchor":"middle", style:"font:700 14px var(--body);fill:#2fd27f"}, g).textContent = "出口";
  el("text", {x:500, y:112, "text-anchor":"middle", style:"font:700 14px var(--body);fill:#2fd27f"}, g).textContent = "出口";
  const sm = el("g", {style:"filter:blur(6px)"}, g); for (let k = 0; k < 9; k++) el("circle", {cx:400+((k*37)%60), cy:60+k*22, r:26, fill:"#b5c2cf", opacity:.45}, sm);
  el("rect", {x:440, y:126, width:36, height:20, rx:3, fill:"#ffb020", transform:"rotate(-20 458 136)"}, g);
  el("text", {x:458, y:178, "text-anchor":"middle", style:"font:600 13px var(--body);fill:#ffb020"}, g).textContent = "倒下的櫃子";
  const sign = el("g", {transform:"translate(260 268)"}, g); el("rect", {x:-16, y:-16, width:32, height:32, rx:6, fill:"#07120c", stroke:"#4be79a", "stroke-width":2}, sign);
  el("path", {d:"M0,-11L9,-1H3V11H-3V-1H-9Z", fill:"#4be79a", transform:`rotate(${smart ? -90 : 90})`}, sign);
  const path = smart ? [[300,268],[62,268],[62,142],[22,142]] : [[300,268],[458,268],[458,170]];
  const d = "M"+path.map(p => p.join(",")).join("L");
  el("path", {d, fill:"none", stroke:smart ? "#5aa2ff" : "#ff4a3d", "stroke-width":4, "stroke-dasharray":"10 7", opacity:.8}, g);
  const p = el("circle", {r:9, fill:"#ffb020", stroke:"#141e29", "stroke-width":2.5}, g);
  const end = el("g", {opacity:0}, g); const [ex, ey] = path[path.length-1];
  if (smart){ el("circle", {cx:ex+30, cy:ey, r:16, fill:"#2fd27f"}, end); el("path", {d:`M${ex+22},${ey}l6,6l10,-12`, stroke:"#04170c", "stroke-width":3.5, fill:"none"}, end); }
  else { el("circle", {cx:ex, cy:ey+30, r:16, fill:"#ff4a3d"}, end); el("path", {d:`M${ex-6},${ey+24}l12,12M${ex+6},${ey+24}l-12,12`, stroke:"#fff", "stroke-width":3.5}, end); }
  return {p, end, path};
}
let probRAF = 0;
function problemPlay(){
  cancelAnimationFrame(probRAF); const A = problemScene($("#probA"), false), B = problemScene($("#probB"), true); const t0 = performance.now();
  const at = (path, u) => { let L = 0; const seg = []; for (let i = 1; i < path.length; i++){ const d = Math.hypot(path[i][0]-path[i-1][0], path[i][1]-path[i-1][1]); seg.push(d); L += d; }
    let r = u*L; for (let i = 0; i < seg.length; i++){ if (r <= seg[i]){ const k = r/seg[i]; return [path[i][0]+(path[i+1][0]-path[i][0])*k, path[i][1]+(path[i+1][1]-path[i][1])*k]; } r -= seg[i]; } return path[path.length-1]; };
  (function f(t){ const u = Math.min(1, (t-t0)/(reduce ? 1 : 4200)); for (const S of [A, B]){ const [x, y] = at(S.path, u); S.p.setAttribute("cx", x); S.p.setAttribute("cy", y); S.end.setAttribute("opacity", u >= 1 ? 1 : 0); }
    if (u < 1) probRAF = requestAnimationFrame(f); })(t0);
}
hooks.problem = {enter:problemPlay, leave:() => cancelAnimationFrame(probRAF)};
$("#probPlay").onclick = problemPlay;


/* ================= slide: ideal vs demo ================= */
const VS = [
  {t:"資料傳輸", real:"LoRa 無線：傳得遠、省電，不依賴大樓 Wi-Fi", demo:"筆電開 Wi-Fi 熱點", why:"火場可能停電、基地台失效或網路壅塞；模型只有幾十公分，Wi-Fi 開發最快。",
   r:`<rect x="40" y="120" width="120" height="150" rx="4" fill="#2a3a4b"/><g fill="#8fa2b3">${[0,1,2,3].map(i=>`<rect x="58" y="${140+i*30}" width="84" height="14" rx="2"/>`).join("")}</g><circle cx="100" cy="112" r="8" fill="#2fd27f"/>${[0,1,2].map(i=>`<circle cx="100" cy="112" fill="none" stroke="#2fd27f" stroke-width="3" style="animation:wave 3s ${i}s linear infinite"/>`).join("")}<rect x="420" y="70" width="12" height="200" fill="#5b6b79"/><path d="M402 70h48l-24-30z" fill="#5b6b79"/><text x="426" y="292" text-anchor="middle" fill="#8fa2b3" font-size="16">數公里外的接收站</text>`,
   d:`<rect x="300" y="170" width="150" height="90" rx="6" fill="#2a3a4b"/><path d="M315 185h120M315 215h120M315 245h120M345 185v60M405 185v60" stroke="#8fa2b3" stroke-width="5"/><rect x="70" y="190" width="120" height="70" rx="6" fill="#e9eff4"/><rect x="58" y="260" width="144" height="8" rx="3" fill="#8fa2b3"/><circle cx="130" cy="180" r="6" fill="#ffb020"/>${[0,1,2].map(i=>`<circle cx="130" cy="180" fill="none" stroke="#ffb020" stroke-width="3" style="animation:wavesm 1.8s ${i*.6}s linear infinite"/>`).join("")}<text x="375" y="155" text-anchor="middle" fill="#8fa2b3" font-size="16">模型就在旁邊</text>`},
  {t:"人員定位", real:"室內定位：藍牙信標或 UWB 算出位置", demo:"在地圖上點選自己的位置", why:"GPS 訊號穿不過屋頂，誤差也有好幾公尺；24 公分的模型裡，GPS 分不出任何一條走廊。",
   r:`<path d="M40 60H480V270H40Z M40 165H480 M260 60V270" fill="none" stroke="#5b6b79" stroke-width="6"/>${[[70,90],[450,90],[70,240],[450,240]].map(([x,y],i)=>`<circle cx="${x}" cy="${y}" r="9" fill="#5aa2ff"/><circle cx="${x}" cy="${y}" fill="none" stroke="#5aa2ff" stroke-width="2" style="animation:wavesm 2.4s ${i*.6}s linear infinite"/>`).join("")}<g stroke="#5aa2ff" stroke-dasharray="5 6" stroke-width="2" opacity=".7"><path d="M70 90L330 200M450 90L330 200M70 240L330 200M450 240L330 200"/></g><circle cx="330" cy="200" r="12" fill="#ffb020" stroke="#141e29" stroke-width="3"/><g transform="translate(400 22)"><rect x="-14" y="-8" width="28" height="16" rx="3" fill="#8fa2b3"/><path d="M-30 0h12M18 0h12" stroke="#8fa2b3" stroke-width="5"/><path d="M-6 26 6 38M6 26-6 38" stroke="#ff4a3d" stroke-width="4"/></g><text x="400" y="54" text-anchor="middle" fill="#ff4a3d" font-size="13">GPS 收不到</text>`,
   d:`<rect x="110" y="40" width="300" height="240" rx="24" fill="#1b2836" stroke="#8fa2b3" stroke-width="4"/><path d="M150 90H370V240H150Z M150 165H370 M260 90V240" fill="none" stroke="#5b6b79" stroke-width="10"/><g style="animation:drop 2.6s ease-out infinite"><path d="M300 150c-12-14-18-22-18-32a18 18 0 0 1 36 0c0 10-6 18-18 32z" fill="#5aa2ff"/><circle cx="300" cy="118" r="7" fill="#fff"/></g><circle cx="300" cy="160" fill="none" stroke="#ffb020" stroke-width="3" style="animation:wavesm 2.6s linear infinite"/>`},
  {t:"鏡頭", real:"耐熱外殼，搭配熱影像穿透濃煙", demo:"一般魚眼鏡頭", why:"熱影像鏡頭一顆就要上萬元；模型只用線香，煙量小，一般鏡頭就看得到。",
   r:`<defs><radialGradient id="th" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff2a8"/><stop offset=".4" stop-color="#ff8a3d"/><stop offset="1" stop-color="#7a1fa2"/></radialGradient></defs><rect x="40" y="30" width="440" height="250" rx="10" fill="#1d1033"/><ellipse cx="260" cy="170" rx="70" ry="95" fill="url(#th)"/><circle cx="260" cy="88" r="30" fill="url(#th)"/><g style="animation:drift 4s ease-in-out infinite alternate" opacity=".25">${[0,1,2,3,4].map(i=>`<circle cx="${90+i*85}" cy="${120+(i%2)*60}" r="60" fill="#a7b6c6"/>`).join("")}</g><text x="56" y="56" fill="#fff2a8" font-size="15">熱影像：煙擋不住人和火源</text>`,
   d:`<rect x="40" y="30" width="440" height="250" rx="10" fill="#0f151b"/><path d="M60 280 200 140h120l140 140" fill="#2a3a4b"/><rect x="230" y="160" width="60" height="40" fill="#e9eff4"/><g style="animation:drift 3s ease-in-out infinite alternate" opacity=".7">${[0,1,2,3,4,5].map(i=>`<circle cx="${70+i*80}" cy="${110+(i%3)*45}" r="58" fill="#a7b6c6"/>`).join("")}</g><text x="56" y="56" fill="#e9eff4" font-size="15">一般鏡頭：煙濃了就看不清</text>`},
  {t:"指示燈", real:"地面與牆面 LED 動態指示，接緊急電源", demo:"每個路口一組小 LED", why:"模型縮小到 1 : 100，空間只放得下一組方向燈，但傳達的資訊一樣：往哪走、此路不通。",
   r:`<path d="M20 230H500" stroke="#2a3a4b" stroke-width="60"/>${Array.from({length:12},(_,i)=>`<path d="M${40+i*38} 222l14 8-14 8" fill="none" stroke="#2fd27f" stroke-width="5" stroke-linecap="round" style="animation:chase 1.4s ${i*.11}s infinite"/>`).join("")}<rect x="160" y="60" width="200" height="80" rx="8" fill="#0a8a4b"/><path d="M200 100h70m-20-20 20 20-20 20" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="315" cy="100" r="16" fill="#fff"/><text x="260" y="170" text-anchor="middle" fill="#8fa2b3" font-size="15">牆面標誌也能改方向</text>`,
   d:`<path d="M260 20V280M20 150H500" stroke="#2a3a4b" stroke-width="70"/><g transform="translate(260 150)"><rect x="-34" y="-34" width="68" height="68" rx="12" fill="#07120c" stroke="#4be79a" stroke-width="3"/><path d="M-20,0L0,-20V-8H20V8H0V20Z" fill="#4be79a" style="animation:chase 1.2s infinite"/></g><text x="260" y="292" text-anchor="middle" fill="#8fa2b3" font-size="15">每個路口一顆</text>`},
  {t:"訓練資料", real:"真實建築與火場影像", demo:"Blender 合成影像，之後補線香實拍", why:"不可能為了拍照真的放火；用模擬世界大量產生影像，再用少量實拍補足差距。",
   r:[0,1,2].map(i=>`<g style="animation:slidein .8s ${i*.4}s both"><rect x="${70+i*40}" y="${50+i*30}" width="300" height="180" rx="8" fill="#2a3a4b" stroke="#e9eff4" stroke-width="3"/><path d="M${90+i*40} ${210+i*30}l80-70 60 50 50-40 90 60z" fill="#5b6b79"/><circle cx="${330+i*40}" cy="${90+i*30}" r="18" fill="#ffb020" opacity=".8"/></g>`).join(""),
   d:`<g fill="none" stroke="#8fa2b3" stroke-width="2" stroke-dasharray="600" stroke-dashoffset="600" style="animation:draw 2.5s ease-out infinite"><path d="M60 250L180 170H340L460 250Z M180 170V60H340V170 M60 250V120L180 60 M460 250V120L340 60"/></g><rect x="220" y="190" width="70" height="40" fill="#e9eff4"/><rect x="214" y="184" width="82" height="52" fill="none" stroke="#ffb020" stroke-width="3" style="animation:chase 2.5s infinite"/><rect x="214" y="166" width="58" height="18" fill="#ffb020"/><text x="220" y="180" font-size="13" fill="#1b1300" font-weight="700">櫃子</text>`},
  {t:"建築", real:"匯入任何樓層平面圖", demo:"兩層、田字形走廊", why:"3D 列印的尺寸和時間有限；田字形已經有環狀與十字走廊，足以示範改道。",
   r:`<g fill="none" stroke="#8fa2b3" stroke-width="5" stroke-dasharray="1400" stroke-dashoffset="1400" style="animation:draw 3s ease-out forwards"><path d="M40 40H480V270H40Z M40 140H200V40 M200 140V270 M200 200H330V270 M330 140V200 M330 140H480 M400 40V140 M120 200H200 M260 40V90H330V140"/></g><path d="M60 250H190V160H320" fill="none" stroke="#2fd27f" stroke-width="5" stroke-dasharray="10 8" style="animation:flow 1s linear infinite"/>`,
   d:`<g transform="translate(130 20)"><rect x="0" y="0" width="260" height="260" rx="6" fill="#18222c" stroke="#7e8d99" stroke-width="8"/>${[[20,20],[140,20],[20,140],[140,140]].map(([x,y])=>`<rect x="${x}" y="${y}" width="100" height="100" fill="#2a3a4b"/>`).join("")}</g><text x="260" y="296" text-anchor="middle" fill="#8fa2b3" font-size="15">240 mm · 兩層疊放</text>`},
];
const vs = {k:0, timer:null};
function vsShow(k){ vs.k = k; const v = VS[k];
  $$("#vsTabs button").forEach((b, i) => { b.classList.toggle("on", i === k); b.setAttribute("aria-selected", i === k); const bar = b.querySelector("i"); bar.style.animation = "none"; bar.offsetWidth; bar.style.animation = ""; });
  for (const [id, svg, txt] of [["#vsReal", v.r, v.real], ["#vsDemo", v.d, v.demo]]){ const s = $(id); s.innerHTML = svg; s.classList.remove("fade-in"); s.getBoundingClientRect(); s.classList.add("fade-in"); $(id+"T").textContent = txt; }
  $("#vsWhy").textContent = v.why; }
function vsAuto(on){ clearInterval(vs.timer); if (on && !reduce) vs.timer = setInterval(() => vsShow((vs.k+1)%VS.length), 6000); }
$("#vsTabs").innerHTML = VS.map(v => `<button role="tab">${v.t}<i></i></button>`).join("");
$$("#vsTabs button").forEach((b, i) => b.onclick = () => { vsShow(i); vsAuto(false); $$("#vsTabs button i").forEach(x => x.style.animationPlayState = "paused"); });
hooks.ideal = {enter:() => { vsShow(0); vsAuto(true); }, leave:() => vsAuto(false)};

/* ================= slide: pipeline ================= */
const PIPE = [
  {id:"cam", x:20, y:150, w:200, t:"魚眼鏡頭 × 8", s:"每層 4 顆，天花板斜 18°", info:"每層天花板四邊各一顆，鏡頭往建築中心斜 18°。等立體角魚眼水平 112°，四顆就能看到整層 12 段走廊。"},
  {id:"hub", x:290, y:150, w:220, t:"HUB 8735 Ultra", s:"YOLOv7-tiny 板上推論", info:"每顆鏡頭接一片 HUB 8735 Ultra，在板子上直接跑 YOLOv7-tiny，辨識 5 種障礙物和煙。只傳偵測框出去，不傳影像，頻寬很小。"},
  {id:"wifi", x:580, y:150, w:190, t:"Wi-Fi 熱點", s:"HTTP POST · JSON", info:"8 片 HUB 透過筆電熱點，每秒把偵測框用 HTTP POST 傳給伺服器；伺服器回傳該 HUB 負責的路口燈號。"},
  {id:"srv", x:840, y:60, w:260, t:"筆電伺服器", s:"投影 → 走廊狀態 → 尋路", info:"把每個偵測框的底部投影回地板，算出 24 段走廊的障礙率和煙濃度；加上煙霧擴散預測與起火點，從出口倒推 Dijkstra，得到每個路口的方向。"},
  {id:"led", x:1170, y:20, w:220, t:"地面 LED × 18", s:"每個路口一組方向燈", info:"每層 9 個路口，每個路口一組地面方向燈：往東西南北、下樓、或打叉表示此路不通。"},
  {id:"app", x:1170, y:250, w:220, t:"網頁中控台", s:"WebSocket 即時同步", info:"避難人員、消防員、無關人員用手機開同一個網頁：看自己的路線、風險熱點、受困位置，消防員還能點開鏡頭畫面。"},
];
function pipeDraw(){
  const svg = $("#pipe"); svg.innerHTML = ""; const by = Object.fromEntries(PIPE.map(n => [n.id, n]));
  const port = (n, side) => side === "r" ? [n.x+n.w, n.y+60] : [n.x, n.y+60];
  const wires = [["cam","hub"],["hub","wifi"],["wifi","srv"],["srv","led"],["srv","app"]];
  for (const [a, b] of wires){ const [x0, y0] = port(by[a], "r"), [x1, y1] = port(by[b], "l"); const mx = (x0+x1)/2; const d = `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
    el("path", {d, class:"wire"}, svg); if (!reduce) for (let k = 0; k < 3; k++){ const c = el("circle", {r:5, class:"pkt"}, svg); el("animateMotion", {dur:"2.4s", begin:`${-k*.8}s`, repeatCount:"indefinite", path:d}, c); } }
  // feedback wire: server answers each HUB with its LEDs
  const fb = `M${by.srv.x+130},${by.srv.y+120}C${by.srv.x+130},380 ${by.hub.x+110},380 ${by.hub.x+110},${by.hub.y+120}`;
  el("path", {d:fb, class:"wire", "stroke-dasharray":"6 8"}, svg); el("text", {x:620, y:400, "text-anchor":"middle", style:"font:500 16px var(--body);fill:var(--mute)"}, svg).textContent = "回傳每片 HUB 負責的路口燈號";
  if (!reduce){ const c = el("circle", {r:5, fill:"#5aa2ff"}, svg); el("animateMotion", {dur:"3s", repeatCount:"indefinite", path:fb}, c); }
  for (const n of PIPE){ const g = el("g", {class:"node", tabindex:0, role:"button", transform:`translate(${n.x},${n.y})`}, svg);
    el("rect", {width:n.w, height:120, rx:14}, g); el("text", {x:20, y:50, style:"font:700 24px var(--display)"}, g).textContent = n.t; el("text", {x:20, y:84, class:"sub"}, g).textContent = n.s;
    const pick = () => { $$("#pipe .node").forEach(x => x.classList.remove("sel")); g.classList.add("sel"); $("#pipeInfo").innerHTML = `<h3 style="margin-bottom:8px">${n.t}</h3><p class="lead" style="font-size:20px;margin:0">${n.info}</p>`; };
    g.addEventListener("click", pick); g.addEventListener("keydown", e => { if (e.key === "Enter") pick(); });
    if (n.id === "srv") pick(); }
}
hooks.system = {enter:pipeDraw};

/* ================= slide: physical model / assembly ================= */
const ASM = [
  {t:"一樓樓層", k:["F1_tray"]},
  {t:"一樓天花板（四邊凸塊自動對位）", k:["F1_lid"]},
  {t:"封孔板，塞住天花板的窗洞", k:["F1_seal"]},
  {t:"麵包版座 + HUB + 鏡頭", k:["F1_pods","F1_boards","F1_pcb"]},
  {t:"支撐柱 + 6 mm 定位銷", k:["F1_spacers"]},
  {t:"二樓樓層", k:["F2_tray"]},
  {t:"二樓天花板、封孔板、鏡頭", k:["F2_lid","F2_seal","F2_pods","F2_boards","F2_pcb"]},
  {t:"東西兩座樓梯塔", k:["stairs"]},
];
const asm = {k:ASM.length-1, explode:false, anim:null};
const EXPL = {F1_tray:0, F1_lid:50, F1_seal:80, F1_pods:110, F1_boards:110, F1_pcb:110, F1_spacers:150, F2_tray:200, F2_lid:260, F2_seal:290, F2_pods:320, F2_boards:320, F2_pcb:320, stairs:0};
function asmApply(k, instant){
  asm.k = k; $$("#asmSteps button").forEach((b, i) => b.classList.toggle("on", i === k));
  if (!T.ready || T.mode !== "model") return;
  const t0 = performance.now(); const target = {};
  ASM.forEach((s, i) => s.k.forEach(n => { target[n] = {vis:i <= k, z:asm.explode ? EXPL[n] : 0, fresh:i === k}; }));
  for (const n in target){ const p = T.parts[n]; if (!p) continue; p.visible = target[n].vis; if (instant || reduce){ p.position.z = target[n].z; continue; }
    if (target[n].fresh && !asm.explode) p.position.z = target[n].z + 90; }
  cancelAnimationFrame(asm.anim);
  if (!instant && !reduce) (function f(t){ const u = Math.min(1, (t-t0)/700), e = 1-Math.pow(1-u, 3);
    for (const n in target){ const p = T.parts[n]; if (!p) continue; p.position.z += (target[n].z - p.position.z)*e; }
    if (u < 1) asm.anim = requestAnimationFrame(f); })(t0);
}
(function asmUI(){
  const box = $("#asmSteps"); ASM.forEach((s, i) => { const b = document.createElement("button"); b.innerHTML = `<span class="k">${i+1}</span>${s.t}`; b.onclick = () => asmApply(i); box.appendChild(b); });
  let timer = null;
  $("#asmPlay").onclick = () => { clearInterval(timer); let i = 0; asmApply(0); timer = setInterval(() => { i++; if (i >= ASM.length){ clearInterval(timer); return; } asmApply(i); }, 1100); };
  $("#asmExplode").onclick = e => { asm.explode = !asm.explode; e.target.setAttribute("aria-pressed", asm.explode); asmApply(asm.k); };
  const parts = [["#dfe3e7","樓層","2"],["#9fb4c9","天花板","2"],["#5aa2ff","封孔板","2"],["#f1f1ee","麵包版座","8"],["#1f7a45","HUB 8735 + 鏡頭","8"],["#c8d0d8","支撐柱","4"],["#e8b04a","樓梯塔（上下段）","2 座"]];
  $("#partList").innerHTML = parts.map(p => `<span class="sw" style="background:${p[0]}"></span><span>${p[1]}</span><span class="n">× ${p[2]}</span>`).join("");
})();
hooks.model = {enter:() => asmApply(asm.k, true)};

/* ================= camera model (equisolid fisheye, ported from evac.py) ================= */
const CAMS = {N:0, W:90, E:-90, S:180}; const IMG_W = 640, IMG_H = 360, SW = 5.6;
function camPose(fl, c, tilt){ const rz = CAMS[c]*Math.PI/180, a = -tilt*Math.PI/180; const cz = Math.cos(rz), sz = Math.sin(rz), ca = Math.cos(a), sa = Math.sin(a);
  const Rz = [[cz,-sz,0],[sz,cz,0],[0,0,1]], Rx = [[1,0,0],[0,ca,-sa],[0,sa,ca]];
  const R = Rz.map((r, i) => [0,1,2].map(j => r[0]*Rx[0][j]+r[1]*Rx[1][j]+r[2]*Rx[2][j]));
  const p = [cz*0 - sz*92, sz*0 + cz*92, 111 + (fl-1)*150]; return {p, R}; }
function project(fl, c, P, tilt, f){ const {p, R} = camPose(fl, c, tilt); const d = [P[0]-p[0], P[1]-p[1], P[2]-p[2]];
  const q = [0,1,2].map(j => R[0][j]*d[0]+R[1][j]*d[1]+R[2][j]*d[2]); const n = Math.hypot(...q); if (q[2] >= 0) return null;
  const th = Math.acos(Math.max(-1, Math.min(1, -q[2]/n))); const r = 2*f*Math.sin(th/2), ph = Math.atan2(q[1], q[0]); const s = IMG_W/SW;
  return [IMG_W/2 + r*Math.cos(ph)*s, IMG_H/2 - r*Math.sin(ph)*s]; }
function unproject(fl, c, u, v, zl, tilt = 18, f = 2.9821){ const {p, R} = camPose(fl, c, tilt); const s = IMG_W/SW; const xs = (u-IMG_W/2)/s, ys = (IMG_H/2-v)/s;
  const r = Math.hypot(xs, ys); const th = 2*Math.asin(Math.min(1, r/(2*f))), ph = Math.atan2(ys, xs); const ray = [Math.sin(th)*Math.cos(ph), Math.sin(th)*Math.sin(ph), -Math.cos(th)];
  const d = [0,1,2].map(i => R[i][0]*ray[0]+R[i][1]*ray[1]+R[i][2]*ray[2]); if (d[2] >= -1e-6) return null; const zw = zl + (fl-1)*150; const t = (zw-p[2])/d[2]; return [p[0]+t*d[0], p[1]+t*d[1]]; }

/* ================= slide: fisheye coverage ================= */
const cov = {fl:2, cam:"all", tilt:18, hfov:112};
function covDraw(){
  const cv = $("#covCanvas"); const box = cv.parentElement; const W = box.clientWidth, H = box.clientHeight; if (!W) return; cv.width = W*2; cv.height = H*2;
  const x = cv.getContext("2d"); x.setTransform(2, 0, 0, 2, 0, 0); x.clearRect(0, 0, W, H);
  const st = D.seq[0]; const k = Math.min(W, H)/270; const ox = W/2, oy = H/2; const P = (X, Y) => [ox + X*k, oy - Y*k];
  x.fillStyle = "#7e8d99"; let [a0, b0] = P(-122, 122); x.fillRect(a0, b0, 244*k, 244*k); x.fillStyle = "#18222c"; [a0, b0] = P(-117, 117); x.fillRect(a0, b0, 234*k, 234*k);
  const f = 2.8/(2*Math.sin(cov.hfov*Math.PI/720)); const cams = cov.cam === "all" ? Object.keys(CAMS) : [cov.cam];
  const segs = st.segments.filter(s => s.floor === cov.fl); let tot = 0, seen = 0; const step = 2.5;
  const colors = ["#3a4a59", "#1f6f4a", "#2fd27f", "#9cf0c4", "#ffffff"];
  for (const s of segs){ const q = segGeom(st, s); const x0 = Math.min(q.ax, q.bx)-q.hw, x1 = Math.max(q.ax, q.bx)+q.hw, y0 = Math.min(q.ay, q.by)-q.hw, y1 = Math.max(q.ay, q.by)+q.hw;
    for (let X = x0+step/2; X < x1; X += step) for (let Y = y0+step/2; Y < y1; Y += step){
      let n = 0; for (const c of cams){ const uv = project(cov.fl, c, [X, Y, 8+(cov.fl-1)*150], cov.tilt, f); if (uv && uv[0] >= 0 && uv[0] < IMG_W && uv[1] >= 0 && uv[1] < IMG_H) n++; }
      tot++; if (n) seen++; x.fillStyle = colors[Math.min(4, n)]; const [px, py] = P(X-step/2, Y+step/2); x.fillRect(px, py, step*k+.6, step*k+.6); } }
  for (const c of Object.keys(CAMS)){ const {p} = camPose(cov.fl, c, cov.tilt); const [px, py] = P(p[0], p[1]); const on = cams.includes(c);
    x.save(); x.translate(px, py); x.rotate(-CAMS[c]*Math.PI/180); x.fillStyle = on ? "#ffb020" : "#5b6b79"; x.beginPath(); x.moveTo(0, 10); x.lineTo(-8, -6); x.lineTo(8, -6); x.closePath(); x.fill(); x.restore();
    x.fillStyle = "#e9eff4"; x.font = "600 13px Noto Sans TC, sans-serif"; x.textAlign = "center"; x.fillText({N:"北", E:"東", S:"南", W:"西"}[c], px, py + (c === "N" ? -14 : c === "S" ? 24 : 4) + 0); }
  const pct = Math.round(seen/tot*100); $("#covTxt").textContent = `走廊覆蓋 ${pct}%（${cams.length === 4 ? "四顆合計" : "單顆"}）`;
  // legend
  x.font = "13px Noto Sans TC, sans-serif"; x.textAlign = "left"; ["沒拍到","1 顆","2 顆","3 顆","4 顆"].forEach((t, i) => { x.fillStyle = colors[i]; x.fillRect(12, H-24-(4-i)*20, 14, 14); x.fillStyle = "#8fa2b3"; x.fillText(t, 32, H-12-(4-i)*20); });
  const c1 = cov.cam === "all" ? "N" : cov.cam; $("#covImg").src = `img/s0_${cov.fl}${c1}.jpg`; $("#covImgT").textContent = `${cov.fl}F ${{N:"北", E:"東", S:"南", W:"西"}[c1]}側鏡頭實際畫面（模擬世界，傾角 18°）`;
}
function segPick(sel, cb){ $$(sel+" .btn").forEach(b => b.onclick = () => { $$(sel+" .btn").forEach(x => x.classList.toggle("on", x === b)); cb(b.dataset.v ?? b.dataset.k); }); }
segPick("#covFloor", v => { cov.fl = +v; covDraw(); }); segPick("#covCam", v => { cov.cam = v; covDraw(); });
$("#tilt").oninput = e => { cov.tilt = +e.target.value; $("#tiltO").textContent = cov.tilt+"°"; covDraw(); };
$("#hfov").oninput = e => { cov.hfov = +e.target.value; $("#hfovO").textContent = cov.hfov+"°"; covDraw(); };
hooks.camera = {enter:() => requestAnimationFrame(covDraw)};

/* ================= slide: dataset ================= */
const CLS = [["櫃子","#ffb020"],["紙箱","#5aa2ff"],["桌椅","#c58cff"],["瓦礫","#e07a5f"],["閘門","#ff4a3d"],["煙","#d6dee6"]];
const galState = {boxes:true, big:null};
function drawLabeled(cv, img, labels, boxes, scale = 1){ const x = cv.getContext("2d"); x.drawImage(img, 0, 0, cv.width, cv.height); if (!boxes) return;
  for (const [c, cx, cy, w, h] of labels){ const [col] = [CLS[c][1]]; x.strokeStyle = col; x.lineWidth = 2*scale; x.strokeRect((cx-w/2)*cv.width, (cy-h/2)*cv.height, w*cv.width, h*cv.height);
    x.fillStyle = col; x.font = `600 ${12*scale}px Noto Sans TC, sans-serif`; const t = CLS[c][0]; const tw = x.measureText(t).width + 8*scale; x.fillRect((cx-w/2)*cv.width, (cy-h/2)*cv.height - 16*scale, tw, 16*scale);
    x.fillStyle = "#0c131b"; x.fillText(t, (cx-w/2)*cv.width + 4*scale, (cy-h/2)*cv.height - 4*scale); } }
function galDraw(){
  const g = $("#gal"); if (!g.children.length){ D.samples.forEach((s, i) => { const b = document.createElement("button"); b.setAttribute("aria-label", `樣本 ${i+1}`); const cv = document.createElement("canvas"); cv.width = 560; cv.height = 315; b.appendChild(cv);
      const img = new Image(); img.onload = () => { s._img = img; drawLabeled(cv, img, s.labels, galState.boxes, 1.6); }; img.src = s.img; b.onclick = () => galBig(i); g.appendChild(b); });
    $("#galLegend").innerHTML = CLS.map(c => `<span class="chip"><span class="dot" style="background:${c[1]}"></span>${c[0]}</span>`).join(""); }
  else [...g.children].forEach((b, i) => { const s = D.samples[i]; if (s._img) drawLabeled(b.firstChild, s._img, s.labels, galState.boxes, 1.6); });
}
function galBig(i){ const g = $("#gal"); const on = galState.big === i ? null : i; galState.big = on;
  [...g.children].forEach((b, k) => { b.classList.toggle("on", k === on); b.style.gridColumn = k === on ? "span 2" : ""; b.style.gridRow = k === on ? "span 2" : ""; }); }
$("#galBoxes").onclick = e => { galState.boxes = !galState.boxes; e.target.classList.toggle("on", galState.boxes); e.target.setAttribute("aria-pressed", galState.boxes); galDraw(); };
hooks.data = {enter:galDraw};

/* ================= slide: training ================= */
let curveKey = "map50";
function curveDraw(){
  const svg = $("#curve"); svg.innerHTML = ""; const rows = D.curve; const Wd = 820, Ht = 420, l = 60, r = 20, t = 20, b = 50;
  const isLoss = curveKey === "loss"; const ymax = isLoss ? .18 : 1; const X = e => l + (Wd-l-r)*e/29, Y = v => t + (Ht-t-b)*(1-v/ymax);
  for (let k = 0; k <= 5; k++){ const v = ymax*k/5; el("line", {x1:l, x2:Wd-r, y1:Y(v), y2:Y(v), class:"grid"}, svg); el("text", {x:l-10, y:Y(v)+5, "text-anchor":"end"}, svg).textContent = isLoss ? v.toFixed(2) : v.toFixed(1); }
  for (const e of [0, 5, 10, 15, 20, 25, 29]) el("text", {x:X(e), y:Ht-b+26, "text-anchor":"middle"}, svg).textContent = e+1;
  el("text", {x:(l+Wd-r)/2, y:Ht-6, "text-anchor":"middle"}, svg).textContent = "訓練輪數（epoch）";
  const series = isLoss ? [["loss","#ffb020","總損失"]] : [["map50","#2fd27f","mAP@.5"],["map","#5aa2ff","mAP@.5:.95"],["P","#c58cff","Precision"],["R","#e07a5f","Recall"]];
  const shown = isLoss ? series : series.filter(s => s[0] === curveKey || (curveKey === "map50" && s[0] === "map"));
  shown.forEach(([k, col, name], si) => { const d = "M"+rows.map(r => `${X(r.ep).toFixed(1)},${Y(r[k]).toFixed(1)}`).join("L");
    const p = el("path", {d, fill:"none", stroke:col, "stroke-width":si === 0 ? 3.5 : 2.5, "stroke-linejoin":"round"}, svg); const L = p.getTotalLength();
    if (!reduce){ p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p.getBoundingClientRect(); p.style.transition = "stroke-dashoffset 1.6s cubic-bezier(.3,.7,.2,1)"; requestAnimationFrame(() => p.style.strokeDashoffset = 0); }
    const lastR = rows[rows.length-1]; const g = el("g", {}, svg); el("circle", {cx:X(lastR.ep), cy:Y(lastR[k]), r:5, fill:col}, g);
    el("text", {x:X(lastR.ep)-8, y:Y(lastR[k]) + (si ? 26 : -14), "text-anchor":"end", style:`fill:${col};font-size:15px;font-weight:600`}, g).textContent = `${name} ${lastR[k].toFixed(3)}`; });
  if (!isLoss){ el("line", {x1:X(6.5), x2:X(6.5), y1:t, y2:Ht-b, stroke:"#8fa2b3", "stroke-dasharray":"4 5"}, svg); el("text", {x:X(6.5)+8, y:t+16, "text-anchor":"start", style:"font-family:var(--body);fill:#8fa2b3;font-size:14px"}, svg).textContent = "雲端環境中斷後，從第 7 輪接續"; }
}
function barsDraw(){ const box = $("#clsBars"); box.innerHTML = D.classes.map(c => `<div class="b"><span>${c[1]}</span><span class="t"><i style="background:${c[0] === "smoke" ? "#a7b6c6" : c[0] === "gate" ? "#ffb020" : "#2fd27f"}" data-w="${c[5]*100}"></i></span><span class="v">${c[5].toFixed(2)}</span></div>`).join("");
  requestAnimationFrame(() => requestAnimationFrame(() => $$("#clsBars i").forEach(i => i.style.width = i.dataset.w+"%"))); }
const M_PLAIN = {map50:"<b class='ic' title='白話說明' aria-label='白話說明'></b><span><em>mAP</em> 是物體辨識最常用的總分：同時看「找不找得到」和「會不會誤報」。<em>@0.5</em> 表示框和答案重疊一半以上才算對；藍線 @.5:.95 的標準更嚴格。<em>一輪（epoch）</em>= 把全部訓練圖片看過一次。</span>",
  P:"<b class='ic' title='白話說明' aria-label='白話說明'></b><span><em>Precision 精確率</em>：AI 說「這裡有障礙物」的時候，有幾成是真的。越高代表越少誤報。</span>",
  R:"<b class='ic' title='白話說明' aria-label='白話說明'></b><span><em>Recall 召回率</em>：真正存在的障礙物裡，AI 找到了幾成。越高代表越少漏掉。</span>",
  loss:"<b class='ic' title='白話說明' aria-label='白話說明'></b><span><em>損失</em>是 AI 答錯的程度，訓練就是讓它一直往下降。曲線變平代表再訓練下去進步有限。</span>"};
segPick("#mSel", k => { curveKey = k; curveDraw(); $("#mPlain").innerHTML = M_PLAIN[k]; });
hooks.train = {enter:() => { curveDraw(); barsDraw(); $("#mPlain").innerHTML = M_PLAIN[curveKey]; }};

/* ================= slide: detections -> corridor state ================= */
const det = {k:3, cam:"2N"};
const HALF_H = [12, 8, 9, 6, 50];
function detDraw(){
  const st = analyse(clone(D.seq[det.k]), W0(), D.seq[det.k-1]); const fl = +det.cam[0], c = det.cam[1];
  const img = $("#dImg"); img.style.visibility = "visible"; img.onerror = () => { img.style.visibility = "hidden"; $("#dList").innerHTML = `<span style="color:var(--fire)">這顆鏡頭在 02:30 故障離線，系統沿用它最後一次的資訊。</span>`; }; img.src = `img/s${det.k}_${det.cam}.jpg`;
  const cv = $("#dBox"); const x = cv.getContext("2d"); x.clearRect(0, 0, 640, 360);
  const dets = (st.dets && st.dets[det.cam]) || []; const dots = []; const lines = [];
  for (const [cl, cx, cy, w, h, conf] of dets){ const col = CLS[cl][1]; x.strokeStyle = col; x.lineWidth = 3; x.strokeRect((cx-w/2)*640, (cy-h/2)*360, w*640, h*360);
    x.fillStyle = col; x.font = "600 18px Noto Sans TC, sans-serif"; const t = `${CLS[cl][0]} ${Math.round(conf*100)}%`; const tw = x.measureText(t).width+10; x.fillRect((cx-w/2)*640, Math.max(0, (cy-h/2)*360-24), tw, 24); x.fillStyle = "#0c131b"; x.fillText(t, (cx-w/2)*640+5, Math.max(18, (cy-h/2)*360-6));
    let gp; if (cl === 5) gp = unproject(fl, c, cx*640, cy*360, 40); else { const bottom = cy+h/2; gp = (cl === 4 || bottom > .97) ? unproject(fl, c, cx*640, cy*360, HALF_H[cl]) : unproject(fl, c, cx*640, bottom*360, 8); }
    if (cl !== 5){ x.fillStyle = "#fff"; x.beginPath(); x.arc(cx*640, Math.min(358, (cy+h/2)*360), 6, 0, 7); x.fill(); }
    if (gp){ const seg = cl === 5 ? null : locate(st, fl, gp[0], gp[1]); dots.push({floor:fl, x:gp[0], y:gp[1], color:col}); lines.push(`<span class="chip" style="border-color:${col};color:var(--ink)"><span class="dot" style="background:${col}"></span>${CLS[cl][0]} ${Math.round(conf*100)}%</span> <span class="mute">→ ${cl === 5 ? "煙，計入附近走廊的煙濃度" : seg ? `${fl}F ${JN[seg.a+""]}–${JN[seg.b+""]}` + (seg.rate ? `，障礙率 ${Math.round(seg.rate*100)}%` : "") : "不在走廊內"}</span>`); } }
  $("#dList").innerHTML = lines.length ? lines.join("<br>") : `<span class="mute">這個畫面沒有偵測到障礙物或煙。</span>`;
  $("#dMapT").textContent = `${fl}F 平面 · ${st.t}`;
  drawMap($("#dMap"), st, fl, {dots, flow:false});
  const {p} = camPose(fl, c, 18); const g = place($("#dMap").querySelector("g").lastChild, p[0], p[1], `rotate(${CAMS[c]})`);
  el("path", {d:"M0,-8L-7,6L7,6Z", fill:"#ffb020", transform:"scale(1,-1)"}, g);
}
(function detUI(){
  $("#dStep").innerHTML = D_steps().map((t, i) => `<button class="btn${i === det.k ? " on" : ""}" data-v="${i}">${t}</button>`).join("");
  $("#dCam").innerHTML = ["1N","1E","1S","1W","2N","2E","2S","2W"].map(c => `<button class="btn${c === det.cam ? " on" : ""}" data-v="${c}">${c[0]}F ${{N:"北", E:"東", S:"南", W:"西"}[c[1]]}</button>`).join("");
})();
function D_steps(){ return ["00:00","00:30","01:00","01:30","02:00","02:30"]; }
segPick("#dStep", v => { det.k = +v; detDraw(); }); segPick("#dCam", v => { det.cam = v; detDraw(); });
hooks.detect = {enter:detDraw};

/* ================= slide: routing playground ================= */
const rp = {st:null, W:W0(), edits:{}, waveT:null};
function rpBase(){ const st = clone(D.seq[0]); st.fire = null; for (const s of st.segments){ s.rate = 0; s.smoke = 0; s.gate = false; s.items = []; s.unknown = false;
  const e = rp.edits[s.id]; if (e === 1){ s.rate = .7; } if (e === 2){ s.smoke = .9; } if (e === 3){ s.gate = true; s.rate = 1; } } return st; }
function rpDraw(waveUpTo){
  const st = analyse(rpBase(), rp.W); rp.st = st;
  for (const f of [1, 2]){ const svg = $("#r"+f); drawMap(svg, st, f, {onSeg:s => { rp.edits[s.id] = ((rp.edits[s.id] || 0)+1)%4; rpDraw(); }, flow:waveUpTo == null});
    if (waveUpTo != null){ const L = svg.querySelector("g"); const lay = L.children[7]; // signs layer
      const reached = new Set(st.order.slice(0, waveUpTo));
      [...lay.children].forEach(g => { g.style.opacity = reached.has(g.dataset.node) ? 1 : .15; });
      const ring = L.children[9];
      for (const n of st.order.slice(0, waveUpTo)){ if (!n.includes(",")) continue; const [nf, i, j] = n.split(",").map(Number); if (nf !== f) continue; const [x, y] = jpos(st, f, i, j);
        const d = st.dist.get(n); const gg = place(ring, x, y); el("text", {x:0, y:-11, "text-anchor":"middle", class:"lbl8", style:"font-size:9px"}, gg).textContent = Math.round(d); } } }
}
$("#rWave").onclick = () => { clearInterval(rp.waveT); let k = 0; rpDraw(0); rp.waveT = setInterval(() => { k++; rpDraw(k); if (k >= rp.st.order.length){ clearInterval(rp.waveT); setTimeout(() => rpDraw(), 900); } }, reduce ? 10 : 260); };
$("#rReset").onclick = () => { rp.edits = {}; rpDraw(); };
$("#rwS").oninput = e => { rp.W.smoke = +e.target.value; $("#rwSO").textContent = e.target.value; rpDraw(); };
$("#rwO").oninput = e => { rp.W.obs = +e.target.value; $("#rwOO").textContent = e.target.value; rpDraw(); };
$("#rPred").onchange = e => { rp.W.predict = e.target.checked; rpDraw(); };
hooks.routing = {enter:() => { if (!Object.keys(rp.edits).length){ rp.edits = {"F1:1-1-10": 1, "F1:10-11": 2, "F2:01-11": 2}; } rpDraw(); }, leave:() => clearInterval(rp.waveT)};

/* ================= slide: linked simulation ================= */
function simState(){ const st = analyse(clone(D.seq[SIM.k]), W0(), D.seq[SIM.k-1]);
  if (SIM.camOff) for (const s of st.segments) if (s.floor === 1 && s.a[0] === 1 && s.b[0] === 1) s.unknown = true;
  return st; }
function simSet(k, keepPeople){
  SIM.k = k; SIM.st = simState(); const st = SIM.st;
  $("#simTitle").textContent = st.note; $$("#simTL button").forEach((b, i) => b.classList.toggle("on", i === k));
  if (!keepPeople) SIM.people = (st.people || []).map(p => ({...p, x:p.x + ({p1:6, p2:-6, p3:6, p4:-6, f1:7, b1:-7}[p.id] || 0), y:p.y + ({p1:5, p2:6, p3:-6, p4:-5, f1:7, b1:-7}[p.id] || 0), out:false}));
  simMaps(); simApply();
}
function simMaps(){ const st = SIM.st; for (const f of [1, 2]) drawMap($("#m"+f), st, f, {people:SIM.people, names:true}); }
let simTimer = null;
(function simUI(){
  $("#simTL").innerHTML = D_steps().map((t, i) => `<button data-i="${i}"><b>${t}</b><span class="tln"></span></button>`).join("");
  $$("#simTL button").forEach(b => b.onclick = () => { stopSim(); simSet(+b.dataset.i); });
  $("#simPlay").onclick = () => { if (simTimer){ stopSim(); return; } $("#simPlay").textContent = "暫停"; if (SIM.k >= 5) simSet(0); simTimer = setInterval(() => { if (SIM.k >= 5){ stopSim(); return; } simSet(SIM.k+1, SIM.walking); }, 3800); };
  $("#simWalk").onclick = e => { SIM.walking = !SIM.walking; e.target.setAttribute("aria-pressed", SIM.walking); e.target.classList.toggle("on", SIM.walking); if (!SIM.walking) simSet(SIM.k); };
  $("#simCam").onclick = e => { SIM.camOff = !SIM.camOff; e.target.setAttribute("aria-pressed", SIM.camOff); e.target.classList.toggle("on", SIM.camOff); simSet(SIM.k, true); };
  $("#simLeg").innerHTML = [["#4be79a","燈號"],["#a7b6c6","煙"],["#2a2f36","障礙物"],["#ffb020","避難者"],["#ff4a3d","消防員 / 起火"]].map(c => `<span><span class="dot" style="background:${c[0]};border:1px solid #556"></span> ${c[1]}</span>`).join("");
})();
function stopSim(){ clearInterval(simTimer); simTimer = null; $("#simPlay").textContent = "播放情境"; }
let walkAcc = 0;
function walkStep(dt){
  const st = SIM.st; if (!st) return; const v = 28*dt; let moved = false;
  for (const p of SIM.people){ if (p.out || p.role !== "evacuee") continue; const r = personRoute(st, p.floor, p.x, p.y); p.trapped = !r.ok; if (!r.ok) continue;
    const part = r.parts[0]; let left = v, k = 1;
    while (left > 0 && k < part.pts.length){ const [tx, ty] = part.pts[k]; const d = Math.hypot(tx-p.x, ty-p.y); if (d <= left){ p.x = tx; p.y = ty; left -= d; k++; } else { p.x += (tx-p.x)/d*left; p.y += (ty-p.y)/d*left; left = 0; } }
    if (k >= part.pts.length){ if (r.parts.length > 1){ p.floor = r.parts[1].floor; [p.x, p.y] = r.parts[1].pts[0]; drawPeople3D(); } else if (Math.abs(p.x) >= 116) p.out = true; }
    moved = true; if (p.mesh) p.mesh.position.set(p.x+fx(p.floor), p.y, fz(p.floor)); }
  walkAcc += dt; if (walkAcc > .25){ walkAcc = 0; simMaps(); if (SIM.people.some(p => p.out && p.mesh && p.mesh.parent)) drawPeople3D(); }
}
hooks.sim = {enter:() => { simSet(SIM.k); }, leave:stopSim};
hooks.cover = {enter:() => { if (SIM.k === 0){ SIM.k = 3; simSet(3); } }};
hooks.end = {enter:() => { simSet(4); }};

/* ================= slide: console ================= */
hooks.console = {enter:() => { const f = $("#console"); if (!f.src) f.src = f.dataset.src; }};

/* ================= boot ================= */
fetch("data.json").then(r => r.json()).then(d => {
  D = d;
  $$("#simTL .tln").forEach((n, i) => n.textContent = D.seq[i].note);
  try { init3D(); } catch (e) { console.warn("3D unavailable", e); }
  SIM.k = 3; SIM.st = simState(); simSet(3);
  const start = Math.max(0, slides.findIndex(s => "#" + s.dataset.name === location.hash));
  go(start);
}).catch(e => { console.error(e); go(0); });
})();
