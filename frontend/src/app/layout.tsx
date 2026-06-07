import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Chatbot from "@/components/Chatbot";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LogicAgent — AI RTL Verification",
  description: "Autonomous AI-powered RTL testbench verification and debugging for Verilog designs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-[#030304] text-slate-100 flex flex-col relative overflow-hidden">
        {/* Ambient background mesh glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-50 select-none">
          <div className="absolute -top-[20%] -left-[10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[140px] animate-mesh-1" />
          <div className="absolute -bottom-[20%] -right-[10%] w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-[140px] animate-mesh-2" />
        </div>
        {children}
        <Chatbot />
      </body>
    </html>
  );
}
