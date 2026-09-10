import { ImageResponse } from "next/og";

export const alt = "推爆東京";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const TITLE = "推爆東京";
const QUESTION = "哪家台灣新創在東京最值得推？";
const SUB = "留一句理由，讓大家推。推最多的十家進決賽。";

/**
 * Satori cannot read woff2, and it ships no CJK glyphs. Ask Google Fonts for a
 * truetype subset containing only the characters this card uses.
 */
async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const text = encodeURIComponent(TITLE + QUESTION + SUB);
    const cssUrl = `https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@700&text=${text}`;
    const css = await fetch(cssUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; og-image-builder)" },
    }).then((r) => r.text());
    const src = /src:\s*url\((https:[^)]+)\)/.exec(css)?.[1];
    if (!src) return null;
    return await fetch(src).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function OgImage() {
  const font = await loadFont();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "72px",
          background: "#FFD84D",
          backgroundImage: "radial-gradient(#F5C400 3px, transparent 3.2px)",
          backgroundSize: "44px 44px",
          color: "#141210",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <span style={{ fontSize: 140, fontWeight: 700 }}>推</span>
          <span
            style={{
              fontSize: 140,
              fontWeight: 700,
              color: "#E8322B",
              transform: "rotate(-6deg)",
            }}
          >
            爆
          </span>
          <span style={{ fontSize: 140, fontWeight: 700 }}>東京</span>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 24,
            fontSize: 52,
            fontWeight: 700,
          }}
        >
          {QUESTION}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 32,
            fontSize: 28,
            color: "#6B6250",
          }}
        >
          {SUB}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "Noto Sans TC", data: font, style: "normal", weight: 700 }]
        : undefined,
    },
  );
}
