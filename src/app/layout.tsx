import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Unbounded } from "next/font/google";
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
import "./globals.css";
import { Providers } from "@/components/providers";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Unbounded({ variable: "--font-display-face", subsets: ["latin"], weight: ["200", "300", "400", "500"] });

export const metadata: Metadata = {
  title: "StellarScope — Citizen discovery on the infrared sky",
  description:
    "Explore NASA SPHEREx DR1's 102-channel all-sky infrared survey, investigate real tiles, run AI-assisted analysis and contribute verifiable discoveries.",
};

export const viewport: Viewport = { themeColor: "#0b0c0f" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} ${display.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
