import { useEffect, useState } from "react";

import { apiBaseUrl } from "../api";

/**
 * Shows the file the backend actually serves.
 *
 * The bytes are fetched from the real endpoint and rendered unmodified in a
 * fully sandboxed frame, with the server's own `X-ResultRipple-Sha256` header
 * reported beside them. Nothing is re-typeset: a re-typeset report is not the
 * edition. Fetching rather than pointing the frame at the URL keeps this
 * working inside embedded browsers that refuse cross-document frame loads, and
 * lets the viewer state the hash of exactly what it drew.
 */
export interface PaperBytes {
  status: "loading" | "ready" | "failed";
  html: string;
  sha: string | null;
  draft: boolean;
  detail: string | null;
}

export function usePaperBytes(url: string | null): PaperBytes {
  const [state, setState] = useState<PaperBytes>({
    status: "loading",
    html: "",
    sha: null,
    draft: false,
    detail: null,
  });

  useEffect(() => {
    let cancelled = false;
    if (!url) {
      setState({ status: "failed", html: "", sha: null, draft: false, detail: "no file to show" });
      return;
    }
    setState({ status: "loading", html: "", sha: null, draft: false, detail: null });
    fetch(url, { credentials: "include", headers: { accept: "text/html" } })
      .then(async (response) => {
        const body = await response.text();
        if (cancelled) return;
        if (!response.ok) {
          setState({
            status: "failed",
            html: "",
            sha: null,
            draft: false,
            detail: `HTTP ${response.status}`,
          });
          return;
        }
        setState({
          status: "ready",
          html: body,
          sha: response.headers.get("X-ResultRipple-Sha256"),
          draft: response.headers.get("X-ResultRipple-Draft") === "true",
          detail: null,
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "failed",
            html: "",
            sha: null,
            draft: false,
            detail: error instanceof Error ? error.message : "the file could not be read",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}

export default function PaperFrame({ title, bytes }: { title: string; bytes: PaperBytes }) {
  if (bytes.status === "loading") {
    return <div className="rr-paper__loading">Reading the file…</div>;
  }
  if (bytes.status === "failed") {
    return (
      <div className="rr-paper__loading rr-paper__loading--failed">
        This file could not be read from {apiBaseUrl}
        {bytes.detail ? ` (${bytes.detail})` : ""}. Nothing is shown in its place.
      </div>
    );
  }
  return (
    <iframe
      className="rr-paper__frame"
      title={title}
      srcDoc={bytes.html}
      sandbox=""
      referrerPolicy="no-referrer"
    />
  );
}
