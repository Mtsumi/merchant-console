import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./theme.css";
import "./hover.css";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "ElementPay Merchant Console",
  description: "Merchant & Developer Console for ElementPay — collect, convert and pay out across Africa and beyond.",
  icons: { icon: "/elementpay-logo.png" },
};

const themeBoot = `try{var t=localStorage.getItem("ep-console-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="light" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
