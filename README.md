# MetaMatch

MetaMatch is a personal, explainable game recommender. Instead of treating genres or raw playtime as taste, it models *why* a game works: movement depth, mechanical execution, build authorship, discovery, challenge retention, social flexibility, and the failure modes that can make a strong build stop being fun.

The app is static and runs entirely in the browser. Ratings and learned preferences remain on the current device in IndexedDB. JSON export and import provide portable backups without an account or external server.

## What the first release does

- Ranks candidate games against a natural-language current craving
- Explains the strongest signals, risks, confidence, and relevant model anchors
- Keeps permanent taste separate from temporary intent
- Stores loved, liked, mixed, abandoned, bounced, disliked, and candidate games
- Lets every feature rating and written rationale be corrected in the WebUI
- Learns preference weights from pairwise choices
- Imports and exports the complete model as JSON
- Deploys to GitHub Pages after tests pass

## Run locally

Requires Node.js 24 or newer.

```bash
npm install
npm run dev
```

Run the model tests and create a production build:

```bash
npm test
npm run build
```

## Publish with GitHub Pages

The included workflow builds and publishes on every push to `main`.

1. Open **Settings → Pages** in the repository.
2. Set **Source** to **GitHub Actions**.
3. Open `https://vorith03.github.io/MetaMatch/` after the workflow finishes.

GitHub Pages sites are public even when a personal repository is private. Pages from a private repository also require a GitHub plan that supports them.

## How scoring works

The transparent baseline combines:

1. permanent feature weights learned from past experiences;
2. temporary boosts inferred from the current craving;
3. interaction bonuses for movement × execution, authorship × retained challenge, and systems × discovery;
4. penalties for prescriptiveness, automation collapse, and grind friction; and
5. a confidence adjustment that pulls uncertain assessments toward neutral.

Pairwise answers apply small bounded weight updates. The model never rewrites game ratings or rationales, so every recommendation remains inspectable and correctable.

## Data ownership

No analytics, account, cookie, API key, or remote database is used. Export a backup before clearing browser storage or moving to another device.
