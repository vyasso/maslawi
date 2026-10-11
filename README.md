# Maslawi

A Duolingo-style app for learning the Mosul (Maslawi) dialect of Iraqi Arabic, in English or Swedish. Phrases are written in simple English letters, every phrase has audio, and learners can make an account so their progress follows them between devices.

28 units, 85 levels (including 28 conversations) and 346 phrases: greetings first, then a *Build sentences* section (I, you, he, she · we, you, they · mine and yours · I eat, you drink), and later *At the doctor*, *At work*, *Moods*, *Compliments*, *Wedding*, *Christmas & Easter* and *Sayings*. The mascot is Istikan, a Maslawi tea glass. Learners do daily quests on the Learn page, look up any word in English, Swedish or Maslawi ("hi" and "hej" both find *merhaba*), practise with listening, flashcards, mistake review and "freshen up", spend gems by tapping the gem counter, pick a light or dark theme in Settings, and see their weekly XP on their profile.

The Words page also has a **sound guide** (kh, gh, q, the deep h, ayn and more, each with words you can play), **Grammar in a minute** (8 short topics, such as talking to a woman, "my/your" endings and the Mosul -tu ending), **verb tables** (8 everyday verbs in past and present for every person, with audio), an optional **Write what you hear** dictation practice, and an optional **Arabic letters** track: 8 short lessons that teach the 28 letters of the alphabet plus چ, ة, ء and ال, their shapes and how to read simple words.

Signed-in learners can **suggest phrases** they say in Mosul. Once a reviewer has approved them, they show up for everyone under Words, in a section called *From friends and family*.

Learners who already know some Maslawi can **jump ahead**: the welcome screen asks how much they know, and locked units on the Learn page have a "Jump here" button. A short test with 3 lives unlocks everything before it.

The app speaks the phone's language: Swedish on a Swedish phone, English everywhere else. Learners can switch on the welcome screen or in Settings.

Made by A. Yasso.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: lessons, words, audio, accounts |
| `extra-audio.json` | Audio for the verb tables and grammar tables, loaded the first time they are opened |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Let people install it to their home screen and open it offline |
| `og-image.png` | The picture shown when someone shares the link (1200×630) |
| `supabase-setup.sql` | Creates the tables for accounts, the league, the content check and suggested phrases (run in Supabase; safe to run again) |

## Editing lessons

Open `index.html` and search for:

- `const W=` – every phrase: English-letter spelling (`tr`), Arabic (`ar`), meaning (`en`) and an optional `note`
- `const UNITS=` – unit titles, guidebook tips and Mosul facts
- `const LESSONS=` – the exercises in each lesson
- `const CONVOS=` – the conversation at the end of each unit
- `TO_F` / `SELF_F` – which phrases change when talking to a woman, or when a woman talks about herself
- `const SYN=` – other English words and spellings that should find a phrase in search (most likely first)
- `const SV_W=` / `SV_N=` – the Swedish meaning and note for each phrase
- `const SV_TXT=` – Swedish for unit titles, tips, facts, conversation titles and build sentences (keyed by the English text)
- `const SV_ACC=` / `SV_SYN=` – extra Swedish answers to accept when typing, and Swedish search words
- `const GUIDE=` – the sound guide
- `const LT=` / `LT_GROUPS=` – the Arabic letters and how they are grouped into lessons
- `const GRAMMAR=` – the Grammar in a minute topics
- `const PRON=` / `VERBS=` – the persons and the verb tables (their audio is in `extra-audio.json`, keys `V_<verb>_<past|now>_<person>`)

New phrases need an audio clip in `const AUD=` (ask Claude to generate one). Letter names use the keys `L_alif`, `L_ba` and so on.

## Publishing

The site is published with GitHub Pages at **https://feli.yasso.se** (the `CNAME` file sets the domain). Every push to `main` updates the live app within a minute or two.

## Accounts (Supabase)

1. Create a free project at supabase.com.
2. In the SQL Editor, run `supabase-setup.sql`. It only creates what's missing, so it's safe to run again after an update.
3. In Project Settings → API, copy the Project URL and the `anon` public key.
4. Paste them into `SUPABASE_URL` and `SUPABASE_ANON_KEY` near the top of the script in `index.html`, then push.
5. In Authentication → URL Configuration, set **Site URL** to `https://feli.yasso.se`, so confirmation emails link back to the app.
6. Optional while testing: Authentication → Sign In / Providers → Email → turn off "Confirm email".

The league has two views: **This week** (ranked by this week's XP, with each learner's level under their name) and **Course progress** (everyone ranked by how much of the course they've done). Tap a learner to see their level, total XP, streak and words learned. If your `league` table was made before these features, run this once in the SQL Editor:

```sql
alter table public.league add column if not exists level text check (char_length(level) <= 12);
alter table public.league add column if not exists stats jsonb check (pg_column_size(stats) <= 2000);
```

Until then the league still works, but you only see your own progress.

The anon key is meant to be public. Row level security in `supabase-setup.sql` keeps each user's progress private.

## Audio

Clips were generated with the open-source Piper voice `ar_JO-kareem-medium` (a Jordanian Arabic voice). Check its dataset licence before publishing the app commercially.

## Content check

Only accounts whose email is in the `reviewers` table see **Settings (the gear) → Reviewer tools → Content check**. Reviewers mark each phrase as *Correct* or *Needs fix* and can write how people in Mosul really say it. Everyone on the list shares the same checks. **Copy fixes** copies all the fixes as a list you can paste to Claude.

Add a reviewer in Supabase → SQL Editor:

```sql
insert into public.reviewers (email) values ('their@email.com');
```

## Suggested phrases

On the Words page, signed-in learners tap **Suggest a phrase** (under *From friends and family*, or when a search finds nothing) and send in the phrase, what it means, and optionally the Arabic and when people say it. Each suggestion waits until a reviewer looks at it in **Settings → Reviewer tools → Suggested phrases**. Reviewers also get a button on the Words page when something new is waiting. They can fix the spelling, meaning, Arabic or note, then **Approve** or **Don't add**.

Approved phrases show up for everyone under Words, with the first name of the person who sent them in, and they turn up in search. They have no audio. **Copy approved** copies them as a list you can paste to Claude, who can add them to the lessons with audio.

The `phrase_suggestions` table is part of `supabase-setup.sql`. If you set up Supabase before this feature, run the file again (it's safe to run more than once). Until the table exists, the feature stays hidden. Each learner can have at most 50 suggestions waiting.

## Link preview

The `og:` tags at the top of `index.html` and the picture `og-image.png` decide how a shared link looks on WhatsApp, Facebook, Messenger, iMessage and X: the picture, the title "Maslawi – lär dig Mosul-dialekten" and a short description. Facebook and Messenger remember a preview for a while. After changing the picture or text, paste the link into Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) and press **Scrape Again**.
