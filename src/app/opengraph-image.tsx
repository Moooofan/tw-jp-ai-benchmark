import { ImageResponse } from "next/og";

export const alt = "Taiwan → Japan AI Representation Benchmark 2026";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const WORDMARK = "AI REPRESENTATION BENCHMARK";
const KICKER = "TAIWAN → JAPAN · 2026";
const HEADLINE = "哪些台灣新創，最值得作為日本市場發展案例？";
const DISCLAIMER = "本活動反映社群關注與市場認知，不構成企業赴日業績的客觀排名。";

/**
 * Satori cannot read woff2 and ships no CJK glyphs, so ask Google Fonts for a
 * truetype subset containing exactly the characters this card uses.
 */
async function loadFont(
  family: string,
  weight: number,
  text: string,
): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&text=${encodeURIComponent(text)}`;
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
  const [serif, sans] = await Promise.all([
    loadFont("Noto+Serif+TC", 900, HEADLINE),
    loadFont("Noto+Sans+TC", 400, DISCLAIMER + WORDMARK + KICKER),
  ]);

  const fonts = [
    serif
      ? { name: "Noto Serif TC", data: serif, style: "normal" as const, weight: 900 as const }
      : null,
    sans
      ? { name: "Noto Sans TC", data: sans, style: "normal" as const, weight: 400 as const }
      : null,
  ].filter((f) => f !== null);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#FFFFFF",
          color: "#1E1E1E",
          fontFamily: "Noto Sans TC",
          borderTop: "14px solid #0F2440",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 6,
              color: "#0F2440",
            }}
          >
            {WORDMARK}
          </div>
          <div
            style={{
              display: "flex",
              marginTop: 8,
              fontSize: 18,
              letterSpacing: 8,
              color: "#5B6474",
            }}
          >
            {KICKER}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontFamily: "Noto Serif TC",
            fontWeight: 900,
            fontSize: 74,
            lineHeight: 1.25,
            color: "#0F2440",
            maxWidth: 980,
          }}
        >
          {HEADLINE}
        </div>

        <div
          style={{
            display: "flex",
            paddingTop: 22,
            borderTop: "2px solid #D3DBE6",
            fontSize: 22,
            color: "#5B6474",
          }}
        >
          {DISCLAIMER}
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
