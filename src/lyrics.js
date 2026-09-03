// Unified Lyrics Engine: github.com/akashrchandran/spotify-lyrics-api + LRCLIB
import { PAYPHONE_DEMO } from './data.js';

/**
 * Parses response from github.com/akashrchandran/spotify-lyrics-api
 * Supports both format=raw (JSON lines with startTimeMs) and format=lrc (plain LRC string or JSON)
 */
export function parseSpotifyLyricsApiResponse(data, trackName, artistName, durationSec) {
  if (!data) return null;

  // 1. Plain text LRC string
  if (typeof data === 'string' && (data.includes('[0') || data.includes('[1') || data.includes('[2') || data.includes(']'))) {
    return parseLrcLyrics(data, trackName, artistName, durationSec);
  }

  // 2. Object with lines array (from spotify-lyrics-api format=raw or format=json)
  const linesArray = data.lines || data.lyrics?.lines;
  if (Array.isArray(linesArray) && linesArray.length > 0) {
    const syncType = data.syncType || data.lyrics?.syncType;
    if (syncType === 'UNSYNCED') {
      const plainText = linesArray.map((l) => l.words || '').join('\n');
      return synthesizeKineticFromPlain(plainText, trackName, artistName, durationSec || 180);
    }

    const lrcLines = linesArray
      .filter((l) => l && typeof l.words === 'string' && l.words.trim() && l.words !== '♪')
      .map((l) => {
        const timeSec = (parseFloat(l.startTimeMs || 0)) / 1000;
        const m = Math.floor(timeSec / 60);
        const s = (timeSec % 60).toFixed(2);
        return `[${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}] ${l.words}`;
      });

    if (lrcLines.length > 0) {
      return parseLrcLyrics(lrcLines.join('\n'), trackName, artistName, durationSec);
    }
  }

  // 3. Object with nested lrc string or lyrics string
  if (typeof data.lrc === 'string' && data.lrc.includes('[')) {
    return parseLrcLyrics(data.lrc, trackName, artistName, durationSec);
  }
  if (typeof data.lyrics === 'string' && data.lyrics.includes('[')) {
    return parseLrcLyrics(data.lyrics, trackName, artistName, durationSec);
  }

  return null;
}

/**
 * Fetches lyrics from akashrchandran/spotify-lyrics-api if configured by user
 * When not configured, returns null immediately to use LRCLIB with zero errors.
 */
export async function fetchLyricsFromSpotifyLyricsApi(trackId, trackUrl, trackName, artistName, durationSec) {
  if (!trackId && !trackUrl) return null;

  const userCustomUrl = localStorage.getItem('spotify_lyrics_api_url');
  // If user hasn't set up or specified a custom endpoint, bypass to avoid ERR_CONNECTION_REFUSED
  if (!userCustomUrl || !userCustomUrl.trim()) {
    return null;
  }

  const base = userCustomUrl.trim().replace(/\/+$/, '');
  const targetUrl = trackId
    ? `${base}/?trackid=${encodeURIComponent(trackId)}&format=raw`
    : `${base}/?url=${encodeURIComponent(trackUrl)}&format=lrc`;

  const doAttempt = async (url) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const json = await res.json();
        return json.error ? null : parseSpotifyLyricsApiResponse(json, trackName, artistName, durationSec);
      } else {
        const text = await res.text();
        if (text && !text.includes('<!DOCTYPE') && !text.includes('<html')) {
          return parseSpotifyLyricsApiResponse(text, trackName, artistName, durationSec);
        }
      }
      return null;
    } catch (err) {
      clearTimeout(timeoutId);
      throw err;
    }
  };

  try {
    const parsed = await doAttempt(targetUrl);
    if (parsed && parsed.frames && parsed.frames.length > 0) {
      parsed.source = 'spotify-lyrics-api';
      return parsed;
    }
  } catch (err) {
    // If user entered a remote URL that is blocked by browser CORS, attempt via CORS proxy
    if (base.startsWith('https://') || (base.startsWith('http://') && !base.includes('localhost') && !base.includes('127.0.0.1'))) {
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const parsed = await doAttempt(proxyUrl);
        if (parsed && parsed.frames && parsed.frames.length > 0) {
          parsed.source = 'spotify-lyrics-api';
          return parsed;
        }
      } catch (proxyErr) {
        // Fallback silently to LRCLIB
      }
    }
  }

  return null;
}

/**
 * Unified Lyric Fetcher: checks demo -> tries akashrchandran/spotify-lyrics-api -> falls back to LRCLIB
 */
export async function fetchTrackLyrics(trackName, artistName, albumName, durationSec, trackId, trackUrl) {
  if (!trackName) return null;

  // 1. Try github.com/akashrchandran/spotify-lyrics-api first if configured
  if (trackId || trackUrl) {
    try {
      const spotifyLyrics = await fetchLyricsFromSpotifyLyricsApi(trackId, trackUrl, trackName, artistName, durationSec);
      if (spotifyLyrics) {
        return spotifyLyrics;
      }
    } catch (err) {
      console.debug('Spotify lyrics api error:', err);
    }
  }

  // 2. Seamless fetch from LRCLIB
  const lrclibResult = await fetchLyricsFromLRCLIB(trackName, artistName, albumName, durationSec);
  if (lrclibResult) {
    lrclibResult.source = 'lrclib';
    return lrclibResult;
  }

  // 3. Fallback to demo only if track name matches Jackie Brown demo
  const cleanTrack = trackName.toLowerCase();
  const cleanArt = (artistName || '').toLowerCase();
  if (cleanTrack.includes('jackie brown') || (cleanArt.includes('brent faiyaz') && cleanTrack.includes('jackie'))) {
    return {
      ...PAYPHONE_DEMO,
      title: trackName,
      artist: artistName || PAYPHONE_DEMO.artist,
      album: albumName || PAYPHONE_DEMO.album,
      duration: durationSec || PAYPHONE_DEMO.duration,
      source: 'demo',
    };
  }

  return null;
}

export async function fetchLyricsFromLRCLIB(trackName, artistName, albumName, durationSec) {
  if (!trackName) return null;

  // Multi-tier clean query generation
  const strippedTitle = trackName
    .replace(/\s*[\(\[](feat|ft|with|prod|remastered|version|edit|deluxe).*?[\)\]]/gi, '')
    .replace(/\s*-\s*(remastered|radio edit|bonus track|single version|sped up|slowed|acoustic).*?$/gi, '')
    .trim();

  const primaryArtist = (artistName || '').split(/[,&/]/)[0].trim();

  const searchCandidates = [
    // 1. Clean track + Primary artist
    { track: strippedTitle, artist: primaryArtist },
    // 2. Original track + Primary artist
    { track: trackName, artist: primaryArtist },
    // 3. Clean track only
    { track: strippedTitle, artist: '' },
  ];

  try {
    for (const candidate of searchCandidates) {
      if (!candidate.track) continue;

      // Try GET with minimal required query (avoiding album/duration 404 mismatch)
      const params = new URLSearchParams({
        track_name: candidate.track,
      });
      if (candidate.artist) params.append('artist_name', candidate.artist);

      try {
        const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          if (data.syncedLyrics) {
            return parseLrcLyrics(data.syncedLyrics, trackName, artistName, durationSec);
          }
        }
      } catch (err) {
        console.debug('LRCLIB get attempt failed:', err);
      }

      // Try Search API
      const searchUrl = candidate.artist
        ? `https://lrclib.net/api/search?track_name=${encodeURIComponent(candidate.track)}&artist_name=${encodeURIComponent(candidate.artist)}`
        : `https://lrclib.net/api/search?q=${encodeURIComponent(`${candidate.artist} ${candidate.track}`.trim())}`;

      try {
        const searchRes = await fetch(searchUrl);
        if (searchRes.ok) {
          const results = await searchRes.json();
          if (Array.isArray(results) && results.length > 0) {
            // Find results with synced lyrics
            const withSynced = results.filter((r) => r.syncedLyrics);
            if (withSynced.length > 0) {
              // Pick closest duration if known
              let bestMatch = withSynced[0];
              if (durationSec) {
                bestMatch = withSynced.reduce((prev, curr) => {
                  const prevDiff = Math.abs((prev.duration || 0) - durationSec);
                  const currDiff = Math.abs((curr.duration || 0) - durationSec);
                  return currDiff < prevDiff ? curr : prev;
                }, withSynced[0]);
              }
              return parseLrcLyrics(bestMatch.syncedLyrics, trackName, artistName, durationSec);
            }

            // If only plain lyrics exist, synthesize timed kinetic frames!
            const withPlain = results.find((r) => r.plainLyrics);
            if (withPlain && withPlain.plainLyrics) {
              return synthesizeKineticFromPlain(withPlain.plainLyrics, trackName, artistName, durationSec || withPlain.duration || 180);
            }
          }
        }
      } catch (err) {
        console.debug('LRCLIB search attempt failed:', err);
      }
    }
  } catch (err) {
    console.warn('LRCLIB fetch error:', err);
  }

  // Fallback: create dynamic placeholder frames matching track info so UI is never blank
  return createFallbackKineticTrack(trackName, artistName, durationSec || 180);
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
    sparkles: 'sparkles',
    fire: 'sparkles',
    sun: 'sparkles',
  };
  return iconMap[clean] || null;
}

// Arranges an array of words into 1-3 vertically stacked lines for giant kinetic typography
function layoutWordsIntoStackedLines(words) {
  if (words.length <= 3) {
    // 1-3 words: 1 word per stacked line (matching the reference video's punchy kinetic look)
    return words.map((w) => [w]);
  }
  if (words.length === 4) {
    return [words.slice(0, 2), words.slice(2, 4)];
  }
  if (words.length === 5) {
    return [words.slice(0, 2), words.slice(2, 5)];
  }
  if (words.length === 6) {
    return [words.slice(0, 2), words.slice(2, 4), words.slice(4, 6)];
  }
  if (words.length === 7) {
    return [words.slice(0, 2), words.slice(2, 5), words.slice(5, 7)];
  }
  // 8 words
  return [words.slice(0, 3), words.slice(3, 5), words.slice(5, 8)];
}

// Splits a long lyric line (> 8 words) into 2 natural conversational phrases
function splitLongLineIntoPhrases(words) {
  if (words.length <= 8) return [words];

  // Look for natural punctuation split point (comma, question mark, dash) between index 3 and length - 3
  let splitIdx = -1;
  for (let i = 3; i < words.length - 2; i++) {
    if (/[,;:\-\?!]/.test(words[i])) {
      splitIdx = i + 1;
      break;
    }
  }

  if (splitIdx === -1) {
    splitIdx = Math.ceil(words.length / 2);
  }

  const p1 = words.slice(0, splitIdx);
  const p2 = words.slice(splitIdx);
  return [p1, p2];
}

// Parse standard LRC or Enhanced LRC into seamless, continuously synchronized kinetic frames
export function parseLrcLyrics(lrcString, trackTitle, artist, expectedDuration) {
  if (!lrcString || typeof lrcString !== 'string') return null;

  const rawLines = [];
  const lines = lrcString.split('\n');

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

      // Check if this line is an empty marker or instrumental pause
      const isMusicPause = !text || text === '♪' || text === '♫';
      rawLines.push({
        time: timeSec,
        text: isMusicPause ? '' : text,
        isPause: isMusicPause,
      });
    }
  }

  if (rawLines.length === 0) return null;

  // Sort chronologically by timestamp
  rawLines.sort((a, b) => a.time - b.time);

  const frames = [];
  const totalDuration = expectedDuration || (rawLines[rawLines.length - 1].time + 6);

  // 1. Intro frame if song starts with an instrumental/intro (> 1.0s before first vocal)
  const firstVocalItem = rawLines.find((l) => !l.isPause && l.text);
  const firstVocalTime = firstVocalItem ? firstVocalItem.time : 2.0;

  if (firstVocalTime > 1.2) {
    frames.push({
      id: 'frame-intro',
      startTime: 0.0,
      endTime: firstVocalTime,
      isIntro: true,
      lines: [
        {
          id: 'intro-l1',
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
          id: 'intro-l2',
          words: [
            {
              text: artist ? `by ${artist}` : 'Intro',
              time: firstVocalTime * 0.5,
              duration: firstVocalTime * 0.5,
              isTape: true,
              angle: -2.4,
            },
          ],
        },
      ],
    });
  }

  const tapeAngles = [-2.6, 2.2, -1.8, 2.5, -2.2, 1.9];
  let angleIdx = 0;

  // 2. Iterate through each lyric item and construct seamless phrase frames
  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i];
    if (current.isPause || !current.text) continue;

    // Find next event (either next vocal line or next pause or end of track)
    const nextItem = rawLines[i + 1];
    const nextTime = nextItem ? nextItem.time : (current.time + 4.5);
    const lineGap = Math.max(1.2, nextTime - current.time);

    // Check for Enhanced LRC word timestamps e.g. <00:06.47> word <00:07.12> word
    const enhancedWordMatches = [...current.text.matchAll(/<(\d{2}:\d{2}(?:\.\d+)?)>\s*([^\s<]+)/g)];
    const hasEnhancedWords = enhancedWordMatches.length >= 2;

    let rawWords = [];
    let enhancedTimings = [];

    if (hasEnhancedWords) {
      enhancedWordMatches.forEach((m) => {
        const wTime = parseTimestamp(m[1]);
        const wText = m[2].trim();
        if (wText) {
          rawWords.push(wText);
          enhancedTimings.push(wTime);
        }
      });
    } else {
      // Standard LRC text: clean off any remaining bracketed codes
      const cleanLineText = current.text.replace(/<[^>]+>/g, '').trim();
      rawWords = cleanLineText.split(/\s+/).filter(Boolean);
    }

    if (rawWords.length === 0) continue;

    // Split long lines (> 8 words) into conversational phrases
    const phrases = splitLongLineIntoPhrases(rawWords);

    // Determine total singing duration for the line
    let totalSingingDuration = lineGap;
    let hasInterludeAfter = false;

    if (lineGap > 4.8) {
      // In longer gaps (> 4.8s), vocal singing occupies natural singing duration
      const estimatedVocalSec = Math.min(lineGap - 1.5, Math.max(2.2, rawWords.length * 0.65));
      totalSingingDuration = estimatedVocalSec;
      hasInterludeAfter = true;
    } else {
      // In rapid sequence, singing spans ~92% of gap to leave a brief musical breath
      totalSingingDuration = lineGap * 0.92;
    }

    // Weight phrases proportionally
    const phraseWeights = phrases.map((p) => p.reduce((sum, w) => sum + Math.max(1.0, w.replace(/[^a-zA-Z0-9]/g, '').length * 0.7), 0));
    const totalLineWeight = phraseWeights.reduce((a, b) => a + b, 0);

    let phraseStartTime = current.time;
    let wordCursor = 0;

    phrases.forEach((phraseWords, phraseIdx) => {
      const pWeight = phraseWeights[phraseIdx];
      const phraseDuration = (pWeight / totalLineWeight) * totalSingingDuration;
      
      // If this is the last phrase and there is NO interlude, frame stays visible until next line
      const phraseEndTime = (!hasInterludeAfter && phraseIdx === phrases.length - 1)
        ? nextTime
        : (phraseStartTime + phraseDuration);

      // Select ONE tape sticker word for this frame
      let tapeWordIdx = phraseWords.length - 1;
      const iconMatch = phraseWords.findIndex((w) => getContextualIcon(w) !== null);
      if (iconMatch !== -1) {
        tapeWordIdx = iconMatch;
      } else if (phraseWords.length >= 2 && (/^(don't|can't|never|always|evergreen|love|switch|you|i)$/i.test(phraseWords[0]))) {
        tapeWordIdx = 0;
      }

      const currentAngle = tapeAngles[angleIdx % tapeAngles.length];
      angleIdx++;

      // Compute word weights with natural vocal inflection
      const wordWeights = phraseWords.map((w, wIdx) => {
        const cleanLen = w.replace(/[^a-zA-Z0-9]/g, '').length;
        let weight = Math.max(1.0, cleanLen * 0.7);
        // Words with punctuation get extra pause
        if (/[,;:\.?!]/.test(w)) weight *= 1.35;
        // Last word of the phrase is sustained by the singer
        if (wIdx === phraseWords.length - 1) weight *= 1.75;
        return weight;
      });
      const totalPhraseWeight = wordWeights.reduce((a, b) => a + b, 0);

      // Calculate exact start times and durations for each word
      let wordStart = phraseStartTime;
      const wordObjects = phraseWords.map((wText, wIdx) => {
        let wTime = wordStart;
        let wDur = 0.5;

        if (hasEnhancedWords && enhancedTimings[wordCursor + wIdx] !== undefined) {
          wTime = enhancedTimings[wordCursor + wIdx];
          const nextWTime = enhancedTimings[wordCursor + wIdx + 1] || (phraseStartTime + phraseDuration);
          wDur = Math.max(0.2, nextWTime - wTime);
        } else {
          const wWeight = wordWeights[wIdx];
          wDur = (wWeight / totalPhraseWeight) * phraseDuration;
          wordStart += wDur;
        }

        const isTape = wIdx === tapeWordIdx;
        const icon = getContextualIcon(wText);
        const wordAngle = isTape ? currentAngle : (wIdx % 2 === 0 ? -2.4 : 2.2);

        return {
          text: wText,
          time: wTime,
          duration: wDur,
          isTape,
          angle: wordAngle,
          icon,
        };
      });

      // Format words into stacked lines (1 to 3 vertical lines)
      const stackedLines = layoutWordsIntoStackedLines(wordObjects);
      const frameLines = stackedLines.map((lineWords, lineSubIdx) => ({
        id: `l-${i}-${phraseIdx}-${lineSubIdx}`,
        words: lineWords,
      }));

      frames.push({
        id: `frame-${i}-${phraseIdx}`,
        startTime: phraseStartTime,
        endTime: phraseEndTime,
        lines: frameLines,
      });

      wordCursor += phraseWords.length;
      phraseStartTime = phraseEndTime;
    });

    // 3. Instrumental interlude frame if there is a gap > 4.8s before the next vocal line
    if (hasInterludeAfter && i < rawLines.length - 1) {
      const interludeStart = current.time + totalSingingDuration;
      const interludeEnd = nextTime;
      if (interludeEnd - interludeStart >= 1.5) {
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

// Synthesizes kinetic frames from unsynced plain lyrics text
function synthesizeKineticFromPlain(plainText, trackTitle, artist, durationSec) {
  const lines = plainText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('['));

  if (lines.length === 0) return null;

  // Approximate line spacing over duration
  const perLine = Math.min(3.5, Math.max(1.8, (durationSec - 4) / lines.length));
  let lrcMock = '';
  lines.forEach((line, idx) => {
    const t = 1.0 + idx * perLine;
    const m = Math.floor(t / 60);
    const s = (t % 60).toFixed(2);
    lrcMock += `[${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}] ${line}\n`;
  });

  return parseLrcLyrics(lrcMock, trackTitle, artist, durationSec);
}

// Creates an aesthetic placeholder kinetic track when lyrics are unavailable
function createFallbackKineticTrack(trackTitle, artist, durationSec) {
  const words = (trackTitle || 'Now Playing').split(/\s+/);
  return {
    id: `fallback-${Date.now()}`,
    title: trackTitle || 'Now Playing',
    artist: artist || 'Live Audio',
    album: 'Spotify Live',
    duration: durationSec || 180,
    frames: [
      {
        id: 'fb-1',
        startTime: 0.0,
        endTime: durationSec || 180,
        lines: [
          {
            id: 'fb-l1',
            words: [{ text: words[0] || 'Live', time: 0.0, duration: 2.0 }],
          },
          {
            id: 'fb-l2',
            words: [{ text: words.slice(1).join(' ') || trackTitle || 'Audio', isTape: true, angle: -2.2, time: 2.0, duration: 3.0 }],
          },
          {
            id: 'fb-l3',
            words: [{ text: artist || 'Spotify', time: 5.0, duration: 4.0 }],
          },
        ],
      },
    ],
  };
}

