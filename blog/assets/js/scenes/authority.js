// Authority is an edge, driven by scroll. Step 0: Noor holds the review and has
// approved plan v1. Step 1: the team's REVIEWED_BY edge moves to Sam. Step 2:
// plan v1's approval stops counting (AUTHORITY_CHANGED). Step 3: plan v2, with
// identical content and a new fingerprint, is approved by Sam. Every name, hash
// and code is read from the story.
import { createGraph, ease, span, keyframes, besideCards } from '../graph-core.js';
import { ids, short, upper } from '../story-view.js';

export function mount(container, story, { reduced }) {
  const I = ids(story);
  const [p1, p2] = story.plans;
  const A = story.authority;
  const include = [I.finding, ...I.docs, I.decision, I.team, I.before, I.after, I.plan1, I.plan2];
  const g = createGraph({
    container, story, reduced, include, dprCap: 1.5,
    edgeTags: (e) => e.rel === 'REVIEWED_BY',
  });

  // context, dimmed: what the review is about
  [I.finding, ...I.docs].forEach((id) => { g.dim(id, 0.45); g.labelAlpha(id, 0.6); });
  g.tone(I.finding, 'amber');
  story.documents.forEach((d) => g.label(d.id, { sub: 'owner ' + d.owner }));
  g.tone(I.decision, 'amber');
  g.label(I.decision, { sub: 'owned by ' + A.team });
  g.label(I.team, { sub: 'review rota' });
  g.edge(I.decision, I.finding, { reveal: 1, tone: 'amber', op: 0.4 });
  I.docs.forEach((d) => g.edge(I.finding, d, { reveal: 1, tone: 'amber', op: 0.35 }));
  g.edge(I.decision, I.team, { reveal: 1, tone: 'faint', op: 0.35 });

  // ---- a text mirror of what the graph holds, from the story ----
  const hud = document.createElement('div');
  hud.className = 'hud hud--authority';
  hud.innerHTML = `
    <div class="hud__k"></div>
    <div class="hud__edge" data-who="before"><span class="hud__node"></span><span class="hud__rel">-[:REVIEWED_BY]-&gt;</span><span class="hud__person"></span></div>
    <div class="hud__edge" data-who="after"><span class="hud__node"></span><span class="hud__rel">-[:REVIEWED_BY]-&gt;</span><span class="hud__person"></span></div>
    <div class="hud__plans">
      <div class="hud__plan" data-plan="1"><span class="hud__pv">v1</span><span class="hud__ph"></span><span class="hud__ps"></span></div>
      <div class="hud__plan" data-plan="2"><span class="hud__pv">v2</span><span class="hud__ph"></span><span class="hud__ps"></span></div>
    </div>
    <div class="hud__same"></div>`;
  hud.setAttribute('aria-hidden', 'true');
  container.appendChild(hud);
  hud.querySelector('.hud__k').textContent = A.team + ' · review authority';
  const edgeRow = { before: hud.querySelector('[data-who=before]'), after: hud.querySelector('[data-who=after]') };
  for (const k of ['before', 'after']) {
    edgeRow[k].querySelector('.hud__node').textContent = A.team;
    edgeRow[k].querySelector('.hud__person').textContent = A[k];
  }
  const planRow = { 1: hud.querySelector('[data-plan="1"]'), 2: hud.querySelector('[data-plan="2"]') };
  planRow[1].querySelector('.hud__ph').textContent = 'fingerprint ' + short(p1.execution_fingerprint);
  planRow[2].querySelector('.hud__ph').textContent = 'fingerprint ' + short(p2.execution_fingerprint);
  hud.querySelector('.hud__same').textContent = 'content hash ' + short(p1.content_hash) +
    (p1.content_hash === p2.content_hash ? ' on both plans · candidates identical' : '');

  const planSub = (p, head) => head + '\ncontent ' + short(p.content_hash) + '\nfingerprint ' + short(p.execution_fingerprint);

  let lastS = -1;
  function setStep(s) {
    const up = (t) => lastS < t && s >= t;

    // step 1: the REVIEWED_BY edge moves
    const m = ease(span(s, 0.3, 0.92));
    const moved = m > 0.5;
    g.edge(I.team, I.before, { reveal: 1 - m, tone: s > 0.3 ? 'coral' : 'ivory', op: 0.6, tag: 1 - m });
    g.edge(I.team, I.after, { reveal: m, tone: 'ivory', op: 0.6, wave: m > 0 && m < 1 ? m : -9, tag: m });
    g.tone(I.before, moved ? 'dim' : 'amber');
    g.tone(I.after, moved ? 'amber' : 'dim');
    g.label(I.before, moved ? { sub: 'reviewer · no current authority' } : { sub: 'reviewer · current reviewer', tag: ['★ REVIEW AUTHORITY', 'amber'] });
    g.label(I.after, moved ? { sub: 'reviewer · current reviewer', tag: ['★ REVIEW AUTHORITY', 'amber'] } : { sub: 'reviewer · no current authority' });
    if (up(0.62)) { g.flash(I.team, 'amber'); g.flash(I.after, 'amber'); }
    edgeRow.before.classList.toggle('is-gone', moved);
    edgeRow.after.classList.toggle('is-gone', !moved);
    edgeRow.after.classList.toggle('is-current', moved);
    edgeRow.before.classList.toggle('is-current', !moved);

    // step 2: plan v1's approval stops counting
    const refused = s >= 1.6;
    g.tone(I.plan1, refused ? 'coral' : 'sage');
    // On a phone, once v2 is in view, v1 keeps only its title and refusal; the panel above still shows its fingerprint.
    const compact = container.clientWidth < 700 && s >= 2.25;
    g.label(I.plan1, refused
      ? { sub: compact ? '' : planSub(p1, 'approval no longer valid'), tag: [story.refusal.code, 'coral'] }
      : { sub: planSub(p1, 'approved by ' + p1.approved_by), tag: ['APPROVED · ' + upper(p1.approved_by), 'sage'] });
    g.edge(I.plan1, I.before, { reveal: 1, tone: refused ? 'coral' : 'sage', op: 0.6, dash: refused, wave: wave(s, 1.15, 1.6, true) });
    if (up(1.6)) g.flash(I.plan1, 'coral');
    g.dim(I.plan1, s >= 2.6 ? 0.6 : 1);
    planRow[1].querySelector('.hud__ps').textContent = refused ? story.refusal.code : 'approved by ' + p1.approved_by;
    planRow[1].dataset.state = refused ? 'refused' : 'approved';

    // step 3: plan v2, identical bytes, new fingerprint, Sam's approval
    const v2 = span(s, 2.25, 2.6);
    const approved = s >= 2.88;
    g.visible(I.plan2, v2);
    g.labelAlpha(I.plan2, v2);
    g.tone(I.plan2, approved ? 'sage' : 'amber');
    g.label(I.plan2, approved
      ? { sub: planSub(p2, 'approved by ' + p2.approved_by), tag: ['APPROVED · ' + upper(p2.approved_by), 'sage'] }
      : { sub: planSub(p2, 'assigned to ' + p2.assigned_reviewer), tag: ['AWAITING REVIEW', 'amber'] });
    g.edge(I.plan2, I.after, { reveal: ease(span(s, 2.35, 2.8)), tone: approved ? 'sage' : 'amber', op: 0.6, dash: !approved, tag: v2 });
    if (up(2.88)) g.flash(I.plan2, 'sage');
    planRow[2].classList.toggle('is-hidden', v2 < 0.5);
    planRow[2].querySelector('.hud__ps').textContent = approved ? 'approved by ' + p2.approved_by : 'assigned to ' + p2.assigned_reviewer;
    planRow[2].dataset.state = approved ? 'approved' : 'assigned';
    hud.querySelector('.hud__same').classList.toggle('is-hidden', v2 < 0.5);

    // camera
    const W = container.clientWidth;
    if (W < 700) {
      g.frame({ x: 13.2, y: -1.9, w: 14, h: 9, shift: 0, lift: 0.1, yaw: 0, pitch: 0.05 });
    } else {
      // below the panel (top right) and clear of the step cards (left)
      const fit = W >= 960 ? besideCards(container, 25, 0) : { w: 17, shift: 0 };
      g.frame({ x: W >= 960 ? 6.8 : 9.4, y: 0.3, w: fit.w, h: 16.6, shift: fit.shift, lift: 0, yaw: -0.06 + 0.06 * ease(span(s, 0, 3)), pitch: 0.04 });
    }
    lastS = s;
    if (reduced || g.slow) g.still();
  }

  function wave(s, a, b, reverse) {
    const p = span(s, a, b);
    if (p <= 0 || p >= 1) return -9;
    return reverse ? 1 - p : p;
  }

  setStep(0);
  g.still();
  return {
    setStep,
    start: () => g.start(),
    stop: () => g.stop(),
    dispose: () => { g.dispose(); hud.remove(); },
  };
}
