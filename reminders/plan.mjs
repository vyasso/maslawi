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
  if (!PUSH_HOSTS.test(row.endpoint || "")) return null;
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
