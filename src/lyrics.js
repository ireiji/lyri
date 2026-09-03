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
    sparkle: 'sparkles',
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
      const text = match[2].trim();
      if (text) {
        rawLines.push({ time: timeSec, text });
      }
    }
  }

  if (rawLines.length === 0) return null;

  // Group lines into kinetic frames (2 or 3 lines per frame)
  const frames = [];
  const maxTime = rawLines[rawLines.length - 1].time + 8;

  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i];
    const nextTime = i < rawLines.length - 1 ? rawLines[i + 1].time : current.time + 3.8;
    const duration = Math.max(1.8, nextTime - current.time);

    // Split text into words with interpolated word timings
    const rawWords = current.text.split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) continue;

    const wordDuration = duration / rawWords.length;
    const words = rawWords.map((w, wIdx) => {
      const wordTime = current.time + wIdx * wordDuration;
      // Mark last word or punchy word as tape sticker
      const isTape = wIdx === rawWords.length - 1 && w.length > 2;
      const angle = isTape ? (wIdx % 2 === 0 ? -2.2 : 2.4) : 0;
      const icon = getContextualIcon(w);

      return {
        text: w,
        time: wordTime,
        duration: wordDuration,
        isTape,
        angle,
        icon,
      };
    });

    // Structure into stacked lines: split 1-3 lines per frame
    const lineStack = [];
    if (words.length <= 2) {
      lineStack.push({ id: `l-${i}-0`, words });
    } else if (words.length <= 5) {
      const mid = Math.ceil(words.length / 2);
      lineStack.push({ id: `l-${i}-0`, words: words.slice(0, mid) });
      lineStack.push({ id: `l-${i}-1`, words: words.slice(mid) });
    } else {
      const chunk1 = Math.ceil(words.length / 3);
      const chunk2 = Math.ceil((words.length - chunk1) / 2);
      lineStack.push({ id: `l-${i}-0`, words: words.slice(0, chunk1) });
      lineStack.push({ id: `l-${i}-1`, words: words.slice(chunk1, chunk1 + chunk2) });
      lineStack.push({ id: `l-${i}-2`, words: words.slice(chunk1 + chunk2) });
    }

    frames.push({
      id: `frame-${i}`,
      startTime: current.time,
      endTime: nextTime,
      lines: lineStack,
    });
  }

  return {
    id: `lrc-${Date.now()}`,
    title: trackTitle || 'Live Stream',
    artist: artist || 'Unknown Artist',
    album: 'Synced Lyrics',
    duration: maxTime,
    frames,
  };
}
