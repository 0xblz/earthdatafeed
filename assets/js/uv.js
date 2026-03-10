/**
 * UV Index module - Open-Meteo Forecast API integration
 * Handles current UV, hourly UV, and 5-day forecast
 */

// ===== OPTIONS =====
var OPTIONS = {
    geocodeTimeout: 10000,
    apiTimeout: 10000,
    cacheTime: 300000, // 5 minutes
    userAgent: 'EarthData/1.0 (earthdatafeed.com)'
};

// ===== SELECTORS =====
var SELECTORS = {
    results: '#results',
    today: '#uv-today'
};

// ===== STATE =====
var STATE = {
    currentLocation: null,
    loading: false,
    chartCanvas: null,
    chartTooltip: null,
    chartPoints: [],
    chartHourly: []
};

// ===== INIT =====
function init() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q) {
        loadUV(q);
    }
}

// ===== MAIN LOAD FUNCTION =====
function loadUV(query) {
    if (STATE.loading) return;
    STATE.loading = true;

    var results = document.querySelector(SELECTORS.results);
    results.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading UV index data...</div>';
    document.querySelector(SELECTORS.today).innerHTML = '';

    // Geocode via Nominatim
    geocode(query)
        .then(function(geo) {
            if (!geo) {
                results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Location not found. Try a city name or zip code.</div>';
                STATE.loading = false;
                return;
            }

            STATE.currentLocation = geo;

            // Save to localStorage if saveLocation is enabled
            var STORAGE_KEY = 'ed_location';
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                q: query,
                lat: geo.lat,
                lon: geo.lon,
                name: geo.name,
                cc: geo.cc
            }));
            if (window.updateLogoFlag) updateLogoFlag();

            // Fetch UV data
            return fetchUVData(geo.lat, geo.lon);
        })
        .then(function(data) {
            if (!data) return;
            renderUV(data);
            STATE.loading = false;
        })
        .catch(function(err) {
            console.error('UV index error:', err);
            results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load UV index data. ' + esc(err.message || 'Try again.') + '</div>';
            STATE.loading = false;
        });
}

// ===== GEOCODING =====
function geocode(query) {
    var url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
        q: query,
        format: 'json',
        limit: '1',
        addressdetails: '1'
    });

    return fetch(url, {
        headers: { 'Accept': 'application/json' }
    })
    .then(function(r) {
        if (!r.ok) throw new Error('Geocoding failed');
        return r.json();
    })
    .then(function(data) {
        if (!data || data.length === 0) return null;

        var geo = data[0];
        var addr = geo.address || {};
        var lat = parseFloat(geo.lat).toFixed(4);
        var lon = parseFloat(geo.lon).toFixed(4);
        var cc = (addr.country_code || '').toUpperCase();

        var main = (geo.display_name || '').split(', ')[0] || '';
        var country = addr.country || '';
        var name = main && country ? main + ', ' + country : geo.display_name || query;

        return { lat: parseFloat(lat), lon: parseFloat(lon), name: name, query: query, cc: cc };
    });
}

// ===== FETCH UV DATA =====
function fetchUVData(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'uv_index',
        hourly: 'uv_index,uv_index_clear_sky',
        daily: 'uv_index_max,uv_index_clear_sky_max',
        timezone: 'auto',
        forecast_days: '5'
    });

    return fetch(url, {
        headers: { 'Accept': 'application/json' }
    })
    .then(function(r) {
        if (!r.ok) throw new Error('UV index data unavailable for this location');
        return r.json();
    })
    .then(function(uv) {
        if (!uv || !uv.current) throw new Error('Invalid UV response');

        var current = {
            uv: parseFloat(uv.current.uv_index || 0).toFixed(1)
        };

        // Daily forecast
        var daily = [];
        if (uv.daily && uv.daily.time) {
            for (var i = 0; i < uv.daily.time.length; i++) {
                daily.push({
                    date: uv.daily.time[i],
                    uv_max: parseFloat(uv.daily.uv_index_max[i] || 0).toFixed(1),
                    clear_sky_max: parseFloat(uv.daily.uv_index_clear_sky_max[i] || 0).toFixed(1)
                });
            }
        }

        // Today's hourly forecast (only daytime hours with UV > 0)
        var hourlyData = [];
        if (uv.hourly && uv.hourly.time && daily.length > 0) {
            var today = daily[0].date;
            for (var i = 0; i < uv.hourly.time.length; i++) {
                if (uv.hourly.time[i].indexOf(today) === 0) {
                    var val = parseFloat(uv.hourly.uv_index[i] || 0).toFixed(1);
                    var clear = parseFloat(uv.hourly.uv_index_clear_sky[i] || 0).toFixed(1);
                    if (parseFloat(val) > 0 || parseFloat(clear) > 0) {
                        hourlyData.push({
                            time: uv.hourly.time[i],
                            uv: val,
                            clear_sky: clear
                        });
                    }
                }
            }
        }

        return {
            current: current,
            daily: daily,
            hourly: hourlyData,
            location: STATE.currentLocation
        };
    });
}

// ===== RENDER UV =====
function renderUV(data) {
    var results = document.querySelector(SELECTORS.results);
    var html = '';

    // Location header
    html += '<span id="loc-resolve" data-lat="' + data.location.lat + '" data-lon="' + data.location.lon + '" data-q="' + esc(data.location.query) + '" data-name="' + esc(data.location.name) + '" hidden></span>';

    // UV Display
    var uvVal = parseFloat(data.current.uv);
    var color = uvColor(uvVal);
    html += '<div class="data-banner data-banner-uv">';
    html += '<div class="data-banner-content">';
    html += '<div class="data-hero-value">' + data.current.uv + '</div>';
    html += '<div class="data-hero-label"><i class="fa-solid ' + uvIcon(uvVal) + '"></i> ' + uvLevel(uvVal) + '</div>';
    html += '<div class="data-hero-sub" style="color:rgba(255,255,255,0.6)">' + uvAdvice(uvVal) + '</div>';
    html += '</div>';
    html += '</div>';

    // Summary Cards
    html += '<div class="card-grid">';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-sun" style="color:' + color + '"></i></div>';
    html += '<div class="card-value" style="color:' + color + '">' + data.current.uv + '</div>';
    html += '<div class="card-label">Current UV</div>';
    html += '</div>';
    if (data.daily.length > 0) {
        var todayMax = parseFloat(data.daily[0].uv_max);
        var todayClear = parseFloat(data.daily[0].clear_sky_max);
        html += '<div class="card">';
        html += '<div class="card-icon"><i class="fa-solid fa-arrow-up" style="color:' + uvColor(todayMax) + '"></i></div>';
        html += '<div class="card-value" style="color:' + uvColor(todayMax) + '">' + data.daily[0].uv_max + '</div>';
        html += '<div class="card-label">Today\'s Max</div>';
        html += '</div>';
        html += '<div class="card">';
        html += '<div class="card-icon"><i class="fa-solid fa-cloud-sun" style="color:' + uvColor(todayClear) + '"></i></div>';
        html += '<div class="card-value" style="color:' + uvColor(todayClear) + '">' + data.daily[0].clear_sky_max + '</div>';
        html += '<div class="card-label">Clear Sky Max</div>';
        html += '</div>';
    }
    html += '</div>';

    // UV curve chart
    STATE.chartHourly = data.hourly || [];
    html += '<div class="uv-chart" id="uv-chart-wrap">';
    html += '<canvas></canvas>';
    html += '<div class="uv-chart-tooltip"></div>';
    html += '<button class="chart-expand-btn" id="uv-chart-expand" aria-label="Expand chart"><i class="fa-solid fa-expand"></i></button>';
    html += '</div>';

    // UV Scale Reference
    html += '<div class="section-title"><i class="fa-solid fa-ruler-horizontal"></i> UV Scale</div>';
    html += '<div class="badges">';
    html += '<div class="badge"><span class="label" style="color:#22c55e">0–2</span><span class="value" style="color:#22c55e">Low</span></div>';
    html += '<div class="badge"><span class="label" style="color:#eab308">3–5</span><span class="value" style="color:#eab308">Moderate</span></div>';
    html += '<div class="badge"><span class="label" style="color:#f97316">6–7</span><span class="value" style="color:#f97316">High</span></div>';
    html += '<div class="badge"><span class="label" style="color:#ef4444">8–10</span><span class="value" style="color:#ef4444">Very High</span></div>';
    html += '<div class="badge"><span class="label" style="color:#8b5cf6">11+</span><span class="value" style="color:#8b5cf6">Extreme</span></div>';
    html += '</div>';

    results.innerHTML = html;

    // Today's Hourly UV (right column)
    var todayHtml = '';
    if (data.hourly.length > 0) {
        todayHtml += '<div class="section-title"><i class="fa-solid fa-clock"></i> Today\'s UV</div>';

        var peakUV = 0;
        data.hourly.forEach(function(h) {
            var val = parseFloat(h.uv);
            if (val > peakUV) peakUV = val;
        });

        data.hourly.forEach(function(h) {
            var hour = formatHour(h.time);
            var hUV = parseFloat(h.uv);
            var hColor = uvColor(hUV);
            var isPeak = (hUV === peakUV && peakUV > 0);

            todayHtml += '<div class="row">';
            todayHtml += '<div class="row-icon"><i class="fa-solid fa-sun" style="color:' + hColor + '"></i></div>';
            todayHtml += '<div class="row-label" style="color:' + hColor + '">' + h.uv + '</div>';
            todayHtml += '<div class="row-text">' + hour;
            if (isPeak) {
                todayHtml += ' <span style="color:' + hColor + ';font-size:0.55rem"><i class="fa-solid fa-arrow-up"></i> peak</span>';
            }
            todayHtml += '</div>';
            todayHtml += '<div class="row-meta c-muted">' + uvLevel(hUV) + '</div>';
            todayHtml += '</div>';
        });
    }
    // Multi-day forecast (right column, below today's UV)
    if (data.daily.length > 1) {
        var forecastDays = data.daily.slice(1);
        todayHtml += '<div class="section-title"><i class="fa-solid fa-calendar-days"></i> ' + forecastDays.length + '-Day Forecast</div>';
        forecastDays.forEach(function(day) {
            var dayMax = parseFloat(day.uv_max);
            var dayClear = parseFloat(day.clear_sky_max);
            var dayColor = uvColor(dayMax);
            var dateLabel = formatDate(day.date);
            var details = uvLevel(dayMax) + ' · Clear sky ' + day.clear_sky_max;

            todayHtml += '<div class="row row-wrap">';
            todayHtml += '<div class="row-icon"><i class="fa-solid fa-sun" style="color:' + dayColor + '"></i></div>';
            todayHtml += '<div class="row-label">' + dateLabel + '</div>';
            todayHtml += '<div class="row-text right" style="color:' + dayColor + '">' + day.uv_max + '</div>';
            todayHtml += '<div class="row-detail">' + details + '</div>';
            todayHtml += '</div>';
        });
    }
    document.querySelector(SELECTORS.today).innerHTML = todayHtml;

    initUVChart();
}

// ===== UV CURVE CHART =====

function initUVChart() {
    var wrap = document.getElementById('uv-chart-wrap');
    if (!wrap) return;
    var canvas = wrap.querySelector('canvas');
    var tooltip = wrap.querySelector('.uv-chart-tooltip');
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
        drawUVChart();
    }

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 100);
    });

    canvas.addEventListener('mousemove', function(e) { uvChartHover(e, wrap); });
    canvas.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
    });
    canvas.addEventListener('touchstart', function(e) {
        uvChartHover(e.touches[0], wrap);
    }, { passive: true });

    window.addEventListener('themechange', drawUVChart);
    resize();

    var expandBtn = document.getElementById('uv-chart-expand');
    if (expandBtn) {
        expandBtn.addEventListener('click', function() {
            openChartModal(STATE, drawUVChart, uvChartHover, 'UV Index');
        });
    }
}

function drawUVChart() {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 36 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartHourly;
    if (!data.length) return;

    // Y-axis: auto-scale, minimum 6
    var maxUV = 3;
    data.forEach(function(d) {
        var v = parseFloat(d.uv);
        if (v > maxUV) maxUV = v;
    });
    if (maxUV <= 3) maxUV = 4;
    else if (maxUV <= 6) maxUV = Math.ceil(maxUV) + 1;
    else if (maxUV <= 11) maxUV = Math.ceil(maxUV) + 1;
    else maxUV = Math.ceil(maxUV * 1.1);

    // UV color bands
    var bands = [
        { min: 0, max: 3, color: '#22c55e' },
        { min: 3, max: 6, color: '#eab308' },
        { min: 6, max: 8, color: '#f97316' },
        { min: 8, max: 11, color: '#ef4444' },
        { min: 11, max: 20, color: '#8b5cf6' }
    ];

    bands.forEach(function(band) {
        if (band.min >= maxUV) return;
        var top = Math.min(band.max, maxUV);
        var y1 = pad.top + plotH - (top / maxUV) * plotH;
        var y2 = pad.top + plotH - (band.min / maxUV) * plotH;
        ctx.fillStyle = band.color;
        ctx.globalAlpha = 0.06;
        ctx.fillRect(pad.left, y1, plotW, y2 - y1);
        ctx.globalAlpha = 1;
    });

    // Horizontal gridlines + y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    var gridVals = [0, 3, 6, 8, 11].filter(function(v) { return v <= maxUV; });
    gridVals.forEach(function(val) {
        var y = pad.top + plotH - (val / maxUV) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(val, pad.left - 6 * dpr, y);
    });

    // Time range
    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0];
    var tMax = times[times.length - 1];
    var tRange = tMax - tMin;
    if (tRange <= 0) return;

    // X-axis: hour labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    data.forEach(function(entry, idx) {
        var d = new Date(entry.time);
        var hr = d.getHours();
        if (hr % 2 === 0) {
            var ts = new Date(entry.time).getTime();
            var xPct = (ts - tMin) / tRange;
            var x = pad.left + xPct * plotW;
            ctx.fillStyle = textDim;
            var hr12 = hr % 12 || 12;
            var ampm = hr >= 12 ? 'p' : 'a';
            ctx.fillText(hr12 + ampm, x, pad.top + plotH + 8 * dpr);
        }
    });

    // Build points
    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var uv = parseFloat(data[i].uv);
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = uv / maxUV;
        yPct = Math.max(0, Math.min(1, yPct));

        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;

        points.push({ cx: cx, cy: cy, uv: uv, time: ts });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            uv: uv, time: ts
        });
    }

    if (points.length < 2) return;

    // Fill under the curve
    ctx.beginPath();
    ctx.moveTo(points[0].cx, pad.top + plotH);
    for (var i = 0; i < points.length; i++) {
        ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
    ctx.closePath();

    // Gradient from peak UV color at top to transparent at bottom
    var peakUV = 0;
    points.forEach(function(p) { if (p.uv > peakUV) peakUV = p.uv; });
    var fillColor = uvColor(peakUV);
    var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.15;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Draw line segments colored by UV
    ctx.lineWidth = 2 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var i = 1; i < points.length; i++) {
        var prev = points[i - 1];
        var curr = points[i];
        var avgUV = (prev.uv + curr.uv) / 2;
        ctx.strokeStyle = uvColor(avgUV);
        ctx.beginPath();
        ctx.moveTo(prev.cx, prev.cy);
        ctx.lineTo(curr.cx, curr.cy);
        ctx.stroke();
    }

    // "Now" line
    var now = Date.now();
    if (now >= tMin && now <= tMax) {
        var nowXPct = (now - tMin) / tRange;
        var nowX = pad.left + nowXPct * plotW;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = dpr;
        ctx.setLineDash([3 * dpr, 3 * dpr]);
        ctx.beginPath();
        ctx.moveTo(nowX, pad.top);
        ctx.lineTo(nowX, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function uvChartHover(e, wrap) {
    var tooltip = STATE.chartTooltip;
    if (!tooltip || !STATE.chartPoints || !STATE.chartPoints.length) return;

    var rect = STATE.chartCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;

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
        var d = new Date(closest.time);
        var hr12 = d.getHours() % 12 || 12;
        var ampm = d.getHours() >= 12 ? 'PM' : 'AM';
        var timeStr = hr12 + ' ' + ampm;
        tooltip.innerHTML =
            '<span style="color:' + uvColor(closest.uv) + ';font-weight:700">UV ' + closest.uv.toFixed(1) + '</span>' +
            ' <span style="color:var(--text-muted)">' + uvLevel(closest.uv) + '</span>' +
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

function uvColor(uv) {
    if (uv < 3) return '#22c55e';
    if (uv < 6) return '#eab308';
    if (uv < 8) return '#f97316';
    if (uv < 11) return '#ef4444';
    return '#8b5cf6';
}

function uvLevel(uv) {
    if (uv < 3) return 'Low';
    if (uv < 6) return 'Moderate';
    if (uv < 8) return 'High';
    if (uv < 11) return 'Very High';
    return 'Extreme';
}

function uvAdvice(uv) {
    if (uv < 3) return 'No protection needed. You can safely stay outside.';
    if (uv < 6) return 'Wear sunscreen and sunglasses. Seek shade during midday.';
    if (uv < 8) return 'Reduce sun exposure between 10am–4pm. Sunscreen, hat, and sunglasses recommended.';
    if (uv < 11) return 'Extra protection needed. Avoid being outside during midday. Shirt, sunscreen, hat required.';
    return 'Take all precautions. Unprotected skin can burn in minutes. Avoid sun exposure.';
}

function uvIcon(uv) {
    if (uv < 3) return 'fa-shield';
    if (uv < 6) return 'fa-sun';
    if (uv < 8) return 'fa-triangle-exclamation';
    if (uv < 11) return 'fa-exclamation-circle';
    return 'fa-radiation';
}

function formatDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();
}

function formatHour(timeStr) {
    var d = new Date(timeStr);
    var h = d.getHours();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return h + ' ' + ampm;
}

// Auto-load on page load
document.addEventListener('DOMContentLoaded', init);
