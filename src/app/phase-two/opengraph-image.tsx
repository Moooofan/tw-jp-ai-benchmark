import { ImageResponse } from "next/og";
import { phaseTwoOpen } from "@/lib/phase";
import { loadStats } from "@/lib/site-data";

export const alt =
  "把「我推薦誰」，變成「為什麼值得帶往日本」。｜台灣新創赴日形象資產決策標竿計畫 Phase Two";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
// Per request: it must switch from 404 to the card exactly at vote_open.
export const dynamic = "force-dynamic";

const KICKER = "PHASE TWO | COMMUNITY VOTING";
const NAME = "台灣新創赴日形象資產決策標竿計畫";
const LINE_1 = "把「我推薦誰」，";
const LINE_2 = "變成「為什麼值得帶往日本」。";
const FOOT = "每個 email 每天最多投給 3 家企業 · 9/28–10/06";
const BRANDS = "VM | VOCAL MIDDLE × ximu";

/** Same Google Fonts subset trick as the Phase One card (Satori needs TTF). */
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

/** Phase Two card; 404 until Phase Two is public. */
export default async function OgImage() {
  if (!phaseTwoOpen(await loadStats())) {
    return new Response(null, { status: 404 });
  }
  const [black, regular, cond] = await Promise.all([
    loadFont("Noto+Sans+TC", 900, LINE_1 + LINE_2),
    loadFont("Noto+Sans+TC", 500, NAME + FOOT),
    loadFont("Barlow+Semi+Condensed", 800, KICKER + BRANDS),
  ]);
  const fonts = [
    black ? { name: "Noto Sans TC", data: black, style: "normal" as const, weight: 900 as const } : null,
    regular ? { name: "Noto Sans TC", data: regular, style: "normal" as const, weight: 500 as const } : null,
    cond ? { name: "Barlow", data: cond, style: "normal" as const, weight: 800 as const } : null,
  ].filter((f) => f !== null);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "56px 72px 52px",
        background: "#13458B",
        color: "#FFFFFF",
        fontFamily: "Noto Sans TC",
        borderBottom: "14px solid #3B82F6",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", fontSize: 28, fontWeight: 500, color: "#DCE9F7" }}>
          {NAME}
        </div>
        <div style={{ display: "flex" }}>
          <div
            style={{
              display: "flex",
              fontFamily: "Barlow",
              fontWeight: 800,
              fontSize: 26,
              letterSpacing: 4,
              background: "#CFD9E8",
              color: "#13458B",
              padding: "6px 16px",
            }}
          >
            {KICKER}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontWeight: 900, fontSize: 68, lineHeight: 1.3 }}>
        <div style={{ display: "flex" }}>{LINE_1}</div>
        <div style={{ display: "flex" }}>{LINE_2}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
        <div style={{ display: "flex", fontSize: 26, fontWeight: 500, color: "#DCE9F7" }}>{FOOT}</div>
        <div style={{ display: "flex", fontFamily: "Barlow", fontWeight: 800, fontSize: 26, letterSpacing: 2 }}>
          {BRANDS}
        </div>
      </div>
    </div>,
    { ...size, fonts: fonts.length > 0 ? fonts : undefined },
  );
}
