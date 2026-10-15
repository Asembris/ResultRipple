import { useEffect, useRef, useState } from "react";

import type { Assessment, Comparison } from "../types";
import { RELATION_PHRASE, money } from "../workflow";

/**
 * The live comparison, bottom-left.
 *
 * The counter only ever travels between two values the server returned: the
 * previous fetch's mean and the current one. It never predicts, and it never
 * moves while a mutation is in flight.
 */
const SCALE_CENTS = 500;

export default function EconomicsStrip({
  comparison,
  assessment,
  reduced,
  style,
}: {
  comparison: Comparison;
  /** Used only for the struck "was", which is the previously published assertion. */
  assessment: Assessment[];
  reduced: boolean;
  style?: React.CSSProperties;
}) {
  const target = comparison.right.mean_display_cents;
  const [shown, setShown] = useState(target);
  const lastValue = useRef<number | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const from = lastValue.current;
    lastValue.current = target;
    if (from === null || from === target) {
      setShown(target);
      return;
    }
    // Tween between two fetched values, nothing else.
    const duration = reduced ? 200 : 900;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (t < 1) frame.current = requestAnimationFrame(step);
      else setShown(target);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [target, reduced]);

  const left = comparison.left;
  const right = comparison.right;
  const higher = comparison.relation === "HIGHER_COST";
  const rightColour = shown > left.mean_display_cents ? "var(--rr-coral)" : "var(--rr-amber)";
  const pct = (cents: number) => Math.max(0, Math.min(100, (cents / SCALE_CENTS) * 100));

  // The struck line is the assertion the current editions actually publish,
  // shown only while the server reports it as contradicted.
  const outdated = assessment.find((entry) => entry.relation_changed || entry.magnitude_changed);
  const publishedCard = outdated?.previous;
  const was =
    publishedCard && typeof publishedCard.magnitude_cents === "number" && publishedCard.relation
      ? `${money(publishedCard.magnitude_cents)} ${RELATION_PHRASE[publishedCard.relation] ?? publishedCard.relation.toLowerCase()}`
      : null;

  const delta =
    comparison.relation === "WITHHELD"
      ? (comparison.hold_reason ?? "comparison withheld")
      : comparison.relation === "EQUAL_COST"
        ? "equal mean cost"
        : `${money(comparison.magnitude_cents)} ${higher ? "more expensive" : "cheaper"}`;

  return (
    <section className="rr-strip" aria-label="Live comparison" style={style}>
      <div className="rr-strip__left">
        <div className="rr-strip__caption">
          <span>Live comparison · mean handling cost per parcel</span>
          <span>minimum {comparison.min_n} batches per side</span>
        </div>
        <div className="rr-strip__row">
          <span className="rr-strip__lane">{left.lane_name}</span>
          <div className="rr-strip__track">
            <div
              className="rr-strip__bar"
              style={{ width: `${pct(left.mean_display_cents)}%`, background: "var(--rr-ink)", opacity: 0.85 }}
            />
          </div>
          <span className="rr-strip__value">
            {money(left.mean_display_cents)} <span className="rr-strip__count">· {left.batch_count} batches</span>
          </span>
        </div>
        <div className="rr-strip__row">
          <span className="rr-strip__lane">{right.lane_name}</span>
          <div className="rr-strip__track">
            <div
              className="rr-strip__bar"
              style={{ width: `${pct(shown)}%`, background: rightColour, boxShadow: `0 0 18px ${rightColour}66` }}
            />
            <div className="rr-strip__tick" style={{ left: `${pct(left.mean_display_cents)}%` }} />
          </div>
          <span className="rr-strip__value" style={{ color: rightColour }}>
            {money(shown)} <span className="rr-strip__count">· {right.batch_count} batches</span>
          </span>
        </div>
      </div>
      <div className="rr-strip__right">
        <div className="rr-strip__was">
          {was && (
            <>
              <s>{was}</s> <span>→</span>
            </>
          )}
        </div>
        <div className="rr-strip__delta" style={{ color: higher ? "var(--rr-coral)" : "var(--rr-amber)" }}>
          {delta}
        </div>
        <div className="rr-strip__note">
          {right.lane_name} vs {left.lane_name} · raw measurements unchanged
        </div>
      </div>
    </section>
  );
}
