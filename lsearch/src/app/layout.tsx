import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LSearch - Linux & Cybersecurity Command Searcher",
  description: "Search and discover Linux commands and cybersecurity tools with AI-powered intelligence from NotebookLM",
  keywords: ["linux", "commands", "cybersecurity", "terminal", "shell", "bash", "security", "hacking", "pentesting"],
  authors: [{ name: "LSearch" }],
  openGraph: {
    title: "LSearch - Linux & Cybersecurity Command Searcher",
    description: "Search and discover Linux commands and cybersecurity tools",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0a0f1a] min-h-screen`}
      >
        <div className="fixed inset-0 bg-grid pointer-events-none opacity-50" />
        <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-[#00ff88] rounded-full filter blur-[150px] opacity-10 pointer-events-none" />
        <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-[#00d4ff] rounded-full filter blur-[150px] opacity-10 pointer-events-none" />
        <div className="relative z-10">
          {children}
        </div>
      </body>
    </html>
  );
}
