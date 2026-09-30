import type { Metadata, Viewport } from "next";
import Script from "next/script";
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
      <head>
        <Script
          id="impact-tracking"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(i,m,p,a,c,t){c.ire_o=p;c[p]=c[p]||function(){(c[p].a=c[p].a||[]).push(arguments)};t=a.createElement(m);var z=a.getElementsByTagName(m)[0];t.async=1;t.src=i;z.parentNode.insertBefore(t,z)})('https://utt.impactcdn.com/P-A7868187-a22f-4e2d-b6e5-6d5f95757e391.js','script','impactStat',document,window);impactStat('transformLinks');impactStat('trackImpression');`,
          }}
        />
      </head>
      <body className="min-h-screen bg-jma3a-dark text-jma3a-sand relative antialiased selection:bg-jma3a-gold selection:text-jma3a-dark">
        {/* Subtle Moroccan geometric background */}
        <MoroccanPattern />
        <main className="relative z-10 min-h-screen flex flex-col">{children}</main>
      </body>
    </html>
  );
}
