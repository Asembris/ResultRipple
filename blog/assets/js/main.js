// Loads each evidence-graph scene only when it scrolls near the viewport, runs it
// only while it is visible, and drives the scroll-linked ones from the position
// of their step cards. Without WebGL, or before a scene is ready, the static
// figure in the page stays in place.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.documentElement;
root.classList.add('js');
if (reduced) root.classList.add('reduced-motion');

const LOADERS = {
  hero: () => import('./scenes/hero.js'),
  ripple: () => import('./scenes/ripple.js'),
  authority: () => import('./scenes/authority.js'),
};

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

let storyPromise = null;
function story() {
  storyPromise ||= fetch(new URL('../../data/story.json', import.meta.url)).then((r) => {
    if (!r.ok) throw new Error('story.json: HTTP ' + r.status);
    return r.json();
  });
  return storyPromise;
}

/** Continuous step index from where the step cards sit relative to the viewport. */
function stepValue(steps) {
  const cards = steps.querySelectorAll('.scrolly__step');
  if (cards.length < 2) return 0;
  // On a phone the active card sits low, below the part of the stage the scene uses.
  const mid = innerHeight * (innerWidth < 700 ? 0.78 : 0.55);
  const c = Array.from(cards, (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; });
  if (mid <= c[0]) return Math.max(-0.6, (mid - c[0]) / (c[1] - c[0]));
  for (let k = 0; k < c.length - 1; k++) if (mid < c[k + 1]) return k + (mid - c[k]) / (c[k + 1] - c[k]);
  const last = c.length - 1;
  return last + Math.min(0.6, (mid - c[last]) / (c[last] - c[last - 1]));
}

const mounted = new Map();
const visible = new Set();

function update() {
  for (const el of visible) {
    const inst = mounted.get(el);
    if (!inst || !inst.setStep) continue;
    const steps = el.parentElement.querySelector('.scrolly__steps');
    const s = stepValue(steps);
    inst.setStep(reduced ? Math.max(0, Math.round(s)) : s);
  }
}
let queued = false;
function onScroll() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; update(); });
}

const runIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const inst = mounted.get(e.target);
    if (!inst) continue;
    if (e.isIntersecting) { visible.add(e.target); inst.start(); } else { visible.delete(e.target); inst.stop(); }
  }
  update();
});

async function mount(el) {
  const load = LOADERS[el.dataset.scene];
  if (!load) return;
  try {
    const [mod, data] = await Promise.all([load(), story()]);
    const inst = mod.mount(el, data, { reduced });
    mounted.set(el, inst);
    el.closest('[data-live]').classList.add('is-live');
    runIO.observe(el);
  } catch (err) {
    // Leave the static figure in place; the page reads fully without the scene.
    console.info('scene', el.dataset.scene, 'not started:', err && err.message);
  }
}

if (webglAvailable()) {
  const nearIO = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { nearIO.unobserve(e.target); mount(e.target); }
  }, { rootMargin: '600px 0px' });
  document.querySelectorAll('[data-scene]').forEach((el) => nearIO.observe(el));
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onScroll, { passive: true });
} else {
  root.classList.add('no-webgl');
}
