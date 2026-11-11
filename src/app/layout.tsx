import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { AuthProvider } from "@/context/AuthContext";

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
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-[#fafafa] text-neutral-900 antialiased selection:bg-neutral-200">
        <AuthProvider>
          <Navbar />
          <main className="flex-1 flex flex-col max-w-5xl w-full mx-auto px-4 sm:px-6">
            {children}
          </main>
          <Footer />
        </AuthProvider>
      </body>
    </html>
  );
}
