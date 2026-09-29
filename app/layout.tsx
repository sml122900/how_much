import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { APP_NAME, APP_SUBCOPY, APP_TITLE } from "@/lib/config";
import { FooterDisclosure } from "@/components/FooterDisclosure";
import { FooterVisibilityProvider } from "@/components/FooterVisibility";
import "./globals.css";

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: APP_TITLE,
  description: `${APP_SUBCOPY}. 사진과 한 줄 설명만 보고 가격을 맞혀보세요.`,
  applicationName: APP_NAME,
  openGraph: { title: APP_TITLE, description: APP_SUBCOPY, siteName: APP_NAME, locale: "ko_KR", type: "website" },
  twitter: { card: "summary_large_image", title: APP_TITLE, description: APP_SUBCOPY },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="bg-white font-sans text-gray-900 antialiased">
        <FooterVisibilityProvider>
          <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5">
            <main className="flex flex-1 flex-col py-3">{children}</main>
            <footer className="border-t border-gray-100 py-4">
              <FooterDisclosure />
              <nav className="mt-2 flex justify-center gap-4 text-[11px] text-gray-300">
                <Link href="/about" className="underline underline-offset-2">
                  서비스 소개
                </Link>
                <Link href="/privacy" className="underline underline-offset-2">
                  개인정보 처리방침
                </Link>
              </nav>
            </footer>
          </div>
        </FooterVisibilityProvider>
      </body>
    </html>
  );
}
