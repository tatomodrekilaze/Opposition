import { built, eachLegalPawn, whiteIsWinning, type Place } from "./engine"
import { ruleSaysWin, trainScorer, type Scorer } from "./guess"
import { squareName } from "./squares"

export type Report = {
  legal: number
  wins: number
  draws: number
  maxPawnMoves: number
  ruleAgreed: number
  scorerAgreed: number
  ruleMiss: Place | null
  scorerMiss: Place | null
  scorer: Scorer
}

// I count the whole table once and keep the numbers. Asking again would only repeat them.
let cache: Report | null = null

export function report(): Report {
  if (!cache) cache = measure()
  return cache
}

function measure(): Report {
  const scorer = trainScorer()
  let legal = 0
  let wins = 0
  let draws = 0
  let ruleAgreed = 0
  let scorerAgreed = 0
  let ruleMiss: Place | null = null
  let scorerMiss: Place | null = null
  eachLegalPawn((place, value) => {
    legal += 1
    const truth = whiteIsWinning(place, value)
    if (truth) wins += 1
    else draws += 1
    const rule = ruleSaysWin(place)
    if (rule === truth) ruleAgreed += 1
    else if (!ruleMiss && rule && !truth) ruleMiss = place
    const guess = scorer.saysWin(place)
    if (guess === truth) scorerAgreed += 1
    else if (!scorerMiss && guess !== truth) scorerMiss = place
  })
  return {
    legal,
    wins,
    draws,
    maxPawnMoves: built().maxPawnMoves,
    ruleAgreed,
    scorerAgreed,
    ruleMiss,
    scorerMiss,
    scorer,
  }
}

export function placeQuery(place: Place): string {
  const params = new URLSearchParams({
    wk: squareName(place.whiteKing),
    bk: squareName(place.blackKing),
    pawn: squareName(place.pawn),
    side: place.side === 0 ? "white" : "black",
  })
  return `/?${params.toString()}`
}
