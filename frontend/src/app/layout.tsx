import "./globals.css";

export const metadata = {
  title: "PhysioTrace | Small moves. Real progress.",
  description:
    "Private movement feedback and a closer connection to your physical therapist.",
};

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
