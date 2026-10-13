// Which learners get a notification right now, and what it says: the streak reminder, the word of
// the day, reviewer alerts and Yalla from friends.
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

// The word of the day: once a day, from the chosen hour (08:00 unless they picked another) until 22:59.
// The app sends the next 14 days of words with the subscription; if it hasn't been opened for that
// long, the notification just says that today's word is waiting.
export function wordDue(row, now = new Date()) {
  if (!row.word || !PUSH_HOSTS.test(row.endpoint || "")) return null;
  const t = localNow(row.tz, now);
  const hour = Number.isInteger(row.word_hour) ? row.word_hour : 8;
  if (t.hour < hour || t.hour > LAST_HOUR) return null;
  if (row.word_sent === t.date) return null;
  return t;
}
const KEY = /^[a-z0-9]{1,40}$/i;
export function wordMessage(row, t) {
  const list = Array.isArray(row.words) ? row.words : [];
  const e = list.find(x => x && x.d === t.date && typeof x.k === "string" && KEY.test(x.k) && typeof x.t === "string" && typeof x.b === "string" && x.t.trim());
  if (e) return { title: cut(e.t, 80), body: cut(e.b, 180), url: "./?ord=" + e.k };
  return row.lang === "en"
    ? { title: "Your word of the day", body: "Open Maslawi to hear today's word.", url: "./?ord=" }
    : { title: "Dagens ord väntar", body: "Öppna Maslawi och hör dagens ord.", url: "./?ord=" };
}

// Yalla from friends: quiet between 22:00 and 07:59 in the learner's time zone (they come in the morning).
export function yallaOk(row, now = new Date()) {
  if (!row.yalla || !row.user_id || !PUSH_HOSTS.test(row.endpoint || "")) return false;
  const t = localNow(row.tz, now);
  return t.hour >= 8 && t.hour <= 21;
}
export function yallaMessage(lang, list) {
  const en = lang === "en";
  const names = [...new Set(list.map(y => cut(y.from_name, 30)).filter(Boolean))];
  const one = names[0] || (en ? "A friend" : "En vän");
  const who = names.length <= 1 ? one
    : names.length === 2 ? `${names[0]} ${en ? "and" : "och"} ${names[1]}`
    : `${names[0]} ${en ? `and ${names.length - 1} more` : `och ${names.length - 1} till`}`;
  if (en) return { title: `${who} sent you a Yalla!`, body: `${names.length > 1 ? "They're" : who + " is"} cheering you on. Send a Yalla back!` };
  return { title: `${who} skickade Yalla!`, body: `${names.length > 1 ? "De" : who} peppar dig att öva i dag. Skicka en Yalla tillbaka!` };
}
