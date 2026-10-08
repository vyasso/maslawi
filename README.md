# Maslawi

A Duolingo-style app for learning the Mosul (Maslawi) dialect of Iraqi Arabic, in English or Swedish. Phrases are written in simple English letters, every phrase has audio, and learners can make an account so their progress follows them between devices.

24 units, 72 levels (including 24 conversations) and 304 phrases, from greetings to *At the doctor*, *At work*, *Moods*, *Compliments*, *Wedding*, *Christmas & Easter* and *Sayings*. The mascot is Istikan, a Maslawi tea glass. Learners do daily quests on the Learn page, look up any word in English, Swedish or Maslawi ("hi" and "hej" both find *merhaba*), practise with listening, flashcards, mistake review and "freshen up", spend gems by tapping the gem counter, pick a light or dark theme in Settings, and see their weekly XP on their profile.

The Words page also has a **sound guide** (kh, gh, q, the deep h, ayn and more, each with words you can play), **Grammar in a minute** (8 short topics, such as talking to a woman, "my/your" endings and the Mosul -tu ending), **verb tables** (8 everyday verbs in past and present for every person, with audio), an optional **Write what you hear** dictation practice, and an optional **Arabic letters** track: 8 short lessons that teach the 28 letters of the alphabet plus چ, ة, ء and ال, their shapes and how to read simple words.

Learners who already know some Maslawi can **jump ahead**: the welcome screen asks how much they know, and locked units on the Learn page have a "Jump here" button. A short test with 3 lives unlocks everything before it.

The app speaks the phone's language: Swedish on a Swedish phone, English everywhere else. Learners can switch on the welcome screen or in Settings.

Made by A. Yasso.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: lessons, words, audio, accounts |
| `extra-audio.json` | Audio for the verb tables and grammar tables, loaded the first time they are opened |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Let people install it to their home screen and open it offline |
| `supabase-setup.sql` | Creates the progress table for accounts (run once in Supabase) |

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
2. In the SQL Editor, run `supabase-setup.sql`.
3. In Project Settings → API, copy the Project URL and the `anon` public key.
4. Paste them into `SUPABASE_URL` and `SUPABASE_ANON_KEY` near the top of the script in `index.html`, then push.
5. In Authentication → URL Configuration, set **Site URL** to `https://feli.yasso.se`, so confirmation emails link back to the app.
6. Optional while testing: Authentication → Sign In / Providers → Email → turn off "Confirm email".

The anon key is meant to be public. Row level security in `supabase-setup.sql` keeps each user's progress private.

## Audio

Clips were generated with the open-source Piper voice `ar_JO-kareem-medium` (a Jordanian Arabic voice). Check its dataset licence before publishing the app commercially.

## Content check

Only accounts whose email is in the `reviewers` table see **Settings (the gear) → Reviewer tools → Content check**. Reviewers mark each phrase as *Correct* or *Needs fix* and can write how people in Mosul really say it. Everyone on the list shares the same checks. **Copy fixes** copies all the fixes as a list you can paste to Claude.

Add a reviewer in Supabase → SQL Editor:

```sql
insert into public.reviewers (email) values ('their@email.com');
```
