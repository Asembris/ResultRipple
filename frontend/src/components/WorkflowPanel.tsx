import PublishingDeskLegacy from "./PublishingDesk";
import RefusalCard from "./RefusalCard";
import ReviewPaneLegacy from "./ReviewPane";
import AuthorityStage from "./stages/AuthorityStage";
import CorrectionStage from "./stages/CorrectionStage";
import DeskStage from "./stages/DeskStage";
import FreshApprovalStage from "./stages/FreshApprovalStage";
import InvestigationStage from "./stages/InvestigationStage";
import ReviewStage from "./stages/ReviewStage";
import type { StageContext } from "./stages/context";
import { STEP_NAMES } from "../workflow";

/**
 * The right-hand rail: one stage at a time, chosen by where the backend's own
 * state says the case is.
 *
 * Stages still being ported render the previous, already-real components, so
 * the application stays fully functional at every commit.
 */
export default function WorkflowPanel({ context }: { context: StageContext }) {
  const { workspace, step, currentStep, refusal } = context;

  return (
    <div className="rr-panel__inner">
      <div className="rr-panel__meta">
        <span>
          Step {step} of 7 · <em>{STEP_NAMES[step - 1]}</em>
        </span>
        <span>context rev {workspace.context_revision}</span>
      </div>

      {step === 1 ? (
        <DeskStage context={context} />
      ) : step === 2 ? (
        <CorrectionStage context={context} />
      ) : step === 3 ? (
        <InvestigationStage context={context} />
      ) : step === 4 ? (
        <ReviewStage context={context} />
      ) : step === 5 ? (
        <AuthorityStage context={context} />
      ) : step === 6 ? (
        <FreshApprovalStage context={context} />
      ) : (
        <div className="rr-legacy">
          <p className="rr-mono">
            Step {step} of 7 · {STEP_NAMES[step - 1]} — this surface is being rebuilt. The actions
            below are the real ones.
          </p>
          <PublishingDeskLegacy state={workspace} />
          <ReviewPaneLegacy
            state={workspace}
            actor={context.actor}
            onChange={() => context.commit(async () => undefined).then(() => undefined)}
            onError={() => undefined}
          />
        </div>
      )}

      {refusal && step !== 6 && (
        <RefusalCard refusal={refusal} onDismiss={context.dismissRefusal} />
      )}

      {currentStep > step && (
        <button
          type="button"
          className="rr-secondary rr-secondary--self"
          onClick={() => context.goTo(currentStep)}
        >
          Back to where the case is →
        </button>
      )}
    </div>
  );
}
