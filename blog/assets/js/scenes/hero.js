// Hero: the whole evidence graph as the run left it, behind the refusal.
// Batches sit in their corrected lanes, the REVIEWED_BY edge names the current
// reviewer, plan v1 carries its AUTHORITY_CHANGED refusal and plan v2 its approval.
// Motion is a slow drift and a periodic glow that walks the recorded ripple path.
import { createGraph, span } from '../graph-core.js';
import { ids, laneSub, comparisonSub, findingSub, statusWord, upper } from '../story-view.js';

export function mount(container, story, { reduced }) {
  const I = ids(story);
  // The headline block, measured from its text (not its boxes), relative to the
  // scene. On desktop the graph is framed to its right, and any node or label
  // still behind it, or left of it, is dimmed or hidden.
  const copy = document.querySelector('.hero__copy');
  let avoid = null;
  function measure() {
    avoid = null;
    if (!copy || container.clientWidth < 900) return;
    const c = container.getBoundingClientRect();
    const range = document.createRange();
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of copy.children) {
      range.selectNodeContents(el);
      for (const q of range.getClientRects()) {
        if (!q.width) continue;
        l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom);
      }
    }
    // Everything from the left edge to the end of the text column, full height.
    if (r > l) avoid = { left: -1e4, top: -1e4, w: 1e4 + r - c.left + 20, h: 2e4 };
  }
  measure();
  const ro = new ResizeObserver(measure);
  ro.observe(container);
  if (copy) ro.observe(copy);
  if (document.fonts) document.fonts.ready.then(measure);

  const g = createGraph({
    container, story, reduced, dprCap: 1.5,
    labels: (def) => def.type !== 'batch',
    avoid: () => avoid,
  });

  // ---- final state, straight from the story ----
  const after = g.batchPos('after');
  I.batches.forEach((id) => g.move(id, after[id]));
  I.moved.forEach((id) => g.tone(id, 'amber'));
  I.lanes.forEach((id) => g.label(id, { sub: laneSub(story, id, 'after') }));
  g.label(I.comparison, { sub: comparisonSub(story, 'after') });
  g.label(I.finding, { sub: findingSub(story, 'after') });
  ['comparison', 'finding', 'decision'].forEach((k) => g.tone(I[k], 'amber'));
  story.documents.forEach((d) => { g.tone(d.id, 'sage'); g.label(d.id, { sub: 'owner ' + d.owner + ' · Version 2', tag: ['CORRECTED', 'sage'] }); });
  g.label(I.decision, { sub: statusWord(story.decision.status_after) });
  g.label(I.team, { sub: 'owns the proposal' });
  g.tone(I.after, 'amber'); g.tone(I.before, 'dim');
  g.label(I.before, { sub: 'no current authority' });
  g.label(I.after, { sub: 'current reviewer', tag: ['★ REVIEW AUTHORITY', 'amber'] });
  const [p1, p2] = story.plans;
  g.tone(p1.id, 'coral'); g.tone(p2.id, 'sage');
  g.label(p1.id, { sub: 'approved by ' + p1.approved_by, tag: [story.refusal.code, 'coral'] });
  g.label(p2.id, { sub: 'approved by ' + p2.approved_by, tag: ['APPROVED · ' + upper(p2.approved_by), 'sage'] });

  const flowTone = { LEFT_SIDE: 'amber', RIGHT_SIDE: 'amber', BASED_ON: 'amber', 'OF_CLAIM · IN_DOCUMENT': 'amber' };
  story.graph.edges.forEach((e) => {
    const shown = e.phase !== 'before';
    let tone = flowTone[e.rel] || 'faint', op = flowTone[e.rel] ? 0.6 : 0.3, dash = false;
    if (e.rel === 'ASSIGNED_TO' && I.moved.includes(e.from)) { tone = 'amber'; op = 0.55; }
    if (e.rel === 'REVIEWED_BY') { tone = 'ivory'; op = 0.6; }
    if (e.rel === 'ASSIGNED_TO_REVIEWER') { tone = e.from === p2.id ? 'sage' : 'coral'; op = 0.6; dash = e.from !== p2.id; }
    // plan v1 keeps its recorded assignment to the reviewer who approved it
    const visible = shown || e.rel === 'ASSIGNED_TO_REVIEWER';
    g.edge(e.from, e.to, { reveal: visible ? 1 : 0, tone, op, dash });
  });

  // ---- the ripple path the glow walks, in the order the change travelled ----
  const path = [
    ...I.moved.map((b) => [b, I.to, 0]),
    [I.comparison, I.right, 1, true],
    [I.finding, I.comparison, 2, true],
    ...I.docs.map((d) => [I.finding, d, 3]),
    [I.decision, I.finding, 3, true],
    [I.decision, I.team, 4],
    [I.team, I.after, 5],
  ];
  const PERIOD = 9;
  function frame(t) {
    const W = container.clientWidth;
    // Desktop: world x 1.0 (just left of the shared finding) lands right of the
    // text, and the reviewers' labels (to about x 17.5) end at the right edge.
    let x = 3.2, w = 27, h = 13.5;
    if (avoid) {
      const from = avoid.left + avoid.w + 4, to = W - 24;
      const scale = Math.max(20, (to - from) / 16.5);
      w = W / scale; h = 1; x = 1.0 + (W / 2 - from) / scale;
    }
    g.frame({
      x, y: avoid ? -0.9 : -0.8,
      w, h,
      shift: 0,
      yaw: reduced ? -0.12 : -0.12 + Math.sin(t * 0.07) * 0.1,
      pitch: reduced ? 0.06 : 0.06 + Math.sin(t * 0.05) * 0.03,
    });
    const phase = reduced ? -1 : (t % PERIOD) / PERIOD * 7 - 0.5;
    path.forEach(([from, to, stage, rev]) => {
      const p = span(phase, stage, stage + 1);
      const wv = p <= 0 || p >= 1 ? -9 : (rev ? 1 - p : p);
      g.edge(from, to, { wave: wv });
    });
  }
  g.onFrame(frame);
  frame(0);
  g.still();

  return {
    start: () => g.start(),
    stop: () => g.stop(),
    dispose: () => { ro.disconnect(); g.dispose(); },
  };
}
