// Unified Lyrics Engine: BetterLyrics CF-API (github.com/better-lyrics/cf-api) + akashrchandran/spotify-lyrics-api + LRCLIB + Word-by-Word eLRC / TTML
import { PAYPHONE_DEMO } from './data.js';

/**
 * Parses timestamp string (supports HH:MM:SS.ms, MM:SS.ms, or pure seconds S.ms)
 */
export function parseTimestamp(timeStr) {
  if (!timeStr) return 0;
  const str = timeStr.trim().replace(/s$/, '');
  
  // Format: HH:MM:SS.mmm or HH:MM:SS:frame
  const parts = str.split(':');
  if (parts.length === 3) {
    const h = parseFloat(parts[0]) || 0;
    const m = parseFloat(parts[1]) || 0;
    const s = parseFloat(parts[2]) || 0;
    return h * 3600 + m * 60 + s;
  }
  if (parts.length === 2) {
    const m = parseFloat(parts[0]) || 0;
    const s = parseFloat(parts[1]) || 0;
    return m * 60 + s;
  }
  return parseFloat(str) || 0;
}

/**
 * Formats seconds into MM:SS.xx timestamp
 */
export function formatLrcTimestamp(sec) {
  const sTotal = Math.max(0, sec || 0);
  const m = Math.floor(sTotal / 60);
  const s = (sTotal % 60).toFixed(2);
  return `${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}`;
}

/**
 * Formats seconds into TTML timecode HH:MM:SS.mmm
 */
export function formatTtmlTimestamp(sec) {
  const sTotal = Math.max(0, sec || 0);
  const h = Math.floor(sTotal / 3600);
  const m = Math.floor((sTotal % 3600) / 60);
  const s = (sTotal % 60).toFixed(3);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.padStart(6, '0')}`;
}

/**
 * Extracts YouTube Video ID from raw ID, standard YouTube URL, or YouTube Music URL
 */
export function extractYouTubeVideoId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    if (url.hostname.includes('youtube.com')) {
      const v = url.searchParams.get('v');
      if (v) return v;
    }
    if (url.hostname.includes('youtu.be')) {
      const id = url.pathname.replace(/^\/+/, '').split('/')[0];
      if (id && id.length === 11) return id;
    }
  } catch (e) {}
  const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

/**
 * Parses response from BetterLyrics CF-API (github.com/better-lyrics/cf-api)
 * Supports Musixmatch richsync (word-level sync), standard LRC fetchedLyrics, lyrics, and LrcLib
 */
export function parseBetterLyricsApiResponse(data, fallbackTitle, fallbackArtist, fallbackDuration) {
  if (!data) return null;

  const title = data.song || data.title || data.trackName || fallbackTitle || 'Unknown Track';
  const artist = data.artist || data.artistName || fallbackArtist || 'Unknown Artist';
  const album = data.album || '';
  const duration = (typeof data.duration === 'number' && data.duration > 0)
    ? data.duration
    : (fallbackDuration || 180);

  // 1. Check Musixmatch richsync for high-precision word-by-word synchronized lyrics
  let richsync = data.musixmatch?.richsync;
  if (typeof richsync === 'string') {
    try {
      richsync = JSON.parse(richsync);
    } catch (e) {}
  }

  if (Array.isArray(richsync) && richsync.length > 0) {
    const lrcLines = [];
    for (const item of richsync) {
      const lineTime = typeof item.ts === 'number' ? item.ts : parseFloat(item.ts || 0);
      const words = Array.isArray(item.l)
        ? item.l.map((w) => w.c || '').join(' ').trim()
        : (item.x || '');
      if (words && words !== '♪') {
        const m = Math.floor(lineTime / 60);
        const s = (lineTime % 60).toFixed(2);
        lrcLines.push(`[${m.toString().padStart(2, '0')}:${s.padStart(5, '0')}] ${words}`);
      }
    }
    if (lrcLines.length > 0) {
      const parsed = parseMusixmatchRichsync(richsync, title, artist, duration);
      if (parsed) {
        parsed.source = 'better-lyrics-cf-api';
        parsed.hasWordSync = true;
        parsed.album = album;
        return parsed;
      }
    }
  }

  // 2. Check fetchedLyrics (the primary LRC output from cf-api GetLyrics.ts)
  if (typeof data.fetchedLyrics === 'string' && (data.fetchedLyrics.includes('[0') || data.fetchedLyrics.includes('[1') || data.fetchedLyrics.includes(']'))) {
    const parsed = parseAnyLyricsFormat(data.fetchedLyrics, title, artist, duration);
    if (parsed) {
      parsed.source = 'better-lyrics-cf-api';
      parsed.album = album;
      return parsed;
    }
  }

  // 3. Check data.lyrics (string LRC or object with lines)
  if (typeof data.lyrics === 'string' && (data.lyrics.includes('[0') || data.lyrics.includes(']'))) {
    const parsed = parseAnyLyricsFormat(data.lyrics, title, artist, duration);
    if (parsed) {
      parsed.source = 'better-lyrics-cf-api';
      parsed.album = album;
      return parsed;
    }
  } else if (data.lyrics && typeof data.lyrics === 'object') {
    const parsed = parseSpotifyLyricsApiResponse(data.lyrics, title, artist, duration);
    if (parsed) {
      parsed.source = 'better-lyrics-cf-api';
      parsed.album = album;
      return parsed;
    }
  }

  // 4. Check data.lrclib
  if (data.lrclib) {
    if (data.lrclib.syncedLyrics) {
      const parsed = parseAnyLyricsFormat(data.lrclib.syncedLyrics, title, artist, duration);
      if (parsed) {
        parsed.source = 'better-lyrics-cf-api';
        parsed.album = album;
        return parsed;
      }
    }
    if (data.lrclib.plainLyrics) {
      const parsed = synthesizeKineticFromPlain(data.lrclib.plainLyrics, title, artist, duration);
      if (parsed) {
        parsed.source = 'better-lyrics-cf-api';
        parsed.album = album;
        return parsed;
      }
    }
  }

  // 5. Check musixmatch body or subtitles
  if (data.musixmatch?.lyrics?.body) {
    const parsed = synthesizeKineticFromPlain(data.musixmatch.lyrics.body, title, artist, duration);
    if (parsed) {
      parsed.source = 'better-lyrics-cf-api';
      parsed.album = album;
      return parsed;
    }
  }

  return null;
}

/**
 * Fetches lyrics from BetterLyrics Cloudflare Worker API (github.com/better-lyrics/cf-api)
 * Accepts videoId (YouTube) or metadata (song, artist, album, duration)
 */
export async function fetchLyricsFromBetterLyricsCfApi({ videoId, song, artist, album, duration }) {
  const customUrl = localStorage.getItem('better_lyrics_api_url');
  const token = localStorage.getItem('better_lyrics_api_token');

  // If no custom URL is configured and no YouTube videoId was given, return null to avoid unnecessary traffic
  if (!customUrl && !videoId) return null;

  const base = (customUrl && customUrl.trim()) ? customUrl.trim().replace(/\/+$/, '') : 'http://localhost:8787';

  const queryParams = new URLSearchParams();
  if (videoId) queryParams.set('videoId', videoId);
  if (song) queryParams.set('song', song);
  if (artist) queryParams.set('artist', artist);
  if (album) queryParams.set('album', album);
  if (duration) queryParams.set('duration', Math.round(duration).toString());

  const targetUrl = `${base}/lyrics?${queryParams.toString()}`;

  const headers = {};
  if (token && token.trim()) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  const doAttempt = async (fetchUrl) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);
    try {
      const res = await fetch(fetchUrl, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!res.ok) return null;
      const json = await res.json();
      return parseBetterLyricsApiResponse(json, song, artist, duration);
    } catch (e) {
      clearTimeout(timeoutId);
      throw e;
    }
  };

  try {
    const result = await doAttempt(targetUrl);
    if (result && result.frames && result.frames.length > 0) {
      return result;
    }
  } catch (err) {
    // If direct request is blocked by CORS from a remote worker domain, try via proxy fallback
    if (base.startsWith('https://') || (base.startsWith('http://') && !base.includes('localhost') && !base.includes('127.0.0.1'))) {
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const result = await doAttempt(proxyUrl);
        if (result && result.frames && result.frames.length > 0) {
          return result;
        }
      } catch (proxyErr) {
        // Fallback silently
      }
    }
  }

  return null;
}

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
 * Unified Lyric Fetcher: checks demo -> tries BetterLyrics CF-API -> tries spotify-lyrics-api -> falls back to LRCLIB
 */
export async function fetchTrackLyrics(trackName, artistName, albumName, durationSec, trackId, trackUrl, videoId) {
  if (!trackName && !videoId) return null;

  const cleanTrack = (trackName || '').toLowerCase();
  const cleanArt = (artistName || '').toLowerCase();

  // Instant perfect match for Jackie Brown / Payphone demo datasets
  if (
    (cleanTrack.includes('jackie brown') || (cleanArt.includes('brent faiyaz') && cleanTrack.includes('jackie'))) ||
    (cleanTrack.includes('payphone') && cleanArt.includes('maroon'))
  ) {
    return {
      ...PAYPHONE_DEMO,
      title: trackName || PAYPHONE_DEMO.title,
      artist: artistName || PAYPHONE_DEMO.artist,
      album: albumName || PAYPHONE_DEMO.album,
      duration: durationSec || PAYPHONE_DEMO.duration,
      source: 'demo',
    };
  }

  // 1. Try BetterLyrics CF-API (github.com/better-lyrics/cf-api) if configured or if videoId is provided
  const cfApiConfigured = localStorage.getItem('better_lyrics_api_url');
  if (cfApiConfigured || videoId) {
    try {
      const cfLyrics = await fetchLyricsFromBetterLyricsCfApi({
        videoId,
        song: trackName,
        artist: artistName,
        album: albumName,
        duration: durationSec,
      });
      if (cfLyrics) {
        return cfLyrics;
      }
    } catch (err) {
      console.debug('BetterLyrics CF-API attempt error:', err);
    }
  }

  // 2. Try github.com/akashrchandran/spotify-lyrics-api if configured
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

  // 3. Seamless fallback to LRCLIB
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
  if (!lrcString || typeof lrcString !== 'string') return null;

  // Auto-detect TTML / Apple Music XML
  if (lrcString.includes('<tt') || lrcString.includes('<p begin=') || lrcString.includes('<p ')) {
    return parseTtmlLyrics(lrcString, trackTitle, artist, expectedDuration);
  }

  // Auto-detect Enhanced LRC inline word tags e.g. <00:12.34> or (00:12.34)
  if (/[<(?](\d{1,2}:\d{2}(?:\.\d+)?)[>)?]/.test(lrcString)) {
    return parseEnhancedLrc(lrcString, trackTitle, artist, expectedDuration);
  }

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

/**
 * Builds kinetic frames from raw lines that already have individual word timestamps (eLRC / TTML / Richsync)
 */
function buildKineticFramesFromWordLines(rawLinesWithWords, trackTitle, artist, expectedDuration) {
  if (!rawLinesWithWords || rawLinesWithWords.length === 0) return null;

  // Flatten all words in chronological sequence
  const allWords = [];
  for (const line of rawLinesWithWords) {
    for (const w of line.words) {
      if (w.text && w.text !== '♪' && w.text !== '♫') {
        allWords.push(w);
      }
    }
  }

  if (allWords.length === 0) return null;

  allWords.sort((a, b) => a.time - b.time);

  // Group into kinetic frames of 1 to 3 words
  const frames = [];
  const tapeAngles = [-2.6, 2.2, -1.8, 2.5, -2.2, 1.9];
  let angleIdx = 0;

  // 1. Intro frame if starting with instrumental delay
  const firstWordTime = allWords[0].time;
  if (firstWordTime > 1.2) {
    frames.push({
      id: 'frame-intro',
      startTime: 0.0,
      endTime: firstWordTime,
      isIntro: true,
      lines: [
        {
          id: 'intro-l1',
          words: [
            {
              text: trackTitle || 'Live Audio',
              time: 0.0,
              duration: firstWordTime * 0.5,
              isTape: false,
              angle: 0,
            },
          ],
        },
        {
          id: 'intro-l2',
          words: [
            {
              text: artist ? `by ${artist}` : 'Word-by-Word Synced',
              time: firstWordTime * 0.5,
              duration: firstWordTime * 0.5,
              isTape: true,
              angle: -2.4,
            },
          ],
        },
      ],
    });
  }

  let i = 0;
  let frameCount = 0;

  while (i < allWords.length) {
    const rem = allWords.length - i;
    let chunkSize = 3;
    if (rem === 4) chunkSize = 2;
    else if (rem <= 3) chunkSize = rem;
    else {
      // Check if next words are very far apart in time (> 2.5s) -> keep chunk small
      if (allWords[i + 1] && (allWords[i + 1].time - allWords[i].time > 1.8)) {
        chunkSize = 1;
      } else if (allWords[i + 2] && (allWords[i + 2].time - allWords[i + 1].time > 1.8)) {
        chunkSize = 2;
      }
    }

    const chunk = allWords.slice(i, i + chunkSize);
    const frameStartTime = chunk[0].time;
    const lastWord = chunk[chunk.length - 1];
    const frameEndTime = lastWord.time + (lastWord.duration || 0.6);

    // Pick a tape sticker word (prefer icon match or last word)
    let tapeWordIdx = chunk.length - 1;
    const iconMatchIdx = chunk.findIndex((w) => getContextualIcon(w.text) !== null);
    if (iconMatchIdx !== -1) {
      tapeWordIdx = iconMatchIdx;
    }

    const currentAngle = tapeAngles[angleIdx % tapeAngles.length];
    angleIdx++;

    const frameLines = chunk.map((w, localIdx) => {
      const isTape = localIdx === tapeWordIdx;
      const angle = isTape ? currentAngle : (localIdx % 2 === 0 ? -2.4 : 2.2);
      const icon = getContextualIcon(w.text);

      return {
        id: `wl-${frameCount}-${localIdx}`,
        words: [
          {
            text: w.text,
            time: w.time,
            duration: Math.max(0.18, w.duration || 0.5),
            isTape,
            angle,
            icon,
          },
        ],
      };
    });

    frames.push({
      id: `frame-wbw-${frameCount}`,
      startTime: frameStartTime,
      endTime: frameEndTime,
      lines: frameLines,
    });

    frameCount++;
    i += chunkSize;

    // Check for instrumental interlude (> 5.5s gap before next word)
    if (i < allWords.length) {
      const nextWordTime = allWords[i].time;
      const gap = nextWordTime - frameEndTime;
      if (gap > 5.5) {
        frames.push({
          id: `interlude-${frameCount}`,
          startTime: frameEndTime,
          endTime: nextWordTime,
          isInterlude: true,
          lines: [
            {
              id: `interlude-line-${frameCount}`,
              words: [
                {
                  text: '♪  ♫  ♪',
                  time: frameEndTime,
                  duration: gap,
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

  const lastFrame = frames[frames.length - 1];
  const totalDuration = expectedDuration || (lastFrame ? lastFrame.endTime + 3 : 180);

  return {
    id: `wbw-${Date.now()}`,
    title: trackTitle || 'Word-by-Word Master',
    artist: artist || 'Poweramp eLRC',
    album: 'Word Synced',
    duration: totalDuration,
    hasWordSync: true,
    frames,
  };
}

/**
 * Enhanced LRC (eLRC) Parser:
 * Parses word-level timestamps in <mm:ss.xx> or (mm:ss.xx) format
 */
export function parseEnhancedLrc(lrcString, trackTitle, artist, expectedDuration) {
  if (!lrcString || typeof lrcString !== 'string') return null;

  const lines = lrcString.split('\n');
  let title = trackTitle;
  let artistName = artist;
  let duration = expectedDuration;

  const rawLinesWithWords = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Metadata headers
    const tiMatch = trimmed.match(/^\[ti:(.*)\]$/i);
    if (tiMatch && tiMatch[1].trim()) title = title || tiMatch[1].trim();
    const arMatch = trimmed.match(/^\[ar:(.*)\]$/i);
    if (arMatch && arMatch[1].trim()) artistName = artistName || arMatch[1].trim();
    const lenMatch = trimmed.match(/^\[length:(.*)\]$/i);
    if (lenMatch && lenMatch[1].trim()) duration = duration || parseTimestamp(lenMatch[1]);

    // Line timestamp [mm:ss.xx]
    const lineMatch = trimmed.match(/^\[(\d{1,2}:\d{2}(?:\.\d+)?)\](.*)/);
    if (!lineMatch) continue;

    const lineStartTime = parseTimestamp(lineMatch[1]);
    const lineRest = lineMatch[2].trim();

    // Check for inline word tags <mm:ss.xx> or (mm:ss.xx)
    const wordTagRegex = /[<(?](\d{1,2}:\d{2}(?:\.\d+)?)[>)?]\s*([^<(?]*)/g;
    const matches = [...lineRest.matchAll(wordTagRegex)];

    if (matches.length > 0) {
      const parsedWords = [];
      for (let mIdx = 0; mIdx < matches.length; mIdx++) {
        const timeVal = parseTimestamp(matches[mIdx][1]);
        const wText = matches[mIdx][2].trim();
        if (wText && wText !== '♪' && wText !== '♫') {
          parsedWords.push({
            text: wText,
            time: timeVal,
            rawIndex: mIdx,
          });
        }
      }

      // Calculate word durations from subsequent tag or line end
      for (let wIdx = 0; wIdx < parsedWords.length; wIdx++) {
        const currentW = parsedWords[wIdx];
        let wDur = 0.6;
        if (wIdx < parsedWords.length - 1) {
          wDur = Math.max(0.18, parsedWords[wIdx + 1].time - currentW.time);
        } else {
          const lastMatch = matches[matches.length - 1];
          if (!lastMatch[2].trim()) {
            const endTagTime = parseTimestamp(lastMatch[1]);
            if (endTagTime > currentW.time) {
              wDur = Math.max(0.18, endTagTime - currentW.time);
            }
          }
        }
        currentW.duration = wDur;
      }

      if (parsedWords.length > 0) {
        rawLinesWithWords.push({
          time: lineStartTime,
          words: parsedWords,
        });
      }
    } else {
      // Standard line without inline tags: split words and estimate
      const cleanText = lineRest.replace(/\[\d{1,2}:\d{2}(?:\.\d+)?\]/g, '').trim();
      if (cleanText && cleanText !== '♪' && cleanText !== '♫') {
        const words = cleanText.split(/\s+/).filter(Boolean);
        const avgDur = 0.45;
        let wTime = lineStartTime;
        const parsedWords = words.map((text) => {
          const item = { text, time: wTime, duration: avgDur };
          wTime += avgDur;
          return item;
        });
        rawLinesWithWords.push({
          time: lineStartTime,
          words: parsedWords,
        });
      }
    }
  }

  if (rawLinesWithWords.length === 0) return null;

  const result = buildKineticFramesFromWordLines(rawLinesWithWords, title, artistName, duration);
  if (result) {
    result.source = 'enhanced-lrc';
    result.hasWordSync = true;
  }
  return result;
}

/**
 * Apple Music / SpotiFLAC TTML Parser:
 * Parses XML with <p begin="..." end="..."> <span begin="..." end="...">word</span> ... </p>
 */
export function parseTtmlLyrics(ttmlString, trackTitle, artist, expectedDuration) {
  if (!ttmlString || typeof ttmlString !== 'string') return null;

  let title = trackTitle;
  let artistName = artist;
  let duration = expectedDuration;

  let doc = null;
  try {
    const parser = new DOMParser();
    doc = parser.parseFromString(ttmlString, 'text/xml');
  } catch (e) {
    return null;
  }

  if (!doc) return null;

  const titleEl = doc.querySelector('title, ttm\\:title');
  if (titleEl && titleEl.textContent) title = titleEl.textContent.trim();
  const agentEl = doc.querySelector('agent[type="person"], ttm\\:agent[type="person"], agent, ttm\\:agent');
  if (agentEl && agentEl.textContent) artistName = agentEl.textContent.trim();

  const pNodes = doc.querySelectorAll('p');
  if (pNodes.length === 0) return null;

  const rawLinesWithWords = [];

  pNodes.forEach((p) => {
    const pBegin = parseTimestamp(p.getAttribute('begin'));
    const pEnd = parseTimestamp(p.getAttribute('end'));
    const spans = p.querySelectorAll('span');

    if (spans.length > 0) {
      const parsedWords = [];
      spans.forEach((span) => {
        const text = span.textContent.trim();
        if (!text || text === '♪' || text === '♫') return;
        const sBegin = parseTimestamp(span.getAttribute('begin')) || pBegin;
        const sEnd = parseTimestamp(span.getAttribute('end')) || (sBegin + 0.5);
        const wDur = Math.max(0.18, sEnd - sBegin);
        parsedWords.push({
          text,
          time: sBegin,
          duration: wDur,
        });
      });

      if (parsedWords.length > 0) {
        rawLinesWithWords.push({
          time: pBegin,
          words: parsedWords,
        });
      }
    } else {
      const text = p.textContent.trim();
      if (text && text !== '♪' && text !== '♫') {
        const words = text.split(/\s+/).filter(Boolean);
        const lineDur = (pEnd > pBegin) ? (pEnd - pBegin) : (words.length * 0.45);
        const wordDur = lineDur / Math.max(1, words.length);
        let currTime = pBegin;
        const parsedWords = words.map((w) => {
          const item = { text: w, time: currTime, duration: wordDur };
          currTime += wordDur;
          return item;
        });
        rawLinesWithWords.push({
          time: pBegin,
          words: parsedWords,
        });
      }
    }
  });

  if (rawLinesWithWords.length === 0) return null;

  const result = buildKineticFramesFromWordLines(rawLinesWithWords, title, artistName, duration);
  if (result) {
    result.source = 'apple-music-ttml';
    result.hasWordSync = true;
  }
  return result;
}

/**
 * Musixmatch Richsync Parser:
 * Parses [{ ts, te, l: [{ c: "word", o: offset }] }]
 */
export function parseMusixmatchRichsync(richsyncData, trackTitle, artist, expectedDuration) {
  let list = richsyncData;
  if (typeof list === 'string') {
    try {
      list = JSON.parse(list);
    } catch (e) {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length === 0) return null;

  const rawLinesWithWords = [];

  for (const item of list) {
    const lineStart = typeof item.ts === 'number' ? item.ts : parseFloat(item.ts || 0);
    const lineEnd = typeof item.te === 'number' ? item.te : parseFloat(item.te || lineStart + 3.5);

    if (Array.isArray(item.l) && item.l.length > 0) {
      const parsedWords = [];
      for (let i = 0; i < item.l.length; i++) {
        const w = item.l[i];
        const wText = (w.c || '').trim();
        if (!wText || wText === '♪' || wText === '♫') continue;
        const offset = typeof w.o === 'number' ? w.o : parseFloat(w.o || 0);
        const wTime = lineStart + offset;

        let wDur = 0.5;
        if (i < item.l.length - 1) {
          const nextOffset = typeof item.l[i + 1].o === 'number' ? item.l[i + 1].o : parseFloat(item.l[i + 1].o || 0);
          wDur = Math.max(0.18, (lineStart + nextOffset) - wTime);
        } else {
          wDur = Math.max(0.18, lineEnd - wTime);
        }

        parsedWords.push({
          text: wText,
          time: wTime,
          duration: wDur,
        });
      }

      if (parsedWords.length > 0) {
        rawLinesWithWords.push({
          time: lineStart,
          words: parsedWords,
        });
      }
    }
  }

  if (rawLinesWithWords.length === 0) return null;

  const result = buildKineticFramesFromWordLines(rawLinesWithWords, trackTitle, artist, expectedDuration);
  if (result) {
    result.source = 'musixmatch-richsync';
    result.hasWordSync = true;
  }
  return result;
}

/**
 * Universal Lyrics Parser:
 * Auto-detects TTML, Enhanced LRC (eLRC), Musixmatch JSON, standard LRC, or plain text
 */
export function parseAnyLyricsFormat(input, trackTitle, artist, expectedDuration) {
  if (!input) return null;

  // 1. JSON object / array
  if (typeof input === 'object') {
    if (Array.isArray(input)) {
      return parseMusixmatchRichsync(input, trackTitle, artist, expectedDuration);
    }
    if (input.musixmatch?.richsync) {
      return parseMusixmatchRichsync(input.musixmatch.richsync, trackTitle, artist, expectedDuration);
    }
    if (input.fetchedLyrics) {
      return parseAnyLyricsFormat(input.fetchedLyrics, trackTitle, artist, expectedDuration);
    }
    if (input.lrc || input.lyrics) {
      return parseAnyLyricsFormat(input.lrc || input.lyrics, trackTitle, artist, expectedDuration);
    }
  }

  if (typeof input !== 'string') return null;
  const trimmed = input.trim();

  // 2. JSON string
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const res = parseAnyLyricsFormat(parsed, trackTitle, artist, expectedDuration);
      if (res) return res;
    } catch (e) {}
  }

  // 3. Apple Music / SpotiFLAC TTML XML
  if (trimmed.includes('<tt') || trimmed.includes('<p begin=') || trimmed.includes('<p ')) {
    return parseTtmlLyrics(trimmed, trackTitle, artist, expectedDuration);
  }

  // 4. Enhanced LRC with inline word timestamps <mm:ss.xx>
  if (/[<(?](\d{1,2}:\d{2}(?:\.\d+)?)[>)?]/.test(trimmed)) {
    return parseEnhancedLrc(trimmed, trackTitle, artist, expectedDuration);
  }

  // 5. Standard LRC with line timestamps [mm:ss.xx]
  if (trimmed.includes('[0') || trimmed.includes('[1') || trimmed.includes('[2') || trimmed.includes(']')) {
    return parseLrcLyrics(trimmed, trackTitle, artist, expectedDuration);
  }

  // 6. Plain text lyrics
  return synthesizeKineticFromPlain(trimmed, trackTitle, artist, expectedDuration || 180);
}

/**
 * Export active track into Enhanced LRC (.lrc) format for Poweramp / players
 */
export function exportTrackToEnhancedLrc(track) {
  if (!track || !track.frames) return '';
  const title = track.title || 'Unknown Title';
  const artist = track.artist || 'Unknown Artist';
  const album = track.album || '';
  const durSec = track.duration || 180;

  const header = [
    `[ti:${title}]`,
    `[ar:${artist}]`,
    `[al:${album}]`,
    `[length:${formatLrcTimestamp(durSec)}]`,
    `[by:LiveLyrics Poweramp Word-by-Word Engine]`,
    '',
  ];

  const bodyLines = [];

  for (const frame of track.frames) {
    if (frame.isIntro || frame.isInterlude) continue;
    const words = [];
    for (const line of frame.lines) {
      for (const w of line.words) {
        if (w.text && w.text !== '♪  ♫  ♪') {
          words.push(w);
        }
      }
    }
    if (words.length === 0) continue;

    const frameStart = formatLrcTimestamp(words[0].time);
    let lineStr = `[${frameStart}] `;
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wTime = formatLrcTimestamp(w.time);
      lineStr += `<${wTime}> ${w.text} `;
    }
    const lastWord = words[words.length - 1];
    const endTime = formatLrcTimestamp(lastWord.time + (lastWord.duration || 0.6));
    lineStr += `<${endTime}>`;
    bodyLines.push(lineStr.trim());
  }

  return header.concat(bodyLines).join('\n');
}

/**
 * Export active track into Apple Music TTML (.ttml) XML format (SpotiFLAC compatible)
 */
export function exportTrackToTtml(track) {
  if (!track || !track.frames) return '';
  const title = track.title || 'Unknown Title';
  const artist = track.artist || 'Unknown Artist';

  let pTags = '';
  for (const frame of track.frames) {
    if (frame.isIntro || frame.isInterlude) continue;
    const words = [];
    for (const line of frame.lines) {
      for (const w of line.words) {
        if (w.text && w.text !== '♪  ♫  ♪') words.push(w);
      }
    }
    if (words.length === 0) continue;

    const pBegin = formatTtmlTimestamp(frame.startTime);
    const pEnd = formatTtmlTimestamp(frame.endTime);
    let spans = '';
    for (const w of words) {
      const sBegin = formatTtmlTimestamp(w.time);
      const sEnd = formatTtmlTimestamp(w.time + (w.duration || 0.6));
      spans += `        <span begin="${sBegin}" end="${sEnd}">${w.text}</span>\n`;
    }
    pTags += `      <p begin="${pBegin}" end="${pEnd}">\n${spans}      </p>\n`;
  }

  return `<?xml version="1.0" encoding="utf-8"?>
<tt xmlns="http://www.w3.org/ns/ttml" xmlns:ttm="http://www.w3.org/ns/ttml#metadata">
  <head>
    <metadata>
      <ttm:title>${title}</ttm:title>
      <ttm:agent type="person">${artist}</ttm:agent>
    </metadata>
  </head>
  <body>
    <div>
${pTags}    </div>
  </body>
</tt>`;
}

/**
 * Export active track into standard line-level LRC (.lrc)
 */
export function exportTrackToStandardLrc(track) {
  if (!track || !track.frames) return '';
  const title = track.title || 'Unknown Title';
  const artist = track.artist || 'Unknown Artist';
  const durSec = track.duration || 180;

  const header = [
    `[ti:${title}]`,
    `[ar:${artist}]`,
    `[length:${formatLrcTimestamp(durSec)}]`,
    '',
  ];

  const bodyLines = [];

  for (const frame of track.frames) {
    if (frame.isIntro || frame.isInterlude) continue;
    const words = [];
    for (const line of frame.lines) {
      for (const w of line.words) {
        if (w.text && w.text !== '♪  ♫  ♪') words.push(w.text);
      }
    }
    if (words.length === 0) continue;
    const timeStr = formatLrcTimestamp(frame.startTime);
    bodyLines.push(`[${timeStr}] ${words.join(' ')}`);
  }

  return header.concat(bodyLines).join('\n');
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

