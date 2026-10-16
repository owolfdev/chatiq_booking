import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "ChatIQ Booking",
  description: "Isolated booking sibling service for ChatIQ",
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
