import type { Metadata, Viewport } from "next";
import { Barlow, Bona_Nova, Inter, Livvic, Noto_Sans_Arabic, Saira } from "next/font/google";
import "./globals.css";

const notoArabic = Noto_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-noto-arabic",
  display: "swap",
});

const bonaNova = Bona_Nova({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-bona-nova",
  display: "swap",
});

const saira = Saira({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-saira",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const livvic = Livvic({
  subsets: ["latin"],
  weight: ["500"],
  variable: "--font-livvic",
  display: "swap",
});

const barlow = Barlow({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-barlow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AXIS",
  description: "Interactive complex tours",
  icons: { icon: "/branding/axis-logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f172a",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${notoArabic.variable} ${bonaNova.variable} ${saira.variable} ${inter.variable} ${livvic.variable} ${barlow.variable}`}>
      <body>{children}</body>
    </html>
  );
}
