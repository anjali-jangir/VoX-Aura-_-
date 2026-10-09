# 🎙️ VoxAura AI Voice Studio

A premium, fully responsive AI text-to-speech website built with **HTML5, CSS3 and vanilla JavaScript**. Voices come from a 3-tier system — the best available one is used automatically:

1. **Your backend** (`POST /api/tts`) — free voices by default (Edge neural → Google fallback), or ElevenLabs if you configure it.
2. **Browser demo voice** — built-in speech synthesis as the fallback (e.g. on static hosts with no backend).

## Voice providers

| Provider | Cost | Key needed | Quality | Set via |
|---|---|---|---|---|
| `auto` (default) | Free | No | Great (Edge neural, Google fallback) | `TTS_PROVIDER=auto` (or unset) |
| `edge` | Free | No | Great (Edge neural only) | `TTS_PROVIDER=edge` |
| `google` | Free | No | Good | `TTS_PROVIDER=google` |
| `elevenlabs` | Paid credits | Yes | Best, ultra-realistic | `TTS_PROVIDER=elevenlabs` + `ELEVENLABS_API_KEY` |

Each voice in the `VOICES` array (`script.js`) carries all three mappings: `edge` = Edge neural voice name, `gl` = Google language, `id` = ElevenLabs voice ID.

## Files

| File | What it does |
|---|---|
| `index.html` | Page structure: hero, studio, audio player, voice library, setup |
| `style.css` | Futuristic dark UI — violet/purple/cyan gradients, glassmorphism, animations |
| `script.js` | Voice selection, char counter, generation, custom audio player, 3D tilt |
| `server.js` | **Secure backend** — holds your API key server-side, proxies `/api/tts` to ElevenLabs |
| `package.json` | Backend dependencies |
| `.env.example` | Template for your secret config — copy to `.env` and fill in |

## Run locally (2 minutes)

1. **Install and start** (no API key needed — free voices work immediately):
   ```bash
   npm install
   npm start
   ```
2. Open **http://localhost:3000** → type text → pick a voice → **Generate Voice**.

> ⚠️ Don't open `index.html` directly with `file://` for the full experience — some browsers restrict the direct free-voice calls there too. `npm start` is the reliable path.

**Want ElevenLabs premium voices?** Copy `.env.example` to `.env`, set `TTS_PROVIDER=elevenlabs`, paste your key into `ELEVENLABS_API_KEY` (get one at [elevenlabs.io](https://elevenlabs.io) → Profile → API Keys), and make sure the account has credits. The key stays server-side, never in the browser.

## Configure voice IDs

Default voices live in the `VOICES` array at the top of `script.js` (name, gender, description + `edge`/`gl`/`id` mappings). To use your own:

1. For Edge neural voices, pick a name from Microsoft's list (e.g. `en-US-AriaNeural`) — [full list](https://speech.microsoft.com/portal/voicegallery).
2. Replace the `edge:` value (and `gl:` language if you want) in the `VOICES` array.
3. The Female / Male / All tabs filter automatically by the `gender` field.

You can also fetch your account's full voice list through the backend: `GET /api/voices` (key stays server-side).

## How the voice generation works

```
Tier 1: Browser ──POST /api/tts {text, voiceId, edgeVoice, glLang}──▶ server.js ──▶ Edge neural (free, default)
                                                                          ├─▶ Google TTS (auto fallback, free)
                                                                          └─▶ ElevenLabs (if TTS_PROVIDER=elevenlabs,
                                                                              xi-api-key from .env — never in the browser)
Tier 2: Browser built-in speech synthesis (fallback, e.g. static hosts with no backend)
```

The server validates text (non-empty, ≤ 5000 chars) before forwarding. Long texts are split into sentence-aware chunks for the free provider.

## Deploy

- **Render / Railway / Fly.io:** push this folder, set the `ELEVENLABS_API_KEY` environment variable in the dashboard (don't commit `.env`), start command `npm start`.
- **VPS:** `npm install --production`, then run with PM2: `pm2 start server.js --name voxaura`.
- The frontend is static, so it can also live on GitHub Pages / Netlify — but `/api/tts` must point at your deployed backend (update the `fetch("/api/tts")` URL in `script.js` if it's on a different host).

## Extras

- Animated 3D background (perspective starfield + synthwave terrain, pure canvas — no libraries) with mouse parallax. Automatically disabled under `prefers-reduced-motion`.
- Keyboard shortcuts: `Ctrl`/`Cmd` + `Enter` generates audio from the script box, `←`/`→` switch pages.
- The header logo pulses while audio is playing.

## Going live (GitHub Pages / Netlify / Vercel)

Static hosts serve only the frontend — they **cannot run `server.js`**, so `/api/tts` has nothing to answer and generation would fail. Two paths:

**A. Instant demo mode (works right now, free).** On static hosts the site uses your browser's built-in voice — no backend, no key, no cost. A "Demo voice" badge shows in the player. Seek/download are unavailable in demo mode (browser speech can't do those).

**B. Real ElevenLabs quality.** Deploy the backend somewhere that runs Node:
1. Push this folder to GitHub.
2. On [Render](https://render.com) (free tier): New → Web Service → connect your repo. Build command: `npm install`, start command: `npm start`.
3. In Render's dashboard add the environment variable `ELEVENLABS_API_KEY` with your key (never commit `.env`).
4. Copy your service URL (e.g. `https://voxaura-api.onrender.com`) into `API_BASE` at the top of `script.js`, then redeploy the frontend.

⚠️ Remember: the ElevenLabs account behind your key is currently **out of quota (402)** — top up credits at elevenlabs.io first, or even the deployed backend won't generate audio.

## Troubleshooting

| Problem | Fix |
|---|---|
| "Is the server running?" | Run `npm start` and open `http://localhost:3000` (not `file://`). |
| "API key is missing or invalid" | Copy `.env.example` → `.env`, paste the real key, restart the server. |
| 401 from ElevenLabs | Key is wrong or expired — regenerate it in your ElevenLabs profile. |
| "out of quota (payment required)" / 402 | The key is valid but the account has no credits left — top up or upgrade at elevenlabs.io, then retry. |
| "quota" / generation suddenly stops | Free-tier character limit reached — check Usage on elevenlabs.io. |
| Voice ID rejected | Copy the exact ID from the voice page; only letters/numbers, ~20 chars. |
| Audio plays but no waveform | That's cosmetic — the bars animate with CSS while playing; check DevTools for JS errors. |
| CORS errors when frontend/backend are on different hosts | Serve both from the same origin, or add `cors` middleware in `server.js`. |

## Accessibility & motion

- All controls have labels and are keyboard-operable; focus states are visible.
- `prefers-reduced-motion` disables tilt, orbs, and wave animations automatically.

## License

MIT — use it for your portfolio, hackathons, or client work.
