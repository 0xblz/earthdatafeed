/**
 * Tides Page
 * Fetches NOAA tide predictions and current water level for a location
 */

// ===== OPTIONS =====
var OPTIONS = {
    stationsCacheTTL: 86400000,
    distanceLimit: { imperial: 100, metric: 161 },
    userAgent: 'EarthData/1.0'
};

// ===== SELECTORS =====
var SELECTORS = {
    results: '#results',
    query: '#q'
};

// ===== STATE =====
var STATE = {
    stationsCache: null,
    stationsCacheTs: 0,
    chartCanvas: null,
    chartTooltip: null,
    chartPoints: [],
    chartHourly: [],
    chartHiLo: [],
    nearbyStations: [],
    stationShowCount: 20,
    locationName: '',
    heightUnit: 'ft',
    distUnit: 'mi',
    apiUnits: 'english',
    lat: 0,
    lon: 0,
    forecastHtml: ''
};

// ===== INIT =====
function init() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q) {
        loadTides(q);
    } else {
        var saved = localStorage.getItem('ed_location');
        if (saved) {
            try {
                var loc = JSON.parse(saved);
                if (loc && loc.q) {
                    document.getElementById('q').value = loc.q;
                    loadTides(loc.q);
                }
            } catch (e) {}
        }
    }
}

// ===== CORE FUNCTIONS =====

function loadTides(query) {
    var results = document.querySelector(SELECTORS.results);
    results.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading tide data...</div>';

    geocode(query).then(function(geo) {
        if (!geo) {
            results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Location not found. Try a coastal city or place name.</div>';
            return;
        }

        var lat = parseFloat(geo.lat);
        var lon = parseFloat(geo.lon);
        var addr = geo.address || {};
        var cc = (addr.country_code || '').toUpperCase();
        var main = (geo.display_name || '').split(', ')[0] || '';
        var country = addr.country || '';
        var locationName = main && country ? main + ', ' + country : shortenLocationName(geo.display_name);

        return getStations().then(function(stations) {
            if (!stations || stations.length === 0) {
                results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> No nearby tide stations. Only US coastal areas are supported right now — global tides coming soon.</div>';
                return;
            }

            var metric = isMetric();
            STATE.stationShowCount = 20;
            var nearby = findNearestStations(lat, lon, stations, metric, 100);

            if (nearby.length === 0) {
                results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> No nearby tide stations. Only US coastal areas are supported right now — global tides coming soon.</div>';
                return;
            }

            STATE.nearbyStations = nearby;
            STATE.locationName = locationName;
            STATE.heightUnit = metric ? 'm' : 'ft';
            STATE.distUnit = metric ? 'km' : 'mi';
            STATE.apiUnits = metric ? 'metric' : 'english';
            STATE.lat = lat;
            STATE.lon = lon;

            saveLocation(query, lat, lon, locationName, cc);
            loadStationData(nearby[0]);
        });
    }).catch(function() {
        results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Network error. Try again.</div>';
    });
}

function loadStationData(station) {
    var results = document.querySelector(SELECTORS.results);
    results.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading tide data...</div>';

    var today = formatDate(new Date());
    var endDate = formatDate(new Date(Date.now() + 3 * 86400000));

    var predUrl = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&station=' + station.id + '&begin_date=' + today + '&end_date=' + endDate + '&datum=MLLW&units=' + STATE.apiUnits + '&time_zone=lst_ldt&format=json&interval=hilo';
    var hourlyUrl = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=predictions&station=' + station.id + '&begin_date=' + today + '&end_date=' + endDate + '&datum=MLLW&units=' + STATE.apiUnits + '&time_zone=lst_ldt&format=json&interval=h';
    var wlUrl = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?product=water_level&station=' + station.id + '&date=latest&datum=MLLW&units=' + STATE.apiUnits + '&time_zone=lst_ldt&format=json';

    Promise.all([
        fetch(predUrl).then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }),
        fetch(wlUrl).then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; }),
        fetch(hourlyUrl).then(function(r) { return r.ok ? r.json() : {}; }).catch(function() { return {}; })
    ]).then(function(data) {
        var predictions = data[0].predictions || [];
        var waterLevelData = data[1].data || [];
        var hourlyPredictions = data[2].predictions || [];

        if (predictions.length === 0) {
            results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Tide predictions unavailable for this station.</div>';
            return;
        }

        var waterLevel = null;
        if (waterLevelData.length > 0) {
            waterLevel = {
                value: parseFloat(waterLevelData[0].v).toFixed(2),
                time: waterLevelData[0].t
            };
        }

        renderTides(station, waterLevel, predictions, hourlyPredictions);
    }).catch(function() {
        results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to fetch tide data.</div>';
    });
}

function geocode(query) {
    var url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams({
        q: query,
        format: 'json',
        limit: '1',
        addressdetails: '1'
    });
    return fetch(url, { headers: { 'User-Agent': OPTIONS.userAgent } })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            return data.length > 0 ? data[0] : null;
        });
}

function getStations() {
    var now = Date.now();
    if (STATE.stationsCache && (now - STATE.stationsCacheTs) < OPTIONS.stationsCacheTTL) {
        return Promise.resolve(STATE.stationsCache);
    }

    return fetch('https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=tidepredictions&units=english')
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (!data || !data.stations) return [];
            var slim = [];
            data.stations.forEach(function(s) {
                if (!s.lat || !s.lng) return;
                slim.push({
                    id: s.id,
                    name: s.name,
                    state: s.state || '',
                    lat: parseFloat(s.lat),
                    lng: parseFloat(s.lng),
                    type: s.type || ''
                });
            });
            STATE.stationsCache = slim;
            STATE.stationsCacheTs = now;
            return slim;
        });
}

function findNearestStations(lat, lon, stations, metric, count) {
    var distLimit = OPTIONS.distanceLimit[metric ? 'metric' : 'imperial'];
    var withDist = [];

    stations.forEach(function(s) {
        var d = haversine(lat, lon, s.lat, s.lng, metric);
        if (d <= distLimit) {
            withDist.push({ id: s.id, name: s.name, state: s.state, lat: s.lat, lng: s.lng, type: s.type, distance: Math.round(d * 10) / 10 });
        }
    });

    withDist.sort(function(a, b) { return a.distance - b.distance; });
    return withDist.slice(0, count);
}

function renderTides(station, waterLevel, predictions, hourlyPredictions) {
    var locationName = STATE.locationName;
    var heightUnit = STATE.heightUnit;
    var distUnit = STATE.distUnit;
    var direction = tideDirection(predictions);
    var next = nextTide(predictions);
    var todayTides = todaysTides(predictions);
    var dailyTides = groupByDay(predictions);
    var nearby = STATE.nearbyStations;

    var html = '';
    html += '<span id="loc-resolve" data-q="' + esc(locationName) + '" data-lat="' + station.lat + '" data-lon="' + station.lng + '" data-name="' + esc(locationName) + '" hidden></span>';

    // Current station
    html += '<div class="section-title"><i class="fa-solid fa-tower-observation"></i> Current Station</div>';
    html += '<div class="row row-wrap">';
    html += '<div class="row-icon"><i class="fa-solid fa-tower-observation c-cyan"></i></div>';
    html += '<div class="row-label">' + esc(station.name) + (station.state ? ', ' + esc(station.state) : '') + '</div>';
    html += '<div class="row-detail">' + station.distance + ' ' + distUnit + ' away · Station ' + station.id + '</div>';
    html += '</div>';

    // Tide direction hero
    html += '<div class="data-banner data-banner-tides">';
    html += '<div class="data-banner-content">';
    html += '<div class="data-hero-value" style="font-size:2rem"><i class="fa-solid ' + direction.icon + '"></i> ' + direction.text + '</div>';
    html += '<div class="data-hero-label">Tide Direction</div>';
    if (waterLevel) {
        html += '<div class="data-hero-sub" style="color:rgba(255,255,255,0.6)">Water Level: ' + waterLevel.value + ' ' + heightUnit + '</div>';
    }
    html += '</div>';
    html += '</div>';

    // Current cards
    html += '<div class="card-grid">';

    if (next) {
        html += '<div class="card">';
        html += '<div class="card-icon"><i class="fa-solid fa-clock" style="color:' + next.color + '"></i></div>';
        html += '<div class="card-value" style="color:' + next.color + '">' + next.countdown + '</div>';
        html += '<div class="card-label">Next ' + next.type + ' Tide</div>';
        html += '</div>';
        html += '<div class="card">';
        html += '<div class="card-icon"><i class="fa-solid fa-ruler-vertical" style="color:' + next.color + '"></i></div>';
        html += '<div class="card-value" style="color:' + next.color + '">' + next.value + ' ' + heightUnit + '</div>';
        html += '<div class="card-label">' + next.type + ' at ' + next.timeDisplay + '</div>';
        html += '</div>';
    }
    html += '</div>';

    // Tide curve chart
    STATE.chartHourly = hourlyPredictions;
    STATE.chartHiLo = predictions;
    STATE.chartHeightUnit = heightUnit;
    html += '<div class="tide-chart" id="tide-chart-wrap">';
    html += '<canvas></canvas>';
    html += '<div class="tide-chart-tooltip"></div>';
    html += '<button class="chart-expand-btn" id="tide-chart-expand" aria-label="Expand chart"><i class="fa-solid fa-expand"></i></button>';
    html += '</div>';

    // Today's tides
    if (todayTides.length > 0) {
        html += '<div class="section-title"><i class="fa-solid fa-calendar-day"></i> Today\'s Tides</div>';
        var now = Date.now();
        todayTides.forEach(function(t) {
            var type = t.type === 'H' ? 'High' : 'Low';
            var color = tideColor(t.type);
            var icon = t.type === 'H' ? 'fa-arrow-up' : 'fa-arrow-down';
            var ts = new Date(t.t).getTime();
            var isPast = ts < now;
            html += '<div class="row"' + (isPast ? ' style="opacity:0.5"' : '') + '>';
            html += '<div class="row-icon"><i class="fa-solid ' + icon + '" style="color:' + color + '"></i></div>';
            html += '<div class="row-label" style="color:' + color + '">' + type + '</div>';
            html += '<div class="row-text">' + formatTime(t.t) + '</div>';
            html += '<div class="row-meta" style="color:' + color + '">' + parseFloat(t.v).toFixed(2) + ' ' + heightUnit + '</div>';
            html += '</div>';
        });
    }

    // Station info
    html += '<div class="badges">';
    html += '<div class="badge"><i class="fa-solid fa-hashtag c-muted"></i><span class="label">Station</span><span class="value">' + station.id + '</span></div>';
    html += '<div class="badge"><i class="fa-solid fa-ruler-vertical c-muted"></i><span class="label">Datum</span><span class="value">MLLW</span></div>';
    html += '<div class="badge"><i class="fa-solid fa-database c-muted"></i><span class="label">Source</span><span class="value">NOAA CO-OPS</span></div>';
    html += '</div>';

    document.querySelector(SELECTORS.results).innerHTML = html;

    // 3-day forecast (right column, above stations)
    var forecastHtml = '';
    var dayKeys = Object.keys(dailyTides);
    if (dayKeys.length > 1) {
        forecastHtml += '<div class="section-title"><i class="fa-solid fa-calendar-days"></i> 3-Day Forecast</div>';
        dayKeys.forEach(function(day) {
            var tides = dailyTides[day];
            var dateLabel = formatDateLabel(day);
            forecastHtml += '<div class="row row-wrap">';
            forecastHtml += '<div class="row-icon"><i class="fa-solid fa-water c-cyan"></i></div>';
            forecastHtml += '<div class="row-label">' + dateLabel + '</div>';
            forecastHtml += '<div class="row-text"></div>';
            forecastHtml += '<div class="row-detail row-detail-grid">';
            tides.forEach(function(t) {
                var color = tideColor(t.type);
                var icon = t.type === 'H' ? 'fa-arrow-up' : 'fa-arrow-down';
                forecastHtml += '<span><i class="fa-solid ' + icon + '" style="color:' + color + '"></i> ' + formatTime(t.t) + '</span>';
                forecastHtml += '<span style="color:' + color + '">' + parseFloat(t.v).toFixed(2) + ' ' + heightUnit + '</span>';
            });
            forecastHtml += '</div>';
            forecastHtml += '</div>';
        });
    }
    STATE.forecastHtml = forecastHtml;

    initTideChart();
    renderStations(station, distUnit);
}

function renderStations(station, distUnit) {
    var nearby = STATE.nearbyStations;
    var stationsEl = document.getElementById('tide-stations');
    if (!stationsEl || nearby.length === 0) return;

    // If already rendered, just update active highlight
    var existing = stationsEl.querySelectorAll('[data-station-id]');
    if (existing.length > 0) {
        existing.forEach(function(row) {
            var isActive = row.getAttribute('data-station-id') === station.id;
            var icon = row.querySelector('.row-icon i');
            var label = row.querySelector('.row-label');
            if (isActive) {
                row.style.opacity = '';
                row.style.cursor = '';
                if (icon) { icon.className = 'fa-solid fa-location-dot c-cyan'; icon.style.color = ''; }
                if (label) label.style.fontWeight = '';
            } else {
                row.style.opacity = '0.55';
                row.style.cursor = 'pointer';
                if (icon) { icon.className = 'fa-solid fa-location-dot'; icon.style.color = 'var(--text-dim)'; }
                if (label) label.style.fontWeight = '400';
            }
        });
        return;
    }

    // Full render
    var visible = nearby.slice(0, STATE.stationShowCount);
    var sh = STATE.forecastHtml || '';
    sh += '<div class="section-title"><i class="fa-solid fa-tower-observation"></i> Nearest Station' + (nearby.length > 1 ? 's' : '') + '</div>';
    for (var si = 0; si < visible.length; si++) {
        var s = visible[si];
        var isActive = s.id === station.id;
        var hasHourly = s.type === 'R';
        var chartIcon = hasHourly ? ' <i class="fa-solid fa-chart-line" style="color:var(--text-dim);font-size:0.6rem"></i>' : '';
        var activeStyle = isActive ? '' : 'cursor:pointer;opacity:0.55';
        var iconClass = isActive ? 'fa-solid fa-location-dot c-cyan' : 'fa-solid fa-location-dot';
        var iconStyle = isActive ? '' : 'color:var(--text-dim)';
        var labelWeight = isActive ? '' : 'font-weight:400';
        sh += '<div class="row" data-station-id="' + s.id + '" data-station-idx="' + si + '"' + (activeStyle ? ' style="' + activeStyle + '"' : '') + '>';
        sh += '<div class="row-icon"><i class="' + iconClass + '"' + (iconStyle ? ' style="' + iconStyle + '"' : '') + '></i></div>';
        sh += '<div class="row-label"' + (labelWeight ? ' style="' + labelWeight + '"' : '') + '>' + esc(s.name) + (s.state ? ', ' + esc(s.state) : '') + '</div>';
        sh += '<div class="row-text"></div>';
        sh += '<div class="row-meta">' + chartIcon + ' ' + s.distance + ' ' + distUnit + '</div>';
        sh += '</div>';
    }

    if (nearby.length > STATE.stationShowCount) {
        sh += '<div class="load-more" id="station-load-more">Load more (' + (nearby.length - STATE.stationShowCount) + ' remaining)</div>';
    }

    stationsEl.innerHTML = sh;

    stationsEl.querySelectorAll('[data-station-id]').forEach(function(row) {
        row.addEventListener('click', function() {
            var idx = parseInt(row.getAttribute('data-station-idx'), 10);
            var chosen = STATE.nearbyStations[idx];
            if (chosen) loadStationData(chosen);
        });
    });

    var loadMore = document.getElementById('station-load-more');
    if (loadMore) {
        loadMore.addEventListener('click', function() {
            STATE.stationShowCount += 20;
            // Force full re-render for load more
            stationsEl.innerHTML = '';
            renderStations(station, distUnit);
        });
    }
}

// ===== TIDE CURVE CHART =====

function initTideChart() {
    var wrap = document.getElementById('tide-chart-wrap');
    if (!wrap) return;
    var canvas = wrap.querySelector('canvas');
    var tooltip = wrap.querySelector('.tide-chart-tooltip');
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
        drawTideChart();
    }

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 100);
    });

    canvas.addEventListener('mousemove', function(e) { tideChartHover(e, wrap); });
    canvas.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
    });
    canvas.addEventListener('touchstart', function(e) {
        tideChartHover(e.touches[0], wrap);
    }, { passive: true });

    window.addEventListener('themechange', drawTideChart);
    resize();

    var expandBtn = document.getElementById('tide-chart-expand');
    if (expandBtn) {
        expandBtn.addEventListener('click', function() {
            openChartModal(STATE, drawTideChart, tideChartHover, 'Tide Predictions');
        });
    }
}

function drawTideChart() {
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

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 42 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartHourly;
    if (!data.length) {
        ctx.fillStyle = style.getPropertyValue('--text-dim').trim() || '#666';
        ctx.font = (12 * dpr) + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Hourly data unavailable for this station', w / 2, h / 2);
        return;
    }

    // Parse times and values
    var entries = data.map(function(d) {
        return { time: new Date(d.t).getTime(), value: parseFloat(d.v) };
    });

    // Y-axis range
    var minVal = Infinity;
    var maxVal = -Infinity;
    entries.forEach(function(e) {
        if (e.value < minVal) minVal = e.value;
        if (e.value > maxVal) maxVal = e.value;
    });
    var valPad = (maxVal - minVal) * 0.15;
    minVal = minVal - valPad;
    maxVal = maxVal + valPad;
    var valRange = maxVal - minVal;

    // Time range
    var tMin = entries[0].time;
    var tMax = entries[entries.length - 1].time;
    var tRange = tMax - tMin;
    if (tRange <= 0 || valRange <= 0) return;

    // Horizontal gridlines
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    var step = valRange <= 3 ? 0.5 : (valRange <= 6 ? 1 : 2);
    var firstGrid = Math.ceil(minVal / step) * step;
    for (var g = firstGrid; g <= maxVal; g += step) {
        var y = pad.top + plotH - ((g - minVal) / valRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(g.toFixed(1), pad.left - 6 * dpr, y);
    }

    // X-axis: day labels at midnight
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var labeledDays = {};
    entries.forEach(function(entry) {
        var d = new Date(entry.time);
        var dayKey = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
        if (!labeledDays[dayKey] && d.getHours() === 0) {
            labeledDays[dayKey] = true;
            var xPct = (entry.time - tMin) / tRange;
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

    // Build points
    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var xPct = (e.time - tMin) / tRange;
        var yPct = (e.value - minVal) / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;

        points.push({ cx: cx, cy: cy, value: e.value, time: e.time });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: e.value, time: e.time
        });
    }

    if (points.length < 2) return;

    // Fill under curve
    ctx.beginPath();
    ctx.moveTo(points[0].cx, pad.top + plotH);
    for (var i = 0; i < points.length; i++) {
        ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
    ctx.closePath();
    var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, '#06b6d4');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.1;
    ctx.fill();
    ctx.globalAlpha = 1;

    // Draw tide curve line
    ctx.beginPath();
    ctx.moveTo(points[0].cx, points[0].cy);
    for (var i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw H/L markers
    var hiLo = STATE.chartHiLo;
    ctx.font = 'bold ' + (9 * dpr) + 'px ' + FONT;
    ctx.textAlign = 'center';
    hiLo.forEach(function(p) {
        var ts = new Date(p.t).getTime();
        var val = parseFloat(p.v);
        if (ts < tMin || ts > tMax) return;
        var xPct = (ts - tMin) / tRange;
        var yPct = (val - minVal) / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        var color = tideColor(p.type);
        var label = p.type === 'H' ? 'H' : 'L';

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(cx, cy, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();

        ctx.textBaseline = p.type === 'H' ? 'bottom' : 'top';
        ctx.fillText(label, cx, cy + (p.type === 'H' ? -6 * dpr : 6 * dpr));
    });

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

function tideChartHover(e, wrap) {
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
        var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        var timeStr = days[d.getDay()] + ' ' + hr12 + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ampm;
        tooltip.innerHTML =
            '<span style="color:#06b6d4;font-weight:700">' + closest.value.toFixed(2) + ' ' + STATE.chartHeightUnit + '</span>' +
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

function tideDirection(predictions) {
    var now = Date.now();
    for (var i = 0; i < predictions.length; i++) {
        var t = new Date(predictions[i].t).getTime();
        if (t > now) {
            return predictions[i].type === 'H'
                ? { text: 'Rising', icon: 'fa-arrow-up', color: '#22c55e' }
                : { text: 'Falling', icon: 'fa-arrow-down', color: '#3b82f6' };
        }
    }
    return { text: '--', icon: 'fa-minus', color: '#555' };
}

function nextTide(predictions) {
    var now = Date.now();
    for (var i = 0; i < predictions.length; i++) {
        var t = new Date(predictions[i].t).getTime();
        if (t > now) {
            var diff = t - now;
            var h = Math.floor(diff / 3600000);
            var m = Math.floor((diff % 3600000) / 60000);
            return {
                type: predictions[i].type === 'H' ? 'High' : 'Low',
                value: parseFloat(predictions[i].v).toFixed(2),
                time: predictions[i].t,
                timeDisplay: formatTime(predictions[i].t),
                countdown: (h > 0 ? h + 'h ' : '') + m + 'm',
                color: tideColor(predictions[i].type)
            };
        }
    }
    return null;
}

function todaysTides(predictions) {
    var today = formatDate(new Date());
    return predictions.filter(function(p) {
        return p.t.substring(0, 10) === today;
    });
}

function groupByDay(predictions) {
    var groups = {};
    predictions.forEach(function(p) {
        var day = p.t.substring(0, 10);
        if (!groups[day]) groups[day] = [];
        groups[day].push(p);
    });
    return groups;
}

function tideColor(type) {
    return type === 'H' ? '#22c55e' : '#3b82f6';
}

function formatDate(date) {
    var y = date.getFullYear();
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return y + m + d;
}

function formatTime(dateStr) {
    var d = new Date(dateStr);
    var h = d.getHours();
    var m = String(d.getMinutes()).padStart(2, '0');
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + m + ' ' + ampm;
}

function formatDateLabel(dateStr) {
    var d = new Date(dateStr + 'T00:00:00');
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();
}

function shortenLocationName(displayName) {
    var parts = displayName.split(', ');
    if (parts.length >= 2) {
        return parts[0] + ', ' + parts[parts.length - 1];
    }
    return displayName;
}

function saveLocation(q, lat, lon, name, cc) {
    localStorage.setItem('ed_location', JSON.stringify({ q: q, lat: lat, lon: lon, name: name, cc: cc || '' }));
    if (window.updateLogoFlag) updateLogoFlag();
}

// ===== BOOT =====
document.addEventListener('DOMContentLoaded', init);
