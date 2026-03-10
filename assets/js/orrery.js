/**
 * Solar System Orrery
 * 2D canvas visualisation of the 8 planets using Keplerian orbital elements.
 * Lazy-initialised on first tab switch; pauses when hidden.
 */

(function () {

    // === Keplerian elements (J2000 epoch) ===
    // [a (AU), e, I (deg), L (deg), longPeri (deg), longNode (deg)]
    // + per-century rates [da, de, dI, dL, dPeri, dNode]
    var planets = [
        { name: 'Mercury', color: '#b0b0b0', r: 2.5,
          a: 0.38709927, e: 0.20563593, I: 7.00497902, L: 252.25032350, lp: 77.45779628, ln: 48.33076593,
          da: 0.00000037, de: 0.00001906, dI: -0.00594749, dL: 149472.67411175, dlp: 0.16047689, dln: -0.12534081 },
        { name: 'Venus', color: '#f59e0b', r: 3,
          a: 0.72333566, e: 0.00677672, I: 3.39467605, L: 181.97909950, lp: 131.60246718, ln: 76.67984255,
          da: 0.00000390, de: -0.00004107, dI: -0.00078890, dL: 58517.81538729, dlp: 0.00268329, dln: -0.27769418 },
        { name: 'Earth', color: '#3b82f6', r: 3.5, glow: true,
          a: 1.00000261, e: 0.01671123, I: -0.00001531, L: 100.46457166, lp: 102.93768193, ln: 0.0,
          da: 0.00000562, de: -0.00004392, dI: -0.01294668, dL: 35999.37244981, dlp: 0.32327364, dln: 0.0 },
        { name: 'Mars', color: '#ef4444', r: 3,
          a: 1.52371034, e: 0.09339410, I: 1.84969142, L: 355.44656895, lp: -23.94362959, ln: 49.55953891,
          da: 0.00001847, de: 0.00007882, dI: -0.00813131, dL: 19140.30268499, dlp: 0.44441088, dln: -0.29257343 },
        { name: 'Jupiter', color: '#f97316', r: 4,
          a: 5.20288700, e: 0.04838624, I: 1.30439695, L: 34.39644051, lp: 14.72847983, ln: 100.47390909,
          da: -0.00011607, de: -0.00013253, dI: -0.00183714, dL: 3034.74612775, dlp: 0.21252668, dln: 0.20469106 },
        { name: 'Saturn', color: '#eab308', r: 3.5,
          a: 9.53667594, e: 0.05386179, I: 2.48599187, L: 49.95424423, lp: 92.59887831, ln: 113.66242448,
          da: -0.00125060, de: -0.00050991, dI: 0.00193609, dL: 1222.49362201, dlp: -0.41897216, dln: -0.28867794 },
        { name: 'Uranus', color: '#06b6d4', r: 3,
          a: 19.18916464, e: 0.04725744, I: 0.77263783, L: 313.23810451, lp: 170.95427630, ln: 74.01692503,
          da: -0.00196176, de: -0.00004397, dI: -0.00242939, dL: 428.48202785, dlp: 0.40805281, dln: 0.04240589 },
        { name: 'Neptune', color: '#8b5cf6', r: 3,
          a: 30.06992276, e: 0.00859048, I: 1.77004347, L: 304.87997031, lp: 44.96476227, ln: 131.78422574,
          da: 0.00026291, de: 0.00005105, dI: 0.00035372, dL: 218.45945325, dlp: -0.32241464, dln: -0.00508664 },
        { name: 'Pluto', color: '#a1887f', r: 2,
          a: 39.48211675, e: 0.24882730, I: 17.14001206, L: 238.92903833, lp: 224.06891629, ln: 110.30393684,
          da: -0.00031596, de: 0.00005170, dI: 0.00004818, dL: 145.20780515, dlp: -0.04062942, dln: -0.01183482 }
    ];

    var DEG2RAD = Math.PI / 180;

    // === Julian date ===
    function getJD(date) {
        var d = date || new Date();
        return (d.getTime() / 86400000) + 2440587.5;
    }

    // === Kepler solver (Newton-Raphson) ===
    function solveKepler(M, e) {
        var E = M;
        for (var i = 0; i < 15; i++) {
            var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
            E -= dE;
            if (Math.abs(dE) < 1e-12) break;
        }
        return E;
    }

    // === Compute orbital angle for each planet ===
    function computePositions(jd) {
        var T = (jd - 2451545.0) / 36525.0;
        var positions = [];
        for (var i = 0; i < planets.length; i++) {
            var p = planets[i];
            var a  = p.a + p.da * T;
            var angle = ((p.L + p.dL * T) % 360) * DEG2RAD;
            positions.push({ a: a, angle: angle, planet: p });
        }
        return positions;
    }

    // === Square-root scaling so inner + outer planets both visible ===
    function auToPixels(au, maxR) {
        var maxAU = 50; // beyond Pluto
        return (Math.sqrt(Math.abs(au)) / Math.sqrt(maxAU)) * maxR * (au < 0 ? -1 : 1);
    }

    // === View state (zoom + pan) ===
    var zoom = 1;
    var ZOOM_MIN = 0.5, ZOOM_MAX = 8;
    var panX = 0, panY = 0;
    var isDragging = false;
    var dragStartX = 0, dragStartY = 0;
    var panStartX = 0, panStartY = 0;

    // === Time state ===
    var simDate = new Date();       // the date shown in the orrery
    var playing = false;            // auto-advance mode
    var playDir = 1;                // +1 forward, -1 backward
    var STEP_DAYS = 1;              // days per click / per frame when playing

    // === Canvas state ===
    var canvas, ctx;
    var wrap;
    var running = false;
    var inited = false;
    var rafId = null;
    var controlsEl = null;

    function init() {
        if (inited) return;
        inited = true;
        wrap = document.getElementById('orrery-wrap');
        canvas = document.getElementById('orrery-canvas');
        if (!canvas || !wrap) return;
        ctx = canvas.getContext('2d');

        // Wheel zoom — towards cursor
        canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;

            var oldZoom = zoom;
            zoom *= e.deltaY < 0 ? 1.04 : 1 / 1.04;
            zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));

            // Adjust pan so the point under cursor stays fixed
            var scale = zoom / oldZoom;
            var cx = rect.width / 2;
            var cy = rect.height / 2;
            panX = (mx - cx) - scale * ((mx - cx) - panX);
            panY = (my - cy) - scale * ((my - cy) - panY);
        }, { passive: false });

        // Drag to pan — mouse
        canvas.addEventListener('mousedown', function (e) {
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            panStartX = panX;
            panStartY = panY;
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        });
        window.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            panX = panStartX + (e.clientX - dragStartX);
            panY = panStartY + (e.clientY - dragStartY);
        });
        window.addEventListener('mouseup', function () {
            if (!isDragging) return;
            isDragging = false;
            canvas.style.cursor = 'grab';
        });

        // Drag to pan — touch
        canvas.addEventListener('touchstart', function (e) {
            if (e.touches.length === 1) {
                isDragging = true;
                dragStartX = e.touches[0].clientX;
                dragStartY = e.touches[0].clientY;
                panStartX = panX;
                panStartY = panY;
            }
        }, { passive: true });
        canvas.addEventListener('touchmove', function (e) {
            if (!isDragging || e.touches.length !== 1) return;
            e.preventDefault();
            panX = panStartX + (e.touches[0].clientX - dragStartX);
            panY = panStartY + (e.touches[0].clientY - dragStartY);
        }, { passive: false });
        canvas.addEventListener('touchend', function () { isDragging = false; });

        // Pinch zoom — touch
        var lastPinchDist = 0;
        canvas.addEventListener('touchstart', function (e) {
            if (e.touches.length === 2) {
                isDragging = false;
                var dx = e.touches[0].clientX - e.touches[1].clientX;
                var dy = e.touches[0].clientY - e.touches[1].clientY;
                lastPinchDist = Math.sqrt(dx * dx + dy * dy);
            }
        }, { passive: true });
        canvas.addEventListener('touchmove', function (e) {
            if (e.touches.length !== 2) return;
            e.preventDefault();
            var dx = e.touches[0].clientX - e.touches[1].clientX;
            var dy = e.touches[0].clientY - e.touches[1].clientY;
            var dist = Math.sqrt(dx * dx + dy * dy);
            if (lastPinchDist > 0) {
                var rect = canvas.getBoundingClientRect();
                var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
                var my = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
                var oldZoom = zoom;
                zoom *= dist / lastPinchDist;
                zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zoom));
                var scale = zoom / oldZoom;
                var cx = rect.width / 2;
                var cy = rect.height / 2;
                panX = (mx - cx) - scale * ((mx - cx) - panX);
                panY = (my - cy) - scale * ((my - cy) - panY);
            }
            lastPinchDist = dist;
        }, { passive: false });
        canvas.addEventListener('touchend', function (e) {
            if (e.touches.length < 2) lastPinchDist = 0;
        });

        // Double-click to reset view
        canvas.addEventListener('dblclick', function () {
            zoom = 1; panX = 0; panY = 0;
        });

        canvas.style.cursor = 'grab';

        // Time controls
        controlsEl = document.createElement('div');
        controlsEl.className = 'orrery-controls';
        controlsEl.innerHTML =
            '<button class="orrery-btn" data-action="back" title="Step back"><i class="fa-solid fa-backward-step"></i></button>' +
            '<button class="orrery-btn" data-action="play" title="Play forward"><i class="fa-solid fa-play"></i></button>' +
            '<button class="orrery-btn" data-action="fwd" title="Step forward"><i class="fa-solid fa-forward-step"></i></button>' +
            '<button class="orrery-btn" data-action="now" title="Reset to now"><i class="fa-solid fa-clock"></i></button>';
        wrap.appendChild(controlsEl);

        // Hold-to-scrub state
        var holdInterval = null;
        var holdTimeout = null;
        var holdAccel = 0;
        var holdFired = false;

        function startHold(dir) {
            playing = false;
            updatePlayBtn();
            holdAccel = 0;
            holdFired = false;
            // Delay before hold-repeat kicks in
            holdTimeout = setTimeout(function () {
                holdFired = true;
                holdInterval = setInterval(function () {
                    holdAccel = Math.min(holdAccel + 1, 60);
                    var days = Math.max(1, Math.floor(holdAccel / 4)) * STEP_DAYS;
                    simDate.setDate(simDate.getDate() + dir * days);
                }, 50);
            }, 300);
        }

        function stopHold(dir) {
            if (holdTimeout) { clearTimeout(holdTimeout); holdTimeout = null; }
            if (holdInterval) { clearInterval(holdInterval); holdInterval = null; }
            // If hold never fired, it was a quick click — step once
            if (!holdFired && dir) {
                simDate.setDate(simDate.getDate() + dir * STEP_DAYS);
            }
            holdAccel = 0;
            holdFired = false;
        }

        var activeDir = 0;

        // Mouse hold
        controlsEl.addEventListener('mousedown', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.getAttribute('data-action');
            if (action === 'back') { activeDir = -1; startHold(-1); }
            else if (action === 'fwd') { activeDir = 1; startHold(1); }
        });
        window.addEventListener('mouseup', function () {
            stopHold(activeDir); activeDir = 0;
        });

        // Touch hold
        controlsEl.addEventListener('touchstart', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.getAttribute('data-action');
            if (action === 'back') { activeDir = -1; startHold(-1); }
            else if (action === 'fwd') { activeDir = 1; startHold(1); }
        }, { passive: true });
        window.addEventListener('touchend', function () {
            stopHold(activeDir); activeDir = 0;
        });
        window.addEventListener('touchcancel', function () {
            stopHold(activeDir); activeDir = 0;
        });

        // Click for play/now (non-hold buttons)
        controlsEl.addEventListener('click', function (e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            var action = btn.getAttribute('data-action');
            if (action === 'now') {
                playing = false;
                updatePlayBtn();
                simDate = new Date();
            } else if (action === 'play') {
                playing = !playing;
                playDir = 1;
                updatePlayBtn();
            }
        });

        function updatePlayBtn() {
            var icon = controlsEl.querySelector('[data-action="play"] i');
            if (icon) {
                icon.className = playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
            }
        }

        // ResizeObserver for responsive sizing
        var ro = new ResizeObserver(function () { resize(); });
        ro.observe(wrap);
        resize();
    }

    function resize() {
        if (!canvas || !wrap) return;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = wrap.clientWidth;
        var h = wrap.clientHeight;
        if (!w || !h) return;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // === Draw ===
    function draw() {
        if (!ctx) return;
        var w = wrap.clientWidth;
        var h = wrap.clientHeight;
        if (!w || !h) return;

        var cx = w / 2;
        var cy = h / 2;
        var maxR = Math.min(cx, cy) - 20;

        // Read theme-aware colors from CSS
        var styles = getComputedStyle(wrap);
        var orbitColor = styles.getPropertyValue('--border').trim() || 'rgba(255,255,255,0.07)';
        var labelColor = styles.getPropertyValue('--text-dim').trim() || 'rgba(255,255,255,0.55)';
        var dateColor = styles.getPropertyValue('--text-faint').trim() || 'rgba(255,255,255,0.3)';

        ctx.clearRect(0, 0, w, h);

        // Apply zoom + pan
        ctx.save();
        ctx.translate(panX + cx, panY + cy);
        ctx.scale(zoom, zoom);
        ctx.translate(-cx, -cy);

        // Advance time when playing
        if (playing) {
            simDate.setDate(simDate.getDate() + STEP_DAYS * playDir);
        }

        var jd = getJD(simDate);
        var positions = computePositions(jd);

        // Draw orbital paths (circles at each planet's current distance from sun)
        var T = (jd - 2451545.0) / 36525.0;
        for (var i = 0; i < planets.length; i++) {
            var p = planets[i];
            var a = p.a + p.da * T;
            var orbR = auToPixels(a, maxR);
            ctx.beginPath();
            ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
            ctx.strokeStyle = orbitColor;
            ctx.lineWidth = 0.5 / zoom;
            ctx.stroke();
        }

        // Sun — yellow glow
        var sunGlowR = 12 / Math.sqrt(zoom);
        var sunGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunGlowR);
        sunGrad.addColorStop(0, 'rgba(250, 204, 21, 1)');
        sunGrad.addColorStop(0.4, 'rgba(250, 204, 21, 0.6)');
        sunGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
        ctx.beginPath();
        ctx.arc(cx, cy, sunGlowR, 0, Math.PI * 2);
        ctx.fillStyle = sunGrad;
        ctx.fill();

        // Sun solid core
        ctx.beginPath();
        ctx.arc(cx, cy, 4 / Math.sqrt(zoom), 0, Math.PI * 2);
        ctx.fillStyle = '#facc15';
        ctx.fill();

        // Planets
        var fontSize = Math.max(7, 9 / Math.sqrt(zoom));
        ctx.font = '500 ' + fontSize + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';

        for (var j = 0; j < positions.length; j++) {
            var pos = positions[j];
            var orbPx = auToPixels(pos.a, maxR);
            var px = cx + orbPx * Math.cos(pos.angle);
            var py = cy - orbPx * Math.sin(pos.angle);

            var pl = pos.planet;
            var dotR = pl.r / Math.sqrt(zoom);

            // Earth glow
            if (pl.glow) {
                var earthGlow = ctx.createRadialGradient(px, py, 0, px, py, dotR * 3);
                earthGlow.addColorStop(0, pl.color + '66');
                earthGlow.addColorStop(1, pl.color + '00');
                ctx.beginPath();
                ctx.arc(px, py, dotR * 3, 0, Math.PI * 2);
                ctx.fillStyle = earthGlow;
                ctx.fill();
            }

            // Planet dot
            ctx.beginPath();
            ctx.arc(px, py, dotR, 0, Math.PI * 2);
            ctx.fillStyle = pl.color;
            ctx.fill();

            // Label
            ctx.fillStyle = labelColor;
            ctx.fillText(pl.name, px, py - dotR - 4 / Math.sqrt(zoom));
        }

        ctx.restore();

        // Date label (top-left) — drawn outside transform so it stays fixed
        var dateStr = simDate.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        ctx.font = '600 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillStyle = dateColor;
        ctx.fillText(dateStr, 12, 20);
    }

    function loop() {
        if (!running) return;
        draw();
        rafId = requestAnimationFrame(loop);
    }

    function start() {
        if (running) return;
        init();
        running = true;
        zoom = 1; panX = 0; panY = 0;
        simDate = new Date(); playing = false;
        resize();
        loop();
    }

    function stop() {
        running = false;
        if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    // === Lifecycle via earth-tab event ===
    window.addEventListener('earth-tab', function (e) {
        if (e.detail === 'orrery') {
            start();
        } else {
            stop();
        }
    });

}());
