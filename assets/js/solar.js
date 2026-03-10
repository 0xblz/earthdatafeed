/**
 * Solar Weather Page
 * Fetches NOAA SWPC data: X-ray flux, flares, Kp index, solar wind
 */

// ===== OPTIONS =====
var OPTIONS = {
    refreshInterval: 60000
};

// ===== SELECTORS =====
var SELECTORS = {
    content: '#solar-content',
    flares: '#solar-flares'
};

// ===== STATE =====
var STATE = {
    refreshTimer: null,
    flareShowCount: 20,
    chartCanvas: null,
    chartTooltip: null,
    chartXray: []
};

// ===== INIT =====
function earthDataSolar() {
    loadSolarData();
    STATE.refreshTimer = setInterval(loadSolarData, OPTIONS.refreshInterval);
}

// ===== CORE FUNCTIONS =====

function loadSolarData() {
    var urls = {
        xray: 'https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json',
        flares: 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json',
        scales: 'https://services.swpc.noaa.gov/products/noaa-scales.json',
        kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
        plasma: 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json'
    };

    Promise.all([
        fetch(urls.xray).then(function(r) { return r.json(); }),
        fetch(urls.flares).then(function(r) { return r.json(); }),
        fetch(urls.scales).then(function(r) { return r.json(); }),
        fetch(urls.kp).then(function(r) { return r.json(); }),
        fetch(urls.plasma).then(function(r) { return r.json(); })
    ]).then(function(data) {
        renderSolar(data[0], data[1], data[2], data[3], data[4]);
    }).catch(function() {
        document.querySelector(SELECTORS.content).innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load solar data.</div>';
        document.querySelector(SELECTORS.flares).innerHTML = '';
    });
}

function renderSolar(xray, flares, scales, kpData, plasma) {
    var currentFlux = getCurrentXrayFlux(xray);
    var currentClass = classifyFlux(currentFlux);
    var currentLetter = currentClass.substring(0, 1);

    var currentKp = getCurrentKp(kpData);
    var windSpeed = getSolarWind(plasma).speed;
    var windDensity = getSolarWind(plasma).density;

    var rScale = scales['0'].R.Scale || '0';
    var sScale = scales['0'].S.Scale || '0';
    var gScale = scales['0'].G.Scale || '0';

    var forecast = getForecast(scales);
    var flareList = flares.slice().reverse();

    var html = '';

    // X-Ray Flux hero
    html += '<div class="data-hero">';
    html += '<div class="data-hero-value" style="color:' + classColor(currentLetter) + '">' + currentClass + '</div>';
    html += '<div class="data-hero-label" style="color:' + classColor(currentLetter) + '"><i class="fa-solid fa-bolt"></i> X-Ray Flux</div>';
    html += '</div>';

    // Current conditions
    html += '<div class="card-grid">';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-magnet" style="color:' + kpColor(currentKp) + '"></i></div>';
    html += '<div class="card-value" style="color:' + kpColor(currentKp) + '">' + (currentKp !== null ? currentKp.toFixed(1) : '--') + '</div>';
    html += '<div class="card-label">Kp Index</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-wind c-cyan"></i></div>';
    var windUnit = isMetric() ? 'km/s' : 'mi/s';
    var windDisplay = isMetric() ? windSpeed : (windSpeed !== '--' ? Math.round(windSpeed * 0.621371) : '--');
    html += '<div class="card-value c-cyan">' + windDisplay + '</div>';
    html += '<div class="card-label">Solar Wind ' + windUnit + '</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-atom c-purple"></i></div>';
    html += '<div class="card-value c-purple">' + windDensity + '</div>';
    html += '<div class="card-label">Density p/cm&sup3;</div>';
    html += '</div>';
    html += '</div>';

    // X-ray flux chart
    STATE.chartXray = xray.filter(function(d) {
        return d.energy === '0.1-0.8nm' && d.flux !== null;
    });
    html += '<div class="solar-chart" id="solar-chart-wrap">';
    html += '<canvas></canvas>';
    html += '<div class="solar-chart-tooltip"></div>';
    html += '<button class="chart-expand-btn" id="solar-chart-expand" aria-label="Expand chart"><i class="fa-solid fa-expand"></i></button>';
    html += '</div>';

    // NOAA Scales
    html += '<div class="badges" id="scales">';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-broadcast-tower c-amber"></i>';
    html += '<span class="label">Radio</span>';
    html += '<span class="level level-' + Math.min(rScale, 5) + '">R' + rScale + '</span>';
    html += '</div>';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-radiation c-red"></i>';
    html += '<span class="label">Radiation</span>';
    html += '<span class="level level-' + Math.min(sScale, 5) + '">S' + sScale + '</span>';
    html += '</div>';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-globe c-blue"></i>';
    html += '<span class="label">Geomagnetic</span>';
    html += '<span class="level level-' + Math.min(gScale, 5) + '">G' + gScale + '</span>';
    html += '</div>';
    html += '</div>';

    // 3-day forecast
    html += '<div class="section-title"><i class="fa-solid fa-calendar-days"></i> 3-Day Forecast</div>';
    html += '<div class="sub-grid">';
    forecast.forEach(function(day) {
        var dateLabel = formatDateLabel(day.date);
        html += '<div class="sub-card daily-card">';
        html += '<div class="sub-card-title lg">' + dateLabel + '</div>';
        html += '<div class="daily-card-icon"><i class="fa-solid fa-sun c-yellow"></i></div>';
        html += '<div class="daily-card-stats">';
        html += '<div class="sub-card-wind"><i class="fa-solid fa-bolt"></i> Flare <span class="' + probClass(day.rMinor) + '">' + day.rMinor + '%</span></div>';
        html += '<div class="sub-card-wind"><i class="fa-solid fa-explosion"></i> Major <span class="' + probClassMajor(day.rMajor) + '">' + day.rMajor + '%</span></div>';
        html += '<div class="sub-card-wind"><i class="fa-solid fa-radiation"></i> Radiation <span class="' + probClassRadiation(day.sProb) + '">' + day.sProb + '%</span></div>';
        html += '<div class="sub-card-wind"><i class="fa-solid fa-globe"></i> Geomag <span class="level-' + Math.min(day.gScale, 5) + '">G' + day.gScale + '</span></div>';
        html += '</div>';
        html += '</div>';
    });
    html += '</div>';

    document.querySelector(SELECTORS.content).innerHTML = html;

    initSolarChart();
    renderFlares(flareList);

    if (location.hash && !STATE.scrolled) {
        var hashId = location.hash.substring(1);
        var target = document.getElementById(hashId);
        if (!target && hashId.indexOf('flare-') === 0 && flareList.length > STATE.flareShowCount) {
            STATE.flareShowCount = flareList.length;
            renderFlares(flareList);
            target = document.getElementById(hashId);
        }
        if (target) {
            STATE.scrolled = true;
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (hashId.indexOf('flare-') === 0) {
                target.style.background = 'var(--hover-bg)';
            }
        }
    }
}

function renderFlares(flareList) {
    var flaresHtml = '';
    flaresHtml += '<div class="section-title" id="flares">';
    flaresHtml += '<i class="fa-solid fa-list"></i> Recent Flares';
    flaresHtml += '<span class="flare-count">' + flareList.length + ' events / 7 days</span>';
    flaresHtml += '</div>';

    if (flareList.length === 0) {
        flaresHtml += '<div class="empty"><i class="fa-solid fa-check"></i> No flares detected</div>';
    } else {
        var visible = flareList.slice(0, STATE.flareShowCount);
        visible.forEach(function(f) {
            var flareClass = f.max_class || '?';
            var letter = flareClass.substring(0, 1).toUpperCase();
            var beginTime = f.begin_time || '';
            var endTime = f.end_time || '';
            var duration = '';
            if (beginTime && endTime) {
                var mins = Math.floor((new Date(endTime) - new Date(beginTime)) / 60000);
                duration = mins + 'm';
            }
            var icon = flareIcon(letter);
            var ts = beginTime ? new Date(beginTime).getTime() : 0;
            var timeDisplay = beginTime ? formatDateTime(beginTime) : '';
            var timeDisplayWithDuration = timeDisplay + (duration ? ' · ' + duration : '');
            var rel = ts ? relativeTimeFromDate(beginTime) : '';

            var flareId = 'flare-' + (beginTime ? new Date(beginTime).getTime() : '');
            flaresHtml += '<div class="row" id="' + flareId + '">';
            flaresHtml += '<div class="row-icon class-' + letter + '"><i class="fa-solid ' + icon + '"></i></div>';
            flaresHtml += '<div class="row-label class-' + letter + '">' + esc(flareClass) + '</div>';
            flaresHtml += '<div class="row-text">' + timeDisplayWithDuration + '</div>';
            flaresHtml += '<div class="row-meta">' + rel + '</div>';
            flaresHtml += '</div>';
        });

        if (flareList.length > STATE.flareShowCount) {
            flaresHtml += '<div class="load-more" id="flare-load-more">Load more (' + (flareList.length - STATE.flareShowCount) + ' remaining)</div>';
        }
    }

    document.querySelector(SELECTORS.flares).innerHTML = flaresHtml;

    var loadMore = document.getElementById('flare-load-more');
    if (loadMore) {
        loadMore.addEventListener('click', function() {
            STATE.flareShowCount += 20;
            renderFlares(flareList);
        });
    }
}

// ===== X-RAY FLUX CHART =====

function initSolarChart() {
    var wrap = document.getElementById('solar-chart-wrap');
    if (!wrap) return;
    var canvas = wrap.querySelector('canvas');
    var tooltip = wrap.querySelector('.solar-chart-tooltip');
    if (!canvas || !tooltip) return;

    STATE.chartCanvas = canvas;
    STATE.chartTooltip = tooltip;

    var dpr = window.devicePixelRatio || 1;
    function resize() {
        var rect = wrap.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        drawSolarChart();
    }

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 100);
    });

    canvas.addEventListener('mousemove', function(e) { solarChartHover(e, wrap); });
    canvas.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
    });
    canvas.addEventListener('touchstart', function(e) {
        solarChartHover(e.touches[0], wrap);
    }, { passive: true });

    window.addEventListener('themechange', drawSolarChart);
    resize();

    var expandBtn = document.getElementById('solar-chart-expand');
    if (expandBtn) {
        expandBtn.addEventListener('click', function() {
            openChartModal(STATE, drawSolarChart, solarChartHover, 'X-Ray Flux');
        });
    }
}

function drawSolarChart() {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var textFaint = style.getPropertyValue('--text-faint').trim() || '#333';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 36 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartXray;
    if (!data.length) return;

    // Log scale: 1e-9 to 1e-3
    var logMin = -9;
    var logMax = -3;
    var logRange = logMax - logMin;

    // Flare class thresholds
    var classes = [
        { label: 'A', flux: 1e-8, color: '#888' },
        { label: 'B', flux: 1e-7, color: '#3b82f6' },
        { label: 'C', flux: 1e-6, color: '#22c55e' },
        { label: 'M', flux: 1e-5, color: '#f59e0b' },
        { label: 'X', flux: 1e-4, color: '#ef4444' }
    ];

    // Draw class threshold lines + labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    classes.forEach(function(c) {
        var logVal = Math.log10(c.flux);
        var yPct = (logVal - logMin) / logRange;
        var y = pad.top + plotH - yPct * plotH;

        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();

        ctx.fillStyle = c.color;
        ctx.fillText(c.label, pad.left - 6 * dpr, y);
    });

    // Time range: data start to now
    var now = Date.now();
    var times = data.map(function(d) { return new Date(d.time_tag).getTime(); });
    var tMin = times[0];
    var tMax = now;
    var tRange = tMax - tMin;
    if (tRange <= 0) return;

    // Draw vertical gridlines + x-axis time labels (every 4h)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    var startHour = new Date(tMin);
    startHour.setMinutes(0, 0, 0);
    startHour.setHours(startHour.getHours() + (4 - startHour.getHours() % 4));
    for (var t = startHour.getTime(); t < tMax; t += 4 * 3600000) {
        var xPct = (t - tMin) / tRange;
        var x = pad.left + xPct * plotW;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(x, pad.top);
        ctx.lineTo(x, pad.top + plotH);
        ctx.stroke();
        ctx.fillStyle = textDim;
        var d = new Date(t);
        var hr12 = d.getHours() % 12 || 12;
        var ampm = d.getHours() >= 12 ? 'pm' : 'am';
        ctx.fillText(hr12 + ampm, x, pad.top + plotH + 8 * dpr);
    }

    // Draw the flux line
    ctx.beginPath();
    var started = false;
    STATE.chartPoints = [];

    for (var i = 0; i < data.length; i++) {
        var flux = data[i].flux;
        if (flux <= 0) continue;

        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var logFlux = Math.log10(flux);
        var yPct = (logFlux - logMin) / logRange;
        yPct = Math.max(0, Math.min(1, yPct));

        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;

        if (!started) {
            ctx.moveTo(cx, cy);
            started = true;
        } else {
            ctx.lineTo(cx, cy);
        }

        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            flux: flux, time: ts
        });
    }

    // Determine line color from current (last) flux
    var lastFlux = data[data.length - 1].flux || 0;
    var lineColor = '#888';
    if (lastFlux >= 1e-4) lineColor = '#ef4444';
    else if (lastFlux >= 1e-5) lineColor = '#f59e0b';
    else if (lastFlux >= 1e-6) lineColor = '#22c55e';
    else if (lastFlux >= 1e-7) lineColor = '#3b82f6';

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Subtle fill under the line
    if (STATE.chartPoints.length > 1) {
        var first = STATE.chartPoints[0];
        var last = STATE.chartPoints[STATE.chartPoints.length - 1];
        ctx.lineTo(last.x * dpr, pad.top + plotH);
        ctx.lineTo(first.x * dpr, pad.top + plotH);
        ctx.closePath();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // "Now" line
    var nowX = pad.left + plotW;
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(nowX, pad.top);
    ctx.lineTo(nowX, pad.top + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
}

function solarChartHover(e, wrap) {
    var tooltip = STATE.chartTooltip;
    if (!tooltip || !STATE.chartPoints || !STATE.chartPoints.length) return;

    var rect = STATE.chartCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;

    // Find closest point by x
    var closest = null;
    var closestDist = Infinity;
    STATE.chartPoints.forEach(function(pt) {
        var dist = Math.abs(mx - pt.x);
        if (dist < closestDist) {
            closest = pt;
            closestDist = dist;
        }
    });

    if (closest && closestDist < 30) {
        var fluxClass = classifyFlux(closest.flux);
        var letter = fluxClass.substring(0, 1);
        var d = new Date(closest.time);
        var hr12 = d.getHours() % 12 || 12;
        var ampm = d.getHours() >= 12 ? 'PM' : 'AM';
        var timeStr = hr12 + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ampm;
        tooltip.innerHTML =
            '<span style="color:' + classColor(letter) + ';font-weight:700">' + esc(fluxClass) + '</span>' +
            ' <span style="color:var(--text-muted)">' + closest.flux.toExponential(1) + ' W/m&sup2;</span>' +
            '<br><span style="color:var(--text-muted);font-size:0.6rem">' + timeStr + '</span>';
        tooltip.style.display = 'block';

        var wrapRect = wrap.getBoundingClientRect();
        var tx = e.clientX - wrapRect.left + 12;
        var ty = e.clientY - wrapRect.top - 10;
        if (tx + 180 > wrapRect.width) tx = e.clientX - wrapRect.left - 180;
        if (ty < 0) ty = 10;
        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
    } else {
        tooltip.style.display = 'none';
    }
}

// ===== HELPER FUNCTIONS =====

function getCurrentXrayFlux(xray) {
    for (var i = xray.length - 1; i >= 0; i--) {
        if (xray[i].energy === '0.1-0.8nm' && xray[i].flux !== null) {
            return xray[i].flux;
        }
    }
    return 0;
}

function classifyFlux(flux) {
    if (flux >= 1e-4) return 'X' + (flux / 1e-4).toFixed(1);
    if (flux >= 1e-5) return 'M' + (flux / 1e-5).toFixed(1);
    if (flux >= 1e-6) return 'C' + (flux / 1e-6).toFixed(1);
    if (flux >= 1e-7) return 'B' + (flux / 1e-7).toFixed(1);
    if (flux > 0) return 'A';
    return 'Quiet';
}

function getCurrentKp(kpData) {
    if (kpData.length > 1) {
        var last = kpData[kpData.length - 1];
        return parseFloat(last[1]);
    }
    return null;
}

function getSolarWind(plasma) {
    if (plasma.length > 1) {
        for (var i = plasma.length - 1; i > 0; i--) {
            if (plasma[i][2] !== null && plasma[i][2] !== '') {
                return {
                    speed: Math.round(plasma[i][2]),
                    density: parseFloat(plasma[i][1]).toFixed(1)
                };
            }
        }
    }
    return { speed: '--', density: '--' };
}

function getForecast(scales) {
    var forecast = [];
    for (var i = 1; i <= 3; i++) {
        if (scales[i]) {
            var d = scales[i];
            forecast.push({
                date: d.DateStamp || '',
                rMinor: parseInt(d.R.MinorProb) || 0,
                rMajor: parseInt(d.R.MajorProb) || 0,
                sProb: parseInt(d.S.Prob) || 0,
                gScale: parseInt(d.G.Scale) || 0,
                gText: d.G.Text || 'none'
            });
        }
    }
    return forecast;
}

function kpColor(kp) {
    if (kp >= 7) return '#ef4444';
    if (kp >= 5) return '#f59e0b';
    if (kp >= 4) return '#eab308';
    return '#22c55e';
}

function classColor(letter) {
    var map = { X: '#ef4444', M: '#f59e0b', C: '#22c55e', B: '#3b82f6', A: '#888' };
    return map[letter] || '#555';
}

function flareIcon(letter) {
    if (letter === 'X') return 'fa-explosion';
    if (letter === 'M') return 'fa-fire';
    if (letter === 'C') return 'fa-bolt';
    if (letter === 'B') return 'fa-circle-dot';
    return 'fa-circle';
}

function probClass(prob) {
    if (prob >= 70) return 'prob-vhigh';
    if (prob >= 50) return 'prob-high';
    if (prob >= 30) return 'prob-med';
    return 'prob-low';
}

function probClassMajor(prob) {
    if (prob >= 50) return 'prob-vhigh';
    if (prob >= 30) return 'prob-high';
    if (prob >= 15) return 'prob-med';
    return 'prob-low';
}

function probClassRadiation(prob) {
    if (prob >= 50) return 'prob-vhigh';
    if (prob >= 30) return 'prob-high';
    if (prob >= 15) return 'prob-med';
    return 'prob-low';
}

function formatDateLabel(dateStr) {
    var d = new Date(dateStr);
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();
}

function formatDateTime(dateStr) {
    var d = new Date(dateStr);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var h = d.getHours();
    var m = String(d.getMinutes()).padStart(2, '0');
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return months[d.getMonth()] + ' ' + d.getDate() + ' ' + h + ':' + m + ' ' + ampm;
}

function relativeTimeFromDate(dateStr) {
    var t = new Date(dateStr).getTime();
    if (!t) return '';
    var diff = Date.now() - t;
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return sec + 's ago';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
}
