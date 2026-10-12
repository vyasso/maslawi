# Maslawi

A Duolingo-style app for learning the Mosul (Maslawi) dialect of Iraqi Arabic, in English or Swedish. Phrases are written in simple English letters, every phrase has audio, and learners can make an account so their progress follows them between devices.

33 units, 100 levels (including 33 conversations) and 411 phrases: greetings first, then a *Build sentences* section (I, you, he, she · we, you, they · mine and yours · I eat, you drink), and later *At the doctor*, *At work*, *Moods*, *Compliments*, *Wedding*, *Christmas & Easter* and *Sayings*, and a last section, *Home and away*: the body, clothes, at home, on the phone and travelling. The mascot is Istikan, a Maslawi tea glass. Learners do daily quests on the Learn page, look up any word in English, Swedish or Maslawi ("hi" and "hej" both find *merhaba*), practise with listening, flashcards, mistake review and "freshen up", earn **kleicha** (the app's coins, named after the Iraqi date cookie) and spend them by tapping the kleicha counter, pick a light or dark theme in Settings, and see their weekly XP on their profile.

The Learn page is a map: the levels follow the Tigris, every unit has a sign and a landmark, and Istikan waits by the next level. Mosul's old city, with the leaning al-Hadba minaret and the clock tower, stands on the horizon, and its windows light up in dark mode. When the last level of a unit is done, its sign gets a *KLAR!* stamp and Istikan rides a kalak, the old raft of the Tigris, down to the next unit. The tea glass at the top fills up towards the daily goal. A right answer gets *Afya!* (or *Mashallah!* or *Zein!*) with confetti and a count of right answers in a row, and a finished lesson ends with a celebration screen showing the day's goal and the streak.

The Words page also has a **sound guide** (kh, gh, q, the deep h, ayn and more, each with words you can play), **Grammar in a minute** (8 short topics, such as talking to a woman, "my/your" endings and the Mosul -tu ending), **verb tables** (8 everyday verbs in past and present for every person, with audio), an optional **Write what you hear** dictation practice, and an optional **Arabic letters** track: 8 short lessons that teach the 28 letters of the alphabet plus چ, ة, ء and ال, their shapes and how to read simple words.

Signed-in learners can **suggest phrases** they say in Mosul. Once a reviewer has approved them, they show up for everyone under Words, in a section called *From friends and family*. They can also **ask about a word** in the question box (*Ask about Maslawi*). A reviewer answers in the app, and answered questions show up for everyone under Words and in search.

59 everyday words have **pictures** (food, animals, places, colours, weather, the body, clothes, things at home, a phone, travel, and a few things like a gift or a clay jar): on the new-word card, in the word list, on the back of the word of the day, and in two kinds of questions that lessons with those words get automatically: "Which picture is it?" (pick the picture for a word) and "What is this called?" (see a picture and pick its Maslawi name). The pictures are in `const PIC=` in `index.html`.

Every picture is also a card in the **Collection** (on the Words page). Learners get a card when they learn the word. It turns silver when they know the word on two different days and gold after three, and a mistake takes it one step back. The categories are in `const CARD_CATS=` in `index.html`.

Learners who already know some Maslawi can **jump ahead**: the welcome screen asks how much they know, and locked units on the Learn page have a "Jump here" button. A short test with 3 lives unlocks everything before it.

The app speaks the phone's language: Swedish on a Swedish phone, English everywhere else. Learners can switch on the welcome screen or in Settings.

Made by A. Yasso.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: lessons, words, audio, accounts |
| `extra-audio.json` | Audio for the verb tables and grammar tables, loaded the first time they are opened |
| `voice/`, `.github/workflows/voice.yml` | Make the audio with Microsoft Azure's Iraqi voices (see *Audio*) |
| `audio-kareem.json` | The old voice, Kareem, for every clip: a backup the app doesn't load |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Let people install it to their home screen and open it offline |
| `og-image.png` | The picture shown when someone shares the link (1200×630) |
| `supabase-setup.sql` | Creates the tables for accounts, the league, the content check, suggested phrases, the question box and notifications (run in Supabase; safe to run again) |
| `reminders/`, `.github/workflows/streak-reminder.yml` | Sends the evening streak reminders and the reviewer alerts, every 10 minutes |

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

New phrases need an audio clip in `const AUD=` (made with the *Make audio* workflow, see *Audio*). Letter names use the keys `L_alif`, `L_ba` and so on.

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

Every phrase is read by **Bassel**, one of Microsoft Azure's Iraqi Arabic AI voices (`ar-IQ-BasselNeural`), a little slower than normal. Phrases only a woman says about herself (the "if you're a woman" forms, such as *ana mashghoola*) are read by **Rana** (`ar-IQ-RanaNeural`). The voices are built for standard Arabic, so the Arabic they read has vowel marks that steer them towards the Mosul pronunciation. The list is `voice/clips.json`: key, the Arabic to read, and the voice.

**Backup:** the old voice, the open-source Piper voice `ar_JO-kareem-medium` (Jordanian), is kept in `audio-kareem.json`, with the same keys as `AUD` and `extra-audio.json`. To switch a phrase back to Kareem, copy its clip from there into `AUD` (or `extra-audio.json`).

**Audio for new or changed phrases:**

1. Add or change the phrase in `voice/clips.json`. Use `ar-IQ-RanaNeural` only for what a woman says about herself.
2. In GitHub → **Actions → Make audio → Run workflow**, write the keys separated by commas (or leave the box empty to remake everything). Several phrases are read in one request, with a 2-second pause between them, because the free tier allows 20 requests a minute.
3. The result lands on the branch `voice-audio`. Put it into the app with ffmpeg and Python on your own computer:
   ```sh
   git fetch origin voice-audio
   mkdir -p /tmp/audio && git archive origin/voice-audio | tar -x -C /tmp/audio
   python3 voice/add.py /tmp/audio
   ```
   It cuts the phrases apart, trims the silence, makes them all equally loud and writes them into `AUD` and `extra-audio.json`. Then raise `CACHE` in `sw.js` and push.

Setup (once): an Azure **Speech** resource on the free tier (F0: half a million characters a month, and all of the app's audio is about 5,500), and two repository secrets, `AZURE_SPEECH_KEY` (the resource's Keys and Endpoint → KEY 1) and `AZURE_SPEECH_REGION` (the Location/Region on the same page, for example `swedencentral`). The app's About text says the voices are AI voices from Microsoft Azure.

## Content check

Only accounts whose email is in the `reviewers` table see **Settings (the gear) → Reviewer tools → Content check**. Reviewers mark each phrase as *Correct* or *Needs fix* and can write how people in Mosul really say it. Everyone on the list shares the same checks. **Copy fixes** copies all the fixes as a list.

Add a reviewer in Supabase → SQL Editor:

```sql
insert into public.reviewers (email) values ('their@email.com');
```

## Suggested phrases

On the Words page, signed-in learners tap **Suggest a phrase** (under *From friends and family*, or when a search finds nothing) and send in the phrase, what it means, and optionally the Arabic and when people say it. Each suggestion waits until a reviewer looks at it in **Settings → Reviewer tools → Suggested phrases**. Reviewers also get a button on the Words page when something new is waiting. They can fix the spelling, meaning, Arabic or note, then **Approve** or **Don't add**.

Approved phrases show up for everyone under Words, with the first name of the person who sent them in, and they turn up in search. They have no audio. **Copy approved** copies them as a list, ready to be added to the lessons with audio.

The `phrase_suggestions` table is part of `supabase-setup.sql`. If you set up Supabase before this feature, run the file again (it's safe to run more than once). Until the table exists, the feature stays hidden. Each learner can have at most 50 suggestions waiting.

## Question box

On the Words page, signed-in learners tap **Ask a question** (under *Ask about Maslawi*) and write which word it's about (optional) and their question. Reviewers answer in **Settings → Reviewer tools → Questions**, or from the button on the Words page when something new is waiting. They can fix typos in the question, write the answer, then **Publish** or **Don't show**. Published answers show up for everyone under Words, with the asker's first name, and in search. Askers see their own questions and answers when they open the question form.

The `word_questions` table is part of `supabase-setup.sql`. Until it exists, the question box stays hidden. Each learner can have at most 20 questions waiting.

## Link preview

The `og:` tags at the top of `index.html` and the picture `og-image.png` decide how a shared link looks on WhatsApp, Facebook, Messenger, iMessage and X: the picture, the title "Maslawi – lär dig Mosul-dialekten" and a short description. Facebook and Messenger remember a preview for a while. After changing the picture or text, paste the link into Facebook's [Sharing Debugger](https://developers.facebook.com/tools/debug/) and press **Scrape Again**.

## Streak reminders

Learners switch on **Settings → Learning → Streak reminder** (the app also offers it once on the streak screen) and pick an hour between 17 and 21. On days they haven't practised by then, their phone gets a notification. It works in Chrome and Firefox on Android and computers. On iPhone (iOS 16.4 or later) it only works when Maslawi is opened from the home screen, and the app explains how to add it.

How it works: the browser gives the app a private push address, which the app saves with `save_push()` together with the learner's time zone, chosen hour and the last day they practised. Every 10 minutes, the GitHub Action `.github/workflows/streak-reminder.yml` runs `reminders/send.mjs`, which reminds everyone who is due. A learner gets at most one reminder a day, never after 22:59. (GitHub sometimes runs scheduled jobs late, and pauses them in a repo with no new commits for 60 days.)

**Instant start:** GitHub's schedule is often late, so Supabase starts the job itself: right away when someone asks a question or suggests a phrase, and every 10 minutes (pg_cron). It needs a fine-grained GitHub token with access to only this repo and *Actions: Read and write*, saved in Supabase Vault as `github_dispatch_token` (see the end of `supabase-setup.sql`). When the token expires, make a new one and replace it in Vault.

**Reviewer alerts:** reviewers can switch on **Settings → Reviewer tools → Notify me about new posts**. The same job then sends them a notification when someone asks a question or suggests a phrase, at most one every 10 minutes and never between 22:00 and 08:00 (those wait until morning).

Setup (once):

1. Run `supabase-setup.sql` again in Supabase (it adds the `push_subscriptions` table).
2. In GitHub → the repo → **Settings → Secrets and variables → Actions**, add two repository secrets:
   - `SUPABASE_SERVICE_KEY`: Supabase → Project Settings → API Keys → the secret (`service_role`) key. Never put it in `index.html`.
   - `VAPID_PRIVATE_KEY`: make a push key pair on your own computer with `npx web-push generate-vapid-keys`. The private key goes in this secret and nowhere else. The public key goes in `VAPID_PUBLIC` in `index.html` and `VAPID_PUBLIC_KEY` in the workflow. Phones that already switched the reminder on move to a new key by themselves the next time they open the app.
3. Optional: in the **Actions** tab, open *Streak reminders* and press **Run workflow** to check that it says "… subscribed, … reminded".
