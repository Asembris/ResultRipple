// The ripple, driven by scroll. Step s runs from 0 (Version 1 published) to 4
// (every registered use out of date). Positions and the glow move continuously
// with the scroll; every figure and sentence switches from its recorded "before"
// value to its recorded "after" value at the step where the change reaches it,
// never through invented intermediate numbers.
import { createGraph, ease, span, keyframes, besideCards } from '../graph-core.js';
import { ids, laneSub, comparisonSub, findingSub, statusWord } from '../story-view.js';

export function mount(container, story, { reduced }) {
  const I = ids(story);
  const D = story.display;
  const include = [...I.batches, ...I.lanes, I.comparison, I.finding, ...I.docs, I.decision];
  const g = createGraph({
    container, story, reduced, include, dprCap: 1.5,
    edgeTags: (e) => ['RIGHT_SIDE', 'BASED_ON'].includes(e.rel),
  });
  const before = g.batchPos('before'), after = g.batchPos('after');
  const moved = new Set(I.moved);

  // ---- the comparison strip, from the story's own figures ----
  const hud = document.createElement('div');
  hud.className = 'hud';
  const max = Math.max(...['before', 'after'].flatMap((p) => [story.comparison[p].left.mean_cents, story.comparison[p].right.mean_cents]));
  const laneName = (id) => story.lanes.find((l) => l.id === id).name;
  hud.innerHTML = `
    <div class="hud__k">Mean handling cost per parcel · minimum ${story.comparison.min_n} batches per side</div>
    <div class="hud__row"><span class="hud__lane"></span><span class="hud__bar"><i></i></span><span class="hud__v"></span></div>
    <div class="hud__row"><span class="hud__lane"></span><span class="hud__bar"><i></i></span><span class="hud__v"></span></div>
    <div class="hud__finding"><span class="hud__k">Shared finding</span><span class="hud__f"></span></div>`;
  hud.setAttribute('aria-hidden', 'true');
  container.appendChild(hud);
  const rows = hud.querySelectorAll('.hud__row');
  rows[0].querySelector('.hud__lane').textContent = laneName(I.left);
  rows[1].querySelector('.hud__lane').textContent = laneName(I.right);
  const hudFinding = hud.querySelector('.hud__f');
  function setHud(south, finding) {
    const c = story.comparison;
    const L = c.before.left;
    rows[0].querySelector('i').style.width = (L.mean_cents / max) * 100 + '%';
    rows[0].querySelector('.hud__v').textContent = D['north.mean'] + ' · ' + L.count + ' batches';
    const R = c[south].right;
    rows[1].querySelector('i').style.width = (R.mean_cents / max) * 100 + '%';
    rows[1].querySelector('.hud__v').textContent = D['south.' + south + '.mean'] + ' · ' + R.count + ' batches';
    rows[1].classList.toggle('is-changed', south === 'after');
    hudFinding.textContent = D['finding.' + finding];
    hudFinding.classList.toggle('is-changed', finding === 'after');
  }

  // ---- static parts ----
  story.documents.forEach((d) => g.label(d.id, { sub: 'owner ' + d.owner + ' · Version 1' }));
  g.label(I.decision, { sub: statusWord(story.decision.status_before) });

  let lastS = -1;
  function setStep(s) {
    const up = (t) => lastS < t && s >= t;
    const m = ease(span(s, 0.3, 0.92));

    // evidence: three memberships move; the rest re-spread in their lanes
    I.batches.forEach((id) => {
      const a = before[id], b = after[id];
      const lift = moved.has(id) ? Math.sin(Math.PI * m) * 0.9 : 0;
      g.move(id, [a[0] + (b[0] - a[0]) * m - lift * 0.6, a[1] + (b[1] - a[1]) * m, a[2] + (b[2] - a[2]) * m + lift]);
      g.tone(id, moved.has(id) && s > 0.15 ? 'amber' : 'ivory');
      if (moved.has(id) && up(0.15)) g.flash(id, 'amber');
    });
    story.graph.edges.filter((e) => e.rel === 'ASSIGNED_TO').forEach((e) => {
      if (e.phase === 'both') g.edge(e.from, e.to, { reveal: 1, tone: 'faint', op: 0.3 });
      else if (e.phase === 'before') g.edge(e.from, e.to, { reveal: 1 - m, tone: s > 0.15 ? 'coral' : 'faint', op: 0.6, dash: s > 0.15 });
      else g.edge(e.from, e.to, { reveal: m, tone: 'amber', op: 0.6 });
    });

    // lane -> comparison
    const southAfter = s >= 1.4;
    g.label(I.left, { sub: laneSub(story, I.left, 'before') });
    g.label(I.right, { sub: laneSub(story, I.right, southAfter ? 'after' : 'before'), tag: southAfter ? ['RECOMPUTED', 'coral'] : null });
    g.label(I.to, { sub: laneSub(story, I.to, s >= 0.92 ? 'after' : 'before') });
    g.tone(I.right, southAfter ? 'coral' : 'ivory');
    if (up(1.4)) g.flash(I.right, 'coral');
    g.edge(I.comparison, I.left, { reveal: 1, tone: 'amber', op: 0.5 });
    g.edge(I.comparison, I.right, { reveal: 1, tone: southAfter ? 'coral' : 'amber', op: 0.6, wave: wave(s, 1.35, 1.88, true) });

    const cmpAfter = s >= 1.88;
    g.tone(I.comparison, cmpAfter ? 'coral' : 'amber');
    g.label(I.comparison, { sub: comparisonSub(story, cmpAfter ? 'after' : 'before'), tag: cmpAfter ? ['DIRECTION REVERSED', 'coral'] : null });
    if (up(1.88)) g.flash(I.comparison, 'coral');

    // comparison -> finding
    g.edge(I.finding, I.comparison, { reveal: 1, tone: cmpAfter ? 'coral' : 'amber', op: 0.6, wave: wave(s, 2.35, 2.88, true) });
    const findAfter = s >= 2.88;
    g.tone(I.finding, findAfter ? 'coral' : 'amber');
    g.label(I.finding, { sub: findingSub(story, findAfter ? 'after' : 'before'), tag: findAfter ? ['PUBLISHED TEXT CONTRADICTED', 'coral'] : null });
    if (up(2.88)) g.flash(I.finding, 'coral');

    // finding -> every registered use, and the decision that rests on it
    const usesAfter = s >= 3.75;
    I.docs.forEach((d, i) => {
      g.edge(I.finding, d, { reveal: 1, tone: findAfter ? 'coral' : 'amber', op: 0.6, wave: wave(s, 3.25, 3.75, false) });
      g.tone(d, usesAfter ? 'coral' : 'ivory');
      g.label(d, { sub: 'owner ' + story.documents[i].owner + ' · Version 1', tag: usesAfter ? ['OUT OF DATE', 'coral'] : null });
      if (up(3.75)) g.flash(d, 'coral');
    });
    g.edge(I.decision, I.finding, { reveal: 1, tone: findAfter ? 'coral' : 'amber', op: 0.6, wave: wave(s, 3.25, 3.75, true) });
    g.tone(I.decision, usesAfter ? 'coral' : 'amber');
    g.label(I.decision, { sub: statusWord(story.decision.status_before), tag: usesAfter ? ['BASIS CONTRADICTED', 'coral'] : null });
    if (up(3.75)) g.flash(I.decision, 'coral');

    setHud(southAfter ? 'after' : 'before', findAfter ? 'after' : 'before');

    // camera: from the evidence out to the whole path
    const wide = container.clientWidth >= 960;
    if (container.clientWidth < 700) {
      // A phone cannot show the whole path legibly: follow the change instead.
      g.frame({
        x: keyframes(s, [[0.6, -7.0], [1.4, -6.6], [2.1, -2.8], [2.9, 0.0], [3.5, 4.4]]),
        y: keyframes(s, [[0.6, -0.4], [2.1, 1.0], [3.5, 0.2]]),
        w: keyframes(s, [[0.6, 13], [2.1, 11], [3.5, 12.5]]), h: 9,
        shift: 0, lift: 0.3, yaw: 0, pitch: 0.05,
      });
      // and label only what the current step is about
      const step = Math.round(Math.max(0, s));
      const focus = [
        [...I.lanes, ...I.moved],
        [...I.lanes, ...I.moved],
        [I.right, I.comparison],
        [I.comparison, I.finding],
        [I.finding, ...I.docs, I.decision],
      ][Math.min(4, step)];
      include.forEach((id) => g.labelAlpha(id, focus.includes(id) ? 1 : 0));
      lastS = s;
      if (reduced || g.slow) g.still();
      return;
    }
    include.forEach((id) => g.labelAlpha(id, 1));
    const c = ease(span(s, 0.9, 3.3));
    const fit = wide ? besideCards(container, 13.5 + (24.5 - 13.5) * c, 0.2) : { w: 13.5 + (24.5 - 13.5) * c, shift: 0 };
    g.frame({
      x: -5.6 + (2.0 - -5.6) * c, y: -0.9 - 0.8 * c,
      w: fit.w, h: 14.5 + 2.2 * c,
      shift: fit.shift,
      yaw: -0.1 + 0.16 * c, pitch: 0.05,
    });
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
