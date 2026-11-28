# DOS AI

A bilingual-ready, responsive AI chat experience with AZIK, the animated robot companion. Built with Next.js, TypeScript, and the Google Gemini API. Chat history stays in the browser; provider credentials are only used by the server.

## Run locally

Requirements: Node.js 20.9 or later and npm.

```bash
npm install
cp .env.example .env.local
# Add your Gemini API key to .env.local
npm run dev
```

Open http://localhost:3000.

## Configure AI (required for live answers)

Create an API key in [Google AI Studio](https://aistudio.google.com/app/apikey), then put it in `.env.local`:

```dotenv
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Google AI Studio offers a free Gemini API tier with model-specific rate and daily limits. Quotas and model availability can change by region and over time; check [official pricing and limits](https://ai.google.dev/gemini-api/docs/pricing) before deployment. No paid service is activated by this project. The server returns a clear setup/rate-limit message if the key is missing or the provider quota is reached; it never substitutes pretend answers.

**Keep `.env.local` private.** It is git-ignored. Never prefix the key with `NEXT_PUBLIC_` or put it in frontend code. For hosting, add it as a server-side environment secret.

## Features

- Gemini-backed responses, with Kazakh, Russian, and English language instructions and automatic language matching.
- Optional image understanding via Gemini vision models (JPEG, PNG, WebP, or GIF; 5 MB maximum).
- Browser-local persistent conversations, rename/delete, timestamps, retry and copy.
- Speech recognition and speech synthesis where the browser supports them.
- Responsive dark space interface and animated, interactive AZIK mascot.
- PWA manifest and service worker for an installable app shell. Chat data remains local to the browser and is not included in the offline cache.

## Checks

```bash
npm run typecheck
npm run build
```

AI responses require a valid `GEMINI_API_KEY`. Speech features depend on browser support and permissions. Image analysis requires an image-capable Gemini model and the same API key.
