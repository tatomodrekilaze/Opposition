// I start from checkmate and walk backward.
// A win is a positive number of plies. A loss is -1 minus the plies, so mate on the board is -1.
// A draw is 0. Anything I have not labeled yet is a big sentinel.
// Only White has a pawn, so only White can force this.

import {
  KING_STEPS,
  KNIGHT_STEPS,
  bishopAttacks,
  chebyshev,
  pawnAttacks,
  pawnFromIndex,
  pawnIndex,
  queenAttacks,
  queenMoves,
  rookMoves,
  squareName,
} from "./squares"

export const UNKNOWN = 32767
export const DRAW = 0

const PLAY = 0
const MATE = 1
const STALEMATE = 2
const ILLEGAL = 3

export function loss(plies: number): number {
  return -1 - plies
}

export function isWin(value: number): boolean {
  return value > 0 && value < UNKNOWN
}

export function isLoss(value: number): boolean {
  return value < 0
}

export function lossPlies(value: number): number {
  return -value - 1
}

export function mateMovesFromWinPlies(plies: number): number {
  return (plies + 1) / 2
}

export function mateMovesFromLossPlies(plies: number): number {
  return plies / 2
}

const DEST_DRAW = 0

function tagged(table: number, index: number): number {
  return (table << 21) | index
}

function tag(dest: number): number {
  return dest >>> 21
}

function payload(dest: number): number {
  return dest & ((1 << 21) - 1)
}

export const KQK_COUNT = 2 * 64 * 64 * 64
export const KPK_COUNT = 2 * 48 * 64 * 64

export function kqkIndex(side: number, piece: number, whiteKing: number, blackKing: number): number {
  return (((side * 64 + piece) * 64 + whiteKing) * 64 + blackKing)
}

export function kpkIndex(side: number, pawn: number, whiteKing: number, blackKing: number): number {
  return (((side * 48 + pawnIndex(pawn)) * 64 + whiteKing) * 64 + blackKing)
}

export type Place = {
  whiteKing: number
  blackKing: number
  pawn: number
  side: 0 | 1
}

export type MoveView = {
  label: string
  note: string
  perfect: boolean
}

export type Look = {
  legal: boolean
  reason: string
  outcome: string
  moves: MoveView[]
  board: string
  whiteWins: boolean
}

type Packed = {
  off: Int32Array
  dest: Int32Array
  value: Int16Array
}

export type Built = {
  kqk: Packed
  krk: Packed
  kpk: Packed
  maxQueenMoves: number
  maxRookMoves: number
  maxPawnMoves: number
  legalPawn: number
  pawnWins: number
  pawnDraws: number
  minorMates: number
}

let cache: Built | null = null

export function built(): Built {
  if (!cache) cache = build()
  return cache
}

export function build(): Built {
  const queen = solveSlider(true)
  const rook = solveSlider(false)
  const pawn = solvePawn(queen, rook)
  let pawnWins = 0
  let pawnDraws = 0
  let legalPawn = 0
  for (let index = 0; index < KPK_COUNT; index += 1) {
    const value = pawn.value[index]
    if (value === UNKNOWN) continue
    legalPawn += 1
    const place = decodeKpk(index)
    if (place && whiteIsWinning(place, value)) pawnWins += 1
    else pawnDraws += 1
  }
  return {
    kqk: queen,
    krk: rook,
    kpk: pawn,
    maxQueenMoves: maxMateMoves(queen),
    maxRookMoves: maxMateMoves(rook),
    maxPawnMoves: maxMateMoves(pawn),
    legalPawn,
    pawnWins,
    pawnDraws,
    minorMates: countMinorMates(pawn),
  }
}

function maxMateMoves(packed: Packed): number {
  let best = 0
  for (const value of packed.value) {
    if (!isWin(value)) continue
    const moves = mateMovesFromWinPlies(value)
    if (moves > best) best = moves
  }
  return best
}

function countMinorMates(packed: Packed): number {
  let total = 0
  for (const dest of packed.dest) {
    const kind = tag(dest)
    if ((kind === 4 || kind === 5) && payload(dest) === 0) total += 1
  }
  return total
}

function solveSlider(queen: boolean): Packed {
  const terminal = new Uint8Array(KQK_COUNT)
  const dest: number[] = []
  const off = new Int32Array(KQK_COUNT + 1)
  for (let index = 0; index < KQK_COUNT; index += 1) {
    off[index] = dest.length
    const decoded = decodeSlider(index)
    const kind = sliderTerminal(decoded, queen)
    terminal[index] = kind
    if (kind === PLAY) sliderMoves(decoded, queen, (next) => dest.push(next))
  }
  off[KQK_COUNT] = dest.length
  const packed = { off, dest: Int32Array.from(dest), value: new Int16Array(KQK_COUNT) }
  solve(packed, terminal, (next, own) => (next === DEST_DRAW ? DRAW : own[payload(next)]))
  return packed
}

function solvePawn(queen: Packed, rook: Packed): Packed {
  const terminal = new Uint8Array(KPK_COUNT)
  const dest: number[] = []
  const off = new Int32Array(KPK_COUNT + 1)
  for (let index = 0; index < KPK_COUNT; index += 1) {
    off[index] = dest.length
    const place = decodeKpk(index)
    const kind = place ? pawnTerminal(place) : ILLEGAL
    terminal[index] = kind
    if (kind === PLAY && place) pawnMoves(place, (next) => dest.push(next))
  }
  off[KPK_COUNT] = dest.length
  const packed = { off, dest: Int32Array.from(dest), value: new Int16Array(KPK_COUNT) }
  solve(packed, terminal, (next, own) => readDest(next, own, queen.value, rook.value))
  return packed
}

// Distance 0 is already mated.
// If one move lands in a loss of that distance, this position is a win one ply sooner.
// If every move is a win for the other side, this is a loss. I keep their slowest remaining win,
// because they will pick the fast one. Whatever is still blank, and legal, is a draw.
function solve(packed: { off: Int32Array; dest: Int32Array; value: Int16Array }, terminal: Uint8Array, read: (dest: number, own: Int16Array) => number) {
  const count = terminal.length
  const value = packed.value
  value.fill(UNKNOWN)
  for (let index = 0; index < count; index += 1) {
    if (terminal[index] === MATE) value[index] = loss(0)
    else if (terminal[index] === STALEMATE) value[index] = DRAW
  }
  for (let distance = 0; distance < 96; distance += 1) {
    let added = 0
    for (let index = 0; index < count; index += 1) {
      if (value[index] !== UNKNOWN) continue
      let found = false
      for (let cursor = packed.off[index]; cursor < packed.off[index + 1]; cursor += 1) {
        const next = read(packed.dest[cursor], value)
        if (isLoss(next) && lossPlies(next) === distance) {
          found = true
          break
        }
      }
      if (found) {
        value[index] = distance + 1
        added += 1
      }
    }
    for (let index = 0; index < count; index += 1) {
      if (value[index] !== UNKNOWN) continue
      if (packed.off[index] === packed.off[index + 1]) continue
      let maxWin = -1
      let forced = true
      for (let cursor = packed.off[index]; cursor < packed.off[index + 1]; cursor += 1) {
        const next = read(packed.dest[cursor], value)
        if (!isWin(next)) {
          forced = false
          break
        }
        if (next > maxWin) maxWin = next
      }
      if (forced && maxWin === distance) {
        value[index] = loss(distance + 1)
        added += 1
      }
    }
    if (added === 0) break
  }
  for (let index = 0; index < count; index += 1) {
    if (terminal[index] !== ILLEGAL && value[index] === UNKNOWN) value[index] = DRAW
  }
}

function readDest(dest: number, own: Int16Array, queen: Int16Array, rook: Int16Array): number {
  if (dest === DEST_DRAW) return DRAW
  const kind = tag(dest)
  const index = payload(dest)
  if (kind === 1) return queen[index]
  if (kind === 2) return rook[index]
  if (kind === 3) return own[index]
  return index === 0 ? loss(0) : DRAW
}

function decodeSlider(index: number): { side: number; piece: number; whiteKing: number; blackKing: number } {
  const blackKing = index % 64
  const rest = Math.floor(index / 64)
  const whiteKing = rest % 64
  const restPiece = Math.floor(rest / 64)
  return { side: Math.floor(restPiece / 64), piece: restPiece % 64, whiteKing, blackKing }
}

export function decodeKpk(index: number): Place {
  const blackKing = index % 64
  const rest = Math.floor(index / 64)
  const whiteKing = rest % 64
  const restPawn = Math.floor(rest / 64)
  return {
    whiteKing,
    blackKing,
    pawn: pawnFromIndex(restPawn % 48),
    side: Math.floor(restPawn / 48) as 0 | 1,
  }
}

function sliderTerminal(decoded: { side: number; piece: number; whiteKing: number; blackKing: number }, queen: boolean): number {
  const { side, piece, whiteKing, blackKing } = decoded
  if (whiteKing === blackKing || whiteKing === piece || blackKing === piece) return ILLEGAL
  if (chebyshev(whiteKing, blackKing) <= 1) return ILLEGAL
  const checks = queen ? queenAttacks(piece, blackKing, whiteKing) : rookAttacks(piece, blackKing, whiteKing)
  if (side === 0 && checks) return ILLEGAL
  let moves = 0
  sliderMoves(decoded, queen, () => {
    moves += 1
  })
  if (moves > 0) return PLAY
  if (side === 1 && checks) return MATE
  return STALEMATE
}

function rookAttacks(from: number, target: number, blocker: number): boolean {
  return rookMoves(from, (square) => square === blocker).includes(target)
}

function sliderMoves(
  decoded: { side: number; piece: number; whiteKing: number; blackKing: number },
  queen: boolean,
  push: (dest: number) => void,
) {
  const { side, piece, whiteKing, blackKing } = decoded
  const slides = queen ? queenMoves : rookMoves
  const table = queen ? 1 : 2
  if (side === 0) {
    for (const next of KING_STEPS[whiteKing]) {
      if (next === piece || next === blackKing || chebyshev(next, blackKing) <= 1) continue
      push(tagged(table, kqkIndex(1, piece, next, blackKing)))
    }
    for (const next of slides(piece, (square) => square === whiteKing || square === blackKing)) {
      push(tagged(table, kqkIndex(1, next, whiteKing, blackKing)))
    }
    return
  }
  for (const next of KING_STEPS[blackKing]) {
    if (next === whiteKing || chebyshev(next, whiteKing) <= 1) continue
    if (next === piece) {
      if (chebyshev(piece, whiteKing) > 1) push(DEST_DRAW)
      continue
    }
    const attacked = queen ? queenAttacks(piece, next, whiteKing) : rookAttacks(piece, next, whiteKing)
    if (!attacked) push(tagged(table, kqkIndex(0, piece, whiteKing, next)))
  }
}

// Kings never stand next to each other. The side that is not moving would already be in check.
// White to move while the pawn already checks Black is the same kind of position. It cannot happen.
function pawnTerminal(place: Place): number {
  const { side, pawn, whiteKing, blackKing } = place
  if (whiteKing === blackKing || whiteKing === pawn || blackKing === pawn) return ILLEGAL
  if (chebyshev(whiteKing, blackKing) <= 1) return ILLEGAL
  if (side === 0 && pawnAttacks(pawn).includes(blackKing)) return ILLEGAL
  let moves = 0
  pawnMoves(place, () => {
    moves += 1
  })
  if (moves > 0) return PLAY
  if (side === 1 && pawnAttacks(pawn).includes(blackKing)) return MATE
  return STALEMATE
}

// I never let a piece capture the king.
// If Black takes a pawn the white king does not defend, both sides are left with a bare king. That is a draw.
function pawnMoves(place: Place, push: (dest: number) => void) {
  const { side, pawn, whiteKing, blackKing } = place
  if (side === 0) {
    for (const next of KING_STEPS[whiteKing]) {
      if (next === pawn || next === blackKing || chebyshev(next, blackKing) <= 1) continue
      push(tagged(3, kpkIndex(1, pawn, next, blackKing)))
    }
    const forward = pawn + 8
    if (forward >= 64 || forward === whiteKing || forward === blackKing) return
    if ((pawn >> 3) === 6) promote(whiteKing, blackKing, forward, push)
    else {
      push(tagged(3, kpkIndex(1, forward, whiteKing, blackKing)))
      if ((pawn >> 3) === 1) {
        const skip = pawn + 16
        if (skip !== whiteKing && skip !== blackKing) push(tagged(3, kpkIndex(1, skip, whiteKing, blackKing)))
      }
    }
    return
  }
  for (const next of KING_STEPS[blackKing]) {
    if (next === whiteKing || chebyshev(next, whiteKing) <= 1) continue
    if (next === pawn) {
      if (chebyshev(pawn, whiteKing) > 1) push(DEST_DRAW)
      continue
    }
    if (!pawnAttacks(pawn).includes(next)) push(tagged(3, kpkIndex(0, pawn, whiteKing, next)))
  }
}

// Queen and rook promotions jump into tables I already finished.
// A bishop or a knight cannot force mate on its own, so I only keep those when the promotion move itself is mate.
function promote(whiteKing: number, blackKing: number, piece: number, push: (dest: number) => void) {
  push(tagged(1, kqkIndex(1, piece, whiteKing, blackKing)))
  push(tagged(2, kqkIndex(1, piece, whiteKing, blackKing)))
  push(tagged(4, minorIsMate(whiteKing, blackKing, piece, true) ? 0 : 1))
  push(tagged(5, minorIsMate(whiteKing, blackKing, piece, false) ? 0 : 1))
}

function minorIsMate(whiteKing: number, blackKing: number, piece: number, bishop: boolean): boolean {
  const attacks = (target: number) =>
    chebyshev(target, whiteKing) <= 1 || (bishop ? bishopAttacks(piece, target, whiteKing) : KNIGHT_STEPS[piece].includes(target))
  if (!attacks(blackKing)) return false
  for (const next of KING_STEPS[blackKing]) {
    if (next === whiteKing) continue
    if (next === piece) {
      if (chebyshev(piece, whiteKing) > 1) return false
      continue
    }
    if (!attacks(next)) return false
  }
  return true
}

export function whiteIsWinning(place: Place, value: number): boolean {
  if (value === UNKNOWN || value === DRAW) return false
  if (place.side === 0) return isWin(value)
  return isLoss(value)
}

function whiteMate(side: number, value: number): number | null {
  if (value === DRAW || value === UNKNOWN) return null
  if (side === 0 && isWin(value)) return mateMovesFromWinPlies(value)
  if (side === 1 && isLoss(value)) return lossPlies(value) === 0 ? 0 : mateMovesFromLossPlies(lossPlies(value))
  return null
}

export function outcomeSentence(place: Place, value: number): string {
  const mover = place.side === 0 ? "White" : "Black"
  if (value === DRAW) return `${mover} to move. Neither side can force mate. This is a draw.`
  if (place.side === 0 && isWin(value)) return `White to move. The pawn wins. Mate in ${mateMovesFromWinPlies(value)}.`
  if (place.side === 1 && isLoss(value)) {
    if (lossPlies(value) === 0) return "Black to move, and it is already mate."
    return `Black to move. The pawn still wins. Mate in ${mateMovesFromLossPlies(lossPlies(value))}.`
  }
  return `${mover} to move. I don't have a forced mate here.`
}

export function boardText(place: Place): string {
  const lines: string[] = []
  for (let rankIndex = 7; rankIndex >= 0; rankIndex -= 1) {
    let line = `${rankIndex + 1} `
    for (let fileIndex = 0; fileIndex < 8; fileIndex += 1) {
      const index = rankIndex * 8 + fileIndex
      if (index === place.whiteKing) line += "K "
      else if (index === place.blackKing) line += "k "
      else if (index === place.pawn) line += "P "
      else line += ". "
    }
    lines.push(line.trimEnd())
  }
  lines.push("  a b c d e f g h")
  return lines.join("\n")
}

export function inspect(place: Place): Look {
  const tables = built()
  const index = kpkIndex(place.side, place.pawn, place.whiteKing, place.blackKing)
  if (tables.kpk.value[index] === UNKNOWN) {
    return { legal: false, reason: illegalReason(place), outcome: "", moves: [], board: boardText(place), whiteWins: false }
  }
  const value = tables.kpk.value[index]
  const moves: MoveView[] = []
  for (let cursor = tables.kpk.off[index]; cursor < tables.kpk.off[index + 1]; cursor += 1) {
    const dest = tables.kpk.dest[cursor]
    const child = readDest(dest, tables.kpk.value, tables.kqk.value, tables.krk.value)
    moves.push(describeMove(place, value, dest, child))
  }
  moves.sort((a, b) => Number(b.perfect) - Number(a.perfect) || a.label.localeCompare(b.label))
  return {
    legal: true,
    reason: "",
    outcome: outcomeSentence(place, value),
    moves,
    board: boardText(place),
    whiteWins: whiteIsWinning(place, value),
  }
}

function illegalReason(place: Place): string {
  if (place.whiteKing === place.blackKing) return "Both kings are on the same square. That position can't happen."
  if (place.whiteKing === place.pawn || place.blackKing === place.pawn) return "The pawn is standing on a king. That position can't happen."
  if (chebyshev(place.whiteKing, place.blackKing) <= 1) return "The kings are touching. That position can't happen."
  if (place.side === 0 && pawnAttacks(place.pawn).includes(place.blackKing)) {
    return "Black is already in check, and it is White's turn. That position can't happen."
  }
  return "That position can't happen."
}

function describeMove(place: Place, parent: number, dest: number, child: number): MoveView {
  const label = moveLabel(place, dest)
  const childSide = (place.side === 0 ? 1 : 0) as 0 | 1
  const parentMate = whiteMate(place.side, parent)
  const childMate = whiteMate(childSide, child)
  if (parent === DRAW) {
    if (child === DRAW) return { label, note: "Still a draw.", perfect: true }
    if (childMate !== null) return { label, note: `That loses. Mate in ${Math.max(childMate, 1)}.`, perfect: false }
    return { label, note: "Still a draw.", perfect: true }
  }
  if (childMate === 0) return { label, note: "That is mate.", perfect: true }
  if (child === DRAW) return { label, note: "That gives the win away. Draw.", perfect: false }
  if (parentMate !== null && childMate !== null) {
    const target = place.side === 0 ? parentMate - 1 : parentMate
    if (childMate <= target) return { label, note: `Mate in ${childMate} from here. That keeps the shortest win.`, perfect: true }
    return { label, note: `Mate in ${childMate} from here. Slower.`, perfect: false }
  }
  return { label, note: "Played.", perfect: false }
}

function moveLabel(place: Place, dest: number): string {
  if (dest === DEST_DRAW) {
    if (place.side === 1 && chebyshev(place.blackKing, place.pawn) <= 1) return "King takes the pawn"
    return "King steps aside"
  }
  const kind = tag(dest)
  if (kind === 4) return `Pawn to ${squareName(place.pawn + 8)} and becomes a bishop`
  if (kind === 5) return `Pawn to ${squareName(place.pawn + 8)} and becomes a knight`
  if (kind === 1 || kind === 2) {
    const piece = decodeSlider(payload(dest)).piece
    return `Pawn to ${squareName(piece)} and becomes a ${kind === 1 ? "queen" : "rook"}`
  }
  const next = decodeKpk(payload(dest))
  if (next.whiteKing !== place.whiteKing) return `King to ${squareName(next.whiteKing)}`
  if (next.blackKing !== place.blackKing) return `King to ${squareName(next.blackKing)}`
  return `Pawn to ${squareName(next.pawn)}`
}

export function eachLegalPawn(visit: (place: Place, value: number) => void) {
  const values = built().kpk.value
  for (let index = 0; index < KPK_COUNT; index += 1) {
    const value = values[index]
    if (value === UNKNOWN) continue
    visit(decodeKpk(index), value)
  }
}
