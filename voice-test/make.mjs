// Makes Azure voice samples: one mp3 for each phrase in phrases.json and each voice.
// Run by .github/workflows/voice-test.yml with the secrets AZURE_SPEECH_KEY and AZURE_SPEECH_REGION.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const KEY = (process.env.AZURE_SPEECH_KEY || "").trim();
const REGION = (process.env.AZURE_SPEECH_REGION || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const LOCALE = process.env.LOCALE || "ar-IQ";
const RATE = process.env.RATE || "-10%"; // a little slower than normal, for learners
const FALLBACK = ["ar-IQ-BasselNeural", "ar-IQ-RanaNeural"];
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
    res = await fetch(url, { ...init, headers: { "Ocp-Apim-Subscription-Key": KEY, "User-Agent": "maslawi-voice-test", ...(init.headers || {}) } });
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

let voices = [];
const list = await call(`${base}/voices/list`);
if (list.ok) {
  const all = await list.json();
  voices = all.filter(v => v.Locale === LOCALE).map(v => ({ name: v.ShortName, local: v.LocalName, gender: v.Gender, type: v.VoiceType }));
  console.log(`Arabic voices in ${REGION}: ${all.filter(v => v.Locale.startsWith("ar-")).map(v => v.ShortName).join(", ")}`);
} else console.log(`::warning::Couldn't list the voices (${list.status}), so using ${FALLBACK.join(" and ")}.`);
if (!voices.length) voices = FALLBACK.map(name => ({ name }));

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const phrases = JSON.parse(await readFile(new URL("phrases.json", here), "utf8"));
await mkdir(out, { recursive: true });
const made = [], failed = [];
for (const v of voices) for (const p of phrases) {
  const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LOCALE}"><voice name="${v.name}"><prosody rate="${p.rate || RATE}">${esc(p.text)}</prosody></voice></speak>`;
  const res = await call(`${base}/v1`, { method: "POST", headers: { "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3" }, body: ssml });
  if (!res.ok) { failed.push(`${p.key} (${v.name}): ${res.status} ${(await res.text()).slice(0, 120)}`); continue; }
  const file = `${p.key}.${v.name}.mp3`;
  await writeFile(new URL(file, out), Buffer.from(await res.arrayBuffer()));
  made.push(file);
}
await writeFile(new URL("manifest.json", out), JSON.stringify({ region: REGION, locale: LOCALE, rate: RATE, voices, phrases, made, failed }, null, 1));
for (const f of failed) console.log(`::warning::${f}`);
console.log(`::notice::Made ${made.length} clips with ${voices.map(v => v.name).join(", ")}${failed.length ? `; ${failed.length} failed` : ""}.`);
if (!made.length) process.exit(1);
