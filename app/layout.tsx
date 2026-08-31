import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./mdt-theme.css";

// 모바일 조회 화면이 있으니 기기 폭에 맞춰야 한다.
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f1114" };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Heinapel War Table v0.1",
  description: "헤이나펄 리그 2기 30인 전략회의용 디지털 작전판",
  openGraph: {
    title: "Heinapel War Table v0.1",
    description: "30명의 말을 실제 전장 위에 배치하고 작전을 설계하는 디지털 War Table",
    type: "website",
    images: [{ url: "/og.png", width: 1792, height: 924, alt: "Heinapel War Table tactical operation board" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Heinapel War Table v0.1",
    description: "30-player tactical operation board",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
