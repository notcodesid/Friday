import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Friday | Marketing Operator",
  description:
    "A marketing workspace for research, social content creation, and OpenClock-ready publishing handoff.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
