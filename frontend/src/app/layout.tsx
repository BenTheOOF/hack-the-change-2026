import type { Viewport } from "next";
import "./globals.css";

export const metadata = {
  title: "PhysioTrace | Small moves. Real progress.",
  description:
    "Private movement feedback and a closer connection to your physical therapist.",
};

// Lets the bottom tab bar sit above the phone's home indicator.
export const viewport: Viewport = { viewportFit: "cover", themeColor: "#f7f8f4" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
