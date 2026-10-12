import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Patrick_Hand } from "next/font/google"
import "./globals.css"

const hand = Patrick_Hand({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: "400",
})

export const metadata: Metadata = {
  title: "Opposition",
  description: "I walk king and pawn against king backward from mate, and I write down the distance.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${hand.variable} h-full`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
