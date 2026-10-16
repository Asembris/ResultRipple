// ResultRipple V2 — evidence-to-decision graph scene (Three.js r160).
// Imperative module: createScene(opts) -> { setStage, playIntro, skipIntro, setInsets, setOptions, describe, dispose }.
import * as THREE from 'three'; // prototype: https://unpkg.com/three@0.160.0/build/three.module.js

export const PALETTE = { ivory: '#EFE8DA', amber: '#E8B064', coral: '#E3876A', sage: '#9CCBAE', dim: '#6A6257', faint: '#8A8172' };
const FONT_SANS = "'Hanken Grotesk', system-ui, sans-serif";
const FONT_SERIF = "'Instrument Serif', Georgia, serif";
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace";

// ---- stage-derived data -----------------------------------------------------
// This module knows no fact about the workspace. Every id, number, name and
// sentence below is read from the SceneStage the app derives from the real
// /workspace and /plans responses (see stageFromWorkspace.ts). A changed
// backend relationship is therefore the only thing that can change the picture.

const LANE_POS = { north: [-5.6, 3.7, 0], south: [-5.6, 0, 0.6], pilot: [-5.6, -3.7, 0] };
export const LAYERS = [['Evidence', -8.6], ['Lanes', -5.6], ['Comparison', -1.8], ['Finding', 1.8], ['Reports', 5.4], ['Decision', 9.4], ['Authority', 13.6]];
const LANE_ORDER = ['north', 'south', 'pilot'];

// Defensive defaults: a partial stage must degrade to an empty label, never crash
// the renderer and never show a fact that the server did not send.
const EMPTY = Object.freeze({ title: '', sub: '', tag: null });
const txtOf = (v) => (typeof v === 'string' ? v : '');
const batchesOf = (s) => (s && s.batches) || [];
const changedOf = (s) => (s && s.changedBatchIds) || [];
const labelsOf = (s) => (s && s.labels) || {};
const factsOf = (s) => (s && s.facts) || null;
const fromLaneOf = (s) => (s && s.fromLaneKey) || 'south';
const toLaneOf = (s) => (s && s.toLaneKey) || 'pilot';
const isChanged = (id, s) => changedOf(s).indexOf(id) >= 0;

/** Effective lane of a batch: the server's current membership once applied. */
function laneOf(id, s, moved) {
  const b = batchesOf(s).find((x) => x.id === id);
  if (!b) return 'south';
  const m = moved === undefined ? !!(s && s.moved) : moved;
  return m ? b.currentLane : b.originalLane;
}

function batchPositions(s, moved) {
  const groups = { north: [], south: [], pilot: [] };
  batchesOf(s).forEach((b) => {
    const lane = laneOf(b.id, s, moved);
    (groups[lane] || groups.south).push(b.id);
  });
  const out = {};
  for (const k in groups) {
    const g = groups[k], n = g.length, lp = LANE_POS[k];
    g.forEach((id, i) => {
      const off = (i - (n - 1) / 2) * 0.6;
      out[id] = [lp[0] - 2.9 + Math.abs(off) * 0.22, lp[1] + off, Math.sin(i * 1.7) * 0.25];
    });
  }
  return out;
}

function nodeDefs(s) {
  const L = labelsOf(s);
  const lane = (key) => (L.lanes && L.lanes[key]) || key.replace(/^./, (c) => c.toUpperCase());
  const d = [
    { id: 'dataset', type: 'dataset', label: txtOf(L.datasetTitle) || 'Batch dataset', pos: [-10.6, 6.6, 0], anchor: 'right' },
    { id: 'case', type: 'case', label: txtOf(L.caseRef) || 'Correction', pos: [-10.4, -6.9, 0.4], anchor: 'right' },
    { id: 'lane-north', type: 'lane', label: lane('north'), pos: LANE_POS.north, anchor: 'left', labelAt: [-9.75, 3.7, 0] },
    { id: 'lane-south', type: 'lane', label: lane('south'), pos: LANE_POS.south, anchor: 'left', labelAt: [-9.75, 0, 0.6] },
    { id: 'lane-pilot', type: 'lane', label: lane('pilot'), pos: LANE_POS.pilot, anchor: 'left', labelAt: [-9.75, -3.7, 0] },
    { id: 'comparison', type: 'comparison', label: txtOf(L.comparisonTitle) || 'Cost comparison', pos: [-1.8, 1.8, 0.6], anchor: 'below' },
    { id: 'finding', type: 'finding', label: txtOf(L.findingTitle) || 'Shared finding', pos: [1.8, 1.8, 0], anchor: 'below' },
    { id: 'doc-ops', type: 'document', label: txtOf(L.docOpsTitle) || 'Report', pos: [5.4, 4.8, -0.3], anchor: 'below' },
    { id: 'doc-memo', type: 'document', label: txtOf(L.docMemoTitle) || 'Report', pos: [5.4, -1.4, 0.3], anchor: 'below' },
    { id: 'release', type: 'release', label: txtOf(L.releaseTitle) || 'Current release', pos: [9.4, 6.4, 0], anchor: 'right' },
    { id: 'decision', type: 'decision', label: txtOf(L.decisionTitle) || 'Decision', pos: [9.4, -0.8, 0], anchor: 'below' },
    { id: 'plan', type: 'plan', label: txtOf(L.planTitle) || 'Review plan', pos: [11.8, 2.6, 0.5], anchor: 'right' },
    { id: 'team', type: 'team', label: txtOf(L.teamTitle) || 'Owning team', pos: [11.4, -4.4, 0], anchor: 'below' },
    { id: 'noor', type: 'person', label: txtOf(L.reviewerAName) || 'Reviewer A', pos: [14.4, -2.2, 0], anchor: 'right', fallback: 'below' },
    { id: 'sam', type: 'person', label: txtOf(L.reviewerBName) || 'Reviewer B', pos: [14.4, -6.3, 0], anchor: 'right', fallback: 'below' },
  ];
  const bp = batchPositions(s, false);
  batchesOf(s).forEach((b) => d.push({ id: b.id, type: 'batch', label: b.id, cost: b.costCents, pos: bp[b.id], anchor: 'left' }));
  return d;
}

export function edgeDefs(s) {
  const E = [];
  const f = factsOf(s);
  const leftLane = f ? f.leftLaneKey : 'north';
  const rightLane = f ? f.rightLaneKey : 'south';
  const to = toLaneOf(s);
  batchesOf(s).forEach((b) => {
    E.push({ id: b.id + '>' + b.originalLane, from: b.id, to: 'lane-' + b.originalLane, rel: 'ASSIGNED_TO', kind: 'assign', lane: b.originalLane, bend: 0 });
    if (isChanged(b.id, s) && to !== b.originalLane) {
      E.push({ id: b.id + '>' + to, from: b.id, to: 'lane-' + to, rel: 'ASSIGNED_TO', kind: 'assign', lane: to, bend: 0 });
    }
  });
  changedOf(s).forEach((id) => E.push({ id: 'case>' + id, from: 'case', to: id, rel: 'CHANGES_BATCH', kind: 'case', bend: 0.12 }));
  E.push({ id: 'left>cmp', from: 'lane-' + leftLane, to: 'comparison', rel: 'LEFT_SIDE', kind: 'flow', rev: true, bend: -0.08, tag: true });
  E.push({ id: 'right>cmp', from: 'lane-' + rightLane, to: 'comparison', rel: 'RIGHT_SIDE', kind: 'flow', stale: true, rev: true, bend: 0.08, tag: true });
  E.push({ id: 'dataset>cmp', from: 'dataset', to: 'comparison', rel: 'USES_DATASET', kind: 'context', rev: true, bend: 0.1 });
  E.push({ id: 'cmp>finding', from: 'comparison', to: 'finding', rel: 'BASED_ON', kind: 'flow', stale: true, rev: true, bend: 0.0, tag: true, link: 'finding' });
  E.push({ id: 'finding>ops', from: 'finding', to: 'doc-ops', rel: 'OF_CLAIM · IN_DOCUMENT', kind: 'flow', stale: true, bend: -0.1, occ: true, link: 'ops' });
  E.push({ id: 'finding>memo', from: 'finding', to: 'doc-memo', rel: 'OF_CLAIM · IN_DOCUMENT', kind: 'flow', stale: true, bend: 0.1, occ: true, link: 'memo' });
  E.push({ id: 'finding>decision', from: 'finding', to: 'decision', rel: 'BASED_ON', kind: 'flow', stale: true, rev: true, bend: 0.05, tag: true, link: 'basis' });
  E.push({ id: 'decision>team', from: 'decision', to: 'team', rel: 'OWNED_BY', kind: 'context', bend: 0.05 });
  E.push({ id: 'team>noor', from: 'team', to: 'noor', rel: 'REVIEWED_BY', kind: 'authority', who: 'noor', bend: -0.1, tag: true });
  E.push({ id: 'team>sam', from: 'team', to: 'sam', rel: 'REVIEWED_BY', kind: 'authority', who: 'sam', bend: 0.1, tag: true });
  E.push({ id: 'ops>release', from: 'doc-ops', to: 'release', rel: 'INCLUDES_DOCUMENT', kind: 'release', rev: true, bend: -0.1 });
  E.push({ id: 'memo>release', from: 'doc-memo', to: 'release', rel: 'INCLUDES_DOCUMENT', kind: 'release', rev: true, bend: 0.14 });
  E.push({ id: 'plan>ops', from: 'plan', to: 'doc-ops', rel: 'COVERS', kind: 'covers', bend: 0.1 });
  E.push({ id: 'plan>memo', from: 'plan', to: 'doc-memo', rel: 'COVERS', kind: 'covers', bend: -0.1 });
  E.push({ id: 'plan>noor', from: 'plan', to: 'noor', rel: 'ASSIGNED_TO_REVIEWER', kind: 'planrev', who: 'noor', bend: -0.12 });
  E.push({ id: 'plan>sam', from: 'plan', to: 'sam', rel: 'ASSIGNED_TO_REVIEWER', kind: 'planrev', who: 'sam', bend: 0.1 });
  return E;
}

// ---- stage semantics -------------------------------------------------------
// stage = { moved, caseVis, stale, plan, reviewer: noor|sam|unknown, authorityKnown,
//           release: none|v1|v2, focus, batches, changedBatchIds, facts, labels }
// `stale` is the server's own assessment (a registered card contradicted by
// current evidence), never an inference from how far the story has run.
const stale = (s) => !!(s && s.stale);
const planTone = (p) => (/approved|issued/.test(p) ? 'sage' : /invalid|retired|rejected/.test(p) ? 'coral' : 'amber');
const reviewerIs = (s, who) => !!(s && s.authorityKnown && s.reviewer === who);

function nodeTone(n, s) {
  const id = n.id;
  const f = factsOf(s);
  if (n.type === 'batch') return isChanged(id, s) && s.caseVis ? 'amber' : 'ivory';
  if (n.type === 'lane') {
    const key = id.slice('lane-'.length);
    return f && key === f.rightLaneKey && stale(s) ? 'coral' : 'ivory';
  }
  switch (id) {
    case 'dataset': return 'faint';
    case 'case': return 'amber';
    case 'comparison': case 'finding': case 'decision': return stale(s) ? 'coral' : 'amber';
    case 'doc-ops': case 'doc-memo': return stale(s) ? 'coral' : s.release === 'v2' ? 'sage' : 'ivory';
    case 'release': return s.release === 'v2' ? 'sage' : 'ivory';
    case 'noor': return reviewerIs(s, 'noor') ? 'amber' : 'dim';
    case 'sam': return reviewerIs(s, 'sam') ? 'amber' : 'dim';
    case 'plan': return planTone(s.plan);
    default: return 'ivory';
  }
}
// An authored link is drawn only when the server reports it. A stage without
// `links` predates authoring and keeps every authored link visible.
const linkOn = (s, key) => !(s && s.links) || s.links[key] !== false;
const nodeVisible = (n, s) => (n.id === 'case' ? s.caseVis : n.id === 'plan' ? s.plan !== 'none' : n.id === 'finding' ? linkOn(s, 'finding') : true);

const money = (cents) => '$' + Math.floor(Math.abs(cents) / 100) + '.' + String(Math.abs(cents) % 100).padStart(2, '0');
const RELATION_WORD = { HIGHER_COST: 'more expensive', LOWER_COST: 'cheaper', EQUAL_COST: 'equal', WITHHELD: 'withheld' };
const RELATION_DIR = { HIGHER_COST: 'higher', LOWER_COST: 'lower' };

function laneSub(key, s) {
  const f = factsOf(s);
  if (f && key === f.leftLaneKey) return money(f.leftMeanCents) + ' mean · ' + f.leftCount + ' batches';
  if (f && key === f.rightLaneKey) return money(f.rightMeanCents) + ' mean · ' + f.rightCount + ' batches';
  const n = batchesOf(s).filter((b) => laneOf(b.id, s) === key).length;
  return n + ' batches · not compared';
}

export function nodeText(n, s) {
  const L = labelsOf(s);
  const f = factsOf(s);
  const v2 = s.release === 'v2';
  if (n.type === 'lane') {
    const key = n.id.slice('lane-'.length);
    const isRight = !!f && key === f.rightLaneKey;
    return { sub: laneSub(key, s), tag: isRight && stale(s) ? ['RECOMPUTED', 'coral'] : null };
  }
  switch (n.id) {
    case 'dataset': return { sub: txtOf(L.datasetSub) };
    case 'case': return { sub: txtOf(L.caseSub), tag: s.moved ? ['APPLIED', 'amber'] : ['AWAITING CONFIRMATION', 'amber'] };
    case 'comparison': {
      const sub = f && RELATION_DIR[f.relation]
        ? f.rightLaneName + ' ' + RELATION_DIR[f.relation] + ' by ' + f.magnitudeCents + '¢'
        : f ? 'comparison withheld' : '';
      // Only a changed relation reverses direction; a magnitude-only change does not.
      const tag = s.reversed ? ['DIRECTION REVERSED', 'coral'] : stale(s) ? ['VALUE CHANGED', 'coral'] : null;
      return { sub, tag };
    }
    case 'finding': {
      const sub = f && RELATION_WORD[f.relation] && RELATION_DIR[f.relation]
        ? f.rightLaneName + ' ' + f.magnitudeCents + '¢ ' + RELATION_WORD[f.relation]
        : txtOf(L.findingSub);
      return { sub, tag: stale(s) ? ['PUBLISHED TEXT CONTRADICTED', 'coral'] : null };
    }
    case 'doc-ops': case 'doc-memo': {
      const owner = txtOf(n.id === 'doc-ops' ? L.docOpsOwner : L.docMemoOwner);
      const edition = txtOf(L.editionLabel);
      return {
        sub: (owner ? 'owner ' + owner : '') + (owner && edition ? ' · ' : '') + edition,
        tag: stale(s) ? ['OUT OF DATE', 'coral'] : v2 ? ['CORRECTED', 'sage'] : null,
      };
    }
    case 'decision': return { sub: txtOf(L.decisionStatus), tag: stale(s) ? ['BASIS CONTRADICTED', 'coral'] : null };
    case 'release': return { sub: txtOf(L.releaseSub), tag: v2 ? ['ISSUED', 'sage'] : null };
    case 'team': return { sub: txtOf(L.teamSub) };
    case 'noor': case 'sam': {
      const mine = reviewerIs(s, n.id);
      const role = txtOf(n.id === 'noor' ? L.reviewerARole : L.reviewerBRole);
      if (!s.authorityKnown) return { sub: role + ' · authority unresolved', tag: ['REVIEW AUTHORITY UNKNOWN', 'coral'] };
      return { sub: mine ? role + ' · current reviewer' : role + ' · no current authority', tag: mine ? ['★ REVIEW AUTHORITY', 'amber'] : null };
    }
    case 'plan': {
      const p = s.plan, v = p.startsWith('v2') ? 'v2' : 'v1';
      const who = txtOf(L.planReviewerName);
      const base = { 'v1-assigned': 'awaiting', 'v1-approved': 'approved by', 'v1-invalid': 'approval no longer valid', 'v1-retired': 'retired · can no longer be approved', 'v1-rejected': 'rejected by the reviewer', 'v1-issued': 'released', 'v2-assigned': 'awaiting', 'v2-approved': 'approved by', 'v2-invalid': 'approval no longer valid', 'v2-retired': 'retired · can no longer be approved', 'v2-rejected': 'rejected by the reviewer', 'v2-issued': 'released' }[p] || '';
      const sub = /invalid|retired|rejected|issued/.test(p) ? base : who ? base + ' ' + who : base;
      const title = txtOf(L.planTitle) ? L.planTitle + ' ' + v : 'Review plan ' + v;
      return {
        title,
        sub,
        tag: /invalid/.test(p) ? ['AUTHORITY_CHANGED', 'coral'] : /retired/.test(p) ? ['INVALIDATED', 'coral'] : /rejected/.test(p) ? ['REJECTED', 'coral'] : /approved|issued/.test(p) ? ['APPROVED' + (who ? ' · ' + who.toUpperCase() : ''), 'sage'] : null,
      };
    }
    default: return EMPTY;
  }
}

export function edgeTarget(e, s) {
  const st = stale(s);
  switch (e.kind) {
    case 'assign': {
      const moving = isChanged(e.from, s);
      const vis = moving ? (e.lane === toLaneOf(s) ? s.moved : !s.moved) : true;
      const tone = moving && s.caseVis ? (e.lane === toLaneOf(s) ? 'amber' : 'coral') : 'faint';
      return { vis, tone, dash: moving && s.caseVis && e.lane !== toLaneOf(s), op: moving && s.caseVis ? 0.7 : 0.32 };
    }
    case 'case': return { vis: s.caseVis, tone: 'amber', dash: true, op: 0.6 };
    case 'flow': return { vis: !e.link || linkOn(s, e.link), tone: e.stale && st ? 'coral' : 'amber', op: 0.62 };
    case 'context': return { vis: true, tone: 'faint', op: 0.3 };
    case 'authority': return { vis: reviewerIs(s, e.who), tone: 'ivory', op: 0.6 };
    // No INCLUDES_DOCUMENT edge is drawn before any release exists.
    case 'release': return { vis: s.release !== 'none', tone: s.release === 'v2' ? 'sage' : 'faint', op: s.release === 'v2' ? 0.6 : 0.3 };
    case 'covers': return { vis: s.plan !== 'none', tone: /issued/.test(s.plan) ? 'sage' : 'faint', dash: !/issued/.test(s.plan), op: 0.4 };
    case 'planrev': {
      // Which reviewer the plan is actually assigned to, not which story step it is.
      const mine = s.plan !== 'none' && s.planReviewerKey === e.who;
      const tone = planTone(s.plan);
      return { vis: mine, tone, dash: tone !== 'sage', op: 0.65 };
    }
  }
  return { vis: true, tone: 'ivory', op: 0.4 };
}


// ---- helpers ---------------------------------------------------------------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const E = { out: (t) => 1 - Math.pow(1 - t, 3), inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), back: (t) => { const c = 1.6; return t <= 0 ? 0 : t >= 1 ? 1 : 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); } };

export function makeLabel(def, layer) {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;left:0;top:0;opacity:0;pointer-events:none;white-space:nowrap;will-change:transform,opacity;text-shadow:0 1px 14px rgba(8,7,6,.95),0 0 3px rgba(8,7,6,.9)';
  const major = ['comparison', 'finding', 'document', 'decision'].includes(def.type);
  const t = document.createElement('div');
  if (def.type === 'batch') t.style.cssText = `font:500 12px/1 ${FONT_MONO};color:#A39A8C;letter-spacing:.02em`;
  else if (def.type === 'lane') t.style.cssText = `font:400 26px/1 ${FONT_SERIF};color:#EFE8DA`;
  else if (major) t.style.cssText = `font:400 21px/1.05 ${FONT_SERIF};color:#EFE8DA`;
  else t.style.cssText = `font:500 13.5px/1.15 ${FONT_SANS};color:#EFE8DA;letter-spacing:.01em`;
  t.textContent = def.label;
  const s = document.createElement('div');
  s.style.cssText = `font:400 12px/1.3 ${FONT_MONO};color:#A39A8C;margin-top:5px`;
  const g = document.createElement('div');
  g.style.cssText = `display:none;font:600 12px/1 ${FONT_MONO};letter-spacing:.08em;padding:4px 6px 3px;border-radius:2px;margin-top:6px;width:max-content`;
  el.append(t, s, g);
  layer.appendChild(el);
  const L = { el, t, s, g, gap: def.type === 'batch' ? 12 : def.type === 'lane' ? 0 : def.type === 'finding' ? 34 : def.type === 'document' ? 34 : 24, last: '', fallback: def.fallback || null, side: null };
  alignLabel(L, def.anchor);
  return L;
}
function alignLabel(L, anchor) {
  if (L.side === anchor) return;
  L.side = anchor;
  const align = anchor === 'left' ? 'right' : anchor === 'below' || anchor === 'above' ? 'center' : 'left';
  L.el.style.textAlign = align;
  L.g.style.marginLeft = align === 'left' ? '' : 'auto';
  L.g.style.marginRight = align === 'center' ? 'auto' : '';
}
function setLabelText(L, txt, base) {
  const key = (txt.title || base) + '|' + (txt.sub || '') + '|' + (txt.tag ? txt.tag.join() : '');
  if (key === L.last) return;
  L.last = key;
  L.t.textContent = txt.title || base;
  L.w = 0;
  L.s.textContent = txt.sub || '';
  L.s.style.display = txt.sub ? 'block' : 'none';
  if (txt.tag) {
    const c = PALETTE[txt.tag[1]];
    L.g.style.display = 'block';
    L.g.textContent = txt.tag[0];
    L.g.style.color = c;
    L.g.style.border = `1px solid ${c}66`;
    L.g.style.background = `${c}14`;
  } else L.g.style.display = 'none';
}
// Labels stay inside the visible canvas: never off its edges, never under the
// panel on the right (bounds.right) or the masthead and note (bounds.top).
export function placeLabel(L, anchor, x, y, bounds) {
  const g = L.gap;
  if (!L.w) { L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
  // A label the right edge would push back over its own node moves below it,
  // when it fits above the comparison strip (bounds.floor). A small margin
  // before switching back keeps the camera drift from flipping it.
  if (anchor === 'right' && L.fallback && bounds && L.w) {
    const room = bounds.right - (L.side === L.fallback ? 16 : 0);
    if (x + g + L.w > room && y + g + L.h <= bounds.floor) anchor = L.fallback;
  }
  alignLabel(L, anchor);
  const w = L.w, h = L.h;
  let left = anchor === 'left' ? x - g - w : anchor === 'below' || anchor === 'above' ? x - w / 2 : x + g;
  let top = anchor === 'below' ? y + g : anchor === 'above' ? y - g - h : y - h / 2;
  if (bounds && w) {
    left = Math.max(bounds.left, Math.min(bounds.right - w, left));
    top = Math.max(bounds.top, Math.min(bounds.bottom - h, top));
  }
  L.el.style.transform = `translate(${left}px,${top}px)`;
}

function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,255,255,.5)');
  gr.addColorStop(0.42, 'rgba(255,255,255,.1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

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

const FOCI = {
  overview: { x: 1.9, y: 0.9, w: 34, h: 18 },
  evidence: { x: -6.8, y: -0.2, w: 15, h: 16.5 },
  review: { x: 7.4, y: 0.4, w: 18, h: 14 },
  authority: { x: 11.6, y: -1.4, w: 14.5, h: 13 },
};

// ---- scene -----------------------------------------------------------------
export function createScene(opts) {
  const { container, labelLayer } = opts;
  // The node and edge sets are built from the first real stage, so geometry never
  // exists for a batch or relationship the server did not report.
  const stage0 = opts.stage || { batches: [], changedBatchIds: [], labels: {}, facts: null };
  const onHover = opts.onHover || (() => {});
  const onSelect = opts.onSelect || (() => {});
  let reduced = !!opts.reduced, drift = opts.drift !== false, flow = opts.flow !== false;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!renderer.getContext()) throw new Error('no ctx');
  } catch (err) {
    return createFallback(opts);
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 500);
  const world = new THREE.Group(); scene.add(world);
  const halo = haloTexture();
  const TONE = {}; for (const k in PALETTE) TONE[k] = new THREE.Color(PALETTE[k]);
  const V = THREE.Vector3;
  let T = 0, last = performance.now();

  // ripple rings behind the network: the brand motif, very faint, gives depth
  const backdrop = new THREE.Group(); backdrop.position.set(1.8, 1.8, -9); world.add(backdrop);
  for (let i = 1; i <= 7; i++) {
    const g = new THREE.RingGeometry(i * 3.2, i * 3.2 + 0.025, 160);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xE8B064, transparent: true, opacity: 0.05 - i * 0.004, depthWrite: false }));
    backdrop.add(m);
  }

  const SIZE = { batch: 0.12, lane: 0.3, dataset: 0.22, case: 0.3, comparison: 0.42, finding: 0.56, document: 0.5, decision: 0.44, release: 0.32, team: 0.3, person: 0.34, plan: 0.3 };
  const nodes = [], nodeMap = {}, edges = [], edgeMap = {};
  const hitMeshes = [];

  function basic(color, op = 1) { return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false }); }

  nodeDefs(stage0).forEach((def) => {
    const group = new THREE.Group();
    const size = SIZE[def.type];
    const mats = [];
    const add = (geo, op = 1, wire = false) => { const m = basic(0xffffff, op); if (wire) m.wireframe = true; mats.push({ m, op }); const mesh = new THREE.Mesh(geo, m); group.add(mesh); return mesh; };
    const spin = [];
    switch (def.type) {
      case 'case': case 'decision': case 'plan': add(new THREE.OctahedronGeometry(size), 0.95); spin.push(group.children[0]); break;
      case 'release': add(new THREE.BoxGeometry(0.46, 0.46, 0.46), 0.9); spin.push(group.children[0]); break;
      case 'document': {
        add(new THREE.BoxGeometry(0.64, 0.84, 0.04), 0.92);
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.78, 0.98, 0.04)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
        mats.push({ m: lines.material, op: 0.5 }); group.add(lines);
        for (let i = 0; i < 4; i++) { const r = add(new THREE.PlaneGeometry(i === 1 ? 0.3 : 0.44, 0.035), 0.5); r.position.set(i === 1 ? -0.07 : 0, 0.24 - i * 0.14, 0.03); r.material.color.set(0x15120F); mats.pop(); }
        break;
      }
      case 'person': add(new THREE.TorusGeometry(0.32, 0.04, 12, 56), 0.95); add(new THREE.SphereGeometry(0.1, 16, 12), 0.9); break;
      default: add(new THREE.SphereGeometry(size, 32, 20), def.type === 'batch' ? 0.95 : 0.9);
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
    const hit = new THREE.Mesh(new THREE.SphereGeometry(Math.max(size * 1.7, def.type === 'batch' ? 0.28 : 0.5), 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.id = def.id; group.add(hit); hitMeshes.push(hit);
    world.add(group);
    const n = {
      id: def.id, type: def.type, def, group, mats, sprite, hs, spin, hit,
      pos: new V(...def.pos), target: new V(...def.pos), color: TONE.ivory.clone(), tColor: TONE.ivory.clone(),
      vis: 1, tVis: 1, flash: 0, flashColor: TONE.ivory.clone(), intro: 1, arc: null, dim: 1, clear: 1,
      label: makeLabel(def, labelLayer),
    };
    nodes.push(n); nodeMap[def.id] = n;
  });

  edgeDefs(stage0).forEach((def) => {
    const uniforms = { uColor: { value: TONE.faint.clone() }, uOpacity: { value: 0.4 }, uTime: { value: 0 }, uFlow: { value: 1 }, uReveal: { value: 1 }, uWave: { value: -9 }, uLen: { value: 1 }, uDash: { value: 0 } };
    const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    world.add(mesh);
    let tagEl = null;
    if (def.tag) {
      tagEl = document.createElement('div');
      tagEl.style.cssText = `position:absolute;left:0;top:0;opacity:0;pointer-events:none;white-space:nowrap;font:500 12px/1 ${FONT_MONO};letter-spacing:.06em;color:#8C8476;text-shadow:0 0 8px #0E0C0A,0 0 3px #0E0C0A`;
      tagEl.textContent = def.rel;
      labelLayer.appendChild(tagEl);
    }
    const e = {
      id: def.id, def, mesh, mat, u: uniforms, tagEl, curve: null, a: new V(1e9, 0, 0), b: new V(), minor: def.kind === 'assign' || def.kind === 'context',
      reveal: 1, tReveal: 1, color: TONE.faint.clone(), tColor: TONE.faint.clone(), op: 0.4, tOp: 0.4, dash: 0, waveT0: null, intro: 1, introWaved: true, flickerUntil: 0, dim: 1,
    };
    edges.push(e); edgeMap[def.id] = e;
  });

  function rebuild(e) {
    const A = nodeMap[e.def.from].pos, B = nodeMap[e.def.to].pos;
    if (e.a.distanceToSquared(A) < 1e-6 && e.b.distanceToSquared(B) < 1e-6) return;
    e.a.copy(A); e.b.copy(B);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const len = A.distanceTo(B);
    const dir = B.clone().sub(A).normalize();
    const perp = new V(-dir.y, dir.x, 0);
    mid.addScaledVector(perp, len * (e.def.bend || 0)).add(new V(0, 0, len * 0.07));
    e.curve = new THREE.QuadraticBezierCurve3(A.clone(), mid, B.clone());
    e.mesh.geometry.dispose();
    e.mesh.geometry = new THREE.TubeGeometry(e.curve, e.minor ? 16 : 56, e.minor ? 0.014 : 0.028, 6, false);
    e.u.uLen.value = e.curve.getLength();
  }

  // ---- state application ----
  let stage = null;
  function applyNode(n, s) {
    n.tColor.copy(TONE[nodeTone(n, s)]);
    n.tVis = nodeVisible(n, s) ? 1 : 0;
    if (n.type === 'batch') { const p = batchPositions(s)[n.id]; if (p) n.target.set(...p); }
    setLabelText(n.label, nodeText(n, s), n.def.label);
  }
  function applyEdge(e, s) {
    const t = edgeTarget(e.def, s);
    e.tReveal = t.vis ? 1 : 0; e.tColor.copy(TONE[t.tone]); e.tOp = t.op; e.dash = t.dash ? 1 : 0;
  }
  const applyNodes = (ids) => ids.forEach((id) => applyNode(nodeMap[id], stage));
  const applyEdges = (ids) => ids.forEach((id) => applyEdge(edgeMap[id], stage));
  function applyAll(s) { nodes.forEach((n) => applyNode(n, s)); edges.forEach((e) => applyEdge(e, s)); }

  let queue = [];
  const k = () => (reduced ? 0.35 : 1);
  const at = (d, fn) => queue.push({ t: T + d * k(), fn });
  const wave = (id, d = 0) => at(d, () => { edgeMap[id].waveT0 = T; });
  const ringGeo = new THREE.RingGeometry(0.93, 1, 96);
  const rings = [];
  function flashNode(id, tone, d = 0, mag = 1) {
    at(d, () => {
      const n = nodeMap[id]; n.flash = 1; n.flashColor.copy(TONE[tone]);
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: TONE[tone], transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      m.position.copy(n.pos); world.add(m);
      rings.push({ m, t0: T, base: (SIZE[n.type] || 0.3) * 1.4, mag: mag * (n.type === 'batch' ? 0.6 : 1), dur: 1.15 });
    });
  }

  function choreoCorrection(s) {
    focus = 'evidence';
    flashNode('case', 'amber');
    const moved = changedOf(s), fromLane = fromLaneOf(s), toLane = toLaneOf(s);
    moved.forEach((id) => wave('case>' + id, 0.05));
    at(0.5, () => moved.forEach((id) => { applyEdge(edgeMap[id + '>' + fromLane], s); }));
    moved.forEach((id, i) => flashNode(id, 'coral', 0.5 + i * 0.06, 0.8));
    at(0.65, () => {
      const bp = batchPositions(s, true);
      batchesOf(s).forEach((b) => {
        const n = nodeMap[b.id];
        if (!n || !bp[b.id]) return;
        if (moved.indexOf(b.id) >= 0) n.arc = { from: n.pos.clone(), to: new V(...bp[b.id]), t0: T, dur: 1.25 * k() };
        n.target.set(...bp[b.id]);
      });
    });
    at(1.55, () => { moved.forEach((id) => { const e = edgeMap[id + '>' + toLane]; if (!e) return; applyEdge(e, s); e.waveT0 = T + 0.15; }); applyNodes(['lane-' + toLane, ...moved]); });
    const rightLane = 'lane-' + (factsOf(s) ? factsOf(s).rightLaneKey : 'south');
    at(1.7, () => { applyNodes([rightLane]); applyEdges(['right>cmp']); });
    flashNode(rightLane, 'coral', 1.7); wave('right>cmp', 1.7);
    at(2.15, () => { applyNodes(['comparison']); applyEdges(['cmp>finding']); focus = 'overview'; });
    flashNode('comparison', 'coral', 2.15); wave('cmp>finding', 2.15);
    at(2.6, () => { applyNodes(['finding']); applyEdges(['finding>ops', 'finding>memo', 'finding>decision']); });
    flashNode('finding', 'coral', 2.6, 1.7);
    ['finding>ops', 'finding>memo', 'finding>decision'].forEach((id) => wave(id, 2.6));
    ['doc-ops', 'doc-memo', 'decision'].forEach((id) => flashNode(id, 'coral', 3.2, 1.2));
    at(3.2, () => applyAll(s));
  }
  function choreoAuthority(s, prev) {
    // Same timing as authored; which person loses and which gains the edge is
    // whatever the graph actually changed.
    focus = 'authority';
    const gone = prev && prev.authorityKnown ? prev.reviewer : null;
    const taken = s.reviewer;
    flashNode('team', 'amber');
    if (gone && edgeMap['team>' + gone]) { edgeMap['team>' + gone].tColor.copy(TONE.coral); wave('team>' + gone, 0.05); }
    at(0.65, () => { applyEdges(['team>noor', 'team>sam', 'plan>noor', 'plan>sam']); applyNodes(['noor', 'sam', 'plan']); const pe = gone ? edgeMap['plan>' + gone] : null; if (pe) pe.flickerUntil = T + 0.9; });
    if (gone) flashNode(gone, 'coral', 0.65);
    flashNode('plan', 'coral', 0.7, 1.2);
    at(1.2, () => applyEdges(['team>noor', 'team>sam']));
    wave('team>' + taken, 1.55);
    flashNode(taken, 'amber', 1.95, 1.4);
    at(1.95, () => applyAll(s));
  }
  function choreoRelease(s) {
    focus = 'overview';
    applyNodes(['plan']); applyEdges(['plan>ops', 'plan>memo', 'plan>sam']);
    flashNode('plan', 'sage', 0, 1.2); wave('plan>ops'); wave('plan>memo');
    at(0.6, () => { applyNodes(['doc-ops', 'doc-memo', 'finding', 'comparison', 'decision', 'lane-' + (factsOf(s) ? factsOf(s).rightLaneKey : 'south')]); applyEdges(['ops>release', 'memo>release', 'right>cmp', 'cmp>finding', 'finding>ops', 'finding>memo', 'finding>decision']); });
    flashNode('doc-ops', 'sage', 0.6); flashNode('doc-memo', 'sage', 0.6);
    wave('ops>release', 0.65); wave('memo>release', 0.65);
    flashNode('release', 'sage', 1.2, 1.9);
    at(1.2, () => applyAll(s));
  }

  let focus = 'overview';
  function setStage(s, animate) {
    const prev = stage; stage = s;
    if (!prev || !animate) { queue = []; nodes.forEach((n) => (n.arc = null)); applyAll(s); focus = s.focus || 'overview'; return; }
    queue = [];
    if (!prev.moved && s.moved) return choreoCorrection(s);
    if (prev.reviewer !== s.reviewer && s.authorityKnown) return choreoAuthority(s, prev);
    if (prev.release !== s.release && s.release === 'v2') return choreoRelease(s);
    applyAll(s); focus = s.focus || 'overview';
    if (!prev.caseVis && s.caseVis) { flashNode('case', 'amber', 0.3, 1.2); changedOf(s).forEach((id) => { wave('case>' + id, 0.45); flashNode(id, 'amber', 0.9, 0.8); }); }
    if (prev.plan !== s.plan && s.plan !== 'none') {
      flashNode('plan', planTone(s.plan), 0.1, 1.2);
      ['plan>ops', 'plan>memo', 'plan>' + (s.planReviewerKey || 'noor')].forEach((id) => wave(id, 0.2));
    }
  }

  // ---- intro ----
  let intro = null;
  const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo, color: 0xFFE7C2, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  spark.position.set(...nodeMap.finding.def.pos); world.add(spark);
  function playIntro(done) {
    if (reduced) { done && done(); return; }
    intro = { t0: T, done };
    nodes.forEach((n) => (n.intro = 0));
    edges.forEach((e) => { e.intro = 0; e.introWaved = false; });
  }
  function finishIntro() {
    if (!intro) return;
    const d = intro.done; intro = null;
    nodes.forEach((n) => (n.intro = 1)); edges.forEach((e) => { e.intro = 1; e.introWaved = true; });
    spark.material.opacity = 0;
    d && d();
  }

  // ---- camera ----
  const cam = { x: FOCI.overview.x, y: FOCI.overview.y, dist: 60 };
  let insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const ins = { top: 0, right: 0, bottom: 0, left: 0 };
  const drag = { on: false, x: 0, y: 0, yaw: 0, pitch: 0, moved: 0 };
  const pointer = { x: 0, y: 0, nx: 0, ny: 0, inside: false };
  const tanH = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  function fitDist(f) {
    const W = container.clientWidth, H = container.clientHeight;
    if (!W || !H) return cam.dist;
    const rw = Math.max(240, W - ins.left - ins.right), rh = Math.max(240, H - ins.top - ins.bottom);
    return Math.max((f.h * H / rh) / (2 * tanH()), (f.w * W / rw) / (2 * tanH() * (W / H)));
  }

  function resize() {
    const W = container.clientWidth, H = container.clientHeight;
    if (!W || !H) return;
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize); ro.observe(container); resize();

  // ---- interaction ----
  const ray = new THREE.Raycaster();
  let hovered = null, trace = null;
  function computeTrace(id) {
    const ns = new Set([id]), es = new Set();
    const walk = (start, dirFwd) => {
      const q = [start], seen = new Set([start]);
      while (q.length) {
        const cur = q.shift();
        edges.forEach((e) => {
          if (e.tReveal < 0.5) return;
          const a = dirFwd ? e.def.from : e.def.to, b = dirFwd ? e.def.to : e.def.from;
          if (a !== cur) return;
          if (nodeMap[b].tVis < 0.5) return;
          es.add(e.id); ns.add(b);
          if (!seen.has(b)) { seen.add(b); q.push(b); }
        });
      }
    };
    walk(id, true); walk(id, false);
    return { nodes: ns, edges: es };
  }
  function pick(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hits = ray.intersectObjects(hitMeshes.filter((h) => nodeMap[h.userData.id].tVis > 0.5), false);
    return hits.length ? hits[0].object.userData.id : null;
  }
  const el = renderer.domElement;
  const onMove = (ev) => {
    const r = el.getBoundingClientRect();
    pointer.nx = ((ev.clientX - r.left) / r.width) * 2 - 1; pointer.ny = ((ev.clientY - r.top) / r.height) * 2 - 1;
    if (drag.on) {
      drag.yaw = clamp(drag.yaw - (ev.clientX - drag.x) * 0.004, -0.75, 0.75);
      drag.pitch = clamp(drag.pitch + (ev.clientY - drag.y) * 0.003, -0.4, 0.45);
      drag.moved += Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y);
      drag.x = ev.clientX; drag.y = ev.clientY;
      return;
    }
    if (intro) return;
    const id = pick(ev.clientX, ev.clientY);
    if (id !== hovered) { hovered = id; trace = id ? computeTrace(id) : null; el.style.cursor = id ? 'pointer' : 'grab'; }
    onHover(id ? { id, x: ev.clientX - r.left, y: ev.clientY - r.top, title: (nodeText(nodeMap[id], stage).title || nodeMap[id].def.label), kind: KIND[nodeMap[id].type] } : null);
  };
  const onDown = (ev) => { drag.on = true; drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = 0; el.setPointerCapture(ev.pointerId); el.style.cursor = 'grabbing'; };
  const onUp = (ev) => {
    const wasClick = drag.moved < 6; drag.on = false; el.style.cursor = hovered ? 'pointer' : 'grab';
    if (wasClick && !intro) { const id = pick(ev.clientX, ev.clientY); onSelect(id); }
  };
  const onLeave = () => { hovered = null; trace = null; onHover(null); };
  const onDbl = () => { drag.yaw = 0; drag.pitch = 0; };
  el.addEventListener('pointermove', onMove); el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp); el.addEventListener('pointerleave', onLeave); el.addEventListener('dblclick', onDbl);

  let selected = null;

  // ---- frame ----
  const tmp = new V();
  let raf = 0, alive = true;
  let lastFrameAt = performance.now();
  function frame(now) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    step(now);
  }
  // watchdog: keeps the scene alive where rAF is throttled (hidden tabs, capture tools)
  const watchdog = setInterval(() => { const n = performance.now(); if (alive && n - lastFrameAt > 250) { step(n); headerStep(); } }, 120);
  function step(now) {
    lastFrameAt = now;
    const cw = container.clientWidth, ch = container.clientHeight;
    if (!cw || !ch) return;
    if (Math.abs(camera.aspect - cw / ch) > 1e-3 || renderer.domElement.width !== Math.round(cw * renderer.getPixelRatio())) resize();
    const dt = Math.min(0.25, (now - last) / 1000); last = now; T += dt;
    const lerpK = 1 - Math.pow(reduced ? 0.0005 : 0.04, dt);
    const slowK = 1 - Math.pow(reduced ? 0.0005 : 0.12, dt);

    queue.sort((a, b) => a.t - b.t);
    while (queue.length && queue[0].t <= T) queue.shift().fn();

    // intro progress
    let it = 1;
    if (intro) {
      const t = T - intro.t0; it = t;
      const origin = nodeMap.finding.pos;
      nodes.forEach((n) => { const d = n.pos.distanceTo(origin); n.intro = E.back(clamp((t - 0.35 - d * 0.05) / 0.5)); });
      edges.forEach((e) => {
        const d = Math.min(nodeMap[e.def.from].pos.distanceTo(origin), nodeMap[e.def.to].pos.distanceTo(origin));
        e.intro = clamp((t - 0.45 - d * 0.05) / 0.45);
        if (!e.introWaved && t > 1.05 + (nodeMap[e.def.from].pos.x + 11) * 0.03) { e.waveT0 = T; e.introWaved = true; }
      });
      const sp = t < 0.3 ? E.out(t / 0.3) * 3.2 : 3.2 * (1 - E.inOut(clamp((t - 0.3) / 0.8)));
      spark.scale.setScalar(Math.max(sp, 0.001)); spark.material.opacity = t < 1.1 ? 1 : 0;
      if (t > 0.32 && !intro.rang) { intro.rang = true; flashNode('finding', 'amber', 0, 3.5); }
      if (t > 2.55) finishIntro();
    }

    // insets & camera
    for (const key in ins) ins[key] += (insets[key] - ins[key]) * slowK;
    const f = FOCI[focus] || FOCI.overview;
    const gd = fitDist(f);
    cam.x += (f.x - cam.x) * lerpK; cam.y += (f.y - cam.y) * lerpK; cam.dist += (gd - cam.dist) * lerpK;
    let cx = cam.x, cy = cam.y, dist = cam.dist, yaw = 0, pitch = 0.04;
    if (intro) {
      const p = E.inOut(clamp((it - 0.1) / 2.3));
      const o = nodeMap.finding.def.pos;
      cx = o[0] + (cam.x - o[0]) * p; cy = o[1] + (cam.y - o[1]) * p; dist = 7 + (gd - 7) * p; cam.dist = gd;
      yaw = 0.6 * (1 - p); pitch = 0.25 * (1 - p) + 0.04;
    }
    if (drift && !reduced) { yaw += Math.sin(T * 0.09) * 0.05; pitch += Math.sin(T * 0.071) * 0.022; yaw += pointer.nx * 0.025; pitch += pointer.ny * 0.015; }
    if (!drag.on) { drag.yaw *= 1 - Math.min(1, dt * 0.25); drag.pitch *= 1 - Math.min(1, dt * 0.25); }
    yaw += drag.yaw; pitch += drag.pitch;
    const wpp = (2 * dist * tanH()) / (container.clientHeight || 1);
    const tx = cx + ((ins.right - ins.left) / 2) * wpp, ty = cy + ((ins.top - ins.bottom) / 2) * wpp;
    camera.position.set(tx + dist * Math.sin(yaw) * Math.cos(pitch), ty + dist * Math.sin(pitch), dist * Math.cos(yaw) * Math.cos(pitch));
    camera.lookAt(tx, ty, 0);
    camera.updateMatrixWorld();

    const focusSet = trace || (selected ? computeTrace(selected) : null);

    // nodes
    nodes.forEach((n) => {
      if (n.arc) {
        const p = E.inOut(clamp((T - n.arc.t0) / n.arc.dur));
        const a = n.arc.from, b = n.arc.to;
        n.pos.set(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, a.z + (b.z - a.z) * p + Math.sin(p * Math.PI) * 2.2);
        if (p >= 1) n.arc = null;
      } else n.pos.lerp(n.target, slowK);
      n.color.lerp(n.tColor, slowK);
      n.vis += (n.tVis - n.vis) * slowK;
      const inTrace = !focusSet || focusSet.nodes.has(n.id);
      n.dim += ((inTrace ? 1 : 0.18) - n.dim) * slowK;
      const isHot = hovered === n.id || selected === n.id;
      const s = Math.max(0.0001, n.vis * n.intro * (1 + n.flash * 0.3) * (isHot ? 1.25 : 1));
      n.group.position.copy(n.pos); n.group.scale.setScalar(s);
      // A node reaching up under the masthead or the graph note fades, so the
      // chrome above it stays legible; its label is already hidden there.
      const sy = (-tmp.copy(n.pos).project(camera).y * 0.5 + 0.5) * ch;
      const reach = (n.type === 'document' ? 0.5 : SIZE[n.type] || 0.3) / wpp;
      const underChrome = ins.top > 1 && sy - reach < Math.max(72, ins.top + 16);
      n.clear += ((underChrome ? 0.08 : 1) - n.clear) * slowK;
      const c = tmp.set(n.color.r, n.color.g, n.color.b);
      n.mats.forEach(({ m, op }) => { m.color.setRGB(c.x + (n.flashColor.r - c.x) * n.flash, c.y + (n.flashColor.g - c.y) * n.flash, c.z + (n.flashColor.b - c.z) * n.flash); m.opacity = op * n.dim * n.clear; });
      n.sprite.material.color.copy(n.color).lerp(n.flashColor, n.flash);
      n.sprite.material.opacity = ((n.type === 'batch' ? 0.35 : 0.45) * n.dim + n.flash * 0.6) * n.clear;
      n.sprite.scale.setScalar(n.hs * (1 + n.flash * 1.2) * (isHot ? 1.3 : 1));
      n.spin.forEach((m, i) => { m.rotation.z += dt * (0.25 + i * 0.12); });
      n.flash *= Math.pow(0.12, dt);
      // label
      const lp = n.def.labelAt ? tmp.set(...n.def.labelAt) : tmp.copy(n.pos);
      if (n.def.labelAt) lp.x = n.def.labelAt[0];
      lp.project(camera);
      const W = container.clientWidth, H = container.clientHeight;
      const x = (lp.x * 0.5 + 0.5) * W, y = (-lp.y * 0.5 + 0.5) * H;
      const labelIntro = intro ? clamp((it - 1.2) / 0.8) : 1;
      const o = n.vis * labelIntro * (n.dim > 0.5 ? 1 : 0.28 + n.dim * 0.5);
      // Below the masthead and the purpose note, left of the panel.
      const bounds = { left: 8, top: Math.max(72, ins.top + 16), right: W - ins.right - 12, bottom: H - 8, floor: H - ins.bottom + 30 };
      // A node outside the visible canvas, such as under the panel, shows no label;
      // a visible node's label is kept inside the canvas.
      const onCanvas = x >= bounds.left + 16 && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
      n.label.el.style.opacity = lp.z < 1 && onCanvas ? o.toFixed(3) : '0';
      placeLabel(n.label, n.def.anchor, x, y, bounds);
    });

    // edges
    edges.forEach((e) => {
      rebuild(e);
      e.reveal += (e.tReveal - e.reveal) * (1 - Math.pow(reduced ? 0.0005 : 0.02, dt));
      e.color.lerp(e.tColor, slowK);
      const inTrace = !focusSet || focusSet.edges.has(e.id);
      e.dim += ((inTrace ? (focusSet ? 1.5 : 1) : 0.12) - e.dim) * slowK;
      let op = e.tOp * e.dim;
      if (e.flickerUntil > T) op *= 0.4 + Math.random() * 1.2;
      e.u.uColor.value.copy(e.color);
      e.u.uOpacity.value = op;
      e.u.uTime.value = T;
      e.u.uFlow.value = flow && !reduced ? 1 : 0;
      e.u.uReveal.value = Math.min(e.reveal, e.intro);
      e.u.uDash.value = e.dash;
      if (e.waveT0 != null) {
        const w = ((T - e.waveT0) / (0.85 * k())) * 1.3 - 0.15;
        e.u.uWave.value = w; if (w > 1.3) e.waveT0 = null;
      } else e.u.uWave.value = -9;
      e.mesh.visible = e.u.uReveal.value > 0.004;
      if (e.tagEl && e.curve) {
        e.curve.getPoint(0.5, tmp); tmp.project(camera);
        const W = container.clientWidth, H = container.clientHeight;
        e.tagEl.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * W}px,${(-tmp.y * 0.5 + 0.5) * H}px) translate(-50%,-140%)`;
        const traced = !!focusSet && focusSet.edges.has(e.id);
        const lo = (intro ? clamp((it - 1.6) / 0.8) : 1) * clamp(e.reveal * 1.4 - 0.4) * (traced ? 1 : 0);
        e.tagEl.style.opacity = lo.toFixed(3);
        e.tagEl.style.color = e.tReveal > 0.5 ? '#8C8476' : PALETTE.coral;
      }
    });

    // rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i], p = (T - r.t0) / (r.dur * (reduced ? 0.6 : 1));
      if (p >= 1) { world.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
      r.m.quaternion.copy(camera.quaternion);
      r.m.scale.setScalar(r.base + E.out(p) * 3.2 * r.mag);
      r.m.material.opacity = (1 - p) * 0.75;
    }
    backdrop.rotation.z += dt * 0.01;
    backdrop.children.forEach((m, i) => { const s = 1 + ((T * 0.03 + i * 0.14) % 1) * 0.04; m.scale.setScalar(s); });

    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  // layer headers
  const headers = LAYERS.map(([name, x]) => {
    const h = document.createElement('div');
    h.style.cssText = `position:absolute;left:0;top:0;pointer-events:none;white-space:nowrap;font:500 12px/1 ${FONT_MONO};letter-spacing:.16em;text-transform:uppercase;color:#8C8476;opacity:0;transition:opacity .8s`;
    h.textContent = name; labelLayer.appendChild(h);
    return { h, x };
  });
  const headerStep = () => {
    headers.forEach(({ h, x }) => {
      tmp.set(x, 8.7, 0).project(camera);
      h.style.transform = `translate(${(tmp.x * 0.5 + 0.5) * container.clientWidth}px,${(-tmp.y * 0.5 + 0.5) * container.clientHeight}px) translate(-50%,-50%)`;
      h.style.opacity = intro || focus !== 'overview' ? '0' : '1';
    });
  };
  const headerTick = () => { if (!alive) return; headerStep(); requestAnimationFrame(headerTick); };
  // A label measured before the web fonts arrived is measured again.
  document.fonts?.ready?.then(() => { nodes.forEach((n) => { n.label.w = 0; }); });
  requestAnimationFrame(headerTick);

  // ---- inspection ----
  const KIND = { batch: 'Batch', lane: 'Lane', dataset: 'Dataset', case: 'CorrectionCase', comparison: 'Comparison', finding: 'Claim · shared finding', document: 'Document', decision: 'Decision', release: 'Release', team: 'Team', person: 'Person', plan: 'ReviewPlan' };
  function describe(id) {
    const n = nodeMap[id]; if (!n || !stage) return null;
    const s = stage, txt = nodeText(n, s), rows = [];
    const add = (k, v) => rows.push({ k, v });
    switch (n.type) {
      case 'batch': { const b = batchesOf(s).find((x) => x.id === id) || {}; add('cost_cents', `${b.costCents} (immutable)`); add('recorded_lane', String(b.originalLane || '').replace(/^./, (c) => c.toUpperCase())); add('effective lane', laneOf(id, s).replace(/^./, (c) => c.toUpperCase())); if (isChanged(id, s) && s.caseVis) add('changed by', txtOf(labelsOf(s).caseRef)); break; }
      case 'lane': { const key = id.slice(5), f0 = factsOf(s); add('mean', txt.sub.split(' · ')[0]); add('in comparison', !f0 ? 'unknown' : key === f0.leftLaneKey ? 'LEFT_SIDE (reference)' : key === f0.rightLaneKey ? 'RIGHT_SIDE (subject)' : 'no'); break; }
      case 'comparison': { const f0 = factsOf(s); add('metric', txtOf(labelsOf(s).metricKey)); add('min_n', labelsOf(s).minN ? labelsOf(s).minN + ' batches per side' : ''); if (f0) { add(f0.leftLaneName, f0.leftMeanCents + '¢ mean'); add(f0.rightLaneName, f0.rightMeanCents + '¢ mean'); add('relation', f0.relation + ' · ' + f0.magnitudeCents + '¢'); } add('owner', txtOf(labelsOf(s).comparisonOwner)); break; }
      case 'finding': add('claim', txtOf(labelsOf(s).claimTitle)); add('registered uses', labelsOf(s).occurrenceCount + ' occurrences'); add('current evidence', txt.sub); add('published', txtOf(labelsOf(s).publishedSentence)); break;
      case 'document': { const L0 = labelsOf(s), isOps = id === 'doc-ops'; add('owner', txtOf(isOps ? L0.docOpsOwner : L0.docMemoOwner)); add('card style', txtOf(isOps ? L0.docOpsStyle : L0.docMemoStyle)); add('edition', txtOf(L0.editionLabel)); add('status', stale(s) ? 'out of date' : 'matches current evidence'); break; }
      case 'decision': add('status', txt.sub); add('basis', txtOf(labelsOf(s).decisionBasis)); add('owning team', txtOf(labelsOf(s).teamTitle)); add('current reviewer', s.authorityKnown ? txtOf(labelsOf(s).currentReviewerName) : 'unresolved'); break;
      case 'team': add('REVIEWED_BY', s.authorityKnown ? txtOf(labelsOf(s).currentReviewerName) : 'unresolved'); add('owns', txtOf(labelsOf(s).decisionTitle)); break;
      case 'person': { const L0 = labelsOf(s), isA = id === 'noor'; add('person_id', txtOf(isA ? L0.reviewerAId : L0.reviewerBId)); add('role', txtOf(isA ? L0.reviewerARole : L0.reviewerBRole)); add('review authority', !s.authorityKnown ? 'unresolved' : reviewerIs(s, id) ? 'yes · current' : 'no'); const owned = txtOf(isA ? L0.reviewerAOwns : L0.reviewerBOwns); if (owned) add('owns', owned); break; }
      case 'plan': add('status', txt.sub); add('assigned', txtOf(labelsOf(s).planReviewerName)); add('covers', txtOf(labelsOf(s).planCoverage)); add('disposition', txtOf(labelsOf(s).planDisposition)); break;
      case 'release': add('sequence', txtOf(labelsOf(s).releaseSequence)); add('includes', txtOf(labelsOf(s).releaseIncludes)); add('verification', 'registered finding cards + typed decision block'); break;
      case 'dataset': add('rows', batchesOf(s).length + ' batches'); add('raw sha', txtOf(labelsOf(s).datasetSha)); break;
      case 'case': add('source_ref', txtOf(labelsOf(s).caseRef)); add('changes', changedOf(s).join(' · ')); add('lanes', txtOf(labelsOf(s).caseLanes)); add('status', txtOf(labelsOf(s).caseStatus)); break;
    }
    const lbl = (nid) => (nodeText(nodeMap[nid], s).title || nodeMap[nid].def.label);
    const rels = edges.filter((e) => e.tReveal > 0.5 && (e.def.from === id || e.def.to === id) && e.def.kind !== 'assign' || (e.tReveal > 0.5 && n.type !== 'lane' && (e.def.from === id || e.def.to === id) && e.def.kind === 'assign'))
      .slice(0, 6).map((e) => (e.def.rev ? `(${lbl(e.def.to)})-[:${e.def.rel}]->(${lbl(e.def.from)})` : `(${lbl(e.def.from)})-[:${e.def.rel}]->(${lbl(e.def.to)})`));
    return { id, kind: KIND[n.type], title: txt.title || n.def.label, rows, rels, isDoc: n.type === 'document' };
  }

  return {
    webgl: true,
    setStage,
    playIntro,
    skipIntro: finishIntro,
    setInsets: (v) => { insets = { ...insets, ...v }; },
    setOptions: (o) => { if ('drift' in o) drift = o.drift; if ('flow' in o) flow = o.flow; if ('reduced' in o) reduced = o.reduced; },
    select: (id) => { selected = id; },
    debug: () => ({ cam: { ...cam }, ins: { ...ins }, aspect: camera.aspect, W: container.clientWidth, H: container.clientHeight, pos: camera.position.toArray(), focus }),
    describe,
    dispose() {
      alive = false; cancelAnimationFrame(raf); clearInterval(watchdog); ro.disconnect();
      el.removeEventListener('pointermove', onMove); el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp); el.removeEventListener('pointerleave', onLeave); el.removeEventListener('dblclick', onDbl);
      halo.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x && x.dispose());
        else if (m) m.dispose();
      });
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
      el.remove(); labelLayer.innerHTML = '';
    },
  };
}

// ---- 2D fallback (no WebGL): same semantics, static SVG ---------------------
function createFallback(opts) {
  const { container, labelLayer } = opts;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%');
  container.appendChild(svg);
  const stage0 = opts.stage || { batches: [], changedBatchIds: [], labels: {}, facts: null };
  const defs = nodeDefs(stage0), eds = edgeDefs(stage0);
  let stage = null, insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const lines = eds.map((e) => { const l = document.createElementNS(NS, 'line'); l.setAttribute('stroke-width', '1.4'); svg.appendChild(l); return l; });
  const dots = defs.map((d) => { const c = document.createElementNS(NS, 'circle'); c.setAttribute('r', d.type === 'batch' ? 3 : d.type === 'finding' ? 10 : 7); svg.appendChild(c); return c; });
  const labels = defs.map((d) => makeLabel(d, labelLayer));
  function draw() {
    if (!stage) return;
    const W = container.clientWidth, H = container.clientHeight;
    const rw = W - insets.left - insets.right, rh = H - insets.top - insets.bottom;
    const sc = Math.min(rw / 32, rh / 18);
    const map = (p) => [insets.left + rw / 2 + (p[0] - 3) * sc, insets.top + rh / 2 - (p[1] - 0.7) * sc];
    const bp = batchPositions(stage);
    const P = {}; defs.forEach((d) => { P[d.id] = d.type === 'batch' ? bp[d.id] : d.pos; });
    eds.forEach((e, i) => {
      const t = edgeTarget(e, stage), a = map(P[e.from]), b = map(P[e.to]);
      const l = lines[i];
      l.setAttribute('x1', a[0]); l.setAttribute('y1', a[1]); l.setAttribute('x2', b[0]); l.setAttribute('y2', b[1]);
      l.setAttribute('stroke', PALETTE[t.tone]); l.setAttribute('stroke-opacity', t.vis ? t.op : 0);
      l.setAttribute('stroke-dasharray', t.dash ? '4 4' : '');
    });
    defs.forEach((d, i) => {
      const n = { id: d.id, type: d.type }, p = map(P[d.id]), vis = nodeVisible(n, stage);
      dots[i].setAttribute('cx', p[0]); dots[i].setAttribute('cy', p[1]);
      dots[i].setAttribute('fill', PALETTE[nodeTone(n, stage)]); dots[i].setAttribute('opacity', vis ? 1 : 0);
      setLabelText(labels[i], nodeText(n, stage), d.label);
      const lp = d.labelAt ? map(d.labelAt) : p;
      placeLabel(labels[i], d.anchor, lp[0], lp[1]);
      labels[i].el.style.opacity = vis ? 1 : 0;
    });
  }
  const ro = new ResizeObserver(draw); ro.observe(container);
  return {
    webgl: false,
    setStage: (s) => { stage = s; draw(); },
    playIntro: (done) => done && done(),
    skipIntro: () => {},
    setInsets: (v) => { insets = { ...insets, ...v }; draw(); },
    setOptions: () => {},
    select: () => {},
    describe: () => null,
    dispose: () => { ro.disconnect(); svg.remove(); labelLayer.innerHTML = ''; },
  };
}
