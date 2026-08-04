# Working on iwopo

Read this before changing anything. It is the house rules and, more usefully,
the list of things that have already gone wrong here.

iwopo is a multi-tenant SaaS for wedding vendors: leads, bookings, contracts,
galleries with face recognition, a file drive, a website builder, and an AI
assistant. One VPS, two checkouts, two databases.

---

## 1. Where things are

| | live | staging |
|---|---|---|
| domain | iwopo.com | alphabetaone.com |
| folder | `/var/www/iwopo` | `/var/www/iwopo-staging` |
| branch | `main` | `staging` |
| process | `iwopo-api` :3001 | `iwopo-staging-api` :3002 |
| database | `iwopo` | `iwopo_staging` |

**Live is never edited directly.** It only pulls `main`. All work happens on
staging and reaches live through `iwopo-deploy`.

Vendors may also point their own domains here; each gets its own nginx vhost.

---

## 2. How to ship

```
iwopo-deploy <message-file>
```

Runs verify, then commit, push staging, merge main, pull live, build, restart,
parity report. **It refuses to commit if verify fails.** Do not work around
that — fix the thing it found.

`iwopo-verify` on its own runs the build, lint, a diff-sanity check, dead and
duplicate CSS detection, and four guards: admin tokens leaking to a client
page, a bare brand gold, a native browser dialog, and a clean boot.

**Two things `iwopo-deploy` does NOT do. Both have taken live down.**

1. After a **schema change**, run `npx prisma generate` and `pm2 restart` on
   live yourself.
2. After any **`npm ci` or `npm install`** in a backend folder, run
   `npx prisma generate` before restarting. The Prisma client is *generated*
   into `node_modules`, so a clean install deletes it and the API crash-loops
   with *"does not provide an export named PrismaClient"*.

**When checking whether live is healthy, hit an API endpoint — not a page.**
nginx serves the SPA, so every page returns 200 while the API is dead.

---

## 3. Non-negotiables

**Multi-tenancy.** `vendor_id` comes from the JWT, never from a request body.
The only exceptions are super-admin paths, which check the role first, and the
two public lookups that identify a vendor by **Host header** or by a published
slug. A vendor must never be able to name another vendor and be believed.

**Public token routes** (`/api/g`, `/api/portal`, `/api/f`, contract signing)
treat the URL token as the credential. Scope every query by what that token
owns; never trust an id supplied alongside it.

**Filenames** go through `path.basename()`. Ids go through `Number()`. Site
media lives one folder per vendor.

**Password doors get a rate limit.** Login, signup, forgot, reset, album
password, share-link password, chatbot fill. The limiter is in
`backend/src/middleware/rateLimit.js` and keeps counters **in memory**, which
is only correct because both pm2 apps run `instances=1` in fork mode. If that
ever changes, the limiter must move to the database or Redis.

---

## 4. Conventions

**CSS**
- No `!important` except inside `prefers-reduced-motion` blocks, where
  overriding everything is the point. Everywhere else it is standing in for
  specificity — find the rule that is winning and match its depth instead.
- No dead classes and no duplicate selectors. `iwopo-verify` reports both and
  they are currently at zero. Keep them there.
- No inline styles except genuinely data-driven values (a vendor's chosen
  colour, a focal point percentage).
- A rule inside a media query that shares a name with one outside it is a
  responsive override, not a duplicate. Do not merge them.

**JavaScript**
- No `eslint-disable` except where the rule is genuinely wrong — a ref in a
  dependency array, for instance. Two exist in `lib/contractDoc.js` for that
  reason.
- Lint sits at 0 errors and ~28 warnings, all pre-existing. If your change adds
  warnings, you have probably orphaned something — see §5.

**Comments** explain *why*, especially where the code looks odd. If a line is
defending against something that already happened, say what happened. Someone
will otherwise "simplify" it back into a bug.

---

## 4b. If you are working from an editor, without the server

Cursor, a local clone, or anything else that can read the code but not reach
the machine. All of the above still applies, and so does this:

- **You cannot verify anything.** No `iwopo-verify`, no database, no test.
  Report what changed and what still needs checking; do not call a change
  verified, working or safe.
- **You cannot deploy.** Changes sit in the clone until pushed, and still need
  `iwopo-deploy` run on the server. Do not imply a change is live.
- **The person directing you is not a developer** and will not catch a bad
  change by reading the diff. Plain language, and say when you are unsure.
- **Do not reformat**, do not offer to split `VendorPanel.jsx`, and do not add
  dependencies without saying why and what they cost.
- **Flag anything touching `prisma/schema.prisma`** — it needs manual steps on
  the server that you cannot perform.

**Only one party holds the working copy at a time.** Claude works directly on
the staging checkout at `/var/www/iwopo-staging`. If someone is also editing a
local clone, whoever pushes second wins and the other change disappears with no
warning. Agree who has it before starting.

---

## 5. Traps that have already cost time

**Route order.** `router.get('/:slug')` is a catch-all that swallows any later
single-segment GET. `/api/sites/by-host`, `/api/sites/domain` and
`/api/inquiry-settings/my` all had to be moved above one. After adding a route,
check the order.

**`PUT /api/sites/my` silently drops `portfolio`.** It cleans its body against
a list that does not include it, so a caption sent that way is accepted,
discarded, and reported as saved. Portfolio changes go to `PUT /my/portfolio`.

**Deleting UI orphans its handlers.** Removing three sidebar blocks once
orphaned seventeen functions, one of which was the only way to give a picture
block its picture. Re-run lint after deleting anything.

**File-wide regexes are dangerous in `VendorPanel.jsx`.** It is one very large
file with repeated variable names across unrelated components. A sweep for
`const secs =` once deleted one belonging to the contract builder.

**Match raw bytes when replacing strings.** Print `JSON.stringify(slice)` and
match against that, not against whitespace-collapsed output.

**`git ls-files -v backend/prisma/schema.prisma`** — if a schema change does
not reach live, this is why. The file once carried a `skip-worktree` flag, so
git reported it clean while it differed from HEAD.

**Caching.** Hashed assets are `immutable` for a year, `index.html` is
`no-cache`. "I don't see the change" is almost always a stale `index.html`.
Hard reload before investigating.

**Aperture and Noir pin their nav `position: fixed`,** which escapes the
website-builder preview onto the panel's own header.

**`add_header` in an nginx block discards everything inherited from above.**
The security snippet is therefore included at server level *and* inside each
location.

**`dig +short A` prints the CNAME chain before the address.** `head -1` can
return `example.com.` rather than an IP.

---

## 6. Verifying your own work

**Look before measuring, on anything visual.** That an element exists says
nothing about whether it renders correctly. Clipped ribbons, doubled bullets
and invisible tints all measure as present.

**Verify the whole round trip.** A delete that removes the row but leaves the
list query unfiltered looks fixed and is not. A caption that appears on screen
but is dropped by a body cleaner looks saved and is not. Check the database.

**Do not quote numbers from notes.** Count them again.

**Read what was asked for.** A brief about how something looks is not answered
with a list of missing features.

---

## 7. Layout of the code

- `backend/src/routes/` — 23 files, 242 routes
- `backend/src/lib/` — engines and helpers, including `wopoAssistant.js` (the
  chatbot) and `customDomain.js`
- `backend/src/middleware/` — `auth.js`, `rateLimit.js`
- `backend/src/config/paths.js` — every storage path, keyed off `STORAGE_BASE`
- `frontend/src/pages/` — 22 pages; `VendorPanel.jsx` is the vendor app,
  `Dashboard.jsx` the super admin, `PublicSite.jsx` a vendor's website
- `tools/` — the scripts above; `/usr/local/bin` symlinks into the **staging**
  checkout, so editing `tools/` is editing the installed tool

The app routes on `window.location`, not react-router.

Fuller detail, including the security posture and what is still not done, is in
the project handoff document.
