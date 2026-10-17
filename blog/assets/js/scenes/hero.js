// Hero: the whole evidence graph as the run left it, behind the refusal.
// Batches sit in their corrected lanes, the REVIEWED_BY edge names the current
// reviewer, plan v1 carries its AUTHORITY_CHANGED refusal and plan v2 its approval.
// Motion is a slow drift and a periodic glow that walks the recorded ripple path.
import { createGraph, span } from '../graph-core.js';
import { ids, laneSub, comparisonSub, findingSub, statusWord, upper } from '../story-view.js';

export function mount(container, story, { reduced }) {
  const I = ids(story);
  const g = createGraph({
    container, story, reduced, dprCap: 1.5,
    labels: (def) => def.type !== 'batch',
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
    const w = container.clientWidth;
    const wide = w >= 900;
    g.frame({
      x: wide ? 4.6 : 3.2, y: -0.6,
      w: wide ? 31 : 27, h: wide ? 15.5 : 16,
      shift: wide ? 0.12 : 0,
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
    dispose: () => g.dispose(),
  };
}
