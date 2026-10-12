import { Suspense } from "react"

import { Study } from "@/components/study"

export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  return (
    <main className="raw">
      <h1>Opposition</h1>
      <p>
        White has a king and a pawn. Black has a king. I started from checkmate and walked backward through every
        position that can actually happen. If one move leaves the other side lost, that position is a win. If every
        move does that, it is a loss. The rest are draws. I counted the moves.
      </p>
      <Suspense fallback={<p>I&apos;m still walking backward from mate.</p>}>
        <Study searchParams={searchParams} />
      </Suspense>
    </main>
  )
}
