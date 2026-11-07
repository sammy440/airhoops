import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter_Tight } from "next/font/google";
import { ServiceWorker } from "@/components/app/ServiceWorker";
import { Providers } from "@/components/motion/Providers";
import "./globals.css";

// One clean grotesk for everything: light, tight headlines and plain body text
const sans = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://airhoops.vercel.app";
const DESCRIPTION = "Shoot hoops with nothing but air. A camera-controlled basketball game that runs entirely in your browser.";

// Share images and icons come from the file conventions in this folder:
// opengraph-image.jpg, twitter-image.jpg, icon.svg, apple-icon.png, favicon.ico, manifest.ts.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "AirHoops: shoot hoops with nothing but air", template: "%s · AirHoops" },
  description: DESCRIPTION,
  applicationName: "AirHoops",
  // Added to an iPhone's home screen, it opens full screen like the installed app elsewhere (manifest.ts)
  appleWebApp: { capable: true, title: "AirHoops", statusBarStyle: "black-translucent" },
  openGraph: {
    type: "website",
    siteName: "AirHoops",
    url: "/",
    title: "AirHoops: shoot hoops with nothing but air",
    description: "Mime the throw. Watch the ball fly. A basketball game controlled by nothing but your body.",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "AirHoops: shoot hoops with nothing but air",
    description: "Mime the throw. Watch the ball fly. A basketball game controlled by nothing but your body.",
  },
};

export const viewport: Viewport = {
  themeColor: "#ececea",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-clip font-sans">
        <a
          href="#main"
          className="sr-only z-[100] rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
