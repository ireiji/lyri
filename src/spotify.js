// Spotify PKCE OAuth flow and Real-time Playback State Poller

const SPOTIFY_AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const SPOTIFY_TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SCOPES = ['user-read-currently-playing', 'user-read-playback-state'].join(' ');

function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], '');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export class SpotifyClient {
  constructor() {
    this.clientId = localStorage.getItem('spotify_client_id') || '';
    this.accessToken = localStorage.getItem('spotify_access_token') || null;
    this.refreshToken = localStorage.getItem('spotify_refresh_token') || null;
    this.tokenExpiry = parseInt(localStorage.getItem('spotify_token_expiry') || '0', 10);
    this.redirectUri = window.location.origin + window.location.pathname;
  }

  setClientId(id) {
    this.clientId = id.trim();
    localStorage.setItem('spotify_client_id', this.clientId);
  }

  isConnected() {
    return !!this.accessToken && Date.now() < this.tokenExpiry;
  }

  getRedirectUri() {
    return this.redirectUri;
  }

  async redirectToAuth() {
    if (!this.clientId) {
      throw new Error('Spotify Client ID is required');
    }

    const codeVerifier = generateRandomString(64);
    const hashed = await sha256(codeVerifier);
    const codeChallenge = base64encode(hashed);

    window.sessionStorage.setItem('code_verifier', codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      scope: SCOPES,
      code_challenge_method: 'S256',
      code_challenge: codeChallenge,
      redirect_uri: this.redirectUri,
    });

    window.location.href = `${SPOTIFY_AUTH_ENDPOINT}?${params.toString()}`;
  }

  async handleAuthCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const error = urlParams.get('error');

    if (error) {
      console.error('Spotify auth error:', error);
      return false;
    }

    if (code) {
      const codeVerifier = window.sessionStorage.getItem('code_verifier');
      if (!codeVerifier) return false;

      const payload = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          code_verifier: codeVerifier,
        }),
      };

      try {
        const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, payload);
        const data = await response.json();

        if (data.access_token) {
          this.accessToken = data.access_token;
          this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
          localStorage.setItem('spotify_access_token', this.accessToken);
          localStorage.setItem('spotify_token_expiry', this.tokenExpiry.toString());

          if (data.refresh_token) {
            this.refreshToken = data.refresh_token;
            localStorage.setItem('spotify_refresh_token', this.refreshToken);
          }

          // Clean up URL query parameters without reloading
          const cleanUrl = window.location.origin + window.location.pathname;
          window.history.replaceState({}, document.title, cleanUrl);
          return true;
        }
      } catch (e) {
        console.error('Token exchange failed:', e);
      }
    }
    return false;
  }

  async refreshAccessToken() {
    if (!this.refreshToken || !this.clientId) return null;

    try {
      const payload = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
        }),
      };

      const response = await fetch(SPOTIFY_TOKEN_ENDPOINT, payload);
      const data = await response.json();

      if (data.access_token) {
        this.accessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
        localStorage.setItem('spotify_access_token', this.accessToken);
        localStorage.setItem('spotify_token_expiry', this.tokenExpiry.toString());
        return this.accessToken;
      }
    } catch (err) {
      console.warn('Failed to refresh Spotify token:', err);
    }
    return null;
  }

  async getCurrentlyPlaying() {
    if (!this.accessToken) return null;

    if (Date.now() > this.tokenExpiry - 30000 && this.refreshToken) {
      await this.refreshAccessToken();
    }

    try {
      const startTime = performance.now();
      const response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (response.status === 204 || response.status > 400) {
        return null;
      }

      const data = await response.json();
      if (!data || !data.item) return null;

      const roundTripMs = performance.now() - startTime;
      const now = Date.now();
      // Estimate delay between Spotify server measurement and client receive time
      const serverAgeMs = data.timestamp ? Math.max(0, Math.min(3000, now - data.timestamp)) : (roundTripMs / 2);

      return {
        trackId: data.item.id,
        trackUrl: data.item.external_urls?.spotify || (data.item.id ? `https://open.spotify.com/track/${data.item.id}` : null),
        isPlaying: data.is_playing,
        progressMs: data.progress_ms,
        latencyCompensatedProgressMs: data.is_playing ? data.progress_ms + serverAgeMs : data.progress_ms,
        durationMs: data.item.duration_ms,
        trackName: data.item.name,
        artistName: data.item.artists.map((a) => a.name).join(', '),
        albumName: data.item.album ? data.item.album.name : '',
        albumArt: data.item.album?.images?.[0]?.url || null,
        timestamp: now,
      };
    } catch (err) {
      console.warn('Spotify fetch player failed:', err);
      return null;
    }
  }

  disconnect() {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = 0;
    localStorage.removeItem('spotify_access_token');
    localStorage.removeItem('spotify_refresh_token');
    localStorage.removeItem('spotify_token_expiry');
  }
}

export const spotifyClient = new SpotifyClient();
