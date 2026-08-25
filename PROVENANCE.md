# Provenance

How authorship of this work is evidenced, and what to do when you build more.

**Owner:** Indie Movement Art Project (iMAP) — economic rights, s.17(c) Copyright Act 1957.
**Author:** Prashant Nair — moral rights, s.57. See [LICENSE](LICENSE) and [AUTHORS.md](AUTHORS.md).

Copyright exists automatically the moment something is written. None of the
below creates the right — it makes the right *provable* if anyone disputes it.

---

## What is in place

**1. Signed commits.** Every commit from 25 August 2026 is signed with an
ed25519 key held only by Prashant Nair. A signature cannot be produced by
someone who merely copies the repository.

```bash
git log --show-signature -1        # G = good signature
git log --format='%h %G? %an' -10  # signature status across recent history
```

**2. A real author identity.** Commits are authored as
`Prashant Nair <vibesconnect96@gmail.com>`. Earlier history is split between the
studio account and `apple@Prashants-MacBook-Pro.local`, a machine hostname
belonging to nobody — those older commits are weak evidence and cannot be
retroactively signed without rewriting published history, which we do not do.

**3. Copyright headers on every source file**, kept correct by
`scripts/stamp-copyright.py`. Run it after adding files; `--check` fails if
anything is missing one.

**4. Hash manifests, timestamped into Bitcoin.** `provenance/<tag>.manifest.txt`
lists the SHA-256 of every tracked file at a release. The matching `.ots` file
proves that manifest existed by a given date. Git dates can be forged by anyone
with a text editor; a Bitcoin block cannot be backdated by anyone.

---

## Cutting a release

```bash
./scripts/release.sh v1.1 "what changed"
git push && git push origin v1.1
```

That hashes every tracked file, timestamps the manifest, and cuts a signed tag.

An OpenTimestamps proof is **incomplete when created** — it becomes final once
the next Bitcoin block is mined. Come back a few hours later and run:

```bash
/Library/Frameworks/Python.framework/Versions/3.14/bin/ots upgrade provenance/v1.1.manifest.txt.ots
/Library/Frameworks/Python.framework/Versions/3.14/bin/ots verify provenance/v1.1.manifest.txt.ots
```

Commit the upgraded `.ots`. Until upgraded it still proves the calendar saw the
hash, but the Bitcoin anchor is the part that needs no trusted third party.

---

## If someone copies the work

1. **Screenshot and archive it immediately**, including the URL and date. Push
   the page through `web.archive.org` so there is a third-party record.
2. **Compare against a manifest.** If their files hash to entries in
   `provenance/*.manifest.txt`, that is a byte-identical copy, not a coincidence.
3. **Verify your own priority**: `ots verify` establishes your date, the signed
   tag establishes who cut it, GitHub's push record corroborates both.
4. **Send a takedown.** Most hosts and GitHub act on a straightforward DMCA-style
   notice. Start there before anything more formal.
5. Only then consider a lawyer. Steps 1–4 cost nothing and resolve most cases.

Remember what is and is not protected: **the code is protected, the idea is
not.** Somebody may legally build their own count-in generator. They may not
take these files.

---

## Registering with the Copyright Office (optional)

Registration is not required — it is evidential. Worth doing for the two
original tools, not for the website.

- **Count Me In** — beat detection, waveform editing, count-in synthesis, export
- **Sync Studio** — tempo detection, pitch-preserving time-stretch, multi-track sync

For each you will need: the source listing, a statement of authorship naming
Prashant Nair as author and iMAP as owner, a no-objection certificate from iMAP
as employer, and the applicable fee. Filing is online at copyright.gov.in under
"literary work — computer software". Check the current fee schedule and forms
before filing; they change.

`./scripts/release.sh` output is the source listing — the manifest names every
file and its hash at that point in time.

---

## Keep the mess

Originality disputes are frequently settled by the working record, not the
finished artefact. Drafts, dead ends, design notes and conversation logs are
worth keeping — nobody who copied the result has the path that led to it.
