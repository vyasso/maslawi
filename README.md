# Maslawi

A Duolingo-style app for learning the Mosul (Maslawi) dialect of Iraqi Arabic. Phrases are written in simple English letters, every phrase has audio, and learners can make an account so their progress follows them between devices.

Made by A. Yasso.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The whole app: lessons, words, audio, accounts |
| `manifest.webmanifest`, `sw.js`, `icon-*.png` | Let people install it to their home screen and open it offline |
| `supabase-setup.sql` | Creates the progress table for accounts (run once in Supabase) |

## Editing lessons

Open `index.html` and search for:

- `const W=` – every phrase: English-letter spelling (`tr`), Arabic (`ar`), meaning (`en`) and an optional `note`
- `const UNITS=` – unit titles, guidebook tips and Mosul facts
- `const LESSONS=` – the exercises in each lesson
- `const CONVOS=` – the conversation at the end of each unit
- `TO_F` / `SELF_F` – which phrases change when talking to a woman, or when a woman talks about herself

New phrases need an audio clip in `const AUD=` (ask Claude to generate one).

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

Only accounts whose email is in the `reviewers` table see **Profile → Content check**. Reviewers mark each phrase as *Correct* or *Needs fix* and can write how people in Mosul really say it. Everyone on the list shares the same checks. **Copy fixes** copies all the fixes as a list you can paste to Claude.

Add a reviewer in Supabase → SQL Editor:

```sql
insert into public.reviewers (email) values ('their@email.com');
```
