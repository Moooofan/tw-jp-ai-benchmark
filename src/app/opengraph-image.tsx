import { ImageResponse } from "next/og";

export const alt =
  "過去五年，哪些台灣新創最值得作為日本市場發展案例？｜Taiwan → Japan 2026";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const KICKER = "TAIWAN → JAPAN 2026";
const LINE_1 = "過去五年，你認為哪些台灣新創";
const LINE_2A = "最值得作為";
const LINE_2B = "日本市場";
const LINE_2C = "發展案例？";
const FOOT = "輸入公司名稱就能提名。一起整理台灣新創前進日本的案例。";

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

/** Spec v6 §2: the question + TAIWAN → JAPAN, in the v5 campaign palette. */
export default async function OgImage() {
  const [black, regular, cond] = await Promise.all([
    loadFont("Noto+Sans+TC", 900, LINE_1 + LINE_2A + LINE_2B + LINE_2C),
    loadFont("Noto+Sans+TC", 500, FOOT),
    loadFont("Barlow+Semi+Condensed", 800, KICKER + "TAIWAN → JAPAN"),
  ]);

  const fonts = [
    black
      ? {
          name: "Noto Sans TC",
          data: black,
          style: "normal" as const,
          weight: 900 as const,
        }
      : null,
    regular
      ? {
          name: "Noto Sans TC",
          data: regular,
          style: "normal" as const,
          weight: 500 as const,
        }
      : null,
    cond
      ? {
          name: "Barlow",
          data: cond,
          style: "normal" as const,
          weight: 800 as const,
        }
      : null,
  ].filter((f) => f !== null);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "60px 72px 56px",
        background: "#00508E",
        color: "#FFFFFF",
        fontFamily: "Noto Sans TC",
        borderBottom: "14px solid #F2C744",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          right: -20,
          bottom: -40,
          display: "flex",
          fontFamily: "Barlow",
          fontWeight: 800,
          fontSize: 190,
          color: "rgba(255,255,255,0.08)",
          letterSpacing: 2,
        }}
      >
        TAIWAN → JAPAN
      </div>
      <div style={{ display: "flex" }}>
        <div
          style={{
            display: "flex",
            fontFamily: "Barlow",
            fontWeight: 800,
            fontSize: 28,
            letterSpacing: 5,
            background: "#FFE38A",
            color: "#0F2440",
            padding: "6px 16px",
          }}
        >
          {KICKER}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          fontWeight: 900,
          fontSize: 70,
          lineHeight: 1.3,
        }}
      >
        <div style={{ display: "flex" }}>{LINE_1}</div>
        <div style={{ display: "flex" }}>
          {LINE_2A}
          <span style={{ color: "#FFE38A" }}>{LINE_2B}</span>
          {LINE_2C}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 26,
          fontWeight: 500,
          color: "#DCE9F7",
        }}
      >
        {FOOT}
      </div>
    </div>,
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
