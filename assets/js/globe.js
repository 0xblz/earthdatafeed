/**
 * Earthquake Globe
 * Procedurally-generated digital Earth texture (dark grid + glowing land
 * outlines, matching the site palette). Dots coloured by the same magnitude
 * scale as the earthquakes page.
 *
 * Drag (mouse / touch) → spin with inertia  |  Scroll → zoom
 * Hover a dot → tooltip  |  Click a dot → /earthquakes/#eq-{id}
 */

import * as THREE     from 'three';
import * as topojson  from 'topojson-client';

(function () {

    var USGS_URL   = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson';
    var ATLAS_URL  = 'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json';

    var RADIUS     = 1;
    var ZOOM_MIN   = 1.6;
    var ZOOM_MAX   = 5.0;
    var ZOOM_SPEED = 0.0008;
    var SENSITIVITY = 0.004;
    var DAMPING     = 0.88;
    var AUTO_SPIN   = 0.0012;

    // ===== COLOUR SCALE (matches earthquakes.js magColor) =====
    function magColor(mag) {
        if (mag >= 6) return 0xef4444;
        if (mag >= 5) return 0xf97316;
        if (mag >= 4) return 0xf59e0b;
        if (mag >= 3) return 0xeab308;
        if (mag >= 2) return 0x06b6d4;
        return 0x22c55e;
    }

    function magColorHex(mag) {
        if (mag >= 6) return '#ef4444';
        if (mag >= 5) return '#f97316';
        if (mag >= 4) return '#f59e0b';
        if (mag >= 3) return '#eab308';
        if (mag >= 2) return '#06b6d4';
        return '#22c55e';
    }

    // ===== HELPERS =====
    function latLonToVec3(lat, lon, r) {
        var phi   = (90 - lat) * (Math.PI / 180);
        var theta = (lon + 180) * (Math.PI / 180);
        return new THREE.Vector3(
            -r * Math.sin(phi) * Math.cos(theta),
             r * Math.cos(phi),
             r * Math.sin(phi) * Math.sin(theta)
        );
    }

    function relTime(ts) {
        var diff = Date.now() - ts;
        var s = Math.floor(diff / 1000);
        if (s < 60)  return s + 's ago';
        var m = Math.floor(s / 60);
        if (m < 60)  return m + 'm ago';
        var h = Math.floor(m / 60);
        if (h < 24)  return h + 'h ago';
        return Math.floor(h / 24) + 'd ago';
    }

    function esc(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    // Mirrors the convertPlace logic in earthquakes.js / alerts.js.
    // Reads ed_units from localStorage each call so it always reflects the
    // current toggle state without needing a page reload.
    function convertPlace(place) {
        var metric = (localStorage.getItem('ed_units') || 'imperial') === 'metric';
        if (metric) return place;
        return place.replace(/(\d+)\s*km\b/g, function (m, km) {
            return Math.round(parseInt(km) * 0.621371) + ' mi';
        });
    }

    // ===== SUN DIRECTION =====
    // Returns the unit vector pointing toward the sun in globe-texture world space,
    // based on the approximate subsolar point for the current UTC time.
    function getSunDir() {
        var now        = new Date();
        var dayOfYear  = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
        var decl       = -23.45 * Math.cos(2 * Math.PI * (dayOfYear + 10) / 365);
        var utHours    = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
        var subLon     = -(utHours - 12) * 15; // longitude where sun is overhead
        var phi        = (90 - decl)      * Math.PI / 180;
        var theta      = (subLon + 180)   * Math.PI / 180;
        return new THREE.Vector3(
            -Math.sin(phi) * Math.sin(theta),
             Math.cos(phi),
             Math.sin(phi) * Math.cos(theta)
        ).normalize();
    }

    // ===== DIGITAL TEXTURE =====
    // Renders land outlines onto a 2048×1024 canvas with an equirectangular
    // projection, using the site's green/cyan palette on a near-black ground.
    function buildDigitalTexture(topoData) {
        var W = 4096, H = 2048;
        var cv  = document.createElement('canvas');
        cv.width = W; cv.height = H;
        var ctx = cv.getContext('2d');

        // ── Background ────────────────────────────────────────────────────
        ctx.fillStyle = '#030810';
        ctx.fillRect(0, 0, W, H);

        // ── Lat / lon grid ────────────────────────────────────────────────
        ctx.lineWidth = 0.6;
        for (var glat = -90; glat <= 90; glat += 30) {
            var gy = (90 - glat) / 180 * H;
            ctx.strokeStyle = (glat === 0) ? '#0f2535' : '#0a1825';
            ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
        }
        for (var glon = -180; glon < 180; glon += 30) {
            var gx = (glon + 180) / 360 * W;
            ctx.strokeStyle = (glon === 0) ? '#0f2535' : '#0a1825';
            ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
        }

        // ── Tropics & polar circles (subtle) ──────────────────────────────
        [23.5, -23.5, 66.5, -66.5].forEach(function (tLat) {
            var ty = (90 - tLat) / 180 * H;
            ctx.strokeStyle = '#0c1e2e';
            ctx.lineWidth = 0.4;
            ctx.setLineDash([4, 8]);
            ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(W, ty); ctx.stroke();
            ctx.setLineDash([]);
        });

        if (!topoData) {
            return new THREE.CanvasTexture(cv);
        }

        // ── Land masses ───────────────────────────────────────────────────
        var land = topojson.feature(topoData, topoData.objects.land);

        // Filled interior (very dark green)
        ctx.beginPath();
        drawFeature(ctx, land, W, H);
        ctx.fillStyle = '#071510';
        ctx.fill();

        // Outer glow (wide, semi-transparent)
        ctx.beginPath();
        drawFeature(ctx, land, W, H);
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.12)';
        ctx.lineWidth   = 5;
        ctx.stroke();

        // Core outline (crisp green)
        ctx.beginPath();
        drawFeature(ctx, land, W, H);
        ctx.strokeStyle = 'rgba(34, 197, 94, 0.55)';
        ctx.lineWidth   = 1.2;
        ctx.stroke();

        return new THREE.CanvasTexture(cv);
    }

    // Equirectangular projection helper
    function project(lon, lat, W, H) {
        return [(lon + 180) / 360 * W, (90 - lat) / 180 * H];
    }

    function drawFeature(ctx, feature, W, H) {
        ctx.beginPath();
        if (feature.type === 'FeatureCollection') {
            feature.features.forEach(function (f) { drawGeom(ctx, f.geometry, W, H); });
        } else if (feature.type === 'Feature') {
            drawGeom(ctx, feature.geometry, W, H);
        } else {
            drawGeom(ctx, feature, W, H);
        }
    }

    function drawGeom(ctx, geom, W, H) {
        if (!geom) return;
        if (geom.type === 'Polygon') {
            drawRings(ctx, geom.coordinates, W, H);
        } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach(function (poly) { drawRings(ctx, poly, W, H); });
        }
    }

    function drawRings(ctx, rings, W, H) {
        rings.forEach(function (ring) {
            if (!ring.length) return;
            var p = project(ring[0][0], ring[0][1], W, H);
            ctx.moveTo(p[0], p[1]);
            var prevLon = ring[0][0];
            for (var i = 1; i < ring.length; i++) {
                var lon = ring[i][0], lat = ring[i][1];
                p = project(lon, lat, W, H);
                // Skip antimeridian-crossing segments to avoid canvas artefacts
                if (Math.abs(lon - prevLon) > 180) {
                    ctx.moveTo(p[0], p[1]);
                } else {
                    ctx.lineTo(p[0], p[1]);
                }
                prevLon = lon;
            }
            ctx.closePath();
        });
    }

    // ===== INIT =====
    function initGlobe(quakes, topoData, sigCount, largestMag, totalCount) {
        var wrap   = document.getElementById('globe-wrap');
        var canvas = document.getElementById('globe-canvas');
        if (!canvas || !wrap) return;

        var w = canvas.clientWidth  || wrap.clientWidth  || 300;
        var h = canvas.clientHeight || 360;

        var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(w, h, false);

        var scene  = new THREE.Scene();
        var camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
        camera.position.z = 3.0;

        var pivot = new THREE.Group();
        pivot.rotation.order = 'YXZ'; // Y (longitude spin) applied before X (latitude tilt)
        scene.add(pivot);

        // ── Globe with digital texture ────────────────────────────────────
        var digitalTex = buildDigitalTexture(topoData);
        digitalTex.anisotropy  = renderer.capabilities.getMaxAnisotropy();
        digitalTex.minFilter   = THREE.LinearMipmapLinearFilter;
        digitalTex.magFilter   = THREE.LinearFilter;
        digitalTex.needsUpdate = true;
        var globeGeo   = new THREE.SphereGeometry(RADIUS, 64, 64);
        // ShaderMaterial: samples the digital texture then darkens the night side
        // in a single pass — no separate mesh, no z-fighting, no triangle-edge banding.
        var globeMat = new THREE.ShaderMaterial({
            uniforms: {
                uTex:    { value: digitalTex },
                uSunDir: { value: getSunDir() }
            },
            vertexShader: [
                'varying vec2 vUv;',
                'void main() {',
                '    vUv = uv;',
                '    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D uTex;',
                'uniform vec3 uSunDir;',
                'varying vec2 vUv;',
                'const float PI = 3.14159265;',
                'void main() {',
                '    vec4 c = texture2D(uTex, vUv);',
                // Reconstruct the geographic surface point from UV (SphereGeometry space).
                // This is independent of pivot rotation, so the terminator always sits at
                // the correct real-world lat/lon regardless of how fast the globe spins.
                '    float phi   = vUv.x * 2.0 * PI;',
                '    float theta = (1.0 - vUv.y) * PI;',
                '    vec3 geoPos = vec3(-sin(phi)*sin(theta), cos(theta), cos(phi)*sin(theta));',
                '    float d     = dot(geoPos, normalize(uSunDir));',
                '    float night = 1.0 - smoothstep(-0.04, 0.04, d);',
                '    c.rgb *= (1.0 - night * 0.5) * 4.5;',
                '    gl_FragColor = c;',
                '}'
            ].join('\n')
        });
        var globeMesh  = new THREE.Mesh(globeGeo, globeMat);
        pivot.add(globeMesh);

        // ── Atmosphere halo ───────────────────────────────────────────────
        var atmGeo = new THREE.SphereGeometry(RADIUS + 0.055, 48, 48);
        var atmMat = new THREE.MeshBasicMaterial({
            color:       0x06b6d4,
            transparent: true,
            opacity:     0.06,
            side:        THREE.BackSide
        });
        scene.add(new THREE.Mesh(atmGeo, atmMat));

        // ── Stat overlays (always visible) ──────────────────────────────
        var ovTL = document.createElement('div');
        ovTL.className = 'globe-ov globe-ov--tl';
        function resetTL() {
            ovTL.innerHTML =
                '<button class="globe-north" title="Reset orientation" aria-label="Reset globe orientation">' +
                    '<i class="fa-solid fa-compass"></i>' +
                    '<span class="globe-ov__loc">Earth</span>' +
                '</button>';
            ovTL.querySelector('.globe-north').addEventListener('click', function () {
                rotAnim = { fromQ: pivot.quaternion.clone(), toQ: new THREE.Quaternion(), t: 0 };
            });
        }
        resetTL();
        wrap.appendChild(ovTL);

        var ovTR = document.createElement('div');
        ovTR.className = 'globe-ov globe-ov--tr';
        ovTR.innerHTML =
            '<span class="globe-ov__val" style="color:var(--color-red)">' + sigCount + '</span>' +
            '<span class="globe-ov__label">M4+ / 24H</span>';
        wrap.appendChild(ovTR);

        var ovBL = document.createElement('div');
        ovBL.className = 'globe-ov globe-ov--bl';
        ovBL.innerHTML =
            '<span class="globe-ov__val" style="color:' + magColorHex(largestMag) + '">M ' + largestMag.toFixed(1) + '</span>' +
            '<span class="globe-ov__label">LARGEST / 24H</span>';
        wrap.appendChild(ovBL);

        var ovBR = document.createElement('div');
        ovBR.className = 'globe-ov globe-ov--br';
        ovBR.innerHTML =
            '<span class="globe-ov__val" style="color:var(--color-blue)">' + totalCount + '</span>' +
            '<span class="globe-ov__label">TOTAL / 24H</span>';
        wrap.appendChild(ovBR);

        var staticOverlays = [ovTR, ovBL, ovBR];

        // ── Saved location indicator ──────────────────────────────────────
        var userLocPin  = null;
        var userLocRing = null;
        var locPulseT   = 0;
        var hasLocation = false;
        var rotAnim       = null; // { fromQ, toQ, t } slerp animation
        var homeQuaternion = new THREE.Quaternion(); // identity = default; updated when location is set

        // Teardown any previously created location objects
        function clearLoc() {
            if (userLocPin)  { pivot.remove(userLocPin);  userLocPin  = null; }
            if (userLocRing) { pivot.remove(userLocRing); userLocRing = null; }
            locPulseT   = 0;
            hasLocation    = false;
            homeQuaternion = new THREE.Quaternion(); // back to identity
            rotAnim        = { fromQ: pivot.quaternion.clone(), toQ: new THREE.Quaternion(), t: 0 };
            // Reset TL to default
            resetTL();
        }

        // Build pin, ripple ring, overlay widgets for a given location
        function setupLoc() {
            clearLoc();
            var savedLoc;
            try { savedLoc = JSON.parse(localStorage.getItem('ed_location')); } catch (e) {}
            if (!savedLoc || savedLoc.lat == null || savedLoc.lon == null) return;

            hasLocation = true;

            // Orient globe so the location faces the camera with north at the top.
            var locDir  = latLonToVec3(savedLoc.lat, savedLoc.lon, 1.0).normalize();
            var worldUp = new THREE.Vector3(0, 1, 0);
            var northDir = worldUp.clone()
                .addScaledVector(locDir, -locDir.dot(worldUp))
                .normalize();
            if (isNaN(northDir.x)) northDir.set(1, 0, 0);
            var rightDir = new THREE.Vector3().crossVectors(northDir, locDir);
            pivot.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
                rightDir.x, rightDir.y, rightDir.z, 0,
                northDir.x, northDir.y, northDir.z, 0,
                locDir.x,   locDir.y,   locDir.z,   0,
                0,          0,          0,           1
            ));
            homeQuaternion.copy(pivot.quaternion);
            rotAnim = null;

            // Pin texture
            var pinCv = document.createElement('canvas');
            pinCv.width = pinCv.height = 64;
            var pctx = pinCv.getContext('2d');
            var pinGlow = pctx.createRadialGradient(32, 32, 8, 32, 32, 31);
            pinGlow.addColorStop(0,   'rgba(59,130,246,0.55)');
            pinGlow.addColorStop(1,   'rgba(59,130,246,0)');
            pctx.fillStyle = pinGlow;
            pctx.fillRect(0, 0, 64, 64);
            pctx.beginPath();
            pctx.arc(32, 32, 8, 0, Math.PI * 2);
            pctx.fillStyle = '#3b82f6';
            pctx.fill();
            pctx.beginPath();
            pctx.arc(32, 32, 3, 0, Math.PI * 2);
            pctx.fillStyle = 'rgba(255,255,255,0.9)';
            pctx.fill();

            // Ring texture
            var ringCv = document.createElement('canvas');
            ringCv.width = ringCv.height = 64;
            var rctx = ringCv.getContext('2d');
            rctx.strokeStyle = '#3b82f6';
            rctx.lineWidth   = 3;
            rctx.beginPath();
            rctx.arc(32, 32, 28, 0, Math.PI * 2);
            rctx.stroke();

            var locPos = latLonToVec3(savedLoc.lat, savedLoc.lon, RADIUS + 0.012);

            userLocPin = new THREE.Sprite(new THREE.SpriteMaterial({
                map:         new THREE.CanvasTexture(pinCv),
                transparent: true,
                depthTest:   true,
                depthWrite:  false,
                blending:    THREE.AdditiveBlending
            }));
            userLocPin.position.copy(locPos);
            userLocPin.scale.setScalar(0.055);
            pivot.add(userLocPin);

            userLocRing = new THREE.Sprite(new THREE.SpriteMaterial({
                map:         new THREE.CanvasTexture(ringCv),
                transparent: true,
                depthTest:   true,
                depthWrite:  false,
                blending:    THREE.AdditiveBlending,
                opacity:     0
            }));
            userLocRing.position.copy(locPos);
            userLocRing.scale.setScalar(0.055);
            pivot.add(userLocRing);

            // Update TL to show location with compass
            ovTL.innerHTML =
                '<button class="globe-north" title="Reset orientation" aria-label="Reset globe orientation">' +
                    '<i class="fa-solid fa-location-crosshairs"></i>' +
                    '<span class="globe-ov__loc">' + esc(savedLoc.name) + '</span>' +
                '</button>';
            ovTL.querySelector('.globe-north').addEventListener('click', function () {
                rotAnim = { fromQ: pivot.quaternion.clone(), toQ: homeQuaternion.clone(), t: 0 };
            });
        }

        setupLoc();

        // Re-run whenever another script sets or clears the location
        var _origFlag = window.updateLogoFlag;
        window.updateLogoFlag = function () {
            if (_origFlag) _origFlag();
            setupLoc();
        };

        // ── Dot sprite texture (shared, white radial gradient — tinted per dot) ──
        var dotCanvas   = document.createElement('canvas');
        dotCanvas.width = dotCanvas.height = 64;
        var dotCtx      = dotCanvas.getContext('2d');
        // Outer glow — starts at the circle edge and fades outward
        var glow = dotCtx.createRadialGradient(32, 32, 13, 32, 32, 31);
        glow.addColorStop(0,   'rgba(255,255,255,0.22)');
        glow.addColorStop(0.5, 'rgba(255,255,255,0.07)');
        glow.addColorStop(1,   'rgba(255,255,255,0)');
        dotCtx.fillStyle = glow;
        dotCtx.fillRect(0, 0, 64, 64);
        // Hard-edged solid circle on top
        dotCtx.beginPath();
        dotCtx.arc(32, 32, 13, 0, Math.PI * 2);
        dotCtx.fillStyle = 'rgba(255,255,255,1)';
        dotCtx.fill();
        var dotTex = new THREE.CanvasTexture(dotCanvas);

        // One SpriteMaterial per magnitude bucket — shared across all dots of
        // the same colour so Three.js can batch them into fewer draw calls.
        var dotMats = {};
        function getDotMat(mag) {
            var key = mag >= 6 ? 6 : mag >= 5 ? 5 : mag >= 4 ? 4 : mag >= 3 ? 3 : mag >= 2 ? 2 : 0;
            if (!dotMats[key]) {
                dotMats[key] = new THREE.SpriteMaterial({
                    map:         dotTex,
                    color:       magColor(mag),
                    transparent: true,
                    depthTest:   true,   // hidden when behind the globe
                    depthWrite:  false,  // no z-fighting between sprites
                    blending:    THREE.AdditiveBlending,
                    sizeAttenuation: true
                });
            }
            return dotMats[key];
        }

        // ── Earthquake dots ───────────────────────────────────────────────
        var dotMeshes = [];

        quakes.forEach(function (q) {
            var coords = q.geometry && q.geometry.coordinates;
            if (!coords) return;
            var lon = coords[0], lat = coords[1];
            if (isNaN(lon) || isNaN(lat)) return;

            var mag     = parseFloat(q.properties.mag) || 0;
            // World-unit diameter: small for micro-quakes, larger for major ones
            var dotSize = Math.max(0.018, Math.min(0.11, 0.02 + mag * 0.012));

            var dot = new THREE.Sprite(getDotMat(mag));
            dot.scale.setScalar(dotSize);
            // Place on sphere surface — sprites face camera automatically
            dot.position.copy(latLonToVec3(lat, lon, RADIUS + 0.01));
            dot.userData.quake = q;
            pivot.add(dot);
            dotMeshes.push(dot);
        });

        // ── Tooltip ───────────────────────────────────────────────────────
        var tooltip = document.createElement('div');
        tooltip.className = 'globe-tooltip';
        wrap.appendChild(tooltip);

        // ── Interaction state ─────────────────────────────────────────────
        var raycaster   = new THREE.Raycaster();
        var mouse       = new THREE.Vector2();
        var hoveredDot  = null;
        var allCastable = [globeMesh].concat(dotMeshes);

        var isDragging  = false;
        var prevDragX   = 0, prevDragY = 0;
        var velRotY     = 0, velRotX   = 0;
        var hoverSlow   = false;

        // Pre-allocated temps for spinGlobe — avoids per-frame GC pressure
        var _qH     = new THREE.Quaternion();
        var _qV     = new THREE.Quaternion();
        var _axisY  = new THREE.Vector3(0, 1, 0);
        var _axisX  = new THREE.Vector3(1, 0, 0);
        var _fwdLocal = new THREE.Vector3();
        var MAX_VIEW_LAT = Math.PI / 2.1; // ~85.7°

        // Rotate globe using world-space axes so it works from any orientation.
        // dh = horizontal (around world Y), dv = vertical (around world X).
        function spinGlobe(dh, dv) {
            if (dh) {
                pivot.quaternion.premultiply(_qH.setFromAxisAngle(_axisY, dh));
            }
            if (dv) {
                pivot.quaternion.premultiply(_qV.setFromAxisAngle(_axisX, dv));
                // Clamp: find the latitude of the point currently facing the camera
                _fwdLocal.set(0, 0, 1).applyQuaternion(
                    pivot.quaternion.clone().invert()
                );
                var lat = Math.asin(Math.max(-1, Math.min(1, _fwdLocal.y)));
                if (Math.abs(lat) > MAX_VIEW_LAT) {
                    // Undo the vertical rotation and kill vertical inertia
                    pivot.quaternion.premultiply(_qV.setFromAxisAngle(_axisX, -dv));
                    velRotX = 0;
                }
            }
        }

        // ── Drag — mouse ──────────────────────────────────────────────────
        canvas.addEventListener('mousedown', function (e) {
            isDragging = true;
            rotAnim    = null;
            prevDragX  = e.clientX;
            prevDragY  = e.clientY;
            velRotY    = 0;
            velRotX    = 0;
            tooltip.style.display = 'none';
            canvas.style.cursor = 'grabbing';
            e.preventDefault();
        });

        window.addEventListener('mousemove', function (e) {
            if (!isDragging) return;
            var dx = e.clientX - prevDragX;
            var dy = e.clientY - prevDragY;
            velRotY   = dx * SENSITIVITY;
            velRotX   = dy * SENSITIVITY;
            spinGlobe(velRotY, velRotX);
            prevDragX = e.clientX;
            prevDragY = e.clientY;
        });

        window.addEventListener('mouseup', function () {
            if (!isDragging) return;
            isDragging = false;
            canvas.style.cursor = hoveredDot ? 'pointer' : 'grab';
        });

        // ── Drag — touch ──────────────────────────────────────────────────
        canvas.addEventListener('touchstart', function (e) {
            if (e.touches.length !== 1) return;
            isDragging = true;
            rotAnim    = null;
            prevDragX  = e.touches[0].clientX;
            prevDragY  = e.touches[0].clientY;
            velRotY    = 0; velRotX = 0;
            e.preventDefault();
        }, { passive: false });

        canvas.addEventListener('touchmove', function (e) {
            if (!isDragging || e.touches.length !== 1) return;
            var dx = e.touches[0].clientX - prevDragX;
            var dy = e.touches[0].clientY - prevDragY;
            velRotY   = dx * SENSITIVITY;
            velRotX   = dy * SENSITIVITY;
            spinGlobe(velRotY, velRotX);
            prevDragX = e.touches[0].clientX;
            prevDragY = e.touches[0].clientY;
            e.preventDefault();
        }, { passive: false });

        var touchStartPos = { x: 0, y: 0 };
        canvas.addEventListener('touchstart', function (e) {
            if (e.touches.length === 1) {
                touchStartPos.x = e.touches[0].clientX;
                touchStartPos.y = e.touches[0].clientY;
            }
        }, { passive: true });

        canvas.addEventListener('touchend', function (e) {
            var wasDragging = isDragging;
            isDragging = false;
            if (!wasDragging || e.changedTouches.length === 0) return;

            var dx = e.changedTouches[0].clientX - touchStartPos.x;
            var dy = e.changedTouches[0].clientY - touchStartPos.y;
            if (Math.abs(dx) > 8 || Math.abs(dy) > 8) return; // was a drag, not a tap

            var rect = canvas.getBoundingClientRect();
            var tx = e.changedTouches[0].clientX;
            var ty = e.changedTouches[0].clientY;
            mouse.x =  ((tx - rect.left) / rect.width)  * 2 - 1;
            mouse.y = -((ty - rect.top)  / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            var hits   = raycaster.intersectObjects(allCastable);
            var dotHit = hits.length > 0 && hits[0].object !== globeMesh ? hits[0].object : null;

            if (dotHit) {
                // Second tap on same dot → navigate
                if (hoveredDot === dotHit) {
                    location.href = '/earthquakes/#eq-' + dotHit.userData.quake.id;
                    return;
                }
                hoveredDot = dotHit;
                var q   = dotHit.userData.quake;
                var mag = parseFloat(q.properties.mag) || 0;
                tooltip.innerHTML =
                    '<span style="color:' + magColorHex(mag) + ';font-weight:700">M\u202f' + mag.toFixed(1) + '</span>'
                    + '<span class="globe-tooltip-place">' + esc(convertPlace(q.properties.place || 'Unknown')) + '</span>'
                    + '<span class="globe-tooltip-time">'  + relTime(q.properties.time || 0) + '</span>';

                var wrapRect = wrap.getBoundingClientRect();
                var tipX = tx - wrapRect.left + 14;
                var tipY = ty - wrapRect.top  - 60;
                tooltip.style.display = 'block';
                var tw = tooltip.offsetWidth;
                if (tipX + tw > wrapRect.width - 6) tipX = tx - wrapRect.left - tw - 14;
                if (tipY < 6) tipY = ty - wrapRect.top + 14;
                tooltip.style.left = tipX + 'px';
                tooltip.style.top  = tipY + 'px';
            } else {
                hoveredDot = null;
                tooltip.style.display = 'none';
            }
        });

        // ── Hover tooltip ─────────────────────────────────────────────────
        canvas.addEventListener('mousemove', function (e) {
            if (isDragging) return;
            var rect = canvas.getBoundingClientRect();
            mouse.x  =  ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
            mouse.y  = -((e.clientY - rect.top)   / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            var hits   = raycaster.intersectObjects(allCastable);
            var dotHit = hits.length > 0 && hits[0].object !== globeMesh ? hits[0].object : null;

            if (dotHit) {
                hoveredDot = dotHit;
                hoverSlow  = true;
                var q     = dotHit.userData.quake;
                var mag   = parseFloat(q.properties.mag) || 0;
                tooltip.innerHTML =
                    '<span style="color:' + magColorHex(mag) + ';font-weight:700">M\u202f' + mag.toFixed(1) + '</span>'
                    + '<span class="globe-tooltip-place">' + esc(convertPlace(q.properties.place || 'Unknown')) + '</span>'
                    + '<span class="globe-tooltip-time">'  + relTime(q.properties.time || 0) + '</span>';

                var wrapRect = wrap.getBoundingClientRect();
                var tx = e.clientX - wrapRect.left + 14;
                var ty = e.clientY - wrapRect.top  + 14;
                tooltip.style.display = 'block';
                var tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
                if (tx + tw > wrapRect.width  - 6) tx = e.clientX - wrapRect.left - tw - 14;
                if (ty + th > wrapRect.height - 6) ty = e.clientY - wrapRect.top  - th - 14;
                tooltip.style.left = tx + 'px';
                tooltip.style.top  = ty + 'px';
                canvas.style.cursor = 'pointer';
            } else {
                hoveredDot = null;
                hoverSlow  = false;
                tooltip.style.display = 'none';
                canvas.style.cursor   = 'grab';
            }
        });

        canvas.addEventListener('mouseleave', function () {
            if (isDragging) return;
            hoveredDot = null; hoverSlow = false;
            tooltip.style.display = 'none';
            canvas.style.cursor   = 'grab';
        });

        // ── Click a dot (mouse only — touch is handled in touchend) ─────
        var isTouchDevice = false;
        canvas.addEventListener('touchstart', function () { isTouchDevice = true; }, { passive: true, once: true });

        canvas.addEventListener('click', function (e) {
            if (isTouchDevice) return;
            if (Math.abs(velRotY) > 0.001 || Math.abs(velRotX) > 0.001) return;
            var rect = canvas.getBoundingClientRect();
            mouse.x  =  ((e.clientX - rect.left)  / rect.width)  * 2 - 1;
            mouse.y  = -((e.clientY - rect.top)   / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            var hits = raycaster.intersectObjects(allCastable);
            if (hits.length > 0 && hits[0].object !== globeMesh) {
                location.href = '/earthquakes/#eq-' + hits[0].object.userData.quake.id;
            }
        });

        // ── Zoom ──────────────────────────────────────────────────────────
        canvas.addEventListener('wheel', function (e) {
            e.preventDefault();
            camera.position.z += e.deltaY * ZOOM_SPEED;
            camera.position.z  = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camera.position.z));
        }, { passive: false });

        // ── Animation loop ────────────────────────────────────────────────
        var _paused = false;
        window.addEventListener('earth-tab', function (e) {
            _paused = e.detail !== 'seismic';
            if (!_paused) requestAnimationFrame(tick);
        });

        var _sunTick = 0;
        function tick() {
            if (_paused) return;
            requestAnimationFrame(tick);
            // Sun moves ~0.25° per minute — refresh direction every ~10 s
            if (++_sunTick >= 600) { _sunTick = 0; globeMat.uniforms.uSunDir.value.copy(getSunDir()); }
            if (rotAnim) {
                // Ease-out cubic slerp back to identity quaternion
                rotAnim.t = Math.min(1, rotAnim.t + 0.04);
                var smoothT = 1 - Math.pow(1 - rotAnim.t, 3);
                pivot.quaternion.slerpQuaternions(rotAnim.fromQ, rotAnim.toQ, smoothT);
                if (rotAnim.t >= 1) rotAnim = null;
            } else if (!isDragging) {
                var hasInertia = Math.abs(velRotY) > 0.00005 || Math.abs(velRotX) > 0.00005;
                if (hasInertia) {
                    spinGlobe(velRotY, velRotX);
                    velRotY *= DAMPING;
                    velRotX *= DAMPING;
                } else if (!hasLocation) {
                    spinGlobe(hoverSlow ? AUTO_SPIN * 0.15 : AUTO_SPIN, 0);
                }
            }
            // Location ripple — expands outward and fades, then resets
            if (userLocRing) {
                locPulseT = (locPulseT + 0.022) % (Math.PI * 2);
                var lp    = locPulseT / (Math.PI * 2); // 0 → 1 over ~4.5 s at 60 fps
                var eased = 1 - Math.pow(1 - lp, 2);   // ease-out quad: fast start, slow end
                userLocRing.scale.setScalar(0.055 + eased * 0.09);
                userLocRing.material.opacity = 0.85 * (1 - lp);
            }
            renderer.render(scene, camera);
        }
        tick();

        // ── Resize ────────────────────────────────────────────────────────
        var ro = new ResizeObserver(function () {
            var nw = canvas.clientWidth, nh = canvas.clientHeight;
            if (!nw || !nh) return;
            camera.aspect = nw / nh;
            camera.updateProjectionMatrix();
            renderer.setSize(nw, nh, false);
        });
        ro.observe(canvas);

        canvas.style.cursor  = 'grab';
        wrap.style.opacity   = '1';
        wrap.style.filter    = 'blur(0)';
    }

    // ===== FETCH =====
    // If earthquakes.js already fetched the data, reuse it via window.eqGlobeData
    // Otherwise (index page), fetch everything here.
    function computeStats(quakes, sigFeatures) {
        var sigCount = sigFeatures.length;
        var largest = 0;
        quakes.forEach(function (q) {
            var m = parseFloat(q.properties.mag) || 0;
            if (m > largest) largest = m;
        });
        return { sigCount: sigCount, largest: largest, total: quakes.length };
    }

    function boot(quakes, topoData, sigFeatures) {
        var stats = computeStats(quakes, sigFeatures);
        initGlobe(quakes, topoData, stats.sigCount, stats.largest, stats.total);
    }

    if (window.eqGlobeData) {
        // Shared data from earthquakes.js
        var d = window.eqGlobeData;
        fetch(ATLAS_URL).then(function (r) { return r.json(); }).then(function (topo) {
            boot(d.quakes, topo, d.sigQuakes);
        }).catch(function () {
            boot(d.quakes, null, d.sigQuakes);
        });
    } else {
        Promise.all([
            fetch(USGS_URL).then(function (r) { return r.json(); }),
            fetch(ATLAS_URL).then(function (r) { return r.json(); })
        ]).then(function (results) {
            var quakes = results[0].features || [];
            var sig = quakes.filter(function (q) { return (parseFloat(q.properties.mag) || 0) >= 4; });
            boot(quakes, results[1], sig);
        }).catch(function () {
            fetch(USGS_URL)
                .then(function (r) { return r.json(); })
                .then(function (d) {
                    var quakes = d.features || [];
                    var sig = quakes.filter(function (q) { return (parseFloat(q.properties.mag) || 0) >= 4; });
                    boot(quakes, null, sig);
                })
                .catch(function ()  { boot([], null, []); });
        });
    }

}());
