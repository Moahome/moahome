import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "모아홈 | 함께 만드는 더 좋은 우리 집",
    template: "%s | 모아홈",
  },
  description:
    "소규모 공동주택을 위한 관리비 통합 플랫폼, 모아홈. 주민의 관리비 조회부터 관리자의 부과·수납, 회계까지 하나로 연결합니다.",
  icons: {
    icon: {
      url: "/moahomeIcon.svg",
      type: "image/svg+xml",
      sizes: "any",
    },
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
