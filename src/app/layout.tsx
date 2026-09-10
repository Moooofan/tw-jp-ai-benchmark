import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://tuibao-tokyo.vercel.app"),
  title: "推爆東京",
  description: "哪家台灣新創在東京最值得推？",
  openGraph: {
    title: "推爆東京",
    description: "哪家台灣新創在東京最值得推？",
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
          href="https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Noto+Sans+TC:wght@500;700;900&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
