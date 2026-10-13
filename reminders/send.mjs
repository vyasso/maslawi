// Notifications, run every 10 minutes by .github/workflows/streak-reminder.yml:
// the streak reminder (learners who haven't practised today), the word of the day, reviewer alerts
// about new questions and phrase suggestions, and Yalla from friends in the league.
import webpush from "web-push";
import { isDue, message, alertDue, wordDue, wordMessage, yallaOk, yallaMessage } from "./plan.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("::error::Not set up yet: add SUPABASE_SERVICE_KEY and VAPID_PRIVATE_KEY under GitHub → Settings → Secrets and variables → Actions.");
  process.exit(1);
}
webpush.setVapidDetails("https://feli.yasso.se", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const rest = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/";
const base = rest + "push_subscriptions";
const headers = { apikey: SUPABASE_SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
if (SUPABASE_SERVICE_KEY.startsWith("eyJ")) headers.Authorization = "Bearer " + SUPABASE_SERVICE_KEY;

const COLS = "id,endpoint,p256dh,auth,tz,hour,lang,last_day,streak,last_sent,updated_at";
const read = cols => fetch(base + `?select=${cols}&order=id&limit=5000`, { headers });
let res = await read(COLS + ",remind,alerts,last_alert,user_id,word,word_hour,word_sent,words,yalla");
if (res.status === 400) res = await read(COLS + ",remind,alerts,last_alert"); // before the word of the day and Yalla (run supabase-setup.sql again)
if (res.status === 400) res = await read(COLS); // before the alert columns existed
if (!res.ok) {
  const txt = await res.text();
  if (/PGRST205|42P01|Could not find the table/.test(txt)) { console.error("::error::The push_subscriptions table doesn't exist yet. Run supabase-setup.sql."); process.exit(1); }
  console.error("::error::Couldn't read subscriptions:", res.status, txt.slice(0, 300)); process.exit(1);
}
let rows = await res.json();
// TEST_SEND=1 (Run workflow → "Send a test notification"): one sample to the phone that switched it on most recently
const test = process.env.TEST_SEND === "true";
if (test) rows = rows.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))).slice(0, 1);
const lang = row => row.lang === "en" ? "en" : "sv";
const patch = (id, body) => fetch(`${base}?id=eq.${id}`, { method: "PATCH", headers, body: JSON.stringify(body) });

let sent = 0, words = 0, alerted = 0, yallas = 0, gone = 0, failed = 0;
const goneIds = new Set();
// one notification to one phone; a phone the browser has thrown away (or one made with an old key) is removed
async function send(row, payload, ttl) {
  if (goneIds.has(row.id)) return false;
  try {
    await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify({ ...payload, lang: lang(row) }), { TTL: ttl, urgency: "normal" });
    return true;
  } catch (e) {
    if ([403, 404, 410].includes(e.statusCode)) { gone++; goneIds.add(row.id); await fetch(`${base}?id=eq.${row.id}`, { method: "DELETE", headers }); }
    else { failed++; console.error("Push failed:", e.statusCode || "", (e.body || e.message || "").toString().slice(0, 200)); }
    return false;
  }
}

// the streak reminder
for (const row of rows) {
  const t = test ? { date: null } : isDue(row);
  if (!t) continue;
  const m = test
    ? (row.lang === "en" ? { title: "Test", body: "This is what your streak reminder looks like." } : { title: "Testnotis", body: "Så här ser din påminnelse för sviten ut." })
    : message(row, t);
  if (await send(row, { title: m.title, body: m.body, tag: "streak", url: "./" }, 4 * 3600)) {
    sent++;
    if (!test) await patch(row.id, { last_sent: t.date });
  }
}

// the word of the day
if (!test) for (const row of rows) {
  const t = wordDue(row);
  if (!t) continue;
  const m = wordMessage(row, t);
  if (await send(row, { title: m.title, body: m.body, tag: "word", url: m.url }, 12 * 3600)) {
    words++;
    await patch(row.id, { word_sent: t.date });
  }
}

// reviewer alerts about new questions and phrase suggestions
let pendingCount = 0;
const watchers = test ? [] : rows.filter(r => r.alerts);
if (watchers.length) {
  const get = async (path, kind) => { const r = await fetch(rest + path, { headers }); return r.ok ? (await r.json()).map(x => ({ ...x, kind })) : []; };
  const items = [
    ...await get("word_questions?select=id,name,word,question,created_at&status=eq.pending&order=created_at.desc&limit=50", "q"),
    ...await get("phrase_suggestions?select=id,name,tr,meaning,created_at&status=eq.pending&order=created_at.desc&limit=50", "s"),
  ];
  pendingCount = items.length;
  for (const row of watchers) {
    const a = alertDue(row, items);
    if (!a) continue;
    if (await send(row, { title: a.title, body: a.body, tag: "review", url: "./" }, 12 * 3600)) {
      alerted++;
      await patch(row.id, { last_alert: a.latest });
    }
  }
}

// Yalla from friends: every phone of the person who got one (if it has Yalla on).
// Not between 22:00 and 07:59 where they are; those wait for the morning. Older than 36 hours: not sent.
if (!test) {
  const r = await fetch(rest + "yalla?select=id,to_id,from_name,created_at&pushed=eq.false&order=created_at&limit=500", { headers });
  if (r.ok) {
    const byTo = new Map();
    for (const y of await r.json()) { if (!byTo.has(y.to_id)) byTo.set(y.to_id, []); byTo.get(y.to_id).push(y); }
    for (const [to, list] of byTo) {
      const fresh = list.filter(y => Date.now() - Date.parse(y.created_at) < 36 * 3600e3);
      const phones = rows.filter(p => p.user_id === to && p.yalla && !goneIds.has(p.id));
      if (fresh.length && phones.length) {
        const ready = phones.filter(p => yallaOk(p));
        if (!ready.length) continue; // night where they are
        for (const p of ready) { const m = yallaMessage(p.lang, fresh); if (await send(p, { title: m.title, body: m.body, tag: "yalla", url: "./?yalla=1" }, 12 * 3600)) yallas++; }
      }
      await fetch(rest + `yalla?id=in.(${list.map(y => y.id).join(",")})`, { method: "PATCH", headers, body: JSON.stringify({ pushed: true }) });
    }
  } else if (r.status !== 404) console.error("Couldn't read Yallas:", r.status, (await r.text()).slice(0, 200));
}

console.log(`::notice::${test ? "TEST: " : ""}${rows.length} subscribed (${watchers.length} reviewer, ${pendingCount} waiting), ${sent} reminded, ${words} word${words === 1 ? "" : "s"} of the day, ${alerted} reviewer alert${alerted === 1 ? "" : "s"}, ${yallas} Yalla, ${gone} removed, ${failed} failed.`);
