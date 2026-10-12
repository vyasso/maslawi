"""Put the audio from the "Make audio" workflow into the app.

    git fetch origin voice-audio
    mkdir -p /tmp/audio && git archive origin/voice-audio | tar -x -C /tmp/audio
    python3 voice/add.py /tmp/audio

Cuts every file into one clip per phrase (the phrases are read with 2-second pauses between them),
trims the silence, levels the loudness and writes mono mp3 clips into const AUD in index.html,
or into extra-audio.json for the verb and grammar tables (keys V_... and G_...).
Needs python3 and ffmpeg. Changes nothing if a file doesn't cut into the right number of phrases.
"""
import base64, json, os, re, subprocess, sys, tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = -20.0  # loudness of every clip, in LUFS


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def duration(f):
    return float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).stdout)


def lufs(f):
    return float(re.findall(r'I:\s+(-?[\d.]+) LUFS', run(['ffmpeg', '-hide_banner', '-i', f, '-af', 'ebur128', '-f', 'null', '-']).stderr)[-1])


def speech_parts(wav):
    """The stretches of speech between pauses of 0.9 seconds or more."""
    total = duration(wav)
    o = run(['ffmpeg', '-hide_banner', '-i', wav, '-af', 'silencedetect=n=-50dB:d=0.9', '-f', 'null', '-']).stderr
    starts = [float(x) for x in re.findall(r'silence_start: (-?[\d.]+)', o)]
    ends = [float(x) for x in re.findall(r'silence_end: ([\d.]+)', o)]
    if len(ends) < len(starts):
        ends.append(total)
    parts, t = [], 0.0
    for s0, e0 in zip(starts, ends):
        if s0 - t > 0.08:
            parts.append((t, s0))
        t = e0
    if total - t > 0.08:
        parts.append((t, total))
    return parts


def clip(wav, a, b, tmp):
    """One phrase as an mp3 data URI: trimmed gently (soft starts and endings stay), levelled, 0.1 s of silence after."""
    cut, mp3 = f'{tmp}/cut.wav', f'{tmp}/clip.mp3'
    trim = ('silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.03,'
            'areverse,silenceremove=start_periods=1:start_threshold=-60dB:start_silence=0.04,areverse')
    run(['ffmpeg', '-y', '-loglevel', 'error', '-ss', f'{max(0, a - 0.08):.3f}', '-to', f'{b + 0.25:.3f}', '-i', wav,
         '-af', trim, '-ac', '1', '-ar', '24000', cut])
    gain = TARGET - lufs(cut)
    r = run(['ffmpeg', '-y', '-loglevel', 'error', '-i', cut, '-af', f'volume={gain:.2f}dB,alimiter=limit=0.891:level=false,apad=pad_dur=0.1',
             '-ac', '1', '-ar', '22050', '-b:a', '40k', mp3])
    if r.returncode:
        sys.exit(r.stderr)
    return 'data:audio/mpeg;base64,' + base64.b64encode(open(mp3, 'rb').read()).decode()


def main(src):
    man = json.load(open(f'{src}/manifest.json'))
    new, bad = {}, []
    with tempfile.TemporaryDirectory() as tmp:
        for f in man['files']:
            wav = f'{tmp}/file.wav'
            run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f"{src}/{f['file']}", '-ac', '1', '-ar', '24000', wav])
            parts = speech_parts(wav) if len(f['keys']) > 1 else [(0.0, duration(wav))]
            if len(parts) != len(f['keys']):
                bad.append(f"{f['file']}: {len(f['keys'])} phrases but {len(parts)} pieces")
                continue
            for key, (a, b) in zip(f['keys'], parts):
                new[key] = clip(wav, a, b, tmp)
    if bad or man.get('failed'):
        sys.exit('Nothing changed. Make these again with batch 1:\n  ' + '\n  '.join(bad + [f'{k} (Azure failed)' for k in man.get('failed', [])]))

    page = f'{ROOT}/index.html'
    s = open(page).read()
    m = re.search(r'const AUD=(\{.*?\});', s, flags=re.S)
    aud = json.loads(m.group(1))
    extra = json.load(open(f'{ROOT}/extra-audio.json'))
    for k, v in new.items():
        (extra if re.match(r'[VG]_', k) else aud)[k] = v
    open(page, 'w').write(s[:m.start(1)] + json.dumps(aud) + s[m.end(1):])
    open(f'{ROOT}/extra-audio.json', 'w').write(json.dumps(extra, separators=(',', ':')))
    print(f'Added {len(new)} clips. Remember to raise CACHE in sw.js so phones pick up the new audio.')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1].rstrip('/'))
