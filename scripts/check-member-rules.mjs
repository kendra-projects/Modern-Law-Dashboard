// Self-check for who may manage whom: node scripts/check-member-rules.mjs
import assert from "node:assert/strict"
import { canManageRole, canRemove, isMainLogin, managedTeams, validEmail } from "../src/lib/member-rules.ts"

const [admin, content, intake] = ["admin@modernlaw.app", "content@modernlaw.app", "intake@modernlaw.app"]
const erick = { email: "erick@mymodernlaw.com", role: "content" }
const harsha = { email: "harsha@mymodernlaw.com", role: "intake" }

assert.deepEqual(managedTeams(admin), ["content", "intake"])
assert.deepEqual(managedTeams("ADMIN@modernlaw.app "), ["content", "intake"], "email case and spaces don't matter")
assert.equal(isMainLogin(erick.email), false, "someone invited is not a main login")
assert.deepEqual(managedTeams(erick.email), [], "and manages no team")
assert.deepEqual(managedTeams(null), [])

assert.equal(canManageRole(admin, "content"), true)
assert.equal(canManageRole(admin, "intake"), true)
assert.equal(canManageRole(admin, "admin"), true)
assert.equal(canManageRole(content, "content"), true)
assert.equal(canManageRole(content, "intake"), false, "content can't touch intake")
assert.equal(canManageRole(content, "admin"), false)
assert.equal(canManageRole(intake, "content"), false, "intake can't touch content")
assert.equal(canManageRole(erick.email, "content"), false, "a member can't manage their own team")

assert.equal(canRemove(admin, erick), true)
assert.equal(canRemove(admin, harsha), true)
assert.equal(canRemove(content, erick), true)
assert.equal(canRemove(content, harsha), false)
assert.equal(canRemove(intake, harsha), true)
assert.equal(canRemove(erick.email, erick), false)
assert.equal(canRemove(admin, { email: content, role: "content" }), false, "main logins can't be removed")
assert.equal(canRemove(admin, { email: admin, role: "admin" }), false, "nor can the admin remove itself")

assert.equal(validEmail("a.b@mymodernlaw.com"), true)
for (const bad of ["", "a", "a@b", "a b@c.com", 'a"@c.com']) assert.equal(validEmail(bad), false, bad)

console.log("member rules ok")
