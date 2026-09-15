import type { Metadata } from "next";
import "./globals.css";

const TITLE = "過去五年，哪些台灣新創最值得作為日本市場發展案例？｜Taiwan → Japan 2026";
const DESCRIPTION = "輸入公司名稱就能提名。一起整理台灣新創前進日本的案例。";

export const metadata: Metadata = {
  metadataBase: new URL("https://tw-jp-ai-benchmark.vercel.app"),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin=""
        />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Barlow+Semi+Condensed:wght@500;600;700;800&family=Noto+Sans+TC:wght@400;500;700;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
