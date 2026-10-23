import type { Metadata, Viewport } from "next";
import { Bona_Nova, Inter, Saira } from "next/font/google";
import "./globals.css";

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
  weight: ["700"],
  variable: "--font-inter",
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
    <html lang="en" className={`${bonaNova.variable} ${saira.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
