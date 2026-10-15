import RefusalCard from "./RefusalCard";
import AuthorityStage from "./stages/AuthorityStage";
import CorrectionStage from "./stages/CorrectionStage";
import DeskStage from "./stages/DeskStage";
import EditionsStage from "./stages/EditionsStage";
import FreshApprovalStage from "./stages/FreshApprovalStage";
import InvestigationStage from "./stages/InvestigationStage";
import ReviewStage from "./stages/ReviewStage";
import type { StageContext } from "./stages/context";
import { STEP_NAMES } from "../workflow";

/**
 * The right-hand rail: one stage at a time, chosen by where the backend's own
 * state says the case is.
 *
 * Every value a stage shows traces to a response; every action it offers is a
 * real request whose refusal is rendered as the server returned it.
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
      ) : step === 7 ? (
        <EditionsStage context={context} />
      ) : null}

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
