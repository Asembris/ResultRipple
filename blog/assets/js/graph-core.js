// Shared rendering for the write-up's evidence-graph scenes (Three.js r160).
//
// The visual language is the app's own (frontend/src/graph/graph-scene.js): halo
// nodes, flowing tube edges, faint ripple rings. What it draws is not: every node,
// edge and label comes from blog/data/story.json, which is built from
// docs/evidence. Positions are presentation only, assigned by node type.
import * as THREE from 'three';

export const PALETTE = { ivory: '#EFE8DA', amber: '#E8B064', coral: '#E3876A', sage: '#9CCBAE', dim: '#6A6257', faint: '#8A8172' };
const TONE = {};
for (const k in PALETTE) TONE[k] = new THREE.Color(PALETTE[k]);
const V = THREE.Vector3;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const ease = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const span = (s, a, b) => clamp((s - a) / (b - a));
/** Piecewise interpolation over [[s, value], ...] keyframes, eased between them. */
export function keyframes(s, frames) {
  if (s <= frames[0][0]) return frames[0][1];
  for (let i = 0; i < frames.length - 1; i++) {
    const [a, va] = frames[i], [b, vb] = frames[i + 1];
    if (s < b) return va + (vb - va) * ease((s - a) / (b - a));
  }
  return frames[frames.length - 1][1];
}

/**
 * Desktop framing for the scroll scenes, tuned at 1440 px: keep that scale on
 * wider screens and move the graph into the space right of the step cards.
 */
export function besideCards(container, w, shift) {
  const W = container.clientWidth;
  const card = container.parentElement && container.parentElement.querySelector('.scrolly__step');
  const right = card ? card.getBoundingClientRect().right : 544;
  return { w: w * Math.max(1, W / 1440), shift: ((shift * 1440) / 2 + (right - 544)) * 2 / W };
}

// ---- layout (presentation only) --------------------------------------------
const FIXED = {
  comparison: [-2.2, 1.8, 0.5],
  finding: [1.6, 1.8, 0],
  decision: [8.6, -2.9, 0],
  team: [10.8, -4.6, 0],
};
const DOC_POS = [[5.2, 4.6, -0.3], [5.2, -1.2, 0.3]];
const PERSON_POS = [[14.2, -2.2, 0], [14.2, -6.4, 0]];
const PLAN_POS = [[11.4, 2.8, 0.4], [11.6, 0.5, 0.3]];

/** Lane positions in story order, then batch positions for a phase ('before' | 'after'). */
export function layout(story) {
  const lanes = {};
  story.lanes.forEach((l, i) => { lanes[l.id] = [-6, 3.6 - i * 3.6, i === 1 ? 0.5 : 0]; });
  const batchPos = (phase) => {
    const key = phase === 'before' ? 'lane_before' : 'lane_after';
    const out = {};
    for (const lid in lanes) {
      const group = story.batches.filter((b) => b[key] === lid).map((b) => b.id).sort();
      const lp = lanes[lid], n = group.length;
      group.forEach((id, j) => {
        const off = (j - (n - 1) / 2) * 0.56;
        out[id] = [lp[0] - 2.8 + Math.abs(off) * 0.22, lp[1] + off, Math.sin(j * 1.7) * 0.25];
      });
    }
    return out;
  };
  const pos = {};
  const before = batchPos('before');
  let d = 0, p = 0, pl = 0;
  for (const n of story.graph.nodes) {
    if (n.type === 'lane') pos[n.id] = lanes[n.id];
    else if (n.type === 'batch') pos[n.id] = before[n.id];
    else if (n.type === 'document') pos[n.id] = DOC_POS[d++];
    else if (n.type === 'person') pos[n.id] = PERSON_POS[p++];
    else if (n.type === 'plan') pos[n.id] = PLAN_POS[pl++];
    else pos[n.id] = FIXED[n.type];
  }
  return { pos, batchPos };
}

// ---- shaders: the app's flowing-edge shader, unchanged --------------------------
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const FS = `uniform vec3 uColor; uniform float uOpacity,uTime,uFlow,uReveal,uWave,uLen,uDash; varying vec2 vUv;
void main(){
  float x = vUv.x;
  if (x > uReveal) discard;
  if (uDash > 0.5 && fract(x*uLen*2.4) > 0.55) discard;
  float s = fract(x*uLen*0.2 - uTime*0.42);
  float pulse = smoothstep(0.0,0.05,s)*(1.0-smoothstep(0.05,0.38,s));
  float tip = smoothstep(uReveal-0.05,uReveal,x)*step(uReveal,0.995);
  float d = (x-uWave)*uLen; float w = exp(-d*d*1.4);
  float a = uOpacity*(0.55 + 0.85*pulse*uFlow) + w*1.3 + tip*0.9;
  vec3 c = mix(uColor, vec3(1.0,0.95,0.84), clamp(w*0.55 + tip*0.4,0.0,1.0));
  gl_FragColor = vec4(c, clamp(a,0.0,1.0));
}`;

function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,.5)');
  gr.addColorStop(0.42, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

const SIZE = { batch: 0.12, lane: 0.3, comparison: 0.42, finding: 0.56, document: 0.5, decision: 0.44, team: 0.3, person: 0.34, plan: 0.3 };
const ANCHOR = { batch: 'left', lane: 'left', comparison: 'below', finding: 'below', document: 'below', decision: 'below', team: 'below', person: 'right', plan: 'right' };
const GAP = { batch: 12, lane: 0, comparison: 26, finding: 36, document: 34, decision: 26, team: 22, person: 22, plan: 18 };

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

/**
 * createGraph({ container, story, include, labels, reduced })
 * include: node ids to build (edges are built only between included nodes).
 * Returns a small imperative API; nothing animates unless the caller drives it.
 */
export function createGraph(opts) {
  const { container, story } = opts;
  const include = new Set(opts.include || story.graph.nodes.map((n) => n.id));
  const reduced = !!opts.reduced;
  const showLabel = opts.labels || (() => true);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  if (!renderer.getContext()) throw new Error('no WebGL context');
  const dprCap = opts.dprCap || 1.5;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dprCap));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = 'gl-canvas';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);
  const labelLayer = document.createElement('div');
  labelLayer.className = 'gl-labels';
  labelLayer.setAttribute('aria-hidden', 'true');
  container.appendChild(labelLayer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const world = new THREE.Group(); scene.add(world);
  const halo = haloTexture();
  const { pos, batchPos } = layout(story);

  // faint ripple rings: the brand motif, centred on the shared finding
  const findingId = story.finding.id;
  const backdrop = new THREE.Group(); backdrop.position.set(...pos[findingId]); backdrop.position.z = -9; world.add(backdrop);
  for (let i = 1; i <= 7; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(i * 3.2, i * 3.2 + 0.025, 160),
      new THREE.MeshBasicMaterial({ color: 0xE8B064, transparent: true, opacity: 0.05 - i * 0.004, depthWrite: false }));
    backdrop.add(m);
  }

  const basic = (op = 1) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: op, depthWrite: false });
  const nodes = new Map();
  for (const def of story.graph.nodes) {
    if (!include.has(def.id)) continue;
    const group = new THREE.Group();
    const size = SIZE[def.type];
    const mats = [];
    const spin = [];
    const add = (geo, op = 1) => { const m = basic(op); mats.push({ m, op }); const mesh = new THREE.Mesh(geo, m); group.add(mesh); return mesh; };
    switch (def.type) {
      case 'decision': case 'plan': spin.push(add(new THREE.OctahedronGeometry(size), 0.95)); break;
      case 'document': {
        add(new THREE.BoxGeometry(0.64, 0.84, 0.04), 0.92);
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.78, 0.98, 0.04)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
        mats.push({ m: lines.material, op: 0.5 }); group.add(lines);
        for (let i = 0; i < 4; i++) {
          const r = new THREE.Mesh(new THREE.PlaneGeometry(i === 1 ? 0.3 : 0.44, 0.035), new THREE.MeshBasicMaterial({ color: 0x15120F, transparent: true, opacity: 0.5, depthWrite: false }));
          r.position.set(i === 1 ? -0.07 : 0, 0.24 - i * 0.14, 0.03); group.add(r);
        }
        break;
      }
      case 'person': add(new THREE.TorusGeometry(0.32, 0.04, 12, 56), 0.95); add(new THREE.SphereGeometry(0.1, 16, 12), 0.9); break;
      default: add(new THREE.SphereGeometry(size, 28, 18), def.type === 'batch' ? 0.95 : 0.9);
    }
    if (def.type === 'lane' || def.type === 'comparison' || def.type === 'finding') {
      const r = add(new THREE.TorusGeometry(size * 1.7, 0.012, 8, 96), 0.55); r.rotation.x = Math.PI / 2.4; spin.push(r);
    }
    if (def.type === 'finding') {
      const r2 = add(new THREE.TorusGeometry(size * 2.3, 0.01, 8, 96), 0.35); r2.rotation.y = Math.PI / 2.6; spin.push(r2);
    }
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
    const hs = def.type === 'batch' ? 1.0 : def.type === 'finding' ? 4.2 : def.type === 'document' ? 2.6 : size * 6;
    sprite.scale.setScalar(hs);
    group.add(sprite);
    group.position.set(...pos[def.id]);
    world.add(group);

    const label = makeLabel(def, labelLayer, showLabel(def));
    nodes.set(def.id, {
      def, group, mats, sprite, spin, hs, label,
      color: TONE.ivory.clone(), tColor: TONE.ivory.clone(), vis: 1, tVis: 1, flash: 0, flashColor: TONE.ivory.clone(), dim: 1, tDim: 1, avoid: 1, tAvoid: 1,
    });
  }

  const edges = new Map();
  story.graph.edges.forEach((def, i) => {
    if (!include.has(def.from) || !include.has(def.to)) return;
    const key = def.from + '>' + def.to;
    const u = { uColor: { value: TONE.faint.clone() }, uOpacity: { value: 0.4 }, uTime: { value: 0 }, uFlow: { value: reduced ? 0 : 1 }, uReveal: { value: 1 }, uWave: { value: -9 }, uLen: { value: 1 }, uDash: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    world.add(mesh);
    const minor = def.rel === 'ASSIGNED_TO';
    const bend = minor ? 0 : ((i * 37) % 7 - 3) * 0.035;
    let tag = null;
    if (opts.edgeTags && opts.edgeTags(def)) {
      tag = document.createElement('div');
      tag.className = 'gl-edge-tag';
      tag.textContent = def.rel;
      labelLayer.appendChild(tag);
    }
    edges.set(key, { def, mesh, u, minor, bend, tag, a: new V(1e9, 0, 0), b: new V(), curve: null,
      color: TONE.faint.clone(), tColor: TONE.faint.clone(), op: 0.4, tOp: 0.4, tagAlpha: 1 });
  });

  function rebuild(e) {
    const A = nodes.get(e.def.from).group.position, B = nodes.get(e.def.to).group.position;
    if (e.a.distanceToSquared(A) < 1e-6 && e.b.distanceToSquared(B) < 1e-6) return;
    e.a.copy(A); e.b.copy(B);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const len = A.distanceTo(B);
    const dir = B.clone().sub(A).normalize();
    mid.addScaledVector(new V(-dir.y, dir.x, 0), len * e.bend).add(new V(0, 0, len * 0.07));
    e.curve = new THREE.QuadraticBezierCurve3(A.clone(), mid, B.clone());
    e.mesh.geometry.dispose();
    e.mesh.geometry = new THREE.TubeGeometry(e.curve, e.minor ? 12 : 48, e.minor ? 0.014 : 0.028, 6, false);
    e.u.uLen.value = e.curve.getLength();
  }

  // ---- camera framing ----
  const view = { x: 2, y: 0, w: 30, h: 16, shift: 0, lift: 0, yaw: 0, pitch: 0.04 };
  const cam = { x: 2, y: 0, dist: 60, init: false };
  const tanH = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  function fitDist() {
    const W = container.clientWidth, H = container.clientHeight;
    if (!W || !H) return cam.dist;
    return Math.max(view.h / (2 * tanH()), view.w / (2 * tanH() * (W / H)));
  }
  function resize() {
    const W = container.clientWidth, H = container.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
    nodes.forEach((n) => { n.label.w = 0; });
    if (!running) draw(lastT, true);
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);

  // ---- per-frame ----
  const tmp = new V();
  const scratch = new THREE.Color();
  let lastT = 0;
  let firstFrame = true;
  function draw(t, snap) {
    const W = container.clientWidth, H = container.clientHeight;
    if (!W || !H) return;
    if (renderer.domElement.width !== Math.round(W * renderer.getPixelRatio())) { renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix(); }
    const dt = Math.min(0.1, Math.max(0, t - lastT)); lastT = t;
    const k = snap || reduced || firstFrame ? 1 : 1 - Math.pow(0.02, dt);
    firstFrame = false;

    const gd = fitDist();
    if (!cam.init || reduced || snap) { cam.x = view.x; cam.y = view.y; cam.dist = gd; cam.init = true; }
    cam.x += (view.x - cam.x) * k; cam.y += (view.y - cam.y) * k; cam.dist += (gd - cam.dist) * k;
    const shiftWorld = view.shift * cam.dist * tanH() * camera.aspect;
    const cx = cam.x - shiftWorld, cy = cam.y - view.lift * cam.dist * tanH();
    camera.position.set(cx + Math.sin(view.yaw) * cam.dist, cy + Math.sin(view.pitch) * cam.dist, Math.cos(view.yaw) * Math.cos(view.pitch) * cam.dist);
    camera.lookAt(cx, cy, 0);

    nodes.forEach((n) => {
      n.color.lerp(n.tColor, k);
      n.vis += (n.tVis - n.vis) * k;
      n.dim += (n.tDim - n.dim) * k;
      n.avoid += (n.tAvoid - n.avoid) * k;
      n.flash = Math.max(0, n.flash - dt * 1.4);
      const c = scratch.copy(n.color).lerp(n.flashColor, n.flash * 0.6);
      const a = n.vis * n.dim * n.avoid;
      n.mats.forEach(({ m, op }) => { m.color.copy(c); m.opacity = op * a; });
      n.sprite.material.color.copy(c);
      n.sprite.material.opacity = (0.42 + n.flash * 0.5) * a;
      n.sprite.scale.setScalar(n.hs * (1 + n.flash * 0.35));
      n.group.visible = a > 0.01;
      if (!reduced) n.spin.forEach((m, i) => { m.rotation.z += dt * (0.25 + i * 0.12); });
    });
    edges.forEach((e) => {
      rebuild(e);
      e.color.lerp(e.tColor, k); e.op += (e.tOp - e.op) * k;
      const nf = nodes.get(e.def.from), nt = nodes.get(e.def.to);
      const da = nf.dim * nt.dim * Math.max(nf.avoid, nt.avoid);
      e.u.uColor.value.copy(e.color); e.u.uOpacity.value = e.op * da; e.u.uTime.value = reduced ? 0 : t;
      e.mesh.visible = e.u.uReveal.value > 0.002 && da > 0.01;
    });
    renderer.render(scene, camera);
    placeLabels(W, H);
  }

  // Labels prefer their type's side, but a label that would be pushed back by
  // an edge of the view, cover another node's marker or overlap a label already
  // placed tries the other sides. A label inside the caller's "avoid" rectangle
  // (the hero's text block) is hidden, and its node dimmed.
  const FLEX = new Set(['comparison', 'finding', 'document', 'decision', 'team', 'person', 'plan']);
  const SIDES = ['right', 'left', 'below', 'above'];
  const rectFor = (side, x, y, g, w, h) => ({
    left: side === 'left' ? x - g - w : side === 'right' ? x + g : x - w / 2,
    top: side === 'below' ? y + g : side === 'above' ? y - g - h : y - h / 2,
    w, h,
  });
  const inside = (px, py, r, pad) => px > r.left - pad && px < r.left + r.w + pad && py > r.top - pad && py < r.top + r.h + pad;
  const overlap = (a, b) => Math.max(0, Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top));
  function placeLabels(W, H) {
    const bounds = { left: 6, top: 6, right: W - 6, bottom: H - 6 };
    const avoid = opts.avoid ? opts.avoid() : null;
    const points = [];
    nodes.forEach((n) => {
      n.sx = null;
      if (n.vis * n.dim < 0.05) return;
      tmp.copy(n.group.position).project(camera);
      if (tmp.z > 1) return;
      n.sx = (tmp.x * 0.5 + 0.5) * W; n.sy = (-tmp.y * 0.5 + 0.5) * H;
      n.tAvoid = avoid && inside(n.sx, n.sy, avoid, 0) ? 0.3 : 1;
      points.push(n);
    });
    const placed = [];
    nodes.forEach((n) => {
      const L = n.label;
      const hide = () => { if (L.shown) { L.el.style.opacity = '0'; L.shown = false; } };
      if (!L.on) return;
      const a = n.vis * n.dim * L.alpha;
      if (a < 0.02 || n.sx === null) return hide();
      let x = n.sx, y = n.sy;
      if (n.def.type === 'lane') {
        tmp.copy(n.group.position); tmp.x -= 4.3; tmp.project(camera); // left of the batch column, as in the app
        x = (tmp.x * 0.5 + 0.5) * W; y = (-tmp.y * 0.5 + 0.5) * H;
      }
      // A node outside the view keeps its label hidden instead of pinned to an edge.
      if (x < -8 || x > W + 8 || y < -8 || y > H + 8) return hide();
      if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
      const g = GAP[n.def.type];
      const score = (side) => {
        const r = rectFor(side, x, y, g, L.w, L.h);
        let sc = Math.max(0, bounds.left - r.left) + Math.max(0, r.left + r.w - bounds.right)
          + Math.max(0, bounds.top - r.top) + Math.max(0, r.top + r.h - bounds.bottom);
        for (const m of points) if (m !== n && m.def.type !== 'batch' && inside(m.sx, m.sy, r, 12)) sc += 400;
        for (const q of placed) sc += overlap(r, q) / 6;
        return sc;
      };
      let side = L.side || L.anchor;
      if (FLEX.has(n.def.type)) {
        let best = side, bestScore = score(side);
        for (const cand of [L.anchor, ...SIDES]) {
          if (cand === best) continue;
          const sc = score(cand);
          if (sc + 1 < bestScore) { best = cand; bestScore = sc; }
        }
        side = best;
      }
      if (side !== L.side) { L.side = side; L.el.dataset.anchor = side; }
      const r = rectFor(side, x, y, g, L.w, L.h);
      if (avoid && overlap(r, avoid) > 0) return hide();
      const left = Math.max(bounds.left, Math.min(bounds.right - L.w, r.left));
      const top = Math.max(bounds.top, Math.min(bounds.bottom - L.h, r.top));
      placed.push({ left, top, w: L.w, h: L.h });
      L.el.style.transform = `translate3d(${left.toFixed(1)}px,${top.toFixed(1)}px,0)`;
      L.el.style.opacity = a.toFixed(3);
      L.shown = true;
    });
    edges.forEach((e) => {
      if (!e.tag || !e.curve) return;
      const a = e.u.uReveal.value > 0.6 ? Math.min(1, e.op * 1.5) * e.tagAlpha : 0;
      if (a < 0.02) { e.tag.style.opacity = '0'; return; }
      tmp.copy(e.curve.getPoint(0.5)).project(camera);
      const x = (tmp.x * 0.5 + 0.5) * W, y = (-tmp.y * 0.5 + 0.5) * H;
      e.tag.style.transform = `translate3d(${(x - e.tag.offsetWidth / 2).toFixed(1)}px,${(y - 18).toFixed(1)}px,0)`;
      e.tag.style.opacity = a.toFixed(3);
    });
  }

  // ---- loop control ----
  // On a machine that cannot hold the frame rate (software WebGL, for one), the
  // scene drops its continuous motion after the first second and renders only
  // when the story moves, so it never competes with scrolling.
  let running = false, raf = 0, slow = false, lastNow = 0;
  const samples = [];
  const t0 = performance.now();
  const frameHooks = [];
  function loop(now) {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    const t = (now - t0) / 1000;
    if (lastNow && samples.length < 45 && document.visibilityState === 'visible') {
      samples.push(now - lastNow);
      if (samples.length === 45) {
        const sorted = samples.slice().sort((x, y) => x - y);
        if (sorted[22] > 28) { slow = true; running = false; cancelAnimationFrame(raf); draw(t, true); return; }
      }
    }
    lastNow = now;
    frameHooks.forEach((fn) => fn(t));
    draw(t);
  }

  const api = {
    nodes, edges, pos, batchPos, reduced,
    PALETTE,
    tone(id, tone) { const n = nodes.get(id); if (n) n.tColor.copy(TONE[tone]); },
    visible(id, v) { const n = nodes.get(id); if (n) n.tVis = v; },
    dim(id, v) { const n = nodes.get(id); if (n) n.tDim = v; },
    flash(id, tone) { const n = nodes.get(id); if (n) { n.flash = 1; n.flashColor.copy(TONE[tone]); } },
    move(id, p) { const n = nodes.get(id); if (n) n.group.position.set(p[0], p[1], p[2]); },
    edge(from, to, o) {
      const e = edges.get(from + '>' + to);
      if (!e) return;
      if (o.reveal !== undefined) e.u.uReveal.value = o.reveal;
      if (o.tone) e.tColor.copy(TONE[o.tone]);
      if (o.op !== undefined) e.tOp = o.op;
      if (o.dash !== undefined) e.u.uDash.value = o.dash ? 1 : 0;
      if (o.wave !== undefined) e.u.uWave.value = o.wave;
      if (o.tag !== undefined) e.tagAlpha = o.tag;
    },
    label(id, txt) { const n = nodes.get(id); if (n) setLabel(n.label, txt); },
    labelAlpha(id, a) { const n = nodes.get(id); if (n) n.label.alpha = a; },
    frame(f) { Object.assign(view, f); },
    onFrame(fn) { frameHooks.push(fn); },
    render() { draw(lastT + 1 / 60, false); },
    still() { draw(lastT, true); },
    start() { if (running || reduced || slow) { if (!running) draw(lastT, true); return; } running = true; lastNow = 0; raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    get running() { return running; },
    get slow() { return slow; },
    dispose() {
      api.stop(); ro.disconnect();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      halo.dispose(); renderer.dispose(); renderer.domElement.remove(); labelLayer.remove();
    },
  };
  resize();
  return api;
}

// ---- DOM labels ------------------------------------------------------------
function makeLabel(def, layer, on) {
  const el = document.createElement('div');
  el.className = 'gl-label gl-label--' + def.type;
  const t = document.createElement('div'); t.className = 'gl-label__t';
  const s = document.createElement('div'); s.className = 'gl-label__s';
  const g = document.createElement('div'); g.className = 'gl-label__g';
  el.append(t, s, g);
  t.textContent = def.label;
  s.style.display = 'none';
  g.style.display = 'none';
  layer.appendChild(el);
  const anchor = ANCHOR[def.type];
  el.dataset.anchor = anchor;
  if (!on) el.style.display = 'none';
  return { el, t, s, g, anchor, side: null, on, alpha: 1, w: 0, h: 0, shown: false, key: '' };
}

function setLabel(L, txt) {
  const key = [txt.title || '', txt.sub || '', txt.tag ? txt.tag.join('|') : ''].join('·');
  if (key === L.key) return;
  L.key = key;
  if (txt.title) L.t.textContent = txt.title;
  L.s.textContent = txt.sub || '';
  L.s.style.display = txt.sub ? '' : 'none';
  if (txt.tag) {
    L.g.textContent = txt.tag[0];
    L.g.dataset.tone = txt.tag[1];
    L.g.style.display = '';
  } else L.g.style.display = 'none';
  L.w = 0;
}
