// LRCLIB API Client and Enhanced Synced Lyrics Parser
export async function fetchLyricsFromLRCLIB(trackName, artistName, albumName, durationSec) {
  try {
    const params = new URLSearchParams({
      track_name: trackName,
      artist_name: artistName,
    });
    if (albumName) params.append('album_name', albumName);
    if (durationSec) params.append('duration', Math.round(durationSec).toString());

    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.syncedLyrics) {
        return parseLrcLyrics(data.syncedLyrics, trackName, artistName);
      }
    }

    // Fallback: search query
    const searchRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(`${artistName} ${trackName}`)}`);
    if (searchRes.ok) {
      const results = await searchRes.json();
      const match = results.find((r) => r.syncedLyrics);
      if (match && match.syncedLyrics) {
        return parseLrcLyrics(match.syncedLyrics, trackName, artistName);
      }
    }
  } catch (err) {
    console.warn('LRCLIB fetch error:', err);
  }
  return null;
}

// Convert MM:SS.xx timestamp to seconds
export function parseTimestamp(timeStr) {
  const match = timeStr.match(/(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return 0;
  return parseInt(match[1], 10) * 60 + parseFloat(match[2]);
}

// Check for contextual icon mappings
export function getContextualIcon(word) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  const iconMap = {
    car: 'car',
    cars: 'car',
    whip: 'car',
    ride: 'car',
    drive: 'car',
    start: 'play',
    play: 'play',
    dice: 'dice',
    chance: 'dice',
    chances: 'dice',
    game: 'dice',
    phone: 'phone',
    call: 'phone',
    number: 'phone',
    ring: 'phone',
    you: 'user',
    me: 'user',
    heart: 'heart',
    love: 'heart',
    need: 'heart',
    swish: 'hand',
    hand: 'hand',
    shame: 'sparkles',
    star: 'sparkles',
    stars: 'sparkles',
    sparkle: 'sparkles',
    fire: 'sparkles',
    sun: 'sparkles',
  };
  return iconMap[clean] || null;
}

// Parse LRC into stacked kinetic frames with word-for-word timestamps
export function parseLrcLyrics(lrcString, trackTitle, artist) {
  const lines = lrcString.split('\n');
  const rawLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Line timestamp e.g. [01:23.45]
    const match = trimmed.match(/^\[(\d{2}:\d{2}(?:\.\d+)?)\](.*)/);
    if (match) {
      const timeSec = parseTimestamp(match[1]);
      let text = match[2].trim();
      // Remove any trailing [00:00.00] tags if present
      text = text.replace(/\[\d{2}:\d{2}(?:\.\d+)?\]/g, '').trim();
      // Ignore empty musical symbols like ♪ if alone
      if (text && text !== '♪' && text !== '♫') {
        rawLines.push({ time: timeSec, text });
      }
    }
  }

  if (rawLines.length === 0) return null;

  // Sort by start timestamp
  rawLines.sort((a, b) => a.time - b.time);

  const frames = [];
  const totalDuration = rawLines[rawLines.length - 1].time + 6;

  // 1. If song starts with an intro gap (> 1.2s before first vocal), add an Intro Frame
  const firstVocalTime = rawLines[0].time;
  if (firstVocalTime > 1.2) {
    frames.push({
      id: 'frame-intro',
      startTime: 0.0,
      endTime: firstVocalTime,
      isIntro: true,
      lines: [
        {
          id: 'intro-line-1',
          words: [
            {
              text: trackTitle || 'Live Audio',
              time: 0.0,
              duration: firstVocalTime * 0.5,
              isTape: false,
              angle: 0,
            },
          ],
        },
        {
          id: 'intro-line-2',
          words: [
            {
              text: artist ? `by ${artist}` : 'Intro',
              time: firstVocalTime * 0.5,
              duration: firstVocalTime * 0.5,
              isTape: true,
              angle: -2.5,
            },
          ],
        },
      ],
    });
  }

  // 2. Process each vocal lyric line into kinetic stacked frames
  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i];
    const nextTime = i < rawLines.length - 1 ? rawLines[i + 1].time : current.time + 4.0;
    const gap = nextTime - current.time;

    // Filter into words
    const rawWords = current.text.split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) continue;

    // Natural singing duration: human singing rate is ~0.3s - 0.6s per word
    const estimatedSingingDuration = Math.max(1.4, rawWords.length * 0.42);
    // If the gap to the next line is large (> 5.5s), don't stretch words across a guitar solo!
    const lineDuration = gap > 5.5 ? Math.min(estimatedSingingDuration, 4.2) : Math.max(1.4, gap);

    // Calculate word duration weighted by character length for natural vocal rhythm
    const weights = rawWords.map((w, idx) => {
      const cleanLen = w.replace(/[^a-zA-Z0-9]/g, '').length;
      let wt = Math.max(1.0, Math.min(cleanLen * 0.65, 4.0));
      if (idx === rawWords.length - 1) wt *= 1.35; // End-of-phrase word is sustained
      return wt;
    });
    const totalWeight = weights.reduce((acc, v) => acc + v, 0);

    let currentWordStart = current.time;
    const words = rawWords.map((w, wIdx) => {
      const wDuration = (weights[wIdx] / totalWeight) * lineDuration;
      const wTime = currentWordStart;
      currentWordStart += wDuration;

      // Make last word or emphasized punchy word a tape cutout badge
      const isTape = wIdx === rawWords.length - 1 && w.length > 1;
      const angle = isTape ? (wIdx % 2 === 0 ? -2.6 : 2.4) : 0;
      const icon = getContextualIcon(w);

      return {
        text: w,
        time: wTime,
        duration: wDuration,
        isTape,
        angle,
        icon,
      };
    });

    // 3. Structure into kinetic stacked lines (max 3-4 words per line for huge bold display typography)
    const lineStack = [];
    if (words.length <= 3) {
      lineStack.push({ id: `l-${i}-0`, words });
    } else if (words.length <= 6) {
      const mid = Math.ceil(words.length / 2);
      lineStack.push({ id: `l-${i}-0`, words: words.slice(0, mid) });
      lineStack.push({ id: `l-${i}-1`, words: words.slice(mid) });
    } else if (words.length <= 9) {
      const chunk1 = Math.ceil(words.length / 3);
      const chunk2 = Math.ceil((words.length - chunk1) / 2);
      lineStack.push({ id: `l-${i}-0`, words: words.slice(0, chunk1) });
      lineStack.push({ id: `l-${i}-1`, words: words.slice(chunk1, chunk1 + chunk2) });
      lineStack.push({ id: `l-${i}-2`, words: words.slice(chunk1 + chunk2) });
    } else {
      // For very long lines (> 9 words), split into 3 balanced stacked lines
      const c1 = Math.ceil(words.length / 3);
      const c2 = Math.ceil((words.length - c1) / 2);
      lineStack.push({ id: `l-${i}-0`, words: words.slice(0, c1) });
      lineStack.push({ id: `l-${i}-1`, words: words.slice(c1, c1 + c2) });
      lineStack.push({ id: `l-${i}-2`, words: words.slice(c1 + c2) });
    }

    frames.push({
      id: `frame-${i}`,
      startTime: current.time,
      endTime: current.time + lineDuration,
      lines: lineStack,
    });

    // 4. If there is a long instrumental break (> 5.5s) between this line and the next, add an Interlude Frame
    if (gap > 5.5 && i < rawLines.length - 1) {
      const interludeStart = current.time + lineDuration;
      const interludeEnd = nextTime;
      frames.push({
        id: `interlude-${i}`,
        startTime: interludeStart,
        endTime: interludeEnd,
        isInterlude: true,
        lines: [
          {
            id: `interlude-line-${i}`,
            words: [
              {
                text: '♪  ♫  ♪',
                time: interludeStart,
                duration: interludeEnd - interludeStart,
                isTape: true,
                angle: 1.5,
              },
            ],
          },
        ],
      });
    }
  }

  return {
    id: `lrc-${Date.now()}`,
    title: trackTitle || 'Live Stream',
    artist: artist || 'Unknown Artist',
    album: 'Synced Lyrics',
    duration: totalDuration,
    frames,
  };
}
