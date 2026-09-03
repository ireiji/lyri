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
 * Fetches lyrics directly from github.com/akashrchandran/spotify-lyrics-api
 * Queries configured or local/public instances via trackid or url
 */
export async function fetchLyricsFromSpotifyLyricsApi(trackId, trackUrl, trackName, artistName, durationSec) {
  if (!trackId && !trackUrl) return null;

  const userCustomUrl = localStorage.getItem('spotify_lyrics_api_url');
  const candidateBases = [];

  if (userCustomUrl && userCustomUrl.trim()) {
    candidateBases.push(userCustomUrl.trim().replace(/\/+$/, ''));
  }

  // Common local Docker and hosted endpoints for akashrchandran/spotify-lyrics-api
  candidateBases.push('http://localhost:8080');
  candidateBases.push('https://spotify-lyrics-api.vercel.app');
  candidateBases.push('https://spotify-lyric-api-984e7b.herokuapp.com');

  for (const base of candidateBases) {
    const urlsToTry = [];
    if (trackId) {
      urlsToTry.push(`${base}/?trackid=${encodeURIComponent(trackId)}&format=raw`);
      urlsToTry.push(`${base}/?trackid=${encodeURIComponent(trackId)}&format=lrc`);
    }
    if (trackUrl) {
      urlsToTry.push(`${base}/?url=${encodeURIComponent(trackUrl)}&format=lrc`);
    }

    for (const targetUrl of urlsToTry) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(targetUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
          const contentType = res.headers.get('content-type') || '';
          let parsed = null;
          if (contentType.includes('application/json')) {
            const json = await res.json();
            if (!json.error) {
              parsed = parseSpotifyLyricsApiResponse(json, trackName, artistName, durationSec);
            }
          } else {
            const text = await res.text();
            if (text && !text.includes('<!DOCTYPE') && !text.includes('<html')) {
              parsed = parseSpotifyLyricsApiResponse(text, trackName, artistName, durationSec);
            }
          }

          if (parsed && parsed.frames && parsed.frames.length > 0) {
            console.log(`[SpotifyLyricsAPI] Loaded synced lyrics for "${trackName}" from ${base}`);
            parsed.source = 'spotify-lyrics-api';
            return parsed;
          }
        }
      } catch (e) {
        // Continue trying next candidate
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

  const cleanTrack = trackName.toLowerCase();
  const cleanArt = (artistName || '').toLowerCase();

  // Instant perfect match for Jackie Brown / Payphone demo datasets
  if (
    (cleanTrack.includes('jackie brown') || (cleanArt.includes('brent faiyaz') && cleanTrack.includes('jackie'))) ||
    (cleanTrack.includes('payphone') && cleanArt.includes('maroon'))
  ) {
    return {
      ...PAYPHONE_DEMO,
      title: trackName,
      artist: artistName || PAYPHONE_DEMO.artist,
      album: albumName || PAYPHONE_DEMO.album,
      duration: durationSec || PAYPHONE_DEMO.duration,
      source: 'demo',
    };
  }

  // 1. Try github.com/akashrchandran/spotify-lyrics-api first as requested
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

  // 2. Seamless fallback to LRCLIB
  const lrclibResult = await fetchLyricsFromLRCLIB(trackName, artistName, albumName, durationSec);
  if (lrclibResult) {
    lrclibResult.source = 'lrclib';
    return lrclibResult;
  }

  return null;
}

export async function fetchLyricsFromLRCLIB(trackName, artistName, albumName, durationSec) {
  if (!trackName) return null;

  const cleanTrack = trackName.toLowerCase();
  const cleanArt = (artistName || '').toLowerCase();

  // Instant perfect match for Jackie Brown / Payphone demo datasets
  if (
    (cleanTrack.includes('jackie brown') || (cleanArt.includes('brent faiyaz') && cleanTrack.includes('jackie'))) ||
    (cleanTrack.includes('payphone') && cleanArt.includes('maroon'))
  ) {
    return {
      ...PAYPHONE_DEMO,
      title: trackName,
      artist: artistName || PAYPHONE_DEMO.artist,
      album: albumName || PAYPHONE_DEMO.album,
      duration: durationSec || PAYPHONE_DEMO.duration,
    };
  }

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

// Splits an array of words into kinetic chunks of 1 to 3 words each
function chunkWordsForKineticTypography(words) {
  if (words.length <= 3) {
    return [words];
  }
  if (words.length === 4) {
    return [words.slice(0, 2), words.slice(2, 4)];
  }
  if (words.length === 5) {
    return [words.slice(0, 3), words.slice(3, 5)];
  }
  if (words.length === 6) {
    return [words.slice(0, 3), words.slice(3, 6)];
  }
  if (words.length === 7) {
    return [words.slice(0, 3), words.slice(3, 5), words.slice(5, 7)];
  }

  // For 8 or more words, slice into 2-3 word chunks
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const rem = words.length - i;
    if (rem === 4) {
      chunks.push(words.slice(i, i + 2));
      chunks.push(words.slice(i + 2, i + 4));
      break;
    } else if (rem <= 3) {
      chunks.push(words.slice(i));
      break;
    } else {
      chunks.push(words.slice(i, i + 3));
      i += 3;
    }
  }
  return chunks;
}

// Parse standard LRC into vertically stacked, 1-word-per-line kinetic frames matching the video
export function parseLrcLyrics(lrcString, trackTitle, artist, expectedDuration) {
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
      // Ignore empty musical symbols if alone
      if (text && text !== '♪' && text !== '♫') {
        rawLines.push({ time: timeSec, text });
      }
    }
  }

  if (rawLines.length === 0) return null;

  // Sort by start timestamp
  rawLines.sort((a, b) => a.time - b.time);

  const frames = [];
  const totalDuration = expectedDuration || rawLines[rawLines.length - 1].time + 6;

  // 1. Intro frame if song starts with silence/instrumental (> 1.2s before vocal)
  const firstVocalTime = rawLines[0].time;
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

  // 2. Process each vocal lyric line into kinetic chunks
  for (let i = 0; i < rawLines.length; i++) {
    const current = rawLines[i];
    const nextTime = i < rawLines.length - 1 ? rawLines[i + 1].time : current.time + 3.8;
    const gap = nextTime - current.time;

    // Filter words
    const rawWords = current.text.split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) continue;

    // Calculate line duration
    const estimatedSingingDuration = Math.max(1.2, rawWords.length * 0.45);
    const lineDuration = gap > 5.5 ? Math.min(estimatedSingingDuration, 4.2) : Math.max(1.2, gap);

    // Split words into 1-to-3-word kinetic chunks
    const wordChunks = chunkWordsForKineticTypography(rawWords);

    // Calculate character weights for timing distribution
    const wordWeights = rawWords.map((w) => {
      const cleanLen = w.replace(/[^a-zA-Z0-9]/g, '').length;
      return Math.max(1.0, Math.min(cleanLen * 0.65, 3.5));
    });
    const totalLineWeight = wordWeights.reduce((a, b) => a + b, 0);

    let currentChunkStart = current.time;
    let globalWordIdx = 0;

    wordChunks.forEach((chunk, chunkIdx) => {
      // Chunk weight
      const chunkWordWeights = chunk.map((_, idx) => wordWeights[globalWordIdx + idx]);
      const chunkWeight = chunkWordWeights.reduce((a, b) => a + b, 0);
      const chunkDuration = (chunkWeight / totalLineWeight) * lineDuration;
      const chunkEnd = currentChunkStart + chunkDuration;

      // Select ONE tape word in this frame (prefer word matching icon, or last word)
      let tapeWordLocalIdx = chunk.length - 1;
      const iconMatchIdx = chunk.findIndex((w) => getContextualIcon(w) !== null);
      if (iconMatchIdx !== -1) {
        tapeWordLocalIdx = iconMatchIdx;
      } else if (chunk.length >= 2 && chunk[0].toLowerCase() === "don't" || chunk[0].toLowerCase() === 'switch' || chunk[0].toLowerCase() === 'you') {
        tapeWordLocalIdx = 0;
      }

      const currentAngle = tapeAngles[angleIdx % tapeAngles.length];
      angleIdx++;

      let wordStartInChunk = currentChunkStart;
      const frameLines = [];

      chunk.forEach((wordText, localIdx) => {
        const wWeight = chunkWordWeights[localIdx];
        const wDuration = (wWeight / chunkWeight) * chunkDuration;
        const isTape = localIdx === tapeWordLocalIdx;
        const icon = getContextualIcon(wordText);

        const wordAngle = isTape ? currentAngle : (localIdx % 2 === 0 ? -2.4 : 2.2);
        const wordObj = {
          text: wordText,
          time: wordStartInChunk,
          duration: wDuration,
          isTape,
          angle: wordAngle,
          icon,
        };

        wordStartInChunk += wDuration;

        // In the reference video, EACH WORD IN THE FRAME GETS ITS OWN VERTICAL LINE!
        frameLines.push({
          id: `l-${i}-${chunkIdx}-${localIdx}`,
          words: [wordObj],
        });
      });

      frames.push({
        id: `frame-${i}-${chunkIdx}`,
        startTime: currentChunkStart,
        endTime: chunkEnd,
        lines: frameLines,
      });

      globalWordIdx += chunk.length;
      currentChunkStart = chunkEnd;
    });

    // Instrumental interlude break if gap > 5.5s
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

