import type { Metadata, Viewport } from "next";
import "./globals.css";
import { MoroccanPattern } from "@/components/icons/MoroccanPattern";

export const metadata: Metadata = {
  title: "JMA3A | جماعة — ألعاب جماعية مغربية",
  description: "ألعاب جماعية تفاعلية مغربية للأصدقاء والعائلة: الذيب، الدخيل، شكون فينا، مثلها، ممنوع، ومهمة سرية. بلا تحميل وبلا تسجيل!",
  manifest: "/manifest.json",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0B0E14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className="dark">
      <body className="min-h-screen bg-jma3a-dark text-jma3a-sand relative antialiased selection:bg-jma3a-gold selection:text-jma3a-dark">
        {/* Subtle Moroccan geometric background */}
        <MoroccanPattern />
        <main className="relative z-10 min-h-screen flex flex-col">{children}</main>
      </body>
    </html>
  );
}
