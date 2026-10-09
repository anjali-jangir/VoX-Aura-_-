/**
 * VoxAura AI Voice Studio — backend
 * --------------------------------------------------------------------
 * Voice providers (set TTS_PROVIDER in .env):
 *   auto (default) — Microsoft Edge neural voices, Google TTS as fallback.
 *                    FREE, no API key, no quota. Just works.
 *   elevenlabs     — premium quality, needs ELEVENLABS_API_KEY + credits.
 *
 * The frontend falls back to the browser's built-in voice when no backend is
 * reachable (e.g. GitHub Pages), so the live site still speaks with zero setup.
 *
 * Run:  npm install && npm start   →  http://localhost:3000
 */
const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
// auto (default): Microsoft Edge neural voices → Google TTS fallback. All free, no key.
// edge: Edge only · google: Google only · elevenlabs: premium, needs key + credits.
const TTS_PROVIDER = (process.env.TTS_PROVIDER || "auto").toLowerCase();
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const MODEL_ID = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const MAX_CHARS = 5000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname)); // serves index.html, style.css, script.js

// Optional: fetch your account's voices through the server (key never leaks)
app.get("/api/voices", async (req, res) => {
  if (!ELEVENLABS_API_KEY) return res.status(500).json({ error: "ELEVENLABS_API_KEY is not set on the server. See .env.example." });
  try {
    const r = await fetch("https://api.elevenlabs.io/v1/voices", {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });
    if (!r.ok) throw new Error(`ElevenLabs returned ${r.status}`);
    res.json(await r.json());
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// Split long text into sentence-aware chunks for the free providers
function chunkText(text, maxLen) {
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+["']?\s*|[^.!?]+$/g) || [text];
  const push = s => { if (s.trim()) chunks.push(s.trim()); };
  let cur = "";
  for (const s of sentences) {
    if (s.length > maxLen) {
      push(cur); cur = "";
      for (let i = 0; i < s.length; i += maxLen) push(s.slice(i, i + maxLen));
      continue;
    }
    if ((cur + s).length > maxLen && cur) { push(cur); cur = ""; }
    cur += s;
  }
  push(cur);
  return chunks.length ? chunks : [text];
}

// ---- free provider 1: Microsoft Edge neural voices (no key, no quota) ----
async function edgeTTS(text, edgeVoice) {
  let EdgeTTS;
  try {
    ({ EdgeTTS } = require("node-edge-tts"));
  } catch (_) {
    throw new Error("edge-tts library not installed. Run: npm install");
  }
  const chunks = chunkText(text.trim(), 600);
  const bufs = [];
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || undefined;
  for (const c of chunks) {
    const tts = new EdgeTTS({ voice: edgeVoice || "en-US-AriaNeural", proxy, timeout: 25000 });
    const tmp = path.join(os.tmpdir(), `voxaura-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`);
    try {
      await tts.ttsPromise(c, tmp);
      bufs.push(fs.readFileSync(tmp));
    } finally {
      try { fs.unlinkSync(tmp); } catch (_) {}
    }
  }
  return Buffer.concat(bufs);
}

// ---- free provider 2: Google Translate TTS (no key, verified reliable fallback) ----
async function googleTTS(text, lang) {
  const chunks = chunkText(text.trim(), 180);
  const bufs = [];
  for (const c of chunks) {
    const url =
      "https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=" +
      encodeURIComponent(lang || "en") +
      "&q=" + encodeURIComponent(c);
    const r = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!r.ok) throw new Error(`Google TTS error (${r.status})`);
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) throw new Error("Google TTS returned empty audio.");
    bufs.push(buf);
  }
  return Buffer.concat(bufs); // concatenated MP3 frames play fine in browsers
}

// ---- premium provider: ElevenLabs ----
async function elevenLabsTTS(text, voiceId) {
  if (!ELEVENLABS_API_KEY) {
    const e = new Error(
      "ELEVENLABS_API_KEY is not configured on the server. Copy .env.example to .env, add your key, and restart."
    );
    e.statusCode = 500;
    throw e;
  }
  const r = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ELEVENLABS_API_KEY,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: MODEL_ID,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  );
  if (!r.ok) {
    let detail = "";
    try {
      const j = await r.json();
      if (typeof j.detail === "string") detail = j.detail;
      else if (j.detail) detail = JSON.stringify(j.detail);
      else if (j.message) detail = j.message;
    } catch (_) {}
    if (r.status === 401) {
      const e = new Error("ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY and your quota.");
      e.statusCode = 500;
      throw e;
    }
    if (r.status === 402) {
      const e = new Error(
        "ElevenLabs says this account is out of quota (payment required). " +
        "Add credits or upgrade your plan at elevenlabs.io, then try again."
      );
      e.statusCode = 502;
      throw e;
    }
    const e = new Error(`ElevenLabs error (${r.status}). ${detail}`.trim());
    e.statusCode = 502;
    throw e;
  }
  return Buffer.from(await r.arrayBuffer());
}

// Main TTS endpoint — the frontend calls this, never the providers directly
app.post("/api/tts", async (req, res) => {
  const { text, voiceId, edgeVoice, glLang } = req.body || {};

  // ---- validation ----
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Text is required." });
  }
  if (text.length > MAX_CHARS) {
    return res.status(400).json({ error: `Text exceeds the ${MAX_CHARS}-character limit.` });
  }
  if (TTS_PROVIDER === "elevenlabs") {
    if (typeof voiceId !== "string" || !/^[A-Za-z0-9]{15,40}$/.test(voiceId)) {
      return res.status(400).json({ error: "A valid voiceId is required." });
    }
  }

  try {
    let buf;
    if (TTS_PROVIDER === "elevenlabs") {
      buf = await elevenLabsTTS(text, voiceId);
    } else if (TTS_PROVIDER === "google") {
      buf = await googleTTS(text, glLang);
    } else if (TTS_PROVIDER === "edge") {
      buf = await edgeTTS(text, edgeVoice);
    } else {
      // "auto" (default): best free voices first, verified fallback second
      try {
        buf = await edgeTTS(text, edgeVoice);
      } catch (e) {
        console.warn("[VoxAura] Edge TTS failed, falling back to Google:", e.message);
        buf = await googleTTS(text, glLang);
      }
    }
    if (!buf.length) throw new Error("The provider returned an empty audio file.");
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buf.length);
    res.send(buf);
  } catch (e) {
    console.error("[VoxAura] TTS error:", e.message);
    res.status(e.statusCode || 502).json({ error: e.message || "Voice generation failed." });
  }
});

app.listen(PORT, () => {
  console.log(`\n  VoxAura AI Voice Studio running → http://localhost:${PORT}`);
  console.log(`  Voice provider: ${TTS_PROVIDER}`);
  if (TTS_PROVIDER === "elevenlabs" && !ELEVENLABS_API_KEY) {
    console.log("  ⚠  ELEVENLABS_API_KEY is not set — ElevenLabs generation will fail until you add it.\n");
  }
});
