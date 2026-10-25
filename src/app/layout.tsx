import type { Metadata, Viewport } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/motion/Providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const display = Anton({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: { default: "AirHoops", template: "%s · AirHoops" },
  description: "Shoot hoops with nothing but air. A camera-controlled basketball game that runs entirely in your browser.",
};

export const viewport: Viewport = {
  themeColor: "#f7f1d6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-clip font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
