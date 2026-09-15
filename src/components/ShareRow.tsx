"use client";

import { useState } from "react";

const DEFAULT_TEXT =
  "Taiwan → Japan 2026：過去五年，哪些台灣新創最值得作為日本市場發展案例？";

export default function ShareRow({
  text: TEXT = DEFAULT_TEXT,
}: { text?: string } = {}) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.origin + "/";
  const open = (u: string) => window.open(u, "_blank", "noopener");
  return (
    <div className="share">
      <button
        type="button"
        onClick={() =>
          open(
            "https://x.com/intent/post?text=" +
              encodeURIComponent(TEXT) +
              "&url=" +
              encodeURIComponent(url),
          )
        }
      >
        分享到 X
      </button>
      <button
        type="button"
        onClick={() =>
          open(
            "https://line.me/R/share?text=" +
              encodeURIComponent(`${TEXT} ${url}`),
          )
        }
      >
        分享到 LINE
      </button>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard?.writeText(`${TEXT} ${url}`);
          setCopied(true);
        }}
      >
        {copied ? "已複製連結" : "複製連結"}
      </button>
    </div>
  );
}
