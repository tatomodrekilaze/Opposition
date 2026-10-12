import { eachLegalPawn, whiteIsWinning, type Place } from "./engine"
import { chebyshev, file, rank } from "./squares"

// Two of these three, and I call it a win. I copied the rule out of the books. It loses to "always say win".
export function ruleSaysWin(place: Place): boolean {
  let met = 0
  if (rank(place.whiteKing) >= 5) met += 1
  if (rank(place.whiteKing) > rank(place.pawn) && Math.abs(file(place.whiteKing) - file(place.pawn)) <= 1) met += 1
  if (whiteHasOpposition(place)) met += 1
  return met >= 2
}

// The kings face each other on a file or a rank, with exactly one square between them, and it is Black to move.
function whiteHasOpposition(place: Place): boolean {
  const fileGap = Math.abs(file(place.whiteKing) - file(place.blackKing))
  const rankGap = Math.abs(rank(place.whiteKing) - rank(place.blackKing))
  const facing = (fileGap === 0 && rankGap === 2) || (rankGap === 0 && fileGap === 2)
  return facing && place.side === 1
}

export function features(place: Place): number[] {
  const promotion = place.pawn + (7 - rank(place.pawn)) * 8
  return [
    1,
    rank(place.pawn) / 6,
    file(place.pawn) === 0 || file(place.pawn) === 7 ? 1 : 0,
    rank(place.whiteKing) >= 5 ? 1 : 0,
    rank(place.whiteKing) > rank(place.pawn) && Math.abs(file(place.whiteKing) - file(place.pawn)) <= 1 ? 1 : 0,
    whiteHasOpposition(place) ? 1 : 0,
    chebyshev(place.whiteKing, place.pawn) / 7,
    chebyshev(place.blackKing, place.pawn) / 7,
    chebyshev(place.blackKing, promotion) / 7,
    place.side === 0 ? 1 : 0,
    (rank(place.whiteKing) - rank(place.pawn)) / 7,
    Math.abs(file(place.whiteKing) - file(place.blackKing)) / 7,
  ]
}

export function sigmoid(value: number): number {
  const clipped = Math.max(-20, Math.min(20, value))
  return 1 / (1 + Math.exp(-clipped))
}

export function dot(weights: number[], row: number[]): number {
  let total = 0
  for (let index = 0; index < weights.length; index += 1) total += weights[index] * row[index]
  return total
}

// Ordinary log loss. After the squash, the slope is just (my guess minus the label).
// Times the feature, that is how much this weight should move. I checked it by wiggling each weight.
export function backward(weights: number[], row: number[], label: number): { loss: number; gradient: number[] } {
  const predicted = sigmoid(dot(weights, row))
  const safe = Math.min(1 - 1e-12, Math.max(1e-12, predicted))
  const loss = -(label * Math.log(safe) + (1 - label) * Math.log(1 - safe))
  const residual = predicted - label
  return { loss, gradient: row.map((entry) => residual * entry) }
}

export type Scorer = {
  weights: number[]
  saysWin: (place: Place) => boolean
}

export function trainScorer(): Scorer {
  const rows: Array<{ row: number[]; label: number }> = []
  eachLegalPawn((place, value) => {
    rows.push({ row: features(place), label: whiteIsWinning(place, value) ? 1 : 0 })
  })
  const weights = new Array(rows[0]?.row.length ?? 12).fill(0)
  const rate = 0.08
  for (let epoch = 0; epoch < 4; epoch += 1) {
    for (let index = epoch; index < rows.length; index += 7) {
      const sample = rows[index]
      const { gradient } = backward(weights, sample.row, sample.label)
      for (let weight = 0; weight < weights.length; weight += 1) weights[weight] -= rate * gradient[weight]
    }
  }
  return {
    weights,
    saysWin(place: Place) {
      return sigmoid(dot(weights, features(place))) >= 0.5
    },
  }
}
