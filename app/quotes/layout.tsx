import type { ReactNode } from "react";
import { Newsreader, Noto_Sans } from "next/font/google";
import "./quote.css";

const news = Newsreader({ subsets: ["latin"], weight: ["300", "400"], variable: "--font-news" });
const noto = Noto_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-noto" });

export default function QuotesLayout({ children }: { children: ReactNode }) {
  return <div className={`${news.variable} ${noto.variable} quote-root`}>{children}</div>;
}
