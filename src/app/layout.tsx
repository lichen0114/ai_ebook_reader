import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Margin Reader", template: "%s · Margin Reader" },
  description: "A quiet EPUB reader with an intelligent, evidence-backed margin."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="paper-grain">{children}</body></html>;
}
