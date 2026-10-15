import { useState } from "react";

import type { Actor, Plan } from "../../types";

/**
 * The acknowledgement of a proposed alternative belongs to one person and one
 * exact plan version.
 *
 * `POST /plans/{id}/approve` records who acknowledged what, so a tick left
 * behind by a previous identity — or by a previous plan version — must never be
 * carried into the next approval. Keying the state on the actor and the plan
 * means switching identity or refreshing the review starts from unticked,
 * without an effect that could briefly show the stale value.
 */
export function useAcknowledgement(
  actor: Actor | null,
  plan: Plan | null,
): readonly [boolean, (value: boolean) => void] {
  const key = `${actor?.person_id ?? "observer"}|${plan?.plan_id ?? "none"}|${plan?.version ?? 0}`;
  const [state, setState] = useState<{ key: string; value: boolean }>({ key, value: false });

  // Discard the stored tick as soon as the identity it belonged to changes.
  // Merely hiding it would bring it back on returning to that person, and an
  // acknowledgement nobody gave this time must never reach an approval request.
  if (state.key !== key) setState({ key, value: false });

  const acknowledged = state.key === key && state.value;
  return [acknowledged, (value: boolean) => setState({ key, value })] as const;
}
