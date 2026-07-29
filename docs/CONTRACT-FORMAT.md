# Contract format — read this before touching a contract

Written after four separate renderers were found to be parsing the same field
in two different formats, three of them broken, one of them the signed legal
document a client downloads. None of that was hard to fix. It was hard to
*find*, and it kept coming back because the shape was re-derived from scratch
each time instead of written down once.

## The body is HTML

`contracts.body` stores **HTML**, built server-side by `buildContractBody()`
in `backend/src/routes/contracts.js`. It is not plain text, and it has not
been since the format change. Anything doing `body.split('[INITIAL]')` is
running pre-change code and is broken.

Everything user-typed is escaped on the way in — a client's name, a vendor's
clause wording. A contract is the last document a stray `<` should break.

## Who reads it — ALL FOUR

| Where | File | Renders via |
|---|---|---|
| Client portal (the link you send) | `pages/ClientPortal.jsx` | `dangerouslySetInnerHTML` + `useContractInitials` |
| Vendor preview | `pages/SignContract.jsx` | `dangerouslySetInnerHTML` + `useContractInitials` |
| Template editor preview | `pages/VendorPanel.jsx` | its own approximation — see below |
| Signed download | `routes/contracts.js` `/download/:token` | server-rendered HTML page |

Before changing the format, run `iwopo-consumers ct-init-tap` and check every
file it lists. The editor preview is a deliberate exception: it previews
unsaved wording with no lead attached, so it cannot call the builder. It
approximates the same HTML and shows generated blocks as
"— {{block}} fills in from the booking —" rather than rendering nothing.

## Classes

Generated server-side, styled in `pages/inquiry.css`, and **also** embedded in
`DOC_CSS` in `contracts.js` for the download — a downloaded contract that
looks unlike the signed one is, to anyone reading it, a different document.

```
ct-headband ct-hb-logo ct-logo ct-hb-info    header band
ct-doc-title ct-doc-for                       title + "FOR ... on ..."
ct-sec  (h2 ruled, h3 sub)                    one clause
ct-details ct-kv ct-svc                       tables; th shaded #f3f4f6
ct-inc  ct-notinc                             Included green / Not Included grey
ct-incl                                       deliverables list
ct-init ct-init-label ct-init-line            the initials row
ct-init-tap[data-init-idx]                    the tap target itself
```

**Never** put `white-space: pre-wrap` on a container holding this. It was left
on three of them from the plain-text era; against HTML it turns every newline
in the markup into visible blank space.

The panel declares `font-size`/`letter-spacing`/`text-transform` on a bare `th`
selector for its own tables. An inherited value loses to any rule targeting the
element directly, specificity aside — so the contract's `th` must restate all
three or the admin styling leaks in.

## Placeholders vs blocks

- **Placeholders** — `{{client_name}}`, `{{total_cost}}` — substituted inline.
- **Blocks** — `{{booking_details}}`, `{{coverage_schedule}}`, `{{deliverables}}`,
  `{{services_summary}}`, `{{crew}}` — a section whose *entire* text is one
  block token is replaced by a generated table. Never mixed with prose, so
  there is one rule for which path a section takes.

A block with nothing to show removes its own heading, so a contract never
carries an empty section.

`{{balance}}` on a contract means **total − deposit**, not what is outstanding
today. Nothing is paid when a contract is written; the panel's own balance
would print the full total right after naming the deposit and read as though
both were owed.

## Getting Ready

States **Yes or No explicitly**. An earlier version hid the row when it was No,
on the assumption that "No" reads as something declined. That was never checked
against the reference, which prints it plainly. Checked now.

## Tools

```
iwopo-consumers <symbol>   every file reading a field/class/function
iwopo-verify               build, lint, dead classes, dupe selectors, boot
iwopo-deploy <msg-file>    verify → commit → push → live → parity
iwopo-deploy --check       verify only
```
