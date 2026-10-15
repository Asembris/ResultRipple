import type { Comparison } from "../types";

const money = (cents: number) => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;

const RELATION_LABEL: Record<string, string> = {
  LOWER_COST: "costs less than",
  HIGHER_COST: "costs more than",
  EQUAL_COST: "has equal mean cost to",
  WITHHELD: "cannot be compared with",
};

/**
 * Two bars, drawn from the server-computed exact result. The frontend never
 * recomputes a comparison or decides a direction.
 */
export default function ComparisonBars({ comparison }: { comparison: Comparison }) {
  const { left, right, relation, magnitude_cents } = comparison;
  const ceiling = Math.max(left.mean_display_cents, right.mean_display_cents, 1);
  const width = (cents: number) => Math.round((cents / ceiling) * 100);

  return (
    <div className="comparison">
      <svg viewBox="0 0 100 34" className="bars" role="img"
           aria-label={`${left.lane_name} ${money(left.mean_display_cents)}, ${right.lane_name} ${money(right.mean_display_cents)} per parcel`}>
        <rect x="0" y="2" width={width(left.mean_display_cents)} height="12" className="bar bar--left" />
        <rect x="0" y="18" width={width(right.mean_display_cents)} height="12" className="bar bar--right" />
      </svg>
      <dl className="comparison__values">
        <div>
          <dt>{left.lane_name}</dt>
          <dd>
            <strong>{money(left.mean_display_cents)}</strong> over {left.batch_count} batches
          </dd>
        </div>
        <div>
          <dt>{right.lane_name}</dt>
          <dd>
            <strong>{money(right.mean_display_cents)}</strong> over {right.batch_count} batches
          </dd>
        </div>
      </dl>
      <p className="comparison__sentence">
        {right.lane_name} {RELATION_LABEL[relation]} {left.lane_name}
        {relation === "HIGHER_COST" || relation === "LOWER_COST"
          ? ` by ${money(magnitude_cents)} per parcel.`
          : "."}
        {comparison.hold_reason && <span className="flag flag--held"> {comparison.hold_reason}</span>}
      </p>
    </div>
  );
}
