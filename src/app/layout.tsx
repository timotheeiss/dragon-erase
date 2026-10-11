import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Dragon Erase — A clear record",
  description:
    "Human-approved erasure workflows. A local, synthetic compliance demo.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
