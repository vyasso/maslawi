// Makes the app's audio with Microsoft Azure's Iraqi voices, from clips.json ({key, text, voice}).
// Run by .github/workflows/voice.yml ("Make audio") with the secrets AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.
// BATCH > 1 reads that many phrases in one request, with a 2-second pause after each (the free tier allows
// 20 requests a minute); the phrases are cut apart again before they go into the app.
// BATCH=1 makes one file per phrase. KEYS (separated by commas) limits the run to those phrases.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const KEY = (process.env.AZURE_SPEECH_KEY || "").trim();
const REGION = (process.env.AZURE_SPEECH_REGION || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const RATE = process.env.RATE || "-10%"; // a little slower than normal, for learners
const BATCH = Math.max(1, parseInt(process.env.BATCH || "12", 10) || 1);
const ONLY = new Set((process.env.KEYS || "").split(/[\s,]+/).filter(Boolean));
const GAP = "2000ms";
const FORMAT = "ogg-24khz-16bit-mono-opus";
const here = new URL("./", import.meta.url);
const out = new URL("out/", here);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const fail = msg => { console.log(`::error::${msg}`); process.exit(1); };

if (!KEY || !REGION) fail("Add the repository secrets AZURE_SPEECH_KEY and AZURE_SPEECH_REGION first (Settings → Secrets and variables → Actions).");

const base = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices`;
let last = 0;
// The free tier (F0) allows 20 requests a minute, so space them out, and wait when Azure asks us to.
async function call(url, init = {}, tries = 4) {
  const wait = last + 3200 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  let res;
  try {
    res = await fetch(url, { ...init, headers: { "Ocp-Apim-Subscription-Key": KEY, "User-Agent": "maslawi-audio", ...(init.headers || {}) } });
  } catch (e) {
    fail(`Couldn't reach ${REGION}.tts.speech.microsoft.com (${e.cause?.code || e.message}). Is "${REGION}" the right region? It's the Location/Region shown under Keys and Endpoint, for example swedencentral.`);
  }
  if (res.status === 429 && tries > 1) {
    await sleep((Number(res.headers.get("retry-after")) || 15) * 1000);
    return call(url, init, tries - 1);
  }
  if (res.status === 401 || res.status === 403) fail(`Azure answered ${res.status}: the key doesn't work in the region "${REGION}". Check AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.`);
  return res;
}

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const all = JSON.parse(await readFile(new URL("clips.json", here), "utf8"));
const list = ONLY.size ? all.filter(c => ONLY.has(c.key)) : all;
const unknown = [...ONLY].filter(k => !all.some(c => c.key === k));
if (unknown.length) console.log(`::warning::Not in clips.json: ${unknown.join(", ")}`);
if (!list.length) fail("No phrases to make.");

// keep each voice's phrases together, in the order of clips.json
const byVoice = new Map();
for (const c of list) { if (!byVoice.has(c.voice)) byVoice.set(c.voice, []); byVoice.get(c.voice).push(c); }

await mkdir(out, { recursive: true });
const files = [], failed = [];
let n = 0;
for (const [voice, clips] of byVoice) for (let i = 0; i < clips.length; i += BATCH) {
  const part = clips.slice(i, i + BATCH);
  const body = part.map(c => `<s><prosody rate="${c.rate || RATE}">${esc(c.text)}</prosody>${part.length > 1 ? `<break time="${GAP}"/>` : ""}</s>`).join("");
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="ar-IQ"><voice name="${voice}">${body}</voice></speak>`;
  const res = await call(`${base}/v1`, { method: "POST", headers: { "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": FORMAT }, body: ssml });
  if (!res.ok) {
    failed.push(...part.map(c => c.key));
    console.log(`::warning::${part.map(c => c.key).join(", ")} (${voice}): ${res.status} ${(await res.text()).slice(0, 120)}`);
    continue;
  }
  const file = part.length > 1 ? `batch-${String(++n).padStart(3, "0")}.ogg` : `${part[0].key}.ogg`;
  await writeFile(new URL(file, out), Buffer.from(await res.arrayBuffer()));
  files.push({ file, voice, keys: part.map(c => c.key) });
}
await writeFile(new URL("manifest.json", out), JSON.stringify({ region: REGION, rate: RATE, batch: BATCH, gap: GAP, format: FORMAT, files, failed }, null, 1));
const made = files.reduce((t, f) => t + f.keys.length, 0);
console.log(`::notice::Made ${made} of ${list.length} phrases in ${files.length} files${failed.length ? `; ${failed.length} failed` : ""}.`);
if (!made) process.exit(1);
