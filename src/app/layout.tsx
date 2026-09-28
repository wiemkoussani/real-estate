import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AXIS",
  description: "Interactive complex tours",
  icons: { icon: "/branding/axis-logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
