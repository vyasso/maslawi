// Streak reminders: run every hour by .github/workflows/streak-reminder.yml.
// Sends a push notification to learners who switched reminders on and haven't practised today.
import webpush from "web-push";
import { isDue, message } from "./plan.mjs";

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.log("Not set up yet: add SUPABASE_SERVICE_KEY and VAPID_PRIVATE_KEY under GitHub → Settings → Secrets and variables → Actions.");
  process.exit(0);
}
webpush.setVapidDetails("https://feli.yasso.se", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const base = SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/push_subscriptions";
const headers = { apikey: SUPABASE_SERVICE_KEY, "Content-Type": "application/json", Prefer: "return=minimal" };
if (SUPABASE_SERVICE_KEY.startsWith("eyJ")) headers.Authorization = "Bearer " + SUPABASE_SERVICE_KEY;

const res = await fetch(base + "?select=id,endpoint,p256dh,auth,tz,hour,lang,last_day,streak,last_sent&order=id&limit=5000", { headers });
if (!res.ok) {
  const txt = await res.text();
  if (/push_subscriptions|PGRST205|42P01/.test(txt)) { console.log("The push_subscriptions table doesn't exist yet. Run supabase-setup.sql."); process.exit(0); }
  console.error("Couldn't read subscriptions:", res.status, txt.slice(0, 300)); process.exit(1);
}
const rows = await res.json();
let sent = 0, gone = 0, failed = 0;
for (const row of rows) {
  const t = isDue(row);
  if (!t) continue;
  const m = message(row, t);
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify({ title: m.title, body: m.body, tag: "streak", url: "./" }),
      { TTL: 4 * 3600, urgency: "normal" }
    );
    sent++;
    await fetch(`${base}?id=eq.${row.id}`, { method: "PATCH", headers, body: JSON.stringify({ last_sent: t.date }) });
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) { // the browser threw the subscription away
      gone++;
      await fetch(`${base}?id=eq.${row.id}`, { method: "DELETE", headers });
    } else { failed++; console.error("Push failed:", e.statusCode || "", (e.body || e.message || "").toString().slice(0, 200)); }
  }
}
console.log(`${rows.length} subscribed, ${sent} reminded, ${gone} removed, ${failed} failed.`);
