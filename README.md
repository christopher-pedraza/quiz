# quiz

A static, multi-subject quiz platform for GitHub Pages. Quizzes live in *any public GitHub folder* (or a local folder
while you author) described by a `manifest.json`; the page URL is the only state needed to open one.

**Status:** complete and tested: core library, UI (hub, practice, exam builder/runner/results, reference drawer, local preview),
schemas, CLI tools and a demo quiz. Read [`docs/DESIGN.md`](docs/DESIGN.md) for the architecture, the manifest/question formats and the URL scheme.

```bash
npm install
npm run dev                                # dev server (slower: unbundled, React dev build, StrictMode)
npm run serve                              # production build + preview: how it will really feel on Pages
npm test                                   # 260+ tests: grading, validation, loading, sampling, sharing, theming, rendering, UI flows
npm run validate -- public/samples/demo    # check a quiz folder exactly as the app will
npm run convert-legacy -- ../neural-networks-pa-practice ./out   # migrate the legacy question bank
npm run schemas                            # regenerate public/schema/*.json after editing src/core/schema/schemas.ts
npm run build
```

Question types: `fill-blank` (text / choice / drag), `code-debug`, `mcq`, `multi-select`, `calculation` (static or
randomized), `ordering`, `matching`, `categorize`, `short-answer`. See `public/samples/demo/` for one of each.

## Using it

* **From GitHub:** put a `manifest.json` (plus question files) in any folder of a public repo, then open
  `https://<you>.github.io/quiz/?repo=owner/repo&path=folder&ref=main`, or paste the folder URL on the start page.
* **While writing:** *Load local folder* on the start page (Chromium reloads automatically when you return to the tab).
  `npm run validate -- <folder>` gives the same diagnostics on the command line.
* **Deploy:** push to `main`; `.github/workflows/deploy.yml` builds and publishes to GitHub Pages (Settings → Pages → Source: GitHub Actions).
