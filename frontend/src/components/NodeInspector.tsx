import type { HoverInfo, NodeDescription } from "../graph/graph-scene.js";

/** Pointer tooltip while a path is traced. */
export function HoverTip({ hover }: { hover: HoverInfo }) {
  return (
    <div className="rr-hovertip" style={{ left: hover.x + 18, top: hover.y + 18 }}>
      <div className="rr-hovertip__kind">{hover.kind}</div>
      <div className="rr-hovertip__title">{hover.title}</div>
      <div className="rr-hovertip__trace">Path traced · click to inspect</div>
    </div>
  );
}

/**
 * The clicked node, described from the scene's stage — which is itself derived
 * from the workspace response. Nothing here is a literal about the demo.
 */
export default function NodeInspector({
  info,
  onClose,
  onOpenDocument,
}: {
  info: NodeDescription;
  onClose: () => void;
  onOpenDocument: () => void;
}) {
  return (
    <aside className="rr-inspector" aria-label="Node inspector">
      <div className="rr-inspector__head">
        <div>
          <div className="rr-inspector__kind">{info.kind}</div>
          <div className="rr-inspector__title">{info.title}</div>
        </div>
        <button type="button" className="rr-inspector__close" aria-label="Close inspector" onClick={onClose}>
          ×
        </button>
      </div>
      <dl className="rr-inspector__rows">
        {info.rows
          .filter((row) => row.v !== "" && row.v !== "undefined")
          .map((row) => (
            <div key={row.k} style={{ display: "contents" }}>
              <dt>{row.k}</dt>
              <dd>{row.v}</dd>
            </div>
          ))}
      </dl>
      {info.rels.length > 0 && (
        <div className="rr-inspector__rels">
          {info.rels.map((rel) => (
            <div key={rel} className="rr-inspector__rel">
              {rel}
            </div>
          ))}
        </div>
      )}
      {info.isDoc && (
        <button type="button" className="rr-inspector__open" onClick={onOpenDocument}>
          Open document →
        </button>
      )}
    </aside>
  );
}
