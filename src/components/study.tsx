import { inspect, type Place } from "@/lib/opposition/engine"
import { ruleSaysWin } from "@/lib/opposition/guess"
import { PAWN_SQUARES, parseSquare, squareName } from "@/lib/opposition/squares"
import { placeQuery, report, type Report } from "@/lib/opposition/study"

type Query = Record<string, string | string[] | undefined>

const PRESETS: Array<{ name: string; place: Place }> = [
  { name: "The king is already on a key square", place: at("e6", "e5", "a8", 0) },
  { name: "The corner where Black has no move", place: at("b6", "a7", "a8", 1) },
  { name: "The knight-pawn trap", place: at("f7", "g6", "h8", 1) },
  { name: "A rook pawn, with Black already in front", place: at("a1", "a2", "a8", 0) },
]

export async function Study({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams
  const measured = report()
  const requested = readQuery(query)
  const counted = measured.legal.toLocaleString("en-US")
  const wins = measured.wins.toLocaleString("en-US")
  return (
    <>
      <p>
        I found {counted} positions that can happen. The pawn wins {wins} of them. The longest one takes{" "}
        {measured.maxPawnMoves} moves.
      </p>
      <p>
        If I had been lazy and called every position a win, I would have been right {wins} times. The rule I copied
        from the books was right {measured.ruleAgreed.toLocaleString("en-US")} times, so it did worse than the lazy
        guess. The little sum I taught was right {measured.scorerAgreed.toLocaleString("en-US")} times, so it did
        better.
      </p>
      <p>A few I already know:</p>
      <ul>
        {PRESETS.map((preset) => (
          <li key={preset.name}>
            <a href={placeQuery(preset.place)}>{preset.name}</a>
          </li>
        ))}
        {measured.ruleMiss ? (
          <li>
            <a href={placeQuery(measured.ruleMiss)}>A place the book rule gets wrong</a>
          </li>
        ) : null}
        {measured.scorerMiss ? (
          <li>
            <a href={placeQuery(measured.scorerMiss)}>A place my sum gets wrong</a>
          </li>
        ) : null}
      </ul>
      {requested.problem ? <p>{requested.problem}</p> : null}
      <form method="get">
        <fieldset>
          <legend>Set the pieces</legend>
          <p>
            <label>
              White king <SquareSelect name="wk" value={requested.wk} pawnOnly={false} />
            </label>
            <label>
              Black king <SquareSelect name="bk" value={requested.bk} pawnOnly={false} />
            </label>
            <label>
              Pawn <SquareSelect name="pawn" value={requested.pawn} pawnOnly />
            </label>
            <label>
              Who moves{" "}
              <select name="side" defaultValue={requested.side}>
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
            </label>
          </p>
          <p>
            <button type="submit">Look at this one</button>
          </p>
        </fieldset>
      </form>
      {requested.place ? <Reading place={requested.place} measured={measured} /> : null}
      <h2>The rule I copied</h2>
      <p>
        If two of these are true, I call it a win: the white king is in front of the pawn, the white king has the
        opposition, the white king has reached the sixth rank. Otherwise I call it a draw. I copied that from the
        books. It is wrong often enough that calling everything a win beats it.
      </p>
      <h2>The sum I taught</h2>
      <p>
        I wrote down a few facts about the position. How far the pawn has come, whether it is a rook pawn, those three
        book facts, how far each king is from the pawn and from the promotion square, and whose turn it is. I add them
        up with weights, squash that into a yes-or-no, and walk the error backward to fix the weights. It beat the lazy
        guess. It still misses some.
      </p>
      <h2>What I left out</h2>
      <p>
        No other pieces. The pawn is White&apos;s, and it moves up the board. I left out the fifty-move rule, because
        this ending is over before that matters. When the pawn promotes I already walked king and queen against king,
        and king and rook against king, the same way. A bishop or a knight cannot force mate, so I only notice those
        promotions when the move itself is mate. The queen&apos;s longest win is 10 moves. The rook&apos;s is 16.
      </p>
    </>
  )
}

function Reading({ place, measured }: { place: Place; measured: Report }) {
  const look = inspect(place)
  const rule = ruleSaysWin(place)
  const guess = measured.scorer.saysWin(place)
  return (
    <>
      <h2>This one</h2>
      <pre>{look.board}</pre>
      <p>K is White&apos;s king. k is Black&apos;s king. P is the pawn.</p>
      {look.legal ? (
        <>
          <p>{look.outcome}</p>
          {look.moves.length ? (
            <>
              <p>What can be played:</p>
              <ol>
                {look.moves.map((move) => (
                  <li key={move.label}>
                    {move.label}. {move.note}
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>There is no legal move.</p>
          )}
          <p>{says("The book rule", rule, look.whiteWins)}</p>
          <p>{says("My sum", guess, look.whiteWins)}</p>
        </>
      ) : (
        <p>{look.reason}</p>
      )}
    </>
  )
}

function says(who: string, callsWin: boolean, pawnWins: boolean): string {
  const called = callsWin ? "a win" : "a draw"
  if (callsWin === pawnWins) return `${who} agrees with me. It calls this ${called}.`
  const mine = pawnWins ? "the pawn wins" : "it is a draw"
  return `${who} gets this one wrong. It calls this ${called}. I say ${mine}.`
}

function SquareSelect({ name, value, pawnOnly }: { name: string; value: string; pawnOnly: boolean }) {
  const squares = pawnOnly ? PAWN_SQUARES : Array.from({ length: 64 }, (_, index) => index)
  return (
    <select name={name} defaultValue={value}>
      {squares.map((index) => {
        const label = squareName(index)
        return (
          <option key={label} value={label}>
            {label}
          </option>
        )
      })}
    </select>
  )
}

function at(whiteKing: string, pawn: string, blackKing: string, side: 0 | 1): Place {
  return {
    whiteKing: parseSquare(whiteKing) as number,
    pawn: parseSquare(pawn) as number,
    blackKing: parseSquare(blackKing) as number,
    side,
  }
}

function readQuery(query: Query): {
  wk: string
  bk: string
  pawn: string
  side: string
  place: Place | null
  problem: string | null
} {
  const wk = text(query.wk) ?? "e6"
  const bk = text(query.bk) ?? "a8"
  const pawn = text(query.pawn) ?? "e5"
  const side = text(query.side) === "black" ? "black" : "white"
  const whiteKing = parseSquare(wk)
  const blackKing = parseSquare(bk)
  const pawnSquare = parseSquare(pawn)
  if (whiteKing === null || blackKing === null || pawnSquare === null) {
    return { wk: "e6", bk: "a8", pawn: "e5", side: "white", place: null, problem: "I don't know one of those squares." }
  }
  const pawnRank = pawnSquare >> 3
  if (pawnRank === 0 || pawnRank === 7) {
    return {
      wk,
      bk,
      pawn: "e5",
      side,
      place: null,
      problem: "A pawn doesn't stand on the first rank or the eighth. On the eighth it would already be a piece.",
    }
  }
  return {
    wk,
    bk,
    pawn,
    side,
    place: { whiteKing, blackKing, pawn: pawnSquare, side: side === "black" ? 1 : 0 },
    problem: null,
  }
}

function text(value: string | string[] | undefined): string | undefined {
  const found = Array.isArray(value) ? value[0] : value
  return found && found.length > 0 ? found : undefined
}
