// Pure JavaScript Kinetic Typography Live Lyrics Engine with Fisheye Optics and Word-by-Word Animation
import './index.css';
import { PAYPHONE_DEMO, ICON_SVGS } from './data.js';
import { demoAudio } from './synth.js';
import { spotifyClient } from './spotify.js';
import {
  fetchTrackLyrics,
  fetchLyricsFromLRCLIB,
  fetchLyricsFromBetterLyricsCfApi,
  extractYouTubeVideoId,
  parseLrcLyrics,
  parseEnhancedLrc,
  parseTtmlLyrics,
  parseMusixmatchRichsync,
  parseAnyLyricsFormat,
  exportTrackToEnhancedLrc,
  exportTrackToTtml,
  exportTrackToStandardLrc,
} from './lyrics.js';
import {
  SAMPLE_ELRC_BLINDING_LIGHTS,
  SAMPLE_TTML_STAY_WITH_ME,
  SAMPLE_RICHSYNC_LEVITATING,
} from './wordSyncSamples.js';

class LiveLyricsApp {
  constructor() {
    // Application State
    this.currentTrack = PAYPHONE_DEMO;
    this.currentTime = 0;
    this.isPlaying = false;
    this.audioMuted = false;
    this.fisheyeEnabled = true;
    this.fisheyeIntensity = 0.7;
    this.tapeColor = '#c48890';
    this.mode = 'demo'; // 'demo' | 'spotify'
    this.syncOffset = parseFloat(localStorage.getItem('spotify_sync_offset') || '0.0');
    this.highlighterMode = localStorage.getItem('highlighter_mode') || 'currentWord'; // 'currentWord' | 'keyWord'

    this.activeFrameIndex = -1;
    this.activeWordId = null;
    this.lastFrameTime = performance.now();
    this.spotifyPollInterval = null;

    // Optical Tilt Physics
    this.mouseX = 0;
    this.mouseY = 0;
    this.targetTiltX = 0;
    this.targetTiltY = 0;
    this.currentTiltX = 0;
    this.currentTiltY = 0;

    // DOM Elements Cache
    this.dom = {
      viewport: document.getElementById('fisheye-viewport'),
      chamber: document.getElementById('fisheye-chamber'),
      lensOverlay: document.getElementById('fisheye-lens-overlay'),
      lineStack: document.getElementById('kinetic-line-stack'),
      currentTimeText: document.getElementById('current-time-text'),
      totalDurationText: document.getElementById('total-duration-text'),
      activeWordLabel: document.getElementById('active-word-label'),
      scrubberTrack: document.getElementById('scrubber-track'),
      scrubberFill: document.getElementById('scrubber-fill'),
      btnPlayPause: document.getElementById('btn-play-pause'),
      playPauseIcon: document.getElementById('play-pause-icon'),
      btnRestart: document.getElementById('btn-restart'),
      btnPrevFrame: document.getElementById('btn-prev-frame'),
      btnNextFrame: document.getElementById('btn-next-frame'),
      btnToggleFisheye: document.getElementById('btn-toggle-fisheye'),
      fisheyeStatusDot: document.getElementById('fisheye-status-dot'),
      fisheyeSlider: document.getElementById('fisheye-intensity-slider'),
      btnToggleAudio: document.getElementById('btn-toggle-audio'),
      audioIcon: document.getElementById('audio-icon'),
      btnHighlighterMode: document.getElementById('btn-highlighter-mode'),
      highlighterModeText: document.getElementById('highlighter-mode-text'),
      btnColorPicker: document.getElementById('btn-color-picker'),
      colorMenu: document.getElementById('color-menu'),
      colorSwatchPreview: document.getElementById('color-swatch-preview'),
      trackTitleText: document.getElementById('track-title-text'),
      trackArtistText: document.getElementById('track-artist-text'),
      modeBadge: document.getElementById('mode-badge'),
      artworkIcon: document.getElementById('artwork-icon'),
      artworkImg: document.getElementById('artwork-img'),
      btnQuickSync: document.getElementById('btn-quick-sync'),
      quickSyncVal: document.getElementById('quick-sync-val'),
      // Settings Modal
      settingsModal: document.getElementById('settings-modal'),
      btnOpenSettings: document.getElementById('btn-open-settings'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      btnModeDemo: document.getElementById('btn-mode-demo'),
      btnModeSpotify: document.getElementById('btn-mode-spotify'),
      spotifyConfigSection: document.getElementById('spotify-config-section'),
      inputClientId: document.getElementById('input-client-id'),
      inputRedirectUri: document.getElementById('input-redirect-uri'),
      btnCopyRedirect: document.getElementById('btn-copy-redirect'),
      btnConnectSpotify: document.getElementById('btn-connect-spotify'),
      btnDisconnectSpotify: document.getElementById('btn-disconnect-spotify'),
      btnSyncDelaySub: document.getElementById('btn-sync-delay-sub'),
      btnSyncDelayAdd: document.getElementById('btn-sync-delay-add'),
      syncDelayVal: document.getElementById('sync-delay-val'),
      inputCfApiUrl: document.getElementById('input-cf-api-url'),
      btnSaveCfApi: document.getElementById('btn-save-cf-api'),
      btnTestCfApi: document.getElementById('btn-test-cf-api'),
      inputCfApiToken: document.getElementById('input-cf-api-token'),
      btnSaveCfToken: document.getElementById('btn-save-cf-token'),
      cfApiStatus: document.getElementById('cf-api-status'),
      inputLyricsApiUrl: document.getElementById('input-lyrics-api-url'),
      btnSaveLyricsApi: document.getElementById('btn-save-lyrics-api'),
      btnTestLyricsApi: document.getElementById('btn-test-lyrics-api'),
      lyricsApiStatus: document.getElementById('lyrics-api-status'),
      inputSongSearch: document.getElementById('input-song-search'),
      btnSearchLyrics: document.getElementById('btn-search-lyrics'),
      searchStatusText: document.getElementById('search-status-text'),

      // Word-by-Word Studio Modal DOM elements
      btnOpenWordSync: document.getElementById('btn-open-wordsync'),
      wordsyncModal: document.getElementById('wordsync-modal'),
      btnCloseWordSync: document.getElementById('btn-close-wordsync'),
      btnCloseWordSyncBottom: document.getElementById('btn-close-wordsync-bottom'),
      wordSyncFormatBadge: document.getElementById('word-sync-format-badge'),
      wordsyncChipsContainer: document.getElementById('wordsync-chips-container'),
      wordsyncActiveWordInfo: document.getElementById('wordsync-active-word-info'),
      wordsyncImportTextarea: document.getElementById('wordsync-import-textarea'),
      wordsyncFileInput: document.getElementById('wordsync-file-input'),
      btnWordsyncParse: document.getElementById('btn-wordsync-parse'),
      wordsyncImportStatus: document.getElementById('wordsync-import-status'),
      btnExportElrc: document.getElementById('btn-export-elrc'),
      btnExportTtml: document.getElementById('btn-export-ttml'),
      btnExportCopy: document.getElementById('btn-export-copy'),
      copyStatusSubtext: document.getElementById('copy-status-subtext'),
      exportPreviewStats: document.getElementById('export-preview-stats'),
      exportPreviewBox: document.getElementById('export-preview-box'),
    };

    this.init();
  }

  async init() {
    this.setupEventListeners();
    this.setupSpotifyAuthCheck();
    this.applyTapeColor(this.tapeColor);
    this.applyFisheyeState();
    this.renderSyncOffsetUI();
    this.renderHighlighterModeUI();
    this.updateTrackMetadata();

    // Start in active demo mode playing
    this.togglePlayback(true);

    // Primary Animation / Rendering Loop
    requestAnimationFrame((ts) => this.renderLoop(ts));
  }

  setupEventListeners() {
    // Play/Pause
    this.dom.btnPlayPause.addEventListener('click', () => {
      this.togglePlayback(!this.isPlaying);
    });

    // Restart
    this.dom.btnRestart.addEventListener('click', () => {
      this.seekTo(0);
    });

    // Navigation between frames
    this.dom.btnPrevFrame.addEventListener('click', () => {
      this.jumpFrame(-1);
    });
    this.dom.btnNextFrame.addEventListener('click', () => {
      this.jumpFrame(1);
    });

    // Scrubber click & drag
    let isDraggingScrubber = false;
    const handleScrub = (e) => {
      const rect = this.dom.scrubberTrack.getBoundingClientRect();
      const clickX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const percentage = clickX / rect.width;
      const targetTime = percentage * (this.currentTrack.duration || 30);
      this.seekTo(targetTime);
    };

    this.dom.scrubberTrack.addEventListener('mousedown', (e) => {
      isDraggingScrubber = true;
      handleScrub(e);
    });
    window.addEventListener('mousemove', (e) => {
      if (isDraggingScrubber) handleScrub(e);
    });
    window.addEventListener('mouseup', () => {
      isDraggingScrubber = false;
    });

    // Fisheye Toggle & Slider
    this.dom.btnToggleFisheye.addEventListener('click', () => {
      this.fisheyeEnabled = !this.fisheyeEnabled;
      this.applyFisheyeState();
    });

    this.dom.fisheyeSlider.addEventListener('input', (e) => {
      this.fisheyeIntensity = parseFloat(e.target.value) / 100;
      this.applyFisheyeState();
    });

    // Audio Beat Mute/Unmute
    this.dom.btnToggleAudio.addEventListener('click', () => {
      this.audioMuted = !this.audioMuted;
      demoAudio.setMuted(this.audioMuted);
      this.dom.audioIcon.textContent = this.audioMuted ? '🔇' : '🔊';
    });

    // Color Picker
    this.dom.btnColorPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      this.dom.colorMenu.classList.toggle('hidden');
    });

    document.querySelectorAll('.color-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const color = e.target.dataset.color;
        if (color) {
          this.applyTapeColor(color);
          this.dom.colorMenu.classList.add('hidden');
        }
      });
    });

    window.addEventListener('click', () => {
      this.dom.colorMenu.classList.add('hidden');
    });

    // Optical Fisheye Cursor / Tilt Reactive Tracking
    window.addEventListener('mousemove', (e) => {
      const { innerWidth, innerHeight } = window;
      const xNorm = (e.clientX / innerWidth - 0.5) * 2; // -1 to 1
      const yNorm = (e.clientY / innerHeight - 0.5) * 2; // -1 to 1
      this.targetTiltX = -yNorm * 12; // deg
      this.targetTiltY = xNorm * 14; // deg
    });

    // Settings Modal
    this.dom.btnOpenSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.remove('hidden');
    });
    this.dom.btnCloseSettings.addEventListener('click', () => {
      this.dom.settingsModal.classList.add('hidden');
    });
    this.dom.settingsModal.addEventListener('click', (e) => {
      if (e.target === this.dom.settingsModal) {
        this.dom.settingsModal.classList.add('hidden');
      }
    });

    // Mode Switcher
    this.dom.btnModeDemo.addEventListener('click', () => {
      this.switchMode('demo');
    });
    this.dom.btnModeSpotify.addEventListener('click', () => {
      this.switchMode('spotify');
    });

    // Spotify PKCE Controls
    this.dom.inputRedirectUri.value = spotifyClient.getRedirectUri();
    this.dom.inputClientId.value = spotifyClient.clientId || '';

    this.dom.btnCopyRedirect.addEventListener('click', () => {
      navigator.clipboard.writeText(spotifyClient.getRedirectUri());
      this.dom.btnCopyRedirect.textContent = 'Copied!';
      setTimeout(() => {
        this.dom.btnCopyRedirect.textContent = 'Copy';
      }, 2000);
    });

    this.dom.btnConnectSpotify.addEventListener('click', () => {
      const id = this.dom.inputClientId.value.trim();
      if (!id) {
        alert('Please enter your Spotify Client ID.');
        return;
      }
      spotifyClient.setClientId(id);
      spotifyClient.redirectToAuth();
    });

    this.dom.btnDisconnectSpotify.addEventListener('click', () => {
      spotifyClient.disconnect();
      this.switchMode('demo');
      this.checkSpotifyConnectionUI();
    });

    // Audio Sync Offset Calibration
    if (this.dom.btnSyncDelaySub) {
      this.dom.btnSyncDelaySub.addEventListener('click', () => {
        this.updateSyncOffset(-0.1);
      });
    }

    if (this.dom.btnSyncDelayAdd) {
      this.dom.btnSyncDelayAdd.addEventListener('click', () => {
        this.updateSyncOffset(0.1);
      });
    }

    if (this.dom.btnQuickSync) {
      this.dom.btnQuickSync.addEventListener('click', () => {
        this.dom.settingsModal.classList.remove('hidden');
      });
    }

    // Highlighter Mode Toggle (Current Word vs Key Word)
    if (this.dom.btnHighlighterMode) {
      this.dom.btnHighlighterMode.addEventListener('click', () => {
        this.highlighterMode = this.highlighterMode === 'currentWord' ? 'keyWord' : 'currentWord';
        localStorage.setItem('highlighter_mode', this.highlighterMode);
        this.renderHighlighterModeUI();
        const currentFrame = this.currentTrack?.frames?.[this.activeFrameIndex];
        if (currentFrame) this.updateWordHighlights(currentFrame);
      });
    }

    // BetterLyrics CF-API Configuration (github.com/better-lyrics/cf-api)
    if (this.dom.inputCfApiUrl) {
      const savedCfUrl = localStorage.getItem('better_lyrics_api_url') || '';
      this.dom.inputCfApiUrl.value = savedCfUrl;
      if (this.dom.cfApiStatus) {
        if (savedCfUrl) {
          this.dom.cfApiStatus.textContent = `Active instance: ${savedCfUrl}`;
          this.dom.cfApiStatus.className = 'text-[10px] text-cyan-400 font-mono';
        } else {
          this.dom.cfApiStatus.textContent = 'Not configured (optional — direct LRCLIB used when omitted)';
          this.dom.cfApiStatus.className = 'text-[10px] text-[#73675e]';
        }
      }
    }

    if (this.dom.inputCfApiToken) {
      this.dom.inputCfApiToken.value = localStorage.getItem('better_lyrics_api_token') || '';
    }

    if (this.dom.btnSaveCfApi) {
      this.dom.btnSaveCfApi.addEventListener('click', () => {
        const url = this.dom.inputCfApiUrl.value.trim();
        if (url) {
          localStorage.setItem('better_lyrics_api_url', url);
          this.dom.cfApiStatus.textContent = `✓ Saved BetterLyrics instance: ${url}`;
          this.dom.cfApiStatus.className = 'text-[10px] text-cyan-400 font-mono';
        } else {
          localStorage.removeItem('better_lyrics_api_url');
          this.dom.cfApiStatus.textContent = 'Not configured (optional — direct LRCLIB used when omitted)';
          this.dom.cfApiStatus.className = 'text-[10px] text-[#73675e]';
        }
      });
    }

    if (this.dom.btnSaveCfToken) {
      this.dom.btnSaveCfToken.addEventListener('click', () => {
        const token = this.dom.inputCfApiToken.value.trim();
        if (token) {
          localStorage.setItem('better_lyrics_api_token', token);
          this.dom.cfApiStatus.textContent = '✓ Saved JWT token for BetterLyrics worker';
          this.dom.cfApiStatus.className = 'text-[10px] text-cyan-400 font-mono';
        } else {
          localStorage.removeItem('better_lyrics_api_token');
          this.dom.cfApiStatus.textContent = 'Bearer token removed';
          this.dom.cfApiStatus.className = 'text-[10px] text-[#8e8278]';
        }
      });
    }

    if (this.dom.btnTestCfApi) {
      this.dom.btnTestCfApi.addEventListener('click', async () => {
        const inputVal = this.dom.inputCfApiUrl.value.trim();
        const tokenVal = this.dom.inputCfApiToken ? this.dom.inputCfApiToken.value.trim() : '';
        const url = (inputVal || 'http://localhost:8787').replace(/\/+$/, '');
        this.dom.cfApiStatus.textContent = `Connecting to BetterLyrics worker at ${url}...`;
        this.dom.cfApiStatus.className = 'text-[10px] text-cyan-400';

        const headers = {};
        if (tokenVal) headers['Authorization'] = `Bearer ${tokenVal}`;

        let success = false;
        let note = '';
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 4000);
          const res = await fetch(`${url}/lyrics?song=Payphone&artist=Maroon%205`, {
            headers,
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            success = true;
          } else if (res.status === 401 || res.status === 403) {
            note = '(Turnstile challenge or JWT token required)';
          } else {
            note = `(Server returned ${res.status})`;
          }
        } catch (e) {
          if (url.startsWith('https://') || (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1'))) {
            try {
              const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`${url}/lyrics?song=Payphone&artist=Maroon%205`)}`;
              const pRes = await fetch(proxyUrl);
              if (pRes.ok) {
                success = true;
                note = '(connected via proxy fallback)';
              }
            } catch (pe) {}
          }
        }

        if (success) {
          this.dom.cfApiStatus.textContent = `✓ BetterLyrics CF-API connected! ${note}`;
          this.dom.cfApiStatus.className = 'text-[10px] text-cyan-400 font-bold';
        } else {
          this.dom.cfApiStatus.textContent = `Could not reach ${url} ${note}. Ensure wrangler dev or worker is active.`;
          this.dom.cfApiStatus.className = 'text-[10px] text-amber-400';
        }
      });
    }

    // Spotify Lyrics API Configuration (akashrchandran/spotify-lyrics-api)
    if (this.dom.inputLyricsApiUrl) {
      const savedApiUrl = localStorage.getItem('spotify_lyrics_api_url') || '';
      this.dom.inputLyricsApiUrl.value = savedApiUrl;
      if (this.dom.lyricsApiStatus) {
        if (savedApiUrl) {
          this.dom.lyricsApiStatus.textContent = `Custom instance configured: ${savedApiUrl}`;
          this.dom.lyricsApiStatus.className = 'text-[10px] text-emerald-400 font-mono';
        } else {
          this.dom.lyricsApiStatus.textContent = 'Direct LRCLIB Synced Lyrics active (zero setup required)';
          this.dom.lyricsApiStatus.className = 'text-[10px] text-[#73675e]';
        }
      }
    }

    if (this.dom.btnSaveLyricsApi) {
      this.dom.btnSaveLyricsApi.addEventListener('click', () => {
        const url = this.dom.inputLyricsApiUrl.value.trim();
        if (url) {
          localStorage.setItem('spotify_lyrics_api_url', url);
          this.dom.lyricsApiStatus.textContent = `✓ Saved custom instance: ${url}`;
          this.dom.lyricsApiStatus.className = 'text-[10px] text-emerald-400 font-mono';
        } else {
          localStorage.removeItem('spotify_lyrics_api_url');
          this.dom.lyricsApiStatus.textContent = 'Direct LRCLIB Synced Lyrics active (zero setup required)';
          this.dom.lyricsApiStatus.className = 'text-[10px] text-[#73675e]';
        }
      });
    }

    if (this.dom.btnTestLyricsApi) {
      this.dom.btnTestLyricsApi.addEventListener('click', async () => {
        const inputVal = this.dom.inputLyricsApiUrl.value.trim();
        if (!inputVal) {
          this.dom.lyricsApiStatus.textContent = 'Field is empty. Direct LRCLIB Synced Lyrics is active with zero setup.';
          this.dom.lyricsApiStatus.className = 'text-[10px] text-emerald-400';
          return;
        }

        const url = inputVal.replace(/\/+$/, '');
        this.dom.lyricsApiStatus.textContent = `Testing connection to ${url}...`;
        this.dom.lyricsApiStatus.className = 'text-[10px] text-[#c48890]';
        
        let success = false;
        let note = '';
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(`${url}/?trackid=4cOdK2wGLETKBW3PvgPWqT&format=raw`, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (res.ok) {
            success = true;
          } else {
            note = `(Server returned ${res.status})`;
          }
        } catch (e) {
          // If remote instance failed due to CORS, check via proxy
          if (url.startsWith('https://') || (url.startsWith('http://') && !url.includes('localhost') && !url.includes('127.0.0.1'))) {
            try {
              const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(`${url}/?trackid=4cOdK2wGLETKBW3PvgPWqT&format=raw`)}`;
              const pRes = await fetch(proxyUrl);
              if (pRes.ok) {
                success = true;
                note = '(via proxy fallback)';
              }
            } catch (pe) {}
          }
        }

        if (success) {
          this.dom.lyricsApiStatus.textContent = `✓ Connected successfully to instance! ${note}`;
          this.dom.lyricsApiStatus.className = 'text-[10px] text-emerald-400 font-bold';
        } else {
          this.dom.lyricsApiStatus.textContent = `Could not reach ${url}. Fast LRCLIB fallback is active.`;
          this.dom.lyricsApiStatus.className = 'text-[10px] text-amber-400';
        }
      });
    }

    // Unified Lyrics Search (BetterLyrics CF-API + LRCLIB + YouTube Video ID)
    const executeLyricsSearch = async (rawQuery) => {
      const query = (rawQuery || this.dom.inputSongSearch.value).trim();
      if (!query) return;

      this.dom.searchStatusText.textContent = 'Searching lyrics...';
      this.dom.searchStatusText.className = 'text-[10px] text-cyan-400 font-medium';

      // 1. Check if input is a YouTube URL or direct Video ID
      const youtubeId = extractYouTubeVideoId(query);
      let parsed = null;

      if (youtubeId) {
        this.dom.searchStatusText.textContent = `Querying BetterLyrics CF-API for video [${youtubeId}]...`;
        parsed = await fetchTrackLyrics(null, null, null, null, null, null, youtubeId);
      }

      // 2. If not a YouTube ID or no lyrics found yet, search by song & artist
      if (!parsed) {
        const parts = query.split(' - ');
        const title = parts[0] || query;
        const artist = parts[1] || '';
        parsed = await fetchTrackLyrics(title, artist, null, null, null, null, null);
      }

      if (parsed && parsed.frames && parsed.frames.length > 0) {
        this.currentTrack = parsed;
        this.seekTo(0);
        this.updateTrackMetadata();
        const srcLabel = parsed.source === 'better-lyrics-cf-api'
          ? 'BetterLyrics CF-API'
          : (parsed.source === 'spotify-lyrics-api' ? 'Spotify API' : (parsed.source === 'demo' ? 'Demo' : 'LRCLIB'));
        this.dom.searchStatusText.textContent = `✓ Loaded ${parsed.frames.length} phrases from ${srcLabel}!`;
        this.dom.searchStatusText.className = 'text-[10px] text-emerald-400 font-bold';
        setTimeout(() => {
          this.dom.settingsModal.classList.add('hidden');
        }, 1100);
      } else {
        this.dom.searchStatusText.textContent = 'No synced lyrics found. Try another title or check your BetterLyrics URL.';
        this.dom.searchStatusText.className = 'text-[10px] text-amber-400';
      }
    };

    if (this.dom.btnSearchLyrics) {
      this.dom.btnSearchLyrics.addEventListener('click', () => executeLyricsSearch());
    }

    if (this.dom.inputSongSearch) {
      this.dom.inputSongSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          executeLyricsSearch();
        }
      });
    }

    // Quick suggestion search pills
    document.querySelectorAll('.quick-song-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        const query = pill.getAttribute('data-query');
        if (query && this.dom.inputSongSearch) {
          this.dom.inputSongSearch.value = query;
          executeLyricsSearch(query);
        }
      });
    });

    // Spacebar Play/Pause
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        this.togglePlayback(!this.isPlaying);
      }
    });

    // Word-by-Word Studio Modal Controls
    if (this.dom.btnOpenWordSync) {
      this.dom.btnOpenWordSync.addEventListener('click', () => {
        this.openWordSyncModal();
      });
    }

    if (this.dom.btnCloseWordSync) {
      this.dom.btnCloseWordSync.addEventListener('click', () => {
        this.dom.wordsyncModal.classList.add('hidden');
      });
    }

    if (this.dom.btnCloseWordSyncBottom) {
      this.dom.btnCloseWordSyncBottom.addEventListener('click', () => {
        this.dom.wordsyncModal.classList.add('hidden');
      });
    }

    // Studio Navigation Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tabName = btn.getAttribute('data-tab');
        document.querySelectorAll('.tab-btn').forEach((b) => {
          b.classList.remove('border-b-2', 'border-[#c48890]', 'text-[#f4d7dc]', 'font-bold');
          b.classList.add('text-[#8a7a80]', 'font-semibold');
        });
        btn.classList.add('border-b-2', 'border-[#c48890]', 'text-[#f4d7dc]', 'font-bold');
        btn.classList.remove('text-[#8a7a80]', 'font-semibold');

        document.querySelectorAll('.tab-pane').forEach((p) => p.classList.add('hidden'));
        const targetPane = document.getElementById(`tab-content-${tabName}`);
        if (targetPane) targetPane.classList.remove('hidden');

        if (tabName === 'timeline') {
          this.renderWordSyncTimeline();
        } else if (tabName === 'export') {
          this.updateExportPreview();
        }
      });
    });

    // Community Master Word-by-Word Presets (r/Poweramp)
    document.querySelectorAll('.btn-load-preset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const preset = btn.getAttribute('data-preset');
        this.loadWordSyncPreset(preset);
      });
    });

    // Custom Lyrics Import Parse
    if (this.dom.btnWordsyncParse) {
      this.dom.btnWordsyncParse.addEventListener('click', () => {
        const text = this.dom.wordsyncImportTextarea?.value?.trim();
        if (!text) {
          if (this.dom.wordsyncImportStatus) {
            this.dom.wordsyncImportStatus.textContent = 'Please paste lyrics text first.';
            this.dom.wordsyncImportStatus.className = 'text-[10px] text-amber-400';
          }
          return;
        }
        const result = parseAnyLyricsFormat(text, 'Custom Track', 'Custom Artist');
        if (result && result.frames && result.frames.length > 0) {
          this.currentTrack = result;
          this.seekTo(0);
          this.updateTrackMetadata();
          this.updateActiveFrame(true);
          this.updateWordSyncBadge();
          this.renderWordSyncTimeline();
          this.updateExportPreview();
          if (this.dom.wordsyncImportStatus) {
            this.dom.wordsyncImportStatus.textContent = `✓ Successfully parsed ${result.frames.length} phrases in ${result.format || 'synced'} format!`;
            this.dom.wordsyncImportStatus.className = 'text-[10px] text-emerald-400 font-bold';
          }
        } else {
          if (this.dom.wordsyncImportStatus) {
            this.dom.wordsyncImportStatus.textContent = 'Could not detect timestamps. Please ensure eLRC <00:12.34> or TTML <span begin="..."> tags are present.';
            this.dom.wordsyncImportStatus.className = 'text-[10px] text-amber-400';
          }
        }
      });
    }

    // Custom Lyrics File Upload
    if (this.dom.wordsyncFileInput) {
      this.dom.wordsyncFileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          const text = event.target?.result;
          if (typeof text === 'string') {
            if (this.dom.wordsyncImportTextarea) this.dom.wordsyncImportTextarea.value = text;
            const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
            const result = parseAnyLyricsFormat(text, fileNameWithoutExt, 'Uploaded Track');
            if (result && result.frames && result.frames.length > 0) {
              this.currentTrack = result;
              this.seekTo(0);
              this.updateTrackMetadata();
              this.updateActiveFrame(true);
              this.updateWordSyncBadge();
              this.renderWordSyncTimeline();
              this.updateExportPreview();
              if (this.dom.wordsyncImportStatus) {
                this.dom.wordsyncImportStatus.textContent = `✓ Loaded ${file.name} (${result.frames.length} phrases, ${result.format})!`;
                this.dom.wordsyncImportStatus.className = 'text-[10px] text-emerald-400 font-bold';
              }
            }
          }
        };
        reader.readAsText(file);
      });
    }

    // Poweramp & Syllable Exporters
    if (this.dom.btnExportElrc) {
      this.dom.btnExportElrc.addEventListener('click', () => {
        const elrcContent = exportTrackToEnhancedLrc(this.currentTrack);
        const filename = `${this.currentTrack.title || 'Lyrics'}.lrc`;
        this.downloadFile(filename, elrcContent, 'text/plain');
      });
    }

    if (this.dom.btnExportTtml) {
      this.dom.btnExportTtml.addEventListener('click', () => {
        const ttmlContent = exportTrackToTtml(this.currentTrack);
        const filename = `${this.currentTrack.title || 'Lyrics'}.ttml`;
        this.downloadFile(filename, ttmlContent, 'application/xml');
      });
    }

    if (this.dom.btnExportCopy) {
      this.dom.btnExportCopy.addEventListener('click', async () => {
        const elrcContent = exportTrackToEnhancedLrc(this.currentTrack);
        try {
          await navigator.clipboard.writeText(elrcContent);
          if (this.dom.copyStatusSubtext) {
            this.dom.copyStatusSubtext.textContent = '✓ Copied to clipboard!';
            this.dom.copyStatusSubtext.className = 'text-[9px] text-emerald-400 font-bold';
            setTimeout(() => {
              this.dom.copyStatusSubtext.textContent = 'Instant copy with tags';
              this.dom.copyStatusSubtext.className = 'text-[9px] text-[#9c8990]';
            }, 2500);
          }
        } catch (err) {
          if (this.dom.copyStatusSubtext) {
            this.dom.copyStatusSubtext.textContent = 'Copied preview text';
          }
        }
      });
    }
  }

  async setupSpotifyAuthCheck() {
    // Check if returning from Spotify OAuth callback
    const handled = await spotifyClient.handleAuthCallback();
    if (handled || spotifyClient.isConnected()) {
      this.checkSpotifyConnectionUI();
      this.switchMode('spotify');
    }
  }

  checkSpotifyConnectionUI() {
    const isConnected = spotifyClient.isConnected();
    if (isConnected) {
      this.dom.btnConnectSpotify.classList.add('hidden');
      this.dom.btnDisconnectSpotify.classList.remove('hidden');
    } else {
      this.dom.btnConnectSpotify.classList.remove('hidden');
      this.dom.btnDisconnectSpotify.classList.add('hidden');
    }
  }

  switchMode(newMode) {
    this.mode = newMode;
    if (newMode === 'demo') {
      this.dom.btnModeDemo.classList.add('bg-[#2b2522]', 'text-[#f4f1ea]');
      this.dom.btnModeDemo.classList.remove('text-[#8e8278]');
      this.dom.btnModeSpotify.classList.remove('bg-[#2b2522]', 'text-[#f4f1ea]');
      this.dom.btnModeSpotify.classList.add('text-[#8e8278]');

      this.currentTrack = PAYPHONE_DEMO;
      this.dom.modeBadge.textContent = 'Demo';
      this.dom.modeBadge.className = 'text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-[#c48890]/20 text-[#c48890] border border-[#c48890]/30';

      if (this.spotifyPollInterval) {
        clearInterval(this.spotifyPollInterval);
        this.spotifyPollInterval = null;
      }
      this.seekTo(0);
      this.togglePlayback(true);
      this.updateTrackMetadata();
    } else {
      this.dom.btnModeSpotify.classList.add('bg-[#2b2522]', 'text-[#f4f1ea]');
      this.dom.btnModeSpotify.classList.remove('text-[#8e8278]');
      this.dom.btnModeDemo.classList.remove('bg-[#2b2522]', 'text-[#f4f1ea]');
      this.dom.btnModeDemo.classList.add('text-[#8e8278]');

      this.dom.modeBadge.textContent = 'Spotify Live';
      this.dom.modeBadge.className = 'text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30';

      demoAudio.stopBeat();
      this.startSpotifyPolling();
    }
  }

  updateSyncOffset(delta) {
    this.syncOffset = Math.round((this.syncOffset + delta) * 10) / 10;
    this.syncOffset = Math.max(-2.0, Math.min(2.0, this.syncOffset));
    localStorage.setItem('spotify_sync_offset', this.syncOffset.toString());
    this.renderSyncOffsetUI();
  }

  renderSyncOffsetUI() {
    const sign = this.syncOffset > 0 ? '+' : '';
    const formatted = `${sign}${this.syncOffset.toFixed(1)}s`;
    if (this.dom.syncDelayVal) this.dom.syncDelayVal.textContent = formatted;
    if (this.dom.quickSyncVal) this.dom.quickSyncVal.textContent = formatted;
  }

  renderHighlighterModeUI() {
    if (this.dom.highlighterModeText) {
      this.dom.highlighterModeText.textContent =
        this.highlighterMode === 'currentWord' ? 'Word Highlighter' : 'Key Word Only';
    }
  }

  startSpotifyPolling() {
    if (this.spotifyPollInterval) clearInterval(this.spotifyPollInterval);

    let lastTrackId = null;

    const poll = async () => {
      if (this.mode !== 'spotify' || !spotifyClient.isConnected()) return;

      const state = await spotifyClient.getCurrentlyPlaying();
      if (state) {
        this.isPlaying = state.isPlaying;
        this.togglePlayPauseUI(this.isPlaying);

        // Latency-compensated Spotify playback time + user calibration offset
        const liveSpotifyTime = (state.latencyCompensatedProgressMs / 1000) + this.syncOffset;

        const trackKey = `${state.trackName}-${state.artistName}`;
        if (trackKey !== lastTrackId) {
          lastTrackId = trackKey;
          this.dom.trackTitleText.textContent = state.trackName;
          this.dom.trackArtistText.textContent = state.artistName;

          if (state.albumArt) {
            this.dom.artworkImg.src = state.albumArt;
            this.dom.artworkImg.classList.remove('hidden');
            this.dom.artworkIcon.classList.add('hidden');
          }

          this.currentTime = Math.max(0, liveSpotifyTime);

          // Fetch lyrics: checks akashrchandran/spotify-lyrics-api first, then LRCLIB
          const lyrics = await fetchTrackLyrics(
            state.trackName,
            state.artistName,
            state.albumName,
            state.durationMs / 1000,
            state.trackId,
            state.trackUrl
          );
          if (lyrics) {
            this.currentTrack = lyrics;
            this.dom.totalDurationText.textContent = this.formatTime(lyrics.duration);
            const sourceLabel = lyrics.source === 'better-lyrics-cf-api'
              ? 'BetterLyrics CF-API'
              : (lyrics.source === 'spotify-lyrics-api' ? 'Spotify API' : (lyrics.source === 'demo' ? 'Demo' : 'LRCLIB'));
            this.dom.modeBadge.textContent = `Live Spotify • ${sourceLabel}`;
            if (lyrics.source === 'better-lyrics-cf-api') {
              this.dom.modeBadge.className = 'text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
            } else {
              this.dom.modeBadge.className = 'text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30';
            }
            this.updateActiveFrame(true);
          }
        } else {
          // Reconcile time: if seeked or skipped (> 0.45s difference), snap immediately!
          const drift = liveSpotifyTime - this.currentTime;
          if (Math.abs(drift) > 0.45) {
            this.currentTime = Math.max(0, liveSpotifyTime);
          } else if (Math.abs(drift) > 0.03) {
            // Smoothly nudge clock forward/backward without jarring jumps
            this.currentTime += drift * 0.2;
          }
        }
      }
    };

    poll();
    this.spotifyPollInterval = setInterval(poll, 750);
  }

  applyTapeColor(color) {
    this.tapeColor = color;
    document.documentElement.style.setProperty('--tape-bg', color);
    this.dom.colorSwatchPreview.style.backgroundColor = color;
    this.dom.scrubberFill.style.backgroundColor = color;
  }

  applyFisheyeState() {
    document.documentElement.style.setProperty('--fisheye-intensity', this.fisheyeIntensity.toString());

    if (this.fisheyeEnabled && this.fisheyeIntensity > 0) {
      this.dom.viewport.classList.add('fisheye-enabled');
      this.dom.lensOverlay.style.opacity = (0.3 + this.fisheyeIntensity * 0.7).toString();
      this.dom.fisheyeStatusDot.className = 'w-2 h-2 rounded-full bg-emerald-400';
    } else {
      this.dom.viewport.classList.remove('fisheye-enabled');
      this.dom.lensOverlay.style.opacity = '0';
      this.dom.fisheyeStatusDot.className = 'w-2 h-2 rounded-full bg-[#5c524c]';
    }
  }

  togglePlayback(play) {
    this.isPlaying = play;
    this.togglePlayPauseUI(this.isPlaying);
    if (this.isPlaying) {
      if (this.mode === 'demo' && !this.audioMuted) {
        demoAudio.startBeat(90);
      }
    } else {
      demoAudio.stopBeat();
    }
  }

  togglePlayPauseUI(playing) {
    if (playing) {
      this.dom.playPauseIcon.innerHTML = `<svg class="w-5 h-5 fill-current" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
    } else {
      this.dom.playPauseIcon.innerHTML = `<svg class="w-5 h-5 fill-current ml-0.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
    }
  }

  seekTo(seconds) {
    this.currentTime = Math.max(0, Math.min(seconds, this.currentTrack.duration || 34));
    this.updateActiveFrame(true);
    this.updateScrubber();
  }

  jumpFrame(direction) {
    const frames = this.currentTrack.frames;
    if (!frames || frames.length === 0) return;

    let targetIdx = this.activeFrameIndex + direction;
    if (targetIdx < 0) targetIdx = 0;
    if (targetIdx >= frames.length) targetIdx = frames.length - 1;

    this.seekTo(frames[targetIdx].startTime);
  }

  updateTrackMetadata() {
    this.dom.trackTitleText.textContent = this.currentTrack.title || 'Unknown Track';
    this.dom.trackArtistText.textContent = this.currentTrack.artist || 'Unknown Artist';
    this.dom.totalDurationText.textContent = this.formatTime(this.currentTrack.duration || 34);

    const src = this.currentTrack.source;
    if (src === 'better-lyrics-cf-api') {
      this.dom.modeBadge.textContent = 'BetterLyrics CF-API';
      this.dom.modeBadge.className = 'text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
    } else if (src === 'lrclib') {
      this.dom.modeBadge.textContent = 'LRCLIB Synced';
      this.dom.modeBadge.className = 'text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30';
    } else if (this.mode === 'spotify') {
      this.dom.modeBadge.textContent = 'Live Spotify';
      this.dom.modeBadge.className = 'text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-[#1DB954]/20 text-[#1DB954] border border-[#1DB954]/30';
    } else {
      this.dom.modeBadge.textContent = 'Demo Mode';
      this.dom.modeBadge.className = 'text-[9px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-[#3b3430] text-[#f4f1ea] border border-[#524843]';
    }

    this.updateWordSyncBadge();
  }

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  }

  updateScrubber() {
    const total = this.currentTrack.duration || 34;
    const progress = Math.min(100, Math.max(0, (this.currentTime / total) * 100));
    this.dom.scrubberFill.style.width = `${progress}%`;
    this.dom.currentTimeText.textContent = this.formatTime(this.currentTime);
  }

  // Primary 60fps/120fps animation loop
  renderLoop(timestamp) {
    const delta = Math.min(0.1, Math.max(0, (timestamp - this.lastFrameTime) / 1000));
    this.lastFrameTime = timestamp;

    // Both Demo AND Live Spotify progress smoothly in the local render loop!
    if (this.isPlaying) {
      this.currentTime += delta;
      const total = this.currentTrack.duration || 34;
      if (this.mode === 'demo' && this.currentTime >= total) {
        this.currentTime = 0; // Loop demo
      }
      this.updateScrubber();
    }

    // Smooth Optical Tilt Physics interpolation
    this.currentTiltX += (this.targetTiltX - this.currentTiltX) * 0.08;
    this.currentTiltY += (this.targetTiltY - this.currentTiltY) * 0.08;

    if (this.fisheyeEnabled) {
      const fTiltX = this.currentTiltX * this.fisheyeIntensity;
      const fTiltY = this.currentTiltY * this.fisheyeIntensity;
      this.dom.chamber.style.transform = `rotateX(${fTiltX}deg) rotateY(${fTiltY}deg) translateZ(${20 * this.fisheyeIntensity}px)`;
    } else {
      this.dom.chamber.style.transform = 'none';
    }

    // Update kinetic stage typography and word-by-word highlight
    this.updateActiveFrame(false);
    this.updateWordSyncTimelineActiveWord();

    requestAnimationFrame((ts) => this.renderLoop(ts));
  }

  // Find and render active frame and highlight exact current word
  updateActiveFrame(forceRebuild = false) {
    const frames = this.currentTrack.frames;
    if (!frames || frames.length === 0) return;

    // Locate current active frame
    let frameIdx = frames.findIndex(
      (f) => this.currentTime >= f.startTime && this.currentTime < f.endTime
    );

    if (frameIdx === -1) {
      if (this.currentTime >= frames[frames.length - 1].endTime) {
        frameIdx = frames.length - 1;
      } else {
        const nextIdx = frames.findIndex((f) => f.startTime > this.currentTime);
        frameIdx = nextIdx > 0 ? nextIdx - 1 : 0;
      }
    }

    // If frame changed, rebuild DOM nodes for lines and words with entering animation
    if (frameIdx !== this.activeFrameIndex || forceRebuild) {
      this.activeFrameIndex = frameIdx;
      this.buildFrameDOM(frames[frameIdx]);
    }

    // Update exact word-for-word highlight state inside the active frame
    this.updateWordHighlights(frames[frameIdx]);
  }

  // Construct DOM for a stacked kinetic frame
  buildFrameDOM(frame) {
    this.dom.lineStack.innerHTML = '';
    this.dom.lineStack.classList.remove('frame-entering');
    void this.dom.lineStack.offsetWidth; // Force reflow to replay smooth entrance animation
    this.dom.lineStack.classList.add('frame-entering');

    const numLines = frame.lines.length;
    // Calculate display font size based on number of stacked lines and word density
    let fontSizeClass = 'text-7xl sm:text-8xl md:text-9xl';
    if (numLines === 1) {
      fontSizeClass = 'text-8xl sm:text-9xl md:text-[10.5rem]';
    } else if (numLines === 2) {
      fontSizeClass = 'text-7xl sm:text-8xl md:text-9xl';
    } else if (numLines >= 3) {
      fontSizeClass = 'text-5xl sm:text-7xl md:text-8xl';
    }

    frame.lines.forEach((line, lineIdx) => {
      const lineEl = document.createElement('div');
      lineEl.className = `kinetic-line ${fontSizeClass} font-black tracking-tight font-['Plus_Jakarta_Sans'] flex items-center justify-center flex-wrap my-1`;
      lineEl.id = `line-${line.id || lineIdx}`;

      // Fisheye 3D convex curvature calculation based on vertical line position
      if (this.fisheyeEnabled && this.fisheyeIntensity > 0) {
        const centerOffset = lineIdx - (numLines - 1) / 2;
        const curveZ = Math.cos(centerOffset * 0.9) * 35 * this.fisheyeIntensity;
        const curveRotX = -centerOffset * 9 * this.fisheyeIntensity;
        const scaleVal = 1 + (1 - Math.abs(centerOffset)) * 0.08 * this.fisheyeIntensity;

        lineEl.style.transform = `translateZ(${curveZ}px) rotateX(${curveRotX}deg) scale(${scaleVal})`;
      }

      line.words.forEach((word, wordIdx) => {
        const wordEl = document.createElement('div');
        wordEl.className = 'word-item relative inline-flex items-center justify-center';
        wordEl.id = `word-${frame.id}-${line.id || lineIdx}-${wordIdx}`;
        wordEl.dataset.startTime = word.time.toString();
        wordEl.dataset.duration = (word.duration || 0.6).toString();
        wordEl.dataset.isTape = word.isTape ? 'true' : 'false';
        
        const tilt = word.angle !== undefined ? word.angle : (wordIdx % 2 === 0 ? -2.4 : 2.2);
        wordEl.dataset.angle = tilt.toString();
        wordEl.style.setProperty('--word-angle', `${tilt}deg`);

        let badgeContent = '';
        if (word.icon && ICON_SVGS[word.icon] && word.icon !== 'heart' && word.icon !== 'hand' && !word.iconTrailing) {
          badgeContent += `<span class="word-glyph mr-2 inline-flex items-center">${ICON_SVGS[word.icon]}</span>`;
        }
        badgeContent += `<span class="word-text">${word.text}</span>`;
        if ((word.icon === 'heart' || word.iconTrailing) && ICON_SVGS[word.icon]) {
          badgeContent += `<span class="word-glyph ml-2 inline-flex items-center">${ICON_SVGS[word.icon]}</span>`;
        }

        let preBadge = '';
        if (word.icon === 'hand' && ICON_SVGS.hand) {
          preBadge = `<span class="word-glyph mr-2.5 inline-flex items-center text-[#9c7a6e]">${ICON_SVGS.hand}</span>`;
        }

        const isDefaultTape = word.isTape;
        const stickerClass = isDefaultTape ? 'tape-sticker default-tape' : 'tape-sticker';
        wordEl.innerHTML = `${preBadge}<span class="${stickerClass} word-badge" style="transform: rotate(${tilt}deg);">${badgeContent}</span>`;
        lineEl.appendChild(wordEl);
      });

      this.dom.lineStack.appendChild(lineEl);
    });
  }

  // Exact Word-for-Word highlighting logic with CSS-accelerated transitions
  updateWordHighlights(frame) {
    const wordElements = this.dom.lineStack.querySelectorAll('.word-item');
    let activeWordText = null;

    wordElements.forEach((el) => {
      const startTime = parseFloat(el.dataset.startTime);
      const duration = parseFloat(el.dataset.duration);
      const endTime = startTime + duration;

      const isCurrentActive = this.currentTime >= startTime && this.currentTime < endTime;
      const hasAlreadyPassed = this.currentTime >= endTime;
      const isTapeDesignated = el.dataset.isTape === 'true';

      const tapeBadge = el.querySelector('.word-badge') || el.querySelector('.tape-sticker');

      if (isCurrentActive) {
        if (!el.classList.contains('word-active')) {
          el.classList.add('word-active', 'just-activated');
          el.classList.remove('word-sung');
          if (tapeBadge) tapeBadge.classList.add('active-sticker');
          setTimeout(() => el.classList.remove('just-activated'), 300);
        }

        // Apply highlighter effect to the current WORD being said by the song
        const shouldHighlight = this.highlighterMode === 'currentWord' || isTapeDesignated;
        if (shouldHighlight) {
          el.classList.add('highlighter-applied');
          el.classList.remove('glow-only');
        } else {
          el.classList.remove('highlighter-applied');
          el.classList.add('glow-only');
        }

        activeWordText = el.querySelector('.word-text')?.textContent || tapeBadge?.textContent || '';
      } else if (hasAlreadyPassed) {
        if (!el.classList.contains('word-sung')) {
          el.classList.remove('word-active', 'just-activated', 'highlighter-applied', 'glow-only');
          el.classList.add('word-sung');
          if (tapeBadge) tapeBadge.classList.remove('active-sticker');
        }
      } else {
        // Future / Upcoming word
        if (el.classList.contains('word-active') || el.classList.contains('word-sung') || el.classList.contains('highlighter-applied')) {
          el.classList.remove('word-active', 'word-sung', 'just-activated', 'highlighter-applied', 'glow-only');
          if (tapeBadge) tapeBadge.classList.remove('active-sticker');
        }
      }
    });

    if (activeWordText) {
      this.dom.activeWordLabel.textContent = `▶ ${activeWordText}`;
    } else if (frame && frame.isIntro) {
      this.dom.activeWordLabel.textContent = 'Intro';
    } else if (frame && frame.isInterlude) {
      this.dom.activeWordLabel.textContent = 'Interlude';
    } else {
      this.dom.activeWordLabel.textContent = 'Live Sync';
    }
  }

  openWordSyncModal() {
    if (!this.dom.wordsyncModal) return;
    this.dom.wordsyncModal.classList.remove('hidden');
    this.renderWordSyncTimeline();
    this.updateExportPreview();
  }

  updateWordSyncBadge() {
    const badge = this.dom.wordSyncFormatBadge;
    if (!badge) return;
    const fmt = this.currentTrack?.format;
    if (fmt === 'elrc') {
      badge.textContent = 'eLRC';
      badge.className = 'px-1.5 py-0.5 bg-amber-500/25 text-amber-300 rounded text-[9px] font-mono font-bold';
    } else if (fmt === 'ttml') {
      badge.textContent = 'TTML';
      badge.className = 'px-1.5 py-0.5 bg-rose-500/25 text-rose-300 rounded text-[9px] font-mono font-bold';
    } else if (fmt === 'richsync') {
      badge.textContent = 'Richsync';
      badge.className = 'px-1.5 py-0.5 bg-cyan-500/25 text-cyan-300 rounded text-[9px] font-mono font-bold';
    } else {
      badge.textContent = 'Syllable';
      badge.className = 'px-1.5 py-0.5 bg-[#c48890]/25 text-[#f4bcc3] rounded text-[9px] font-mono font-bold';
    }
  }

  loadWordSyncPreset(preset) {
    let track = null;
    if (preset === 'payphone') {
      track = PAYPHONE_DEMO;
    } else if (preset === 'blinding-lights') {
      track = parseEnhancedLrc(SAMPLE_ELRC_BLINDING_LIGHTS, 'Blinding Lights', 'The Weeknd');
    } else if (preset === 'stay-with-me') {
      track = parseTtmlLyrics(SAMPLE_TTML_STAY_WITH_ME, 'Stay With Me', 'Sam Smith');
    } else if (preset === 'levitating') {
      track = parseMusixmatchRichsync(SAMPLE_RICHSYNC_LEVITATING, 'Levitating', 'Dua Lipa');
    }

    if (track) {
      this.currentTrack = track;
      this.seekTo(0);
      this.updateTrackMetadata();
      this.updateActiveFrame(true);
      this.updateWordSyncBadge();
      this.renderWordSyncTimeline();
      this.updateExportPreview();
      if (!this.isPlaying) this.togglePlayback(true);
    }
  }

  renderWordSyncTimeline() {
    if (!this.dom.wordsyncChipsContainer) return;
    this.dom.wordsyncChipsContainer.innerHTML = '';

    const frames = this.currentTrack?.frames || [];
    let totalWords = 0;

    frames.forEach((frame, fIdx) => {
      frame.lines.forEach((line, lIdx) => {
        line.words.forEach((w, wIdx) => {
          totalWords++;
          const chip = document.createElement('button');
          chip.className = 'wordsync-chip px-2 py-1 rounded bg-[#181416] hover:bg-[#2e1f25] border border-[#36252c] text-[#d6c4c9] hover:text-white transition flex items-center gap-1.5 active:scale-95';
          chip.id = `ws-chip-${fIdx}-${lIdx}-${wIdx}`;
          chip.dataset.time = w.time.toString();
          chip.dataset.duration = (w.duration || 0.6).toString();
          chip.dataset.text = w.text;

          const timeFormatted = this.formatTime(w.time);
          chip.innerHTML = `<span class="text-white font-bold">${w.text}</span><span class="text-[9px] text-[#917d84]">&lt;${timeFormatted}&gt;</span>`;

          chip.addEventListener('click', () => {
            this.seekTo(w.time);
            if (!this.isPlaying) this.togglePlayback(true);
          });

          this.dom.wordsyncChipsContainer.appendChild(chip);
        });
      });
    });

    if (totalWords === 0) {
      this.dom.wordsyncChipsContainer.innerHTML = '<span class="text-[#8e8278]">No syllable timing available for this track yet.</span>';
    }
  }

  updateWordSyncTimelineActiveWord() {
    if (!this.dom.wordsyncModal || this.dom.wordsyncModal.classList.contains('hidden')) return;
    const chips = this.dom.wordsyncChipsContainer?.querySelectorAll('.wordsync-chip');
    if (!chips || chips.length === 0) return;

    chips.forEach((chip) => {
      const time = parseFloat(chip.dataset.time);
      const dur = parseFloat(chip.dataset.duration);
      const isActive = this.currentTime >= time && this.currentTime < time + dur;
      if (isActive) {
        chip.classList.add('bg-[#c48890]', 'text-black', 'border-[#f4d7dc]', 'font-extrabold', 'scale-105');
        chip.classList.remove('bg-[#181416]', 'text-[#d6c4c9]');
        if (this.dom.wordsyncActiveWordInfo) {
          this.dom.wordsyncActiveWordInfo.textContent = `Word: "${chip.dataset.text}" @ ${this.formatTime(time)}`;
        }
      } else {
        chip.classList.remove('bg-[#c48890]', 'text-black', 'border-[#f4d7dc]', 'font-extrabold', 'scale-105');
        chip.classList.add('bg-[#181416]', 'text-[#d6c4c9]');
      }
    });
  }

  updateExportPreview() {
    if (!this.dom.exportPreviewBox) return;
    const elrc = exportTrackToEnhancedLrc(this.currentTrack);
    this.dom.exportPreviewBox.textContent = elrc;

    const lines = elrc.split('\n').filter((l) => l.trim().length > 0);
    let wordCount = 0;
    this.currentTrack.frames?.forEach((f) => f.lines.forEach((l) => (wordCount += l.words.length)));

    if (this.dom.exportPreviewStats) {
      this.dom.exportPreviewStats.textContent = `${lines.length} lines • ${wordCount} synced syllables`;
    }
  }

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// Instantiate application on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LiveLyricsApp();
});
