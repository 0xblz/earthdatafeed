/**
 * Air Quality module - Open-Meteo Air Quality API integration
 * Handles AQI, pollutants, and 3-day forecast
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
    pollutants: '#air-pollutants'
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
        loadAir(q);
    }
}

// ===== MAIN LOAD FUNCTION =====
function loadAir(query) {
    if (STATE.loading) return;
    STATE.loading = true;

    var results = document.querySelector(SELECTORS.results);
    results.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading air quality data...</div>';
    document.querySelector(SELECTORS.pollutants).innerHTML = '';

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

            // Fetch air quality data
            return fetchAirQualityData(geo.lat, geo.lon);
        })
        .then(function(data) {
            if (!data) return;
            renderAir(data);
            STATE.loading = false;
        })
        .catch(function(err) {
            console.error('Air quality error:', err);
            results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load air quality data. ' + esc(err.message || 'Try again.') + '</div>';
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

// ===== FETCH AIR QUALITY DATA =====
function fetchAirQualityData(lat, lon) {
    var url = 'https://air-quality-api.open-meteo.com/v1/air-quality?' + new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'us_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone,us_aqi_pm2_5,us_aqi_pm10,us_aqi_nitrogen_dioxide,us_aqi_sulphur_dioxide,us_aqi_ozone,us_aqi_carbon_monoxide',
        hourly: 'us_aqi,pm2_5,pm10',
        forecast_days: '3'
    });

    return fetch(url, {
        headers: { 'Accept': 'application/json' }
    })
    .then(function(r) {
        if (!r.ok) throw new Error('Air quality data unavailable for this location');
        return r.json();
    })
    .then(function(aq) {
        if (!aq || !aq.current) throw new Error('Invalid air quality response');

        var c = aq.current;
        var current = {
            aqi: parseInt(c.us_aqi || 0),
            pm25: parseFloat(c.pm2_5 || 0).toFixed(1),
            pm10: parseFloat(c.pm10 || 0).toFixed(1),
            co: Math.round(parseFloat(c.carbon_monoxide || 0)),
            no2: parseFloat(c.nitrogen_dioxide || 0).toFixed(1),
            so2: parseFloat(c.sulphur_dioxide || 0).toFixed(1),
            o3: parseFloat(c.ozone || 0).toFixed(1),
            aqi_pm25: parseInt(c.us_aqi_pm2_5 || 0),
            aqi_pm10: parseInt(c.us_aqi_pm10 || 0),
            aqi_no2: parseInt(c.us_aqi_nitrogen_dioxide || 0),
            aqi_so2: parseInt(c.us_aqi_sulphur_dioxide || 0),
            aqi_o3: parseInt(c.us_aqi_ozone || 0),
            aqi_co: parseInt(c.us_aqi_carbon_monoxide || 0)
        };

        // Pollutant rows
        var pollutants = [
            { name: 'PM2.5', value: current.pm25, unit: 'μg/m³', aqi: current.aqi_pm25, icon: 'fa-smog' },
            { name: 'PM10', value: current.pm10, unit: 'μg/m³', aqi: current.aqi_pm10, icon: 'fa-smog' },
            { name: 'O₃', value: current.o3, unit: 'μg/m³', aqi: current.aqi_o3, icon: 'fa-sun' },
            { name: 'NO₂', value: current.no2, unit: 'μg/m³', aqi: current.aqi_no2, icon: 'fa-car' },
            { name: 'SO₂', value: current.so2, unit: 'μg/m³', aqi: current.aqi_so2, icon: 'fa-industry' },
            { name: 'CO', value: current.co, unit: 'μg/m³', aqi: current.aqi_co, icon: 'fa-fire' }
        ];

        // Hourly forecast (group by day, pick daily high)
        var hourly = [];
        if (aq.hourly && aq.hourly.time) {
            var daily = {};
            for (var i = 0; i < aq.hourly.time.length; i++) {
                var day = aq.hourly.time[i].substring(0, 10);
                var aqiVal = parseInt(aq.hourly.us_aqi[i] || 0);
                var pm25Val = parseFloat(aq.hourly.pm2_5[i] || 0);
                var pm10Val = parseFloat(aq.hourly.pm10[i] || 0);

                if (!daily[day]) {
                    daily[day] = { aqi_max: 0, aqi_min: 999, pm25_max: 0, pm10_max: 0, date: day };
                }

                if (aqiVal > daily[day].aqi_max) daily[day].aqi_max = aqiVal;
                if (aqiVal < daily[day].aqi_min) daily[day].aqi_min = aqiVal;
                if (pm25Val > daily[day].pm25_max) daily[day].pm25_max = pm25Val.toFixed(1);
                if (pm10Val > daily[day].pm10_max) daily[day].pm10_max = pm10Val.toFixed(1);
            }
            hourly = Object.values(daily);
        }

        // Raw hourly data for chart
        var hourlyRaw = [];
        if (aq.hourly && aq.hourly.time) {
            for (var j = 0; j < aq.hourly.time.length; j++) {
                hourlyRaw.push({
                    time: aq.hourly.time[j],
                    aqi: parseInt(aq.hourly.us_aqi[j] || 0)
                });
            }
        }

        return {
            current: current,
            pollutants: pollutants,
            hourly: hourly,
            hourlyRaw: hourlyRaw,
            location: STATE.currentLocation
        };
    });
}

// ===== RENDER AIR QUALITY =====
function renderAir(data) {
    var results = document.querySelector(SELECTORS.results);
    var html = '';

    // Location header
    html += '<span id="loc-resolve" data-lat="' + data.location.lat + '" data-lon="' + data.location.lon + '" data-q="' + esc(data.location.query) + '" data-name="' + esc(data.location.name) + '" hidden></span>';

    // AQI Display
    var aqi = data.current.aqi;
    var color = aqiColor(aqi);
    html += '<div class="data-banner data-banner-air">';
    html += '<div class="data-banner-content">';
    html += '<div class="data-hero-value">' + aqi + '</div>';
    html += '<div class="data-hero-label"><i class="fa-solid ' + aqiIcon(aqi) + '"></i> ' + aqiLevel(aqi) + '</div>';
    html += '<div class="data-hero-sub" style="color:rgba(255,255,255,0.6)">' + aqiAdvice(aqi) + '</div>';
    html += '</div>';
    html += '</div>';

    // Pollutant Cards
    html += '<div class="card-grid">';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-smog" style="color:' + aqiColor(data.current.aqi_pm25) + '"></i></div>';
    html += '<div class="card-value" style="color:' + aqiColor(data.current.aqi_pm25) + '">' + data.current.pm25 + '</div>';
    html += '<div class="card-label">PM2.5 μg/m³</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-smog" style="color:' + aqiColor(data.current.aqi_pm10) + '"></i></div>';
    html += '<div class="card-value" style="color:' + aqiColor(data.current.aqi_pm10) + '">' + data.current.pm10 + '</div>';
    html += '<div class="card-label">PM10 μg/m³</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-sun" style="color:' + aqiColor(data.current.aqi_o3) + '"></i></div>';
    html += '<div class="card-value" style="color:' + aqiColor(data.current.aqi_o3) + '">' + data.current.o3 + '</div>';
    html += '<div class="card-label">Ozone μg/m³</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-car" style="color:' + aqiColor(data.current.aqi_no2) + '"></i></div>';
    html += '<div class="card-value" style="color:' + aqiColor(data.current.aqi_no2) + '">' + data.current.no2 + '</div>';
    html += '<div class="card-label">NO₂ μg/m³</div>';
    html += '</div>';
    html += '</div>';

    // AQI trend chart
    STATE.chartHourly = data.hourlyRaw || [];
    html += '<div class="air-chart" id="air-chart-wrap">';
    html += '<canvas></canvas>';
    html += '<div class="air-chart-tooltip"></div>';
    html += '<button class="chart-expand-btn" id="air-chart-expand" aria-label="Expand chart"><i class="fa-solid fa-expand"></i></button>';
    html += '</div>';

    // AQI Scale Reference
    html += '<div class="section-title"><i class="fa-solid fa-ruler-horizontal"></i> AQI Scale</div>';
    html += '<div class="badges">';
    html += '<div class="badge"><span class="label" style="color:#22c55e">0–50</span><span class="value" style="color:#22c55e">Good</span></div>';
    html += '<div class="badge"><span class="label" style="color:#eab308">51–100</span><span class="value" style="color:#eab308">Moderate</span></div>';
    html += '<div class="badge"><span class="label" style="color:#f97316">101–150</span><span class="value" style="color:#f97316">USG</span></div>';
    html += '<div class="badge"><span class="label" style="color:#ef4444">151–200</span><span class="value" style="color:#ef4444">Unhealthy</span></div>';
    html += '<div class="badge"><span class="label" style="color:#8b5cf6">201–300</span><span class="value" style="color:#8b5cf6">Very</span></div>';
    html += '<div class="badge"><span class="label" style="color:#7f1d1d">301+</span><span class="value" style="color:#7f1d1d">Hazard</span></div>';
    html += '</div>';

    results.innerHTML = html;

    // Pollutant Breakdown (right column)
    var pollHtml = '';
    pollHtml += '<div class="section-title"><i class="fa-solid fa-flask"></i> Pollutant Breakdown</div>';
    data.pollutants.forEach(function(p) {
        var pColor = aqiColor(p.aqi);
        pollHtml += '<div class="row">';
        pollHtml += '<div class="row-icon"><i class="fa-solid ' + p.icon + '" style="color:' + pColor + '"></i></div>';
        pollHtml += '<div class="row-label" style="color:' + pColor + '">' + p.name + '</div>';
        pollHtml += '<div class="row-text">' + p.value + ' ' + p.unit + '</div>';
        pollHtml += '<div class="row-meta" style="color:' + pColor + '">AQI ' + p.aqi + '</div>';
        pollHtml += '</div>';
    });
    // 3-Day Forecast (right column)
    if (data.hourly && data.hourly.length > 0) {
        pollHtml += '<div class="section-title"><i class="fa-solid fa-calendar-days"></i> 3-Day Forecast</div>';
        data.hourly.forEach(function(day) {
            var maxAqi = day.aqi_max;
            var dayColor = aqiColor(maxAqi);
            var dateLabel = formatDate(day.date);
            var details = 'Range ' + day.aqi_min + '–' + day.aqi_max + ' · PM2.5 peak ' + day.pm25_max + ' μg/m³';

            pollHtml += '<div class="row row-wrap">';
            pollHtml += '<div class="row-icon"><i class="fa-solid fa-smog" style="color:' + dayColor + '"></i></div>';
            pollHtml += '<div class="row-label">' + dateLabel + '</div>';
            pollHtml += '<div class="row-text right" style="color:' + dayColor + '">AQI ' + maxAqi + '</div>';
            pollHtml += '<div class="row-detail">' + details + '</div>';
            pollHtml += '</div>';
        });
    }
    document.querySelector(SELECTORS.pollutants).innerHTML = pollHtml;

    initAirChart();
}

// ===== AQI TREND CHART =====

function initAirChart() {
    var wrap = document.getElementById('air-chart-wrap');
    if (!wrap) return;
    var canvas = wrap.querySelector('canvas');
    var tooltip = wrap.querySelector('.air-chart-tooltip');
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
        drawAirChart();
    }

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 100);
    });

    canvas.addEventListener('mousemove', function(e) { airChartHover(e, wrap); });
    canvas.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
    });
    canvas.addEventListener('touchstart', function(e) {
        airChartHover(e.touches[0], wrap);
    }, { passive: true });

    window.addEventListener('themechange', drawAirChart);
    resize();

    var expandBtn = document.getElementById('air-chart-expand');
    if (expandBtn) {
        expandBtn.addEventListener('click', function() {
            openChartModal(STATE, drawAirChart, airChartHover, 'Air Quality Index');
        });
    }
}

function drawAirChart() {
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

    // Y-axis: auto-scale based on max AQI, minimum 100
    var maxAqi = 50;
    data.forEach(function(d) {
        if (d.aqi > maxAqi) maxAqi = d.aqi;
    });
    // Round up to next band boundary
    if (maxAqi <= 50) maxAqi = 60;
    else if (maxAqi <= 100) maxAqi = 120;
    else if (maxAqi <= 150) maxAqi = 170;
    else if (maxAqi <= 200) maxAqi = 220;
    else if (maxAqi <= 300) maxAqi = 320;
    else maxAqi = Math.ceil(maxAqi * 1.1);

    // Draw AQI color bands
    var bands = [
        { min: 0, max: 50, color: '#22c55e' },
        { min: 50, max: 100, color: '#eab308' },
        { min: 100, max: 150, color: '#f97316' },
        { min: 150, max: 200, color: '#ef4444' },
        { min: 200, max: 300, color: '#8b5cf6' },
        { min: 300, max: 500, color: '#7f1d1d' }
    ];

    bands.forEach(function(band) {
        if (band.min >= maxAqi) return;
        var top = Math.min(band.max, maxAqi);
        var y1 = pad.top + plotH - (top / maxAqi) * plotH;
        var y2 = pad.top + plotH - (band.min / maxAqi) * plotH;
        ctx.fillStyle = band.color;
        ctx.globalAlpha = 0.06;
        ctx.fillRect(pad.left, y1, plotW, y2 - y1);
        ctx.globalAlpha = 1;
    });

    // Horizontal gridlines + y-axis labels at band boundaries
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    var gridLines = [0, 50, 100, 150, 200, 300].filter(function(v) { return v <= maxAqi; });
    gridLines.forEach(function(val) {
        var y = pad.top + plotH - (val / maxAqi) * plotH;
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

    // X-axis: day labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var labeledDays = {};
    data.forEach(function(entry) {
        var d = new Date(entry.time);
        var dayKey = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
        if (!labeledDays[dayKey] && d.getHours() === 0) {
            labeledDays[dayKey] = true;
            var ts = new Date(entry.time).getTime();
            var xPct = (ts - tMin) / tRange;
            var x = pad.left + xPct * plotW;

            ctx.strokeStyle = borderColor;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotH);
            ctx.stroke();

            ctx.fillStyle = textDim;
            ctx.fillText(days[d.getDay()], x + (12 * 3600000 / tRange) * plotW, pad.top + plotH + 8 * dpr);
        }
    });

    // Draw the AQI line
    ctx.beginPath();
    var started = false;
    STATE.chartPoints = [];

    for (var i = 0; i < data.length; i++) {
        var aqi = data[i].aqi;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = aqi / maxAqi;
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
            aqi: aqi, time: ts
        });
    }

    // Line color from current AQI
    var currentAqi = data[0].aqi;
    var lineColor = aqiColor(currentAqi);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Fill under line
    if (STATE.chartPoints.length > 1) {
        var last = STATE.chartPoints[STATE.chartPoints.length - 1];
        var first = STATE.chartPoints[0];
        ctx.lineTo(last.x * dpr, pad.top + plotH);
        ctx.lineTo(first.x * dpr, pad.top + plotH);
        ctx.closePath();
        ctx.globalAlpha = 0.07;
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.globalAlpha = 1;
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

function airChartHover(e, wrap) {
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
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var timeStr = months[d.getMonth()] + ' ' + d.getDate() + ' ' + hr12 + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ampm;
        tooltip.innerHTML =
            '<span style="color:' + aqiColor(closest.aqi) + ';font-weight:700">AQI ' + closest.aqi + '</span>' +
            ' <span style="color:var(--text-muted)">' + aqiLevel(closest.aqi) + '</span>' +
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

function aqiColor(aqi) {
    if (aqi <= 50) return '#22c55e';
    if (aqi <= 100) return '#eab308';
    if (aqi <= 150) return '#f97316';
    if (aqi <= 200) return '#ef4444';
    if (aqi <= 300) return '#8b5cf6';
    return '#7f1d1d';
}

function aqiLevel(aqi) {
    if (aqi <= 50) return 'Good';
    if (aqi <= 100) return 'Moderate';
    if (aqi <= 150) return 'Unhealthy for Sensitive Groups';
    if (aqi <= 200) return 'Unhealthy';
    if (aqi <= 300) return 'Very Unhealthy';
    return 'Hazardous';
}

function aqiAdvice(aqi) {
    if (aqi <= 50) return 'Air quality is satisfactory. Enjoy outdoor activities.';
    if (aqi <= 100) return 'Acceptable. Unusually sensitive people should limit prolonged outdoor exertion.';
    if (aqi <= 150) return 'Sensitive groups should reduce prolonged outdoor exertion.';
    if (aqi <= 200) return 'Everyone should reduce prolonged outdoor exertion. Sensitive groups should avoid it.';
    if (aqi <= 300) return 'Health alert. Everyone should avoid prolonged outdoor exertion.';
    return 'Health emergency. Everyone should avoid all outdoor activity.';
}

function aqiIcon(aqi) {
    if (aqi <= 50) return 'fa-face-smile';
    if (aqi <= 100) return 'fa-face-meh';
    if (aqi <= 150) return 'fa-triangle-exclamation';
    if (aqi <= 200) return 'fa-face-frown';
    if (aqi <= 300) return 'fa-skull-crossbones';
    return 'fa-biohazard';
}

function formatDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();
}

// Auto-load on page load
document.addEventListener('DOMContentLoaded', init);
