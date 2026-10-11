// Which learners get a streak reminder right now, and what it says.
// Kept separate from send.mjs so it can be tested without sending anything.

export const PUSH_HOSTS = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
const LAST_HOUR = 22; // never remind after 22:59 local time

// date (YYYY-MM-DD), yesterday and hour in the learner's own time zone
export function localNow(tz, now = new Date()) {
  let zone = tz;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: zone }); } catch { zone = "Europe/Stockholm"; }
  const part = d => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(d).map(x => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
  };
  const today = part(now);
  // noon minus a day is always the previous date, whatever the clock change
  const [y, m, d] = today.date.split("-").map(Number);
  const yday = new Date(Date.UTC(y, m - 1, d, 12) - 864e5).toISOString().slice(0, 10);
  return { date: today.date, yesterday: yday, hour: today.hour };
}

// a reminder is due from the chosen hour until 22:59, once a day, and only if they haven't practised today
export function isDue(row, now = new Date()) {
  if (!PUSH_HOSTS.test(row.endpoint || "") || row.remind === false) return null;
  const t = localNow(row.tz, now);
  const hour = Number.isInteger(row.hour) ? row.hour : 19;
  if (t.hour < hour || t.hour > LAST_HOUR) return null;
  if (row.last_day === t.date || row.last_sent === t.date) return null;
  return t;
}

export function message(row, t) {
  const alive = (row.streak || 0) > 0 && row.last_day === t.yesterday;
  const n = row.streak || 0;
  if (row.lang === "en") return alive
    ? { title: `Keep your ${n}-day streak`, body: "One short lesson is enough. Yalla!" }
    : { title: "Time for today's lesson", body: "Five minutes of Maslawi a day adds up." };
  return alive
    ? { title: `Rädda din svit på ${n} ${n === 1 ? "dag" : "dagar"}`, body: "En kort lektion räcker. Yalla!" }
    : { title: "Dags för dagens lektion", body: "Fem minuter maslawi om dagen gör skillnad." };
}

// Reviewer alerts: new questions (kind "q") and phrase suggestions (kind "s") since the last alert.
// Quiet between 22:00 and 07:59 in the reviewer's time zone; they come in the morning instead.
const cut = (x, n) => { x = String(x || "").replace(/\s+/g, " ").trim(); return x.length > n ? x.slice(0, n - 1) + "…" : x; };
export function alertDue(row, items, now = new Date()) {
  if (!row.alerts || !PUSH_HOSTS.test(row.endpoint || "")) return null;
  const since = row.last_alert ? Date.parse(row.last_alert) : now.getTime();
  const fresh = items.filter(x => Date.parse(x.created_at) > since);
  if (!fresh.length) return null;
  const t = localNow(row.tz, now);
  if (t.hour < 8 || t.hour > 21) return null;
  const q = fresh.filter(x => x.kind === "q"), s = fresh.filter(x => x.kind === "s");
  const latest = fresh.map(x => x.created_at).sort().pop();
  const en = row.lang === "en", who = x => x.name || (en ? "Someone" : "Någon");
  let title, body;
  if (q.length && s.length) {
    title = en ? "New in the app" : "Nytt i appen";
    body = en ? `${q.length} question${q.length > 1 ? "s" : ""} and ${s.length} phrase suggestion${s.length > 1 ? "s" : ""} are waiting.`
              : `${q.length} ${q.length > 1 ? "frågor" : "fråga"} och ${s.length} fraseförslag väntar.`;
  } else if (q.length === 1) {
    title = en ? "New question" : "Ny fråga";
    body = cut(`${who(q[0])}: ${q[0].word ? q[0].word + " – " : ""}${q[0].question}`, 140);
  } else if (q.length) {
    title = en ? `${q.length} new questions` : `${q.length} nya frågor`;
    body = en ? "Open the app to answer them." : "Öppna appen och svara.";
  } else if (s.length === 1) {
    title = en ? "New phrase suggestion" : "Nytt fraseförslag";
    body = cut(`${who(s[0])}: ${s[0].tr} – ${s[0].meaning}`, 140);
  } else {
    title = en ? `${s.length} new phrase suggestions` : `${s.length} nya fraseförslag`;
    body = en ? "Open the app to review them." : "Öppna appen och granska.";
  }
  return { title, body, latest };
}
