import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "MMA Benefits",
  description: "Your benefits, in one place.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#F7F3EE" }}>{children}</body>
    </html>
  );
}
