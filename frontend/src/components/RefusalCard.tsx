import { ApiRefusal } from "../api";

/**
 * A refusal the server actually returned. The code, the sentence and the
 * witness are rendered exactly as they arrived; the interface adds nothing and
 * interprets nothing.
 */
export default function RefusalCard({
  refusal,
  onDismiss,
  prominent = false,
}: {
  refusal: ApiRefusal;
  onDismiss?: () => void;
  prominent?: boolean;
}) {
  const witness = Object.keys(refusal.context).length > 0 ? refusal.context : null;
  return (
    <div className="rr-refusal" role="alert">
      <div className="rr-refusal__head">
        <span className="rr-refusal__kicker">
          {prominent ? "Release refused" : "Action refused"} · HTTP {refusal.status}
        </span>
        {onDismiss && (
          <button type="button" className="rr-refusal__dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
      <div className={`rr-refusal__code${prominent ? "" : " rr-refusal__code--small"}`}>{refusal.code}</div>
      <div className={`rr-refusal__detail${prominent ? "" : " rr-refusal__detail--small"}`}>{refusal.detail}</div>
      {witness && <pre className="rr-refusal__witness">{JSON.stringify(witness, null, 2)}</pre>}
    </div>
  );
}
