import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Friday",
  description: "An agent platform for Friday's distribution workflows.",
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
