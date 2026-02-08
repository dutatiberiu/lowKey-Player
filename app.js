// ===== GLOBAL STATE =====
const state = {
    baseUrl: '',
    artists: [],           // NEW: Store artist data with their albums
    albums: [],
    allSongs: [],
    currentArtist: null,   // NEW: Track selected artist ID
    currentAlbum: null,
    currentSongs: [],
    currentIndex: 0,
    currentTab: 'artists', // NEW: Track current tab
    isPlaying: false,
    isShuffle: false,
    repeatMode: 'off', // 'off', 'all', 'one'
    volume: 0.7,
    isMuted: false,
    previousVolume: 0.7,
    filteredSongs: [],
    shuffleHistory: [],
    // Visualizer state
    visualizerStyle: localStorage.getItem('visualizerStyle') || 'enhanced-bars',
    visualizerOpacity: 1
};

// ===== DOM ELEMENTS =====
const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const shuffleBtn = document.getElementById('shuffleBtn');
const repeatBtn = document.getElementById('repeatBtn');
const volumeBtn = document.getElementById('volumeBtn');
const volumeRange = document.getElementById('volumeRange');
const volumeFill = document.getElementById('volumeFill');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const progressHandle = document.getElementById('progressHandle');
const timeCurrent = document.getElementById('timeCurrent');
const timeDuration = document.getElementById('timeDuration');
const songTitle = document.getElementById('songTitle');
const songArtist = document.getElementById('songArtist');
const playlistItems = document.getElementById('playlistItems');
const searchInput = document.getElementById('searchInput');
const visualizerCanvas = document.getElementById('visualizer');
const visualizerContainer = document.querySelector('.visualizer-container');
const fullscreenBtn = document.getElementById('fullscreenBtn');

// NEW: Tab elements
const artistsPanel = document.getElementById('artists-panel');
const albumsPanel = document.getElementById('albums-panel');
const songsPanel = document.getElementById('songs-panel');

// ===== WEB AUDIO API SETUP =====
let audioContext;
let analyser;
let dataArray;
let bufferLength;
let animationId;

function setupAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.8; // Default value - minimal smoothing

        bufferLength = analyser.frequencyBinCount; // 128
        dataArray = new Uint8Array(bufferLength);
    }
}

// ===== VISUALIZER RENDERERS =====
const VisualizerRenderers = {
    // Shared gradient cache to avoid recreating per frame
    gradientCache: {},

    // Base renderer with common utilities
    BaseRenderer: {
        // Reusable gradient - create once, reuse forever
        getGradient(ctx, type, x1, y1, x2, y2) {
            const key = `${type}-${x1}-${y1}-${x2}-${y2}`;
            if (!VisualizerRenderers.gradientCache[key]) {
                const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
                gradient.addColorStop(0, '#c8ff00');
                gradient.addColorStop(0.5, '#8aad00');
                gradient.addColorStop(1, '#c8ff00');
                VisualizerRenderers.gradientCache[key] = gradient;
            }
            return VisualizerRenderers.gradientCache[key];
        },

        // Smooth interpolation between data points
        interpolateData(current, previous, factor) {
            if (!previous) return current;
            return new Uint8Array(current.map((val, i) =>
                previous[i] + (val - previous[i]) * factor
            ));
        },

        // Apply glow effect
        applyGlow(ctx, color, blur) {
            ctx.shadowColor = color;
            ctx.shadowBlur = blur;
        },

        clearGlow(ctx) {
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
        }
    },

    // Enhanced Bars Renderer - Original simple bars
    'enhanced-bars': {
        render(ctx, width, height, dataArray) {
            const barCount = dataArray.length;
            const barWidth = (width / barCount) * 2.5;
            let x = 0;

            for (let i = 0; i < barCount; i++) {
                const barHeight = (dataArray[i] / 255) * height;

                const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
                gradient.addColorStop(0, '#c8ff00');
                gradient.addColorStop(0.5, '#8aad00');
                gradient.addColorStop(1, '#c8ff00');

                ctx.fillStyle = gradient;
                ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);

                x += barWidth;
            }
        }
    },

    // Starfield + Waveform Renderer (Audio Visualization III)
    'circular': {
        stars: [],
        points: [],
        rotation: 0,
        avgCircleRadius: 0,
        initialized: false,
        TOTAL_STARS: 800,
        STARS_BREAK_POINT: 140,
        AVG_BREAK_POINT: 100,

        init(width, height) {
            if (this.initialized) return;

            const cx = width / 2;
            const cy = height / 2;
            const TOTAL_POINTS = bufferLength / 2;

            // Create stars
            this.stars = [];
            for (let i = 0; i < this.TOTAL_STARS; i++) {
                this.stars.push(this.createStar(width, height, cx, cy));
            }

            // Create waveform points
            this.points = [];
            for (let i = 0; i < TOTAL_POINTS; i++) {
                const angle = (i * 360) / TOTAL_POINTS;
                const radius = Math.min(width, height) / 10;
                this.points.push({
                    index: i,
                    angle: angle,
                    radius: radius,
                    x: cx + radius * Math.sin(Math.PI / 180 * angle),
                    y: cy + radius * Math.cos(Math.PI / 180 * angle),
                    dx: 0,
                    dy: 0
                });
            }

            this.avgCircleRadius = Math.min(width, height) / 10;
            this.initialized = true;
        },

        createStar(w, h, cx, cy) {
            const x = Math.random() * w - cx;
            const y = Math.random() * h - cy;
            const xc = x > 0 ? 1 : -1;
            const yc = y > 0 ? 1 : -1;

            let dx, dy;
            if (Math.abs(x) > Math.abs(y)) {
                dx = 1.0;
                dy = Math.abs(y / x);
            } else {
                dx = Math.abs(x / y);
                dy = 1.0;
            }

            return {
                x, y,
                z: Math.max(w/h),
                max_depth: Math.max(w/h),
                radius: 0.2,
                dx: dx * xc,
                dy: dy * yc,
                dz: -0.1,
                ddx: 0.001 * dx * xc,
                ddy: 0.001 * dy * yc,
                color: y > (cy/2) ? 'rgba(200, 255, 0, 0.3)' : 'rgba(138, 173, 0, 0.5)'
            };
        },

        render(ctx, width, height, dataArray) {
            if (!this.initialized) this.init(width, height);

            const cx = width / 2;
            const cy = height / 2;

            // Get frequency data and calculate average
            const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            const AVG_BREAK_POINT_HIT = avg > this.AVG_BREAK_POINT;

            // Draw starfield
            this.drawStarField(ctx, width, height, cx, cy, avg, AVG_BREAK_POINT_HIT);

            // Draw average circle
            this.drawAverageCircle(ctx, cx, cy, avg, AVG_BREAK_POINT_HIT);

            // Draw waveform (using time domain data)
            const timeData = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(timeData);
            this.drawWaveform(ctx, cx, cy, timeData, AVG_BREAK_POINT_HIT);
        },

        drawStarField(ctx, w, h, cx, cy, avg, hitBreakpoint) {
            for (let i = 0; i < this.stars.length; i++) {
                const p = this.stars[i];
                const tick = hitBreakpoint ? (avg/20) : (avg/50);

                p.x += p.dx * tick;
                p.y += p.dy * tick;
                p.z += p.dz;
                p.dx += p.ddx;
                p.dy += p.ddy;
                p.radius = 0.2 + ((p.max_depth - p.z) * 0.1);

                if (p.x < -cx || p.x > cx || p.y < -cy || p.y > cy) {
                    this.stars[i] = this.createStar(w, h, cx, cy);
                    continue;
                }

                ctx.beginPath();
                ctx.globalCompositeOperation = "lighter";
                ctx.fillStyle = hitBreakpoint ? 'rgba(200, 255, 0, 0.9)' : p.color;
                ctx.arc(p.x + cx, p.y + cy, p.radius, 0, Math.PI * 2, false);
                ctx.fill();
                ctx.closePath();
            }
        },

        drawAverageCircle(ctx, cx, cy, avg, hitBreakpoint) {
            ctx.strokeStyle = hitBreakpoint ? 'rgba(200, 255, 0, 1)' : 'rgba(138, 173, 0, 0.8)';
            ctx.fillStyle = hitBreakpoint ? 'rgba(200, 255, 0, 0.05)' : 'rgba(138, 173, 0, 0.1)';
            ctx.lineWidth = 1;

            ctx.beginPath();
            ctx.arc(cx, cy, avg + this.avgCircleRadius, 0, Math.PI * 2, false);
            ctx.stroke();
            ctx.fill();
            ctx.closePath();
        },

        drawWaveform(ctx, cx, cy, timeData, hitBreakpoint) {
            const waveformTick = 0.05;
            this.rotation += hitBreakpoint ? waveformTick : -waveformTick;

            ctx.strokeStyle = hitBreakpoint ? 'rgba(200, 255, 0, 0.8)' : 'rgba(138, 173, 0, 0.4)';
            ctx.fillStyle = hitBreakpoint ? 'rgba(0, 0, 0, 0)' : 'rgba(138, 173, 0, 0.05)';
            ctx.lineWidth = 1;
            ctx.lineCap = "round";

            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(this.rotation);
            ctx.translate(-cx, -cy);

            ctx.beginPath();
            const TOTAL_POINTS = this.points.length;

            for (let i = 0; i < TOTAL_POINTS; i++) {
                const p = this.points[i];
                const value = timeData[i] || 0;
                p.dx = p.x + value * Math.sin(Math.PI / 180 * p.angle);
                p.dy = p.y + value * Math.cos(Math.PI / 180 * p.angle);

                if (i === 0) {
                    ctx.moveTo(p.dx, p.dy);
                } else {
                    const xc = (p.dx + this.points[i-1].dx) / 2;
                    const yc = (p.dy + this.points[i-1].dy) / 2;
                    ctx.quadraticCurveTo(this.points[i-1].dx, this.points[i-1].dy, xc, yc);
                }
            }

            // Close the path back to first point
            const last = this.points[TOTAL_POINTS - 1];
            const first = this.points[0];
            const xc = (last.dx + first.dx) / 2;
            const yc = (last.dy + first.dy) / 2;
            ctx.quadraticCurveTo(last.dx, last.dy, xc, yc);
            ctx.quadraticCurveTo(xc, yc, first.dx, first.dy);

            ctx.stroke();
            ctx.fill();
            ctx.restore();
            ctx.closePath();
        }
    },

    // Reactive Waves Renderer (Simplified Shader Style)
    'waveform': {
        time: 0,
        bassEnergy: 0,
        midEnergy: 0,
        highEnergy: 0,
        kickDetected: false,
        kickEnergy: 0,

        render(ctx, width, height, dataArray) {
            this.time += 0.02;

            // Split frequency data into bands
            const third = Math.floor(dataArray.length / 3);
            const bassData = dataArray.slice(0, third);
            const midData = dataArray.slice(third, third * 2);
            const highData = dataArray.slice(third * 2);

            // Calculate average energy for each band (0-1)
            const bass = this.getAverage(bassData) / 255;
            const mid = this.getAverage(midData) / 255;
            const high = this.getAverage(highData) / 255;

            // Smooth energy values
            this.bassEnergy = this.bassEnergy * 0.7 + bass * 0.3;
            this.midEnergy = this.midEnergy * 0.7 + mid * 0.3;
            this.highEnergy = this.highEnergy * 0.7 + high * 0.3;

            // Simple kick detection (bass spike)
            if (bass > 0.6 && !this.kickDetected) {
                this.kickDetected = true;
                this.kickEnergy = 1.0;
            } else {
                this.kickEnergy *= 0.9;
                if (this.kickEnergy < 0.1) {
                    this.kickDetected = false;
                }
            }

            const centerY = height / 2;

            // Draw background gradient
            const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
            bgGradient.addColorStop(0, 'rgba(10, 10, 11, 0.3)');
            bgGradient.addColorStop(1, 'rgba(10, 10, 11, 0.3)');
            ctx.fillStyle = bgGradient;
            ctx.fillRect(0, 0, width, height);

            // Draw three reactive waves
            this.drawReactiveWave(ctx, width, height, centerY, this.bassEnergy, this.kickEnergy, 1, '#c8ff00', 3);
            this.drawReactiveWave(ctx, width, height, centerY, this.midEnergy, this.kickEnergy, 2, '#8aad00', 2.5);
            this.drawReactiveWave(ctx, width, height, centerY, this.highEnergy, this.kickEnergy, 3, '#5a7a00', 2);
        },

        drawReactiveWave(ctx, width, height, centerY, energy, kickEnergy, waveNum, color, lineWidth) {
            const points = 100;
            const amplitude = height * 0.15 * (0.5 + energy * 2); // Energy affects amplitude
            const frequency = 2 + waveNum * 0.5;
            const speed = this.time * (1 + energy);
            const offset = waveNum * 0.3; // Different phase for each wave

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth * (1 + kickEnergy * 0.5); // Thicker on kick
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Add glow on kick
            if (kickEnergy > 0.2) {
                ctx.shadowColor = color;
                ctx.shadowBlur = 10 * kickEnergy;
            }

            ctx.beginPath();

            for (let i = 0; i <= points; i++) {
                const x = (i / points) * width;
                const progress = i / points;

                // Main sine wave
                let y = centerY + Math.sin((progress * frequency * Math.PI * 2) + speed + offset) * amplitude;

                // Add complexity with secondary wave
                y += Math.sin((progress * frequency * 4 * Math.PI) - speed * 2) * amplitude * 0.3 * energy;

                // Add kick bounce effect
                if (kickEnergy > 0.1) {
                    y += Math.sin(progress * Math.PI) * kickEnergy * 15 * (waveNum === 1 ? 1 : 0.5);
                }

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }
            }

            ctx.stroke();
            ctx.restore();
        },

        getAverage(array) {
            if (array.length === 0) return 0;
            const sum = array.reduce((a, b) => a + b, 0);
            return sum / array.length;
        }
    }
};

// ===== MAIN VISUALIZER FUNCTION =====
function drawVisualizer() {
    if (!state.isPlaying) {
        const ctx = visualizerCanvas.getContext('2d');
        ctx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        return;
    }

    animationId = requestAnimationFrame(drawVisualizer);

    analyser.getByteFrequencyData(dataArray);

    const ctx = visualizerCanvas.getContext('2d');
    const container = visualizerCanvas.parentElement;

    // Use window dimensions if in fullscreen, otherwise use container
    let width, height;
    if (document.fullscreenElement === container) {
        width = window.innerWidth;
        height = window.innerHeight;
    } else {
        width = container.offsetWidth;
        height = container.offsetHeight;
    }

    // Clear canvas completely for instant response
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = 'rgb(10, 10, 11)';
    ctx.fillRect(0, 0, width, height);

    // Apply global opacity for transitions
    ctx.save();
    ctx.globalAlpha = state.visualizerOpacity;

    // Render using selected style
    const renderer = VisualizerRenderers[state.visualizerStyle];
    if (renderer && renderer.render) {
        renderer.render(ctx, width, height, dataArray, dataArray);
    }

    ctx.restore();
}

// ===== VISUALIZER STYLE SWITCHING =====
function switchVisualizerStyle(newStyle) {
    if (state.visualizerStyle === newStyle) return;

    // Fade out current style
    fadeVisualizerTransition(() => {
        state.visualizerStyle = newStyle;
        localStorage.setItem('visualizerStyle', newStyle);

        // Clear gradient cache when switching to avoid artifacts
        VisualizerRenderers.gradientCache = {};

        // Reset starfield initialization when switching to it
        if (newStyle === 'circular' && VisualizerRenderers.circular) {
            VisualizerRenderers.circular.initialized = false;
        }

        // Update UI
        updateVisualizerButtons();
    });
}

function fadeVisualizerTransition(callback) {
    const fadeOutDuration = 300; // ms
    const startTime = performance.now();
    const initialOpacity = state.visualizerOpacity;

    function fadeOut(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / fadeOutDuration, 1);

        state.visualizerOpacity = initialOpacity * (1 - progress);

        if (progress < 1) {
            requestAnimationFrame(fadeOut);
        } else {
            // Switch style at lowest opacity
            callback();
            // Fade back in
            fadeIn();
        }
    }

    function fadeIn() {
        const fadeInDuration = 300;
        const startTime = performance.now();

        function animate(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / fadeInDuration, 1);

            state.visualizerOpacity = progress;

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        }

        requestAnimationFrame(animate);
    }

    requestAnimationFrame(fadeOut);
}

function updateVisualizerButtons() {
    document.querySelectorAll('.visualizer-style-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.style === state.visualizerStyle);
    });
}

// Resize canvas function
let resizeTimeout;
function resizeCanvas(immediate = false) {
    const doResize = () => {
        const container = visualizerCanvas.parentElement;
        const dpr = window.devicePixelRatio || 1;
        const isFullscreen = document.fullscreenElement === container;

        // Get dimensions - use window size if in fullscreen
        let width, height;
        if (isFullscreen) {
            width = window.innerWidth;
            height = window.innerHeight;
            // Set explicit dimensions for fullscreen
            visualizerCanvas.style.width = width + 'px';
            visualizerCanvas.style.height = height + 'px';
        } else {
            // Clear inline styles so CSS takes over
            visualizerCanvas.style.width = '';
            visualizerCanvas.style.height = '';
            // Get actual container dimensions
            width = container.offsetWidth;
            height = container.offsetHeight;
        }

        // Set actual size in memory (scaled for retina displays)
        visualizerCanvas.width = width * dpr;
        visualizerCanvas.height = height * dpr;

        // Scale context to match device pixel ratio
        const ctx = visualizerCanvas.getContext('2d');
        ctx.scale(dpr, dpr);

        // Clear gradient cache on resize
        VisualizerRenderers.gradientCache = {};

        // Reset starfield initialization on resize
        if (VisualizerRenderers.circular) {
            VisualizerRenderers.circular.initialized = false;
        }
    };

    if (immediate) {
        clearTimeout(resizeTimeout);
        doResize();
    } else {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(doResize, 150);
    }
}

// ===== PLAYLIST FUNCTIONS =====
async function loadPlaylist() {
    try {
        const response = await fetch('playlist.json');
        const data = await response.json();

        // Store baseUrl for R2 access
        state.baseUrl = data.baseUrl;
        state.artists = [];
        state.albums = [];
        state.allSongs = [];

        // Build artists array with nested album data
        data.users.forEach(user => {
            user.artists.forEach(artist => {
                const artistData = {
                    id: artist.id,
                    name: artist.name,
                    albums: artist.albums.map(album => ({
                        id: album.id,
                        name: album.name,
                        path: album.path,
                        songs: album.songs,
                        artistName: artist.name,
                        artistId: artist.id
                    }))
                };
                state.artists.push(artistData);

                // Also build flat albums array (for backwards compatibility)
                artistData.albums.forEach(album => {
                    state.albums.push({
                        id: album.id,
                        name: `${artist.name} - ${album.name}`,
                        path: album.path,
                        songs: album.songs,
                        artistName: artist.name,
                        artistId: artist.id
                    });

                    // Build all songs array
                    album.songs.forEach((filename) => {
                        state.allSongs.push({
                            filename: filename,
                            path: album.path,
                            albumId: album.id,
                            albumName: album.name,
                            artistName: artist.name,
                            artistId: artist.id,
                            globalIndex: state.allSongs.length
                        });
                    });
                });
            });
        });

        // Initialize tabs
        renderArtists();
        renderAlbums();
        loadAllSongs(); // Start with all songs in songs tab
    } catch (error) {
        console.error('Error loading playlist:', error);
        songTitle.textContent = 'Error loading playlist';
        songArtist.textContent = 'Check playlist.json file';
    }
}

// Render Artists Tab
function renderArtists() {
    const html = state.artists.map(artist => {
        const totalSongs = artist.albums.reduce((sum, album) => sum + album.songs.length, 0);
        return `
            <div class="list-item ${state.currentArtist === artist.id ? 'active' : ''}" onclick="selectArtist('${artist.id}')">
                <div class="list-item-header">
                    <div class="list-item-name">${artist.name}</div>
                    <div class="list-item-count">${artist.albums.length} albums • ${totalSongs} songs</div>
                </div>
            </div>
        `;
    }).join('');
    artistsPanel.innerHTML = html;
}

// Render Albums Tab (filtered by artist if selected)
function renderAlbums() {
    let albumsToShow = [];

    if (!state.currentArtist) {
        // Show all albums from all artists
        albumsToShow = state.albums.map(album => ({
            ...album,
            displayName: album.name // Already includes artist name
        }));
    } else {
        // Show only albums from selected artist
        const artist = state.artists.find(a => a.id === state.currentArtist);
        if (artist) {
            albumsToShow = artist.albums.map(album => ({
                ...album,
                displayName: album.name // Just album name
            }));
        }
    }

    const html = albumsToShow.map(album => `
        <div class="list-item ${state.currentAlbum === album.id ? 'active' : ''}" onclick="selectAlbum('${album.id}')">
            <div class="list-item-header">
                <div class="list-item-name">${album.displayName}</div>
                <div class="list-item-count">${album.songs.length} songs</div>
            </div>
        </div>
    `).join('');

    albumsPanel.innerHTML = html || '<div style="padding: 20px; text-align: center; color: #6b6b76;">No albums</div>';
}

// Select Artist
function selectArtist(artistId) {
    state.currentArtist = artistId;
    state.currentAlbum = null;
    renderArtists();
    renderAlbums();
    // Auto-switch to albums tab
    switchTab('albums');
}

// Select Album
function selectAlbum(albumId) {
    state.currentAlbum = albumId;

    const album = state.albums.find(a => a.id === albumId);
    if (!album) return;

    state.currentSongs = album.songs.map((filename, index) => ({
        filename: filename,
        path: album.path,
        albumId: album.id,
        albumName: album.name,
        artistName: album.artistName,
        index: index
    }));

    state.filteredSongs = [...state.currentSongs];
    state.currentIndex = 0;
    renderPlaylist();
    renderAlbums();

    // Auto-switch to songs tab
    switchTab('songs');

    if (state.currentSongs.length > 0) {
        loadSong(0);
    }
}

// Load all songs
function loadAllSongs() {
    state.currentSongs = state.allSongs.map((song, index) => ({
        ...song,
        index: index
    }));
    state.filteredSongs = [...state.currentSongs];
    state.currentIndex = 0;
    renderPlaylist();
    if (state.currentSongs.length > 0) {
        loadSong(0);
    }
}

// Switch Tab
function switchTab(tabName) {
    state.currentTab = tabName;

    // Update tab buttons
    document.querySelectorAll('.tab').forEach(tab => {
        tab.classList.remove('active');
        if (tab.dataset.tab === tabName) {
            tab.classList.add('active');
        }
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    document.getElementById(tabName + '-panel').classList.add('active');
}

function renderPlaylist() {
    playlistItems.innerHTML = '';
    state.filteredSongs.forEach((song, displayIndex) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        if (song.index === state.currentIndex) {
            item.classList.add('active');
        }

        const { title, artist } = parseSongName(song.filename);

        item.innerHTML = `
            <div class="playlist-item-number">${displayIndex + 1}</div>
            <div class="playlist-item-info">
                <div class="playlist-item-title">${title}</div>
                <div class="playlist-item-artist">${artist}</div>
            </div>
        `;

        item.addEventListener('click', () => {
            loadSong(song.index);
            play();
        });

        playlistItems.appendChild(item);
    });

    // Scroll to active item
    setTimeout(() => {
        const activeItem = playlistItems.querySelector('.playlist-item.active');
        if (activeItem) {
            activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }, 100);
}

function parseSongName(filename) {
    // Remove file extension
    const nameWithoutExt = filename.replace(/\.(mp3|MP3|flac|FLAC)$/, '');

    // Check for "Artist - Title" pattern
    if (nameWithoutExt.includes(' - ')) {
        const parts = nameWithoutExt.split(' - ');
        // If it starts with a number (track number), skip it
        if (/^\d+\.?\s*/.test(parts[0])) {
            // Format: "01. Title" or "01 - Title"
            const titlePart = parts.slice(1).join(' - ');
            return {
                artist: parts[0].replace(/^\d+\.?\s*/, '').trim() || 'Unknown Artist',
                title: titlePart || nameWithoutExt
            };
        }
        return {
            artist: parts[0].trim(),
            title: parts.slice(1).join(' - ').trim()
        };
    }

    // Check for track number at start
    if (/^\d+\.?\s+/.test(nameWithoutExt)) {
        const title = nameWithoutExt.replace(/^\d+\.?\s+/, '');
        return {
            artist: 'Unknown Artist',
            title: title
        };
    }

    return {
        artist: 'Unknown Artist',
        title: nameWithoutExt
    };
}

// ===== SONG LOADING =====
function loadSong(index) {
    if (index < 0 || index >= state.currentSongs.length) return;

    state.currentIndex = index;
    const song = state.currentSongs[index];
    const { title, artist } = parseSongName(song.filename);

    // Build R2 URL: baseUrl/path/filename (properly encoded)
    const pathParts = song.path.split('/').map(encodeURIComponent);
    const encodedFilename = encodeURIComponent(song.filename);
    // Add cache-busting parameter to force fresh CORS headers
    audio.src = `${state.baseUrl}/${pathParts.join('/')}/${encodedFilename}?v=2`;

    songTitle.textContent = title;
    songArtist.textContent = song.artistName || artist;

    renderPlaylist();
}

// ===== PLAYBACK CONTROLS =====
function play() {
    if (!audioContext) {
        setupAudioContext();
    }

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    const playPromise = audio.play();

    if (playPromise !== undefined) {
        playPromise
            .then(() => {
                console.log('Audio playback started successfully');
                state.isPlaying = true;
                updatePlayButton();
                drawVisualizer();
            })
            .catch(error => {
                console.error('Error playing audio:', error);
                console.log('Audio src:', audio.src);
                console.log('Audio ready state:', audio.readyState);
                console.log('Audio network state:', audio.networkState);
            });
    }
}

function pause() {
    audio.pause();
    state.isPlaying = false;
    updatePlayButton();
}

function togglePlay() {
    if (state.isPlaying) {
        pause();
    } else {
        play();
    }
}

function updatePlayButton() {
    const playIcon = playBtn.querySelector('.play-icon');
    const pauseIcon = playBtn.querySelector('.pause-icon');

    if (state.isPlaying) {
        playIcon.classList.add('hidden');
        pauseIcon.classList.remove('hidden');
        document.body.classList.add('playing');
    } else {
        playIcon.classList.remove('hidden');
        pauseIcon.classList.add('hidden');
        document.body.classList.remove('playing');
    }
}

function nextSong() {
    if (state.isShuffle) {
        state.shuffleHistory.push(state.currentIndex);
        const remainingSongs = state.currentSongs
            .map((_, i) => i)
            .filter(i => i !== state.currentIndex);

        if (remainingSongs.length === 0) {
            state.currentIndex = 0;
        } else {
            const randomIndex = Math.floor(Math.random() * remainingSongs.length);
            state.currentIndex = remainingSongs[randomIndex];
        }
    } else {
        state.currentIndex = (state.currentIndex + 1) % state.currentSongs.length;
    }

    loadSong(state.currentIndex);
    if (state.isPlaying) {
        play();
    }
}

function prevSong() {
    if (state.isShuffle && state.shuffleHistory.length > 0) {
        state.currentIndex = state.shuffleHistory.pop();
    } else {
        state.currentIndex = (state.currentIndex - 1 + state.currentSongs.length) % state.currentSongs.length;
    }

    loadSong(state.currentIndex);
    if (state.isPlaying) {
        play();
    }
}

// ===== SHUFFLE & REPEAT =====
function toggleShuffle() {
    state.isShuffle = !state.isShuffle;
    shuffleBtn.classList.toggle('active', state.isShuffle);
    if (state.isShuffle) {
        state.shuffleHistory = [];
    }
}

function toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(state.repeatMode);
    state.repeatMode = modes[(currentIndex + 1) % modes.length];

    repeatBtn.classList.toggle('active', state.repeatMode !== 'off');

    // Visual feedback for repeat mode
    if (state.repeatMode === 'one') {
        repeatBtn.style.boxShadow = '0 0 15px rgba(200, 255, 0, 0.5)';
    } else if (state.repeatMode === 'all') {
        repeatBtn.style.boxShadow = '0 0 15px rgba(200, 255, 0, 0.3)';
    } else {
        repeatBtn.style.boxShadow = '';
    }
}

// ===== VOLUME CONTROLS =====
function setVolume(value) {
    state.volume = value / 100;
    audio.volume = state.volume;
    volumeFill.style.width = value + '%';

    updateVolumeIcon();
}

function toggleMute() {
    if (state.isMuted) {
        state.isMuted = false;
        audio.volume = state.previousVolume;
        volumeRange.value = state.previousVolume * 100;
        volumeFill.style.width = (state.previousVolume * 100) + '%';
    } else {
        state.isMuted = true;
        state.previousVolume = audio.volume;
        audio.volume = 0;
        volumeRange.value = 0;
        volumeFill.style.width = '0%';
    }

    updateVolumeIcon();
}

function updateVolumeIcon() {
    const volumeIcon = volumeBtn.querySelector('.volume-icon');
    const muteIcon = volumeBtn.querySelector('.mute-icon');

    if (audio.volume === 0 || state.isMuted) {
        volumeIcon.classList.add('hidden');
        muteIcon.classList.remove('hidden');
    } else {
        volumeIcon.classList.remove('hidden');
        muteIcon.classList.add('hidden');
    }
}

// ===== PROGRESS BAR =====
function updateProgress() {
    if (audio.duration) {
        const percent = (audio.currentTime / audio.duration) * 100;
        progressFill.style.width = percent + '%';
        progressHandle.style.left = percent + '%';

        timeCurrent.textContent = formatTime(audio.currentTime);
        timeDuration.textContent = formatTime(audio.duration);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';

    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function seek(e) {
    const rect = progressBar.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const time = percent * audio.duration;

    if (!isNaN(time)) {
        audio.currentTime = time;
    }
}

// ===== SEARCH/FILTER =====
function filterPlaylist(query) {
    const lowerQuery = query.toLowerCase();
    state.filteredSongs = state.currentSongs.filter(song =>
        song.filename.toLowerCase().includes(lowerQuery)
    );
    renderPlaylist();
}

// ===== EVENT LISTENERS =====
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', prevSong);
nextBtn.addEventListener('click', nextSong);
shuffleBtn.addEventListener('click', toggleShuffle);
repeatBtn.addEventListener('click', toggleRepeat);
volumeBtn.addEventListener('click', toggleMute);
volumeRange.addEventListener('input', (e) => setVolume(e.target.value));
progressBar.addEventListener('click', seek);
searchInput.addEventListener('input', (e) => filterPlaylist(e.target.value));

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        switchTab(tab.dataset.tab);
    });
});

// Audio events
audio.addEventListener('timeupdate', updateProgress);
audio.addEventListener('loadedmetadata', updateProgress);
audio.addEventListener('ended', () => {
    if (state.repeatMode === 'one') {
        audio.currentTime = 0;
        play();
    } else if (state.repeatMode === 'all' || state.currentIndex < state.currentSongs.length - 1) {
        nextSong();
    } else {
        pause();
    }
});

// Debug audio loading
audio.addEventListener('loadstart', () => console.log('Audio loading started'));
audio.addEventListener('canplay', () => console.log('Audio can play'));
audio.addEventListener('playing', () => console.log('Audio is playing'));
audio.addEventListener('error', (e) => {
    console.error('Audio error:', e);
    console.error('Audio error details:', audio.error);
    console.log('Failed URL:', audio.src);
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT') {
        e.preventDefault();
        togglePlay();
    } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        nextSong();
    } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        prevSong();
    }
});

// Window resize for canvas
window.addEventListener('resize', resizeCanvas);

// Fullscreen toggle
fullscreenBtn.addEventListener('click', toggleFullscreen);

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        visualizerContainer.requestFullscreen().catch(err => {
            console.error('Error entering fullscreen:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function updateFullscreenButton() {
    const fullscreenIcon = fullscreenBtn.querySelector('.fullscreen-icon');
    const exitIcon = fullscreenBtn.querySelector('.exit-fullscreen-icon');

    if (document.fullscreenElement) {
        fullscreenIcon.classList.add('hidden');
        exitIcon.classList.remove('hidden');
    } else {
        fullscreenIcon.classList.remove('hidden');
        exitIcon.classList.add('hidden');
    }
}

document.addEventListener('fullscreenchange', () => {
    updateFullscreenButton();
    // Resize canvas immediately when entering/exiting fullscreen
    resizeCanvas(true);
    // Do another resize after a short delay to ensure proper dimensions
    setTimeout(() => resizeCanvas(true), 100);
});

// Visualizer style button event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Add click handlers to visualizer style buttons
    document.querySelectorAll('.visualizer-style-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchVisualizerStyle(btn.dataset.style);
        });
    });

    // Initialize button states based on saved preference
    updateVisualizerButtons();
});

// ===== INITIALIZATION =====
function init() {
    resizeCanvas();
    setVolume(70);
    loadPlaylist();
}

// Start the app
init();
