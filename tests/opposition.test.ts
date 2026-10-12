// The books already printed these lengths: 10 with the queen, 16 with the rook, 28 with the pawn.
import { describe, expect, it } from "vitest"

import { built, inspect, kqkIndex } from "../src/lib/opposition/engine"
import { report } from "../src/lib/opposition/study"
import { backward, dot, sigmoid } from "../src/lib/opposition/guess"
import { parseSquare } from "../src/lib/opposition/squares"

function place(whiteKing: string, pawn: string, blackKing: string, side: 0 | 1) {
  return {
    whiteKing: parseSquare(whiteKing) as number,
    pawn: parseSquare(pawn) as number,
    blackKing: parseSquare(blackKing) as number,
    side,
  }
}

describe("known endings", () => {
  it("matches the published mate distances and the corner positions", () => {
    const tables = built()
    expect(tables.maxQueenMoves).toBe(10)
    expect(tables.maxRookMoves).toBe(16)
    expect(tables.maxPawnMoves).toBe(28)
    expect(tables.minorMates).toBe(0)

    const queenMate = kqkIndex(1, parseSquare("g7") as number, parseSquare("g6") as number, parseSquare("h8") as number)
    expect(tables.kqk.value[queenMate]).toBeLessThan(0)

    const corner = inspect(place("b6", "a7", "a8", 1))
    expect(corner.legal).toBe(true)
    expect(corner.whiteWins).toBe(false)
    expect(corner.outcome).toMatch(/draw/)
    expect(corner.moves).toEqual([])

    const trap = inspect(place("f7", "g6", "h8", 1))
    expect(trap.outcome).toMatch(/draw/)

    const ahead = inspect(place("a1", "a2", "a8", 0))
    expect(ahead.legal).toBe(true)
    expect(ahead.whiteWins).toBe(false)

    const key = inspect(place("e6", "e5", "a8", 0))
    expect(key.whiteWins).toBe(true)
    expect(key.outcome).toMatch(/Mate in/)
    expect(key.moves.some((move) => move.perfect)).toBe(true)

    const touching = inspect(place("e4", "e2", "e5", 0))
    expect(touching.legal).toBe(false)
    expect(touching.reason).toMatch(/touching/)

    const measured = report()
    expect(measured.ruleMiss).not.toBeNull()
    expect(measured.ruleAgreed).toBeLessThan(measured.legal)
    expect(measured.ruleAgreed).toBeGreaterThan(measured.legal * 0.2)
    expect(measured.scorerAgreed).toBeGreaterThan(measured.legal * 0.5)
    expect(measured.maxPawnMoves).toBe(28)
  }, 120_000)
})

describe("the backward step", () => {
  it("matches a finite difference on the logistic loss", () => {
    const weights = [0.2, -0.4, 0.7]
    const row = [1, 0.5, -1]
    const { gradient } = backward(weights, row, 1)
    for (let index = 0; index < weights.length; index += 1) {
      const step = 1e-5
      const plus = weights.slice()
      const minus = weights.slice()
      plus[index] += step
      minus[index] -= step
      const lossAt = (candidate: number[]) => {
        const predicted = Math.min(1 - 1e-12, Math.max(1e-12, sigmoid(dot(candidate, row))))
        return -Math.log(predicted)
      }
      const numeric = (lossAt(plus) - lossAt(minus)) / (2 * step)
      expect(numeric).toBeCloseTo(gradient[index], 4)
    }
  })
})
