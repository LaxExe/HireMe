import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export const metadata: Metadata = {
  title: "HireMe",
  description: "Minimalist talent discovery and recruitment platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col bg-[#fafafa] text-neutral-900 antialiased selection:bg-neutral-200">
        <Navbar />
        <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-12 sm:py-20 animate-fadeIn">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
