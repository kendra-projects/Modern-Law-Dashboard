// Self-check for the Nov 2026 intake fixes: node scripts/check-intake-fixes.mjs
// Clio's rate-limit wait, Make's calendar answers, Grow's link ids.
import assert from "node:assert/strict"
import { clioHeldBackMessage, clioRetryAfterMs } from "../src/lib/clio-busy.ts"
import { readCalendarAnswer } from "../src/lib/calendar-answer.ts"
import { growMatterGone, isGrowNumber, isGrowUlid, matchGrowUlid, ulidTime, ULID_MATCH_MS } from "../src/lib/grow-ids.ts"

// ── Clio 429 ──
const said = '{"error":{"type":"RateLimited","message":"Rate limit of 50 exceeded. Retry in 16 seconds."}}'
assert.equal(clioRetryAfterMs(null, said), 16_000, "body: Retry in 16 seconds")
assert.equal(clioRetryAfterMs("7", said), 7_000, "the Retry-After header wins")
assert.equal(clioRetryAfterMs("2.5", ""), 2_500)
const now = Date.parse("2026-11-25T10:00:00Z")
assert.equal(clioRetryAfterMs("Wed, 25 Nov 2026 10:00:09 GMT", "", now), 9_000, "Retry-After as a date")
assert.equal(clioRetryAfterMs(null, "Retry in 62 seconds."), 62_000)
assert.equal(clioRetryAfterMs(null, "Not Found"), null)
assert.equal(clioRetryAfterMs("", null), null)
const held = clioHeldBackMessage("GET", "/api/v4/matters/1916692205?fields=id", 15_200)
// auto-intake's busy() and Intake Recovery's readable message key on these.
assert.match(held, /failed \(429\)|rate limit/i)
assert.match(held, /^Clio GET \/api\/v4\/matters\/1916692205 failed \(429\) /)
assert.equal(JSON.parse(held.replace(/^.*?failed \(429\) /, "")).error.message.includes("Retry in 16 seconds"), true)

// ── Make's calendar answers ──
assert.deepEqual(readCalendarAnswer(200, "added"), { result: "added" })
assert.deepEqual(readCalendarAnswer(200, " already\n"), { result: "already" })
assert.deepEqual(readCalendarAnswer(200, "others"), { result: "others" })
assert.deepEqual(readCalendarAnswer(200, "none"), { result: "none" })
for (const [status, text] of [[200, "Accepted"], [500, "Scenario failed to complete."], [200, ""], [502, "added"], [200, "<html>"]]) {
  const r = readCalendarAnswer(status, text)
  assert.equal(r.result, "unconfirmed", `${status} ${text} is not a confirmed answer`)
  assert.match(r.note, new RegExp(`\\(${status} `))
}
assert.equal(readCalendarAnswer(200, "Accepted").note, "Make's calendar scenario didn't confirm it (200 Accepted).")

// ── Grow ids ──
assert.equal(isGrowNumber("72026832"), true)
assert.equal(isGrowNumber("01M3D3YD8B410HXRPC7NJZM9FN"), false)
assert.equal(isGrowUlid("01M3D3YD8B410HXRPC7NJZM9FN"), true)
assert.equal(isGrowUlid("01m3d3yd8b410hxrpc7njzm9fn"), true, "case doesn't matter")
assert.equal(isGrowUlid("72026832"), false)
assert.equal(isGrowUlid("01M3D3YD8B410HXRPC7NJZM9FU"), false, "U isn't Crockford")
assert.equal(isGrowUlid("lindsay-fox-divorce-with-children"), false)
// A ULID's first 10 characters are its time; encode one and read it back.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const encode = (ms) => {
  let s = ""
  for (let i = 0; i < 10; i++) {
    s = CROCKFORD[ms % 32] + s
    ms = Math.floor(ms / 32)
  }
  return s
}
const made = Date.parse("2026-11-23T18:59:04.512Z")
const ulid = `${encode(made)}410HXRPC7NJZM9FN`
assert.equal(isGrowUlid(ulid), true)
assert.equal(ulidTime(ulid), made)
assert.equal(ulidTime("not a ulid"), null)
// The two links staff pasted in Nov 2026 read as matters made in 2026.
for (const pasted of ["01M3D3YD8B410HXRPC7NJZM9FN", "01KYWPYBB67QB3GEKJ7974788B"]) {
  const year = new Date(ulidTime(pasted)).getUTCFullYear()
  assert.equal(year, 2026, `${pasted} reads as ${new Date(ulidTime(pasted)).toISOString()}`)
}

const at = (ms) => new Date(ms).toISOString()
const mine = { id: 72700001, created_at: at(made + 800) }
const other = { id: 72700002, created_at: at(made + 5 * 60_000) }
const someoneElse = { id: 72700003, created_at: at(made + 300) }
assert.equal(matchGrowUlid(ulid, [mine, other, someoneElse], [mine, other])?.id, 72700001, "the client's matter made at the ULID's time")
assert.equal(matchGrowUlid(ulid, [someoneElse], []), null, "another client's matter is never picked by time")
assert.equal(matchGrowUlid(ulid, [other], [other]), null, "five minutes off is not the same matter")
const twin = { id: 72700004, created_at: at(made + ULID_MATCH_MS - 1000) }
assert.equal(matchGrowUlid(ulid, [mine, twin], [mine, twin]), null, "two close matches: nothing guessed")
const carrying = { id: 72700005, created_at: at(made - 10 * 86_400_000), url: `https://grow.clio.com/matters/${ulid}` }
assert.equal(matchGrowUlid(ulid, [carrying, mine], [mine])?.id, 72700005, "a matter whose data carries the ULID wins")

assert.equal(growMatterGone('Clio Grow POST /matters/72026832/notes failed (404) {"error":{"status":"NotFoundError"}}'), true)
assert.equal(growMatterGone('Clio Grow GET /matters/72026832 failed (404) {"error":{}}'), true)
assert.equal(growMatterGone('Clio Grow POST /matters/72026832/notes failed (500) {"error":{}}'), false)
assert.equal(growMatterGone('Clio Grow GET /contacts failed (404) {"error":{}}'), false)
assert.equal(growMatterGone("Clio Grow is not connected"), false)

console.log("intake fixes ok")
