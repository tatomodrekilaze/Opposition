// a1 is 0. Files run left to right, ranks run up, the way I draw the board.
// A king touches another square when the longer of the two gaps is 1. That is chebyshev.

const FILES = "abcdefgh"

export function file(square: number): number {
  return square & 7
}

export function rank(square: number): number {
  return square >> 3
}

export function square(fileIndex: number, rankIndex: number): number {
  return rankIndex * 8 + fileIndex
}

export function squareName(index: number): string {
  return `${FILES[file(index)]}${rank(index) + 1}`
}

export function parseSquare(text: string): number | null {
  if (!/^[a-h][1-8]$/.test(text)) return null
  return square(FILES.indexOf(text[0]), Number(text[1]) - 1)
}

export function chebyshev(a: number, b: number): number {
  return Math.max(Math.abs(file(a) - file(b)), Math.abs(rank(a) - rank(b)))
}

export const KING_STEPS: number[][] = Array.from({ length: 64 }, (_, from) => {
  const steps: number[] = []
  for (let df = -1; df <= 1; df += 1) {
    for (let dr = -1; dr <= 1; dr += 1) {
      if (df === 0 && dr === 0) continue
      const nextFile = file(from) + df
      const nextRank = rank(from) + dr
      if (nextFile >= 0 && nextFile < 8 && nextRank >= 0 && nextRank < 8) steps.push(square(nextFile, nextRank))
    }
  }
  return steps
})

export const KNIGHT_STEPS: number[][] = Array.from({ length: 64 }, (_, from) => {
  const steps: number[] = []
  for (const [df, dr] of [
    [1, 2],
    [2, 1],
    [-1, 2],
    [-2, 1],
    [1, -2],
    [2, -1],
    [-1, -2],
    [-2, -1],
  ]) {
    const nextFile = file(from) + df
    const nextRank = rank(from) + dr
    if (nextFile >= 0 && nextFile < 8 && nextRank >= 0 && nextRank < 8) steps.push(square(nextFile, nextRank))
  }
  return steps
})

const QUEEN_DIRS: Array<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

const ROOK_DIRS = QUEEN_DIRS.slice(0, 4)
const BISHOP_DIRS = QUEEN_DIRS.slice(4)

export function slide(from: number, directions: Array<[number, number]>, blocked: (square: number) => boolean): number[] {
  const landed: number[] = []
  for (const [df, dr] of directions) {
    let nextFile = file(from) + df
    let nextRank = rank(from) + dr
    while (nextFile >= 0 && nextFile < 8 && nextRank >= 0 && nextRank < 8) {
      const next = square(nextFile, nextRank)
      if (blocked(next)) break
      landed.push(next)
      nextFile += df
      nextRank += dr
    }
  }
  return landed
}

export function queenMoves(from: number, blocked: (square: number) => boolean): number[] {
  return slide(from, QUEEN_DIRS, blocked)
}

export function rookMoves(from: number, blocked: (square: number) => boolean): number[] {
  return slide(from, ROOK_DIRS, blocked)
}

export function bishopAttacks(from: number, target: number, blocker: number): boolean {
  return slide(from, BISHOP_DIRS, (square) => square === blocker).includes(target)
}

export function queenAttacks(from: number, target: number, blocker: number): boolean {
  return queenMoves(from, (square) => square === blocker).includes(target)
}

export function pawnAttacks(pawn: number): number[] {
  const attacks: number[] = []
  const nextRank = rank(pawn) + 1
  if (nextRank > 7) return attacks
  for (const df of [-1, 1]) {
    const nextFile = file(pawn) + df
    if (nextFile >= 0 && nextFile < 8) attacks.push(square(nextFile, nextRank))
  }
  return attacks
}

export const PAWN_SQUARES: number[] = []
for (let rankIndex = 1; rankIndex <= 6; rankIndex += 1) {
  for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) PAWN_SQUARES.push(square(fileIndex, rankIndex))
}

export function pawnIndex(pawn: number): number {
  return (rank(pawn) - 1) * 8 + file(pawn)
}

export function pawnFromIndex(index: number): number {
  return PAWN_SQUARES[index]
}
