// Read-only helpers over blog/data/story.json. Every string a scene shows is
// either a value from the story or a fixed state word from the app's own
// vocabulary (CORRECTED, OUT OF DATE, REVIEW AUTHORITY, ...).

export function ids(story) {
  const byType = (t) => story.graph.nodes.filter((n) => n.type === t).map((n) => n.id);
  return {
    lanes: story.lanes.map((l) => l.id),
    left: story.comparison.left_lane,
    right: story.comparison.right_lane,
    from: story.correction.from_lane,
    to: story.correction.to_lane,
    moved: story.correction.moved,
    batches: story.batches.map((b) => b.id),
    comparison: story.comparison.id,
    finding: story.finding.id,
    docs: story.documents.map((d) => d.id),
    decision: story.decision.id,
    team: byType('team')[0],
    before: story.authority.before_id,
    after: story.authority.after_id,
    plan1: story.plans[0].id,
    plan2: story.plans[1].id,
  };
}

const laneName = (story, id) => story.lanes.find((l) => l.id === id).name;
const RELATION_DIR = { HIGHER_COST: 'higher', LOWER_COST: 'lower', EQUAL_COST: 'equal' };
const RELATION_WORD = { HIGHER_COST: 'more expensive', LOWER_COST: 'cheaper', EQUAL_COST: 'equal' };
const STATUS = { PROPOSED: 'proposed', RETURNED_FOR_REVIEW: 'returned for review' };

export function money(cents) {
  return '$' + Math.floor(cents / 100) + '.' + String(cents % 100).padStart(2, '0');
}

/** Mean and count under a lane, for 'before' or 'after' the correction. */
export function laneSub(story, laneId, phase) {
  const c = story.comparison[phase];
  if (laneId === story.comparison.left_lane) return money(c.left.mean_cents) + ' mean · ' + c.left.count + ' batches';
  if (laneId === story.comparison.right_lane) return money(c.right.mean_cents) + ' mean · ' + c.right.count + ' batches';
  const key = phase === 'before' ? 'lane_before' : 'lane_after';
  return story.batches.filter((b) => b[key] === laneId).length + ' batches · not compared';
}

export function comparisonSub(story, phase) {
  const c = story.comparison[phase];
  return laneName(story, story.comparison.right_lane) + ' ' + RELATION_DIR[c.relation] + ' by ' + c.magnitude_cents + '¢';
}

export function findingSub(story, phase) {
  const c = story.comparison[phase];
  return laneName(story, story.comparison.right_lane) + ' ' + c.magnitude_cents + '¢ ' + RELATION_WORD[c.relation];
}

export const statusWord = (s) => STATUS[s] || s.toLowerCase().replace(/_/g, ' ');
export const short = (h) => h.slice(0, 8) + '…' + h.slice(-4);
export const upper = (s) => s.toUpperCase();
