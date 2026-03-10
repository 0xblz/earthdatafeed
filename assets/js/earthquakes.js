/**
 * Earthquakes Page
 * Fetches USGS earthquake data (24h feed + significant month)
 */

// ===== OPTIONS =====
var OPTIONS = {
    refreshInterval: 60000
};

// ===== SELECTORS =====
var SELECTORS = {
    content: '#eq-content'
};

// ===== STATE =====
var STATE = {
    refreshTimer: null,
    showCount: 10,
    allQuakes: [],
    sigQuakes: [],
    map: null,
    marker: null,
    chartCanvas: null,
    chartTooltip: null,
    chartQuakes: [],
    filterLat: null,
    filterLon: null,
    filterCity: null,
    sigShowCount: 10,
    activeChartTab: 'magnitude',
    activityRange: '24h',
    monthQuakes: []
};

// ===== INIT =====
function earthDataEarthquakes() {
    initMapModal();
    loadEarthquakeData();
    STATE.refreshTimer = setInterval(loadEarthquakeData, OPTIONS.refreshInterval);

    // Apply filter from URL on load
    var urlQ = new URLSearchParams(window.location.search).get('q');
    if (urlQ) filterEarthquakes(urlQ);

    // Scroll to earthquake on hash change (e.g. globe click)
    window.addEventListener('hashchange', function() {
        if (!location.hash) return;
        var id = location.hash.substring(1);
        var target = document.getElementById(id);
        if (!target && STATE.allQuakes.length > STATE.showCount) {
            for (var i = STATE.showCount; i < STATE.allQuakes.length; i++) {
                if (STATE.allQuakes[i].id === id.replace('eq-', '')) {
                    STATE.showCount = STATE.allQuakes.length;
                    renderQuakeList(STATE.allQuakes, STATE.allQuakes.length, isMetric());
                    target = document.getElementById(id);
                    break;
                }
            }
        }
        if (target) {
            target.style.background = 'var(--hover-bg)';
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    });
}

// ===== CORE FUNCTIONS =====

function loadEarthquakeData() {
    Promise.all([
        fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson').then(function(r) { return r.json(); }),
        fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson').then(function(r) { return r.json(); })
    ]).then(function(results) {
            var data = results[0];
            var monthData = results[1];
            var quakes = data.features || [];
            var sigQuakes = quakes.filter(function(q) {
                return (parseFloat(q.properties.mag) || 0) >= 4;
            });
            window.eqGlobeData = {
                quakes: quakes,
                sigQuakes: sigQuakes
            };
            STATE.monthQuakes = (monthData.features || []).filter(function(q) {
                return (q.properties.time || 0) > Date.now() - 30 * 86400000;
            });
            renderEarthquakes(data, { features: sigQuakes });
        }).catch(function() {
            document.querySelector(SELECTORS.content).innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load earthquake data.</div>';
        });
}

function renderEarthquakes(allDay, significant) {
    var quakes = allDay.features || [];
    var sigQuakes = (significant && significant.features) || [];

    // Sort by time descending
    quakes.sort(function(a, b) {
        return (b.properties.time || 0) - (a.properties.time || 0);
    });

    var total = quakes.length;
    var largest = 0;
    var magBuckets = { '0-1': 0, '1-2': 0, '2-3': 0, '3-4': 0, '4-5': 0, '5+': 0 };

    quakes.forEach(function(q) {
        var mag = parseFloat(q.properties.mag) || 0;
        if (mag > largest) largest = mag;
        if (mag >= 5) magBuckets['5+']++;
        else if (mag >= 4) magBuckets['4-5']++;
        else if (mag >= 3) magBuckets['3-4']++;
        else if (mag >= 2) magBuckets['2-3']++;
        else if (mag >= 1) magBuckets['1-2']++;
        else magBuckets['0-1']++;
    });

    var sigCount = sigQuakes.length;
    var metric = isMetric();

    var html = '';

    // Earthquake count hero
    html += '<div class="data-hero">';
    html += '<div class="data-hero-value c-blue">' + total + '</div>';
    html += '<div class="data-hero-label c-blue"><i class="fa-solid fa-hashtag"></i> Earthquakes (24h)</div>';
    html += '</div>';

    // Summary cards
    html += '<div class="card-grid">';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-arrow-up" style="color:' + magColor(largest) + '"></i></div>';
    html += '<div class="card-value" style="color:' + magColor(largest) + '">M ' + largest.toFixed(1) + '</div>';
    html += '<div class="card-label">Largest</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-triangle-exclamation c-red"></i></div>';
    html += '<div class="card-value c-red">' + sigCount + '</div>';
    html += '<div class="card-label">M4+ (24h)</div>';
    html += '</div>';
    html += '</div>';

    // Timeline chart
    html += '<div class="section-title"><i class="fa-solid fa-chart-line"></i> Timeline</div>';
    html += '<div class="chart-tabs" id="eq-chart-tabs">';
    html += '<button class="chart-tab' + (STATE.activeChartTab === 'magnitude' ? ' active' : '') + '" data-tab="magnitude">Magnitude</button>';
    html += '<button class="chart-tab' + (STATE.activeChartTab === 'activity' ? ' active' : '') + '" data-tab="activity">Activity</button>';
    html += '<div class="unit-toggle chart-range-toggle" id="eq-range-toggle">';
    html += '<div class="unit-slider" id="eq-range-slider"></div>';
    html += '<button class="unit-opt' + (STATE.activityRange === '24h' ? ' active' : '') + '" data-range="24h">24h</button>';
    html += '<button class="unit-opt' + (STATE.activityRange === '30d' ? ' active' : '') + '" data-range="30d">30d</button>';
    html += '</div>';
    html += '</div>';
    html += '<div class="eq-chart" id="eq-chart-wrap">';
    html += '<canvas></canvas>';
    html += '<div class="eq-chart-tooltip"></div>';
    html += '<button class="chart-expand-btn" id="eq-chart-expand" aria-label="Expand chart"><i class="fa-solid fa-expand"></i></button>';
    html += '</div>';

    // Magnitude badges
    html += '<div class="badges">';
    var bucketOrder = ['0-1', '1-2', '2-3', '3-4', '4-5', '5+'];
    bucketOrder.forEach(function(range) {
        var count = magBuckets[range];
        var colorMag = range === '5+' ? 5 : parseInt(range);
        html += '<div class="badge">';
        html += '<span class="label">M' + range + '</span>';
        html += '<span class="value" style="color:' + magColor(colorMag) + '">' + count + '</span>';
        html += '</div>';
    });
    html += '</div>';

    STATE.allQuakes = quakes;
    STATE.sigQuakes = sigQuakes;
    STATE.chartQuakes = quakes.filter(function(q) {
        return (q.properties.time || 0) > Date.now() - 86400000;
    });

    // Search form (right above the list)
    html += '<form class="search-form" method="get" autocomplete="off">';
    html += '<div class="search-wrap">';
    html += '<button type="submit"><i class="fa-solid fa-magnifying-glass"></i></button>';
    html += '<input type="text" name="q" id="q" placeholder="Filter by city or place...">';
    html += '<button type="button" class="search-clear" id="search-clear" aria-label="Clear search"><i class="fa-solid fa-xmark"></i></button>';
    html += '<div class="dropdown" id="ac-dropdown"></div>';
    html += '</div>';
    html += '</form>';

    html += '<div id="eq-list"></div>';

    document.querySelector(SELECTORS.content).innerHTML = html;

    // Re-init search after DOM replacement
    initEqSearch();

    initChart();

    renderSignificant(sigQuakes);
    renderQuakeList(quakes, total, metric);

    // Scroll to hash target on first render
    if (location.hash && !STATE.scrolled) {
        var hashId = location.hash.substring(1);
        var target = document.getElementById(hashId);
        if (!target && quakes.length > STATE.showCount) {
            for (var i = STATE.showCount; i < quakes.length; i++) {
                if (quakes[i].id === hashId.replace('eq-', '')) {
                    STATE.showCount = quakes.length;
                    renderQuakeList(quakes, total, metric);
                    target = document.getElementById(hashId);
                    break;
                }
            }
        }
        if (target) {
            STATE.scrolled = true;
            target.style.background = 'var(--hover-bg)';
            setTimeout(function() {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
        }
    }
}

function renderQuakeList(quakes, total, metric) {
    var html = '';
    var isFiltered = STATE.filterLat !== null;
    var listQuakes = quakes;
    var distances = {};

    if (isFiltered) {
        quakes.forEach(function(q) {
            var c = q.geometry && q.geometry.coordinates;
            if (c) distances[q.id] = haversine(STATE.filterLat, STATE.filterLon, c[1], c[0], metric);
        });
        listQuakes = quakes.slice().sort(function(a, b) {
            var da = distances[a.id] !== undefined ? distances[a.id] : Infinity;
            var db = distances[b.id] !== undefined ? distances[b.id] : Infinity;
            return da - db;
        });
    }

    // Section title
    html += '<div class="section-title">';
    if (isFiltered) {
        html += '<i class="fa-solid fa-location-crosshairs"></i> Nearest to ' + esc(STATE.filterCity);
    } else {
        html += '<i class="fa-solid fa-list"></i> Recent Earthquakes';
    }
    html += '<span class="section-title-meta">' + total + ' events / 24h</span>';
    html += '</div>';

    if (listQuakes.length === 0) {
        html += '<div class="empty"><i class="fa-solid fa-check"></i> No earthquakes detected</div>';
    } else {
        var visible = listQuakes.slice(0, STATE.showCount);
        var unit = metric ? ' km' : ' mi';
        visible.forEach(function(q) {
            var mag = parseFloat(q.properties.mag) || 0;
            var place = convertPlace(q.properties.place || 'Unknown location', metric);
            var ts = q.properties.time || 0;
            var color = magColor(mag);
            var coords = q.geometry && q.geometry.coordinates;
            var lat = coords ? coords[1] : null;
            var lng = coords ? coords[0] : null;
            var coordAttrs = (lat !== null && lng !== null)
                ? ' data-lat="' + lat + '" data-lng="' + lng + '" data-mag="' + mag.toFixed(1) + '" style="cursor:pointer"'
                : '';
            var meta = relativeTime(ts);
            if (isFiltered && distances[q.id] !== undefined) {
                meta = Math.round(distances[q.id]) + unit + ' · ' + meta;
            }

            var isRecent = ts > Date.now() - RECENT_QUAKE_MS;
            html += '<div class="row" id="eq-' + q.id + '"' + coordAttrs + '>';
            html += '<div class="row-icon"><i class="fa-solid fa-circle' + (isRecent ? ' eq-pulse' : '') + '" style="color:' + color + '; font-size:0.5rem"></i></div>';
            html += '<div class="row-label" style="color:' + color + '">M ' + mag.toFixed(1) + '</div>';
            html += '<div class="row-text">' + esc(place) + '</div>';
            html += '<div class="row-meta">' + meta + '</div>';
            html += '</div>';
        });

        if (listQuakes.length > STATE.showCount) {
            html += '<div class="load-more" id="eq-load-more">Load more (' + (listQuakes.length - STATE.showCount) + ' remaining)</div>';
        }
    }

    document.getElementById('eq-list').innerHTML = html;

    var loadMore = document.getElementById('eq-load-more');
    if (loadMore) {
        loadMore.addEventListener('click', function() {
            STATE.showCount += 10;
            renderQuakeList(quakes, total, metric);
        });
    }
}

// ===== HELPER FUNCTIONS =====

function magColor(mag) {
    if (mag >= 6) return '#ef4444';
    if (mag >= 5) return '#f97316';
    if (mag >= 4) return '#f59e0b';
    if (mag >= 3) return '#eab308';
    if (mag >= 2) return '#06b6d4';
    return '#22c55e';
}

function convertPlace(place, metric) {
    if (metric) return place;
    return place.replace(/(\d+)\s*km\b/g, function(match, km) {
        return Math.round(parseInt(km) * 0.621371) + ' mi';
    });
}

// ===== SIGNIFICANT LIST (right column, under globe) =====

function renderSignificant(sigQuakes) {
    var el = document.getElementById('eq-significant');
    if (!el) return;

    var metric = isMetric();
    var html = '<div class="section-title"><i class="fa-solid fa-triangle-exclamation"></i> M4+ Earthquakes<span class="section-title-meta">' + sigQuakes.length + ' events / 24h</span></div>';

    if (!sigQuakes.length) {
        html += '<div class="empty"><i class="fa-solid fa-check"></i> No significant earthquakes</div>';
    } else {
        var sorted = sigQuakes.slice().sort(function(a, b) {
            return (b.properties.time || 0) - (a.properties.time || 0);
        });
        var visible = sorted.slice(0, STATE.sigShowCount);

        visible.forEach(function(q) {
            var mag = parseFloat(q.properties.mag) || 0;
            var place = convertPlace(q.properties.place || 'Unknown location', metric);
            var ts = q.properties.time || 0;
            var color = magColor(mag);
            var coords = q.geometry && q.geometry.coordinates;
            var lat = coords ? coords[1] : null;
            var lng = coords ? coords[0] : null;
            var coordAttrs = (lat !== null && lng !== null)
                ? ' data-lat="' + lat + '" data-lng="' + lng + '" data-mag="' + mag.toFixed(1) + '" style="cursor:pointer"'
                : '';
            var isRecent = ts > Date.now() - RECENT_QUAKE_MS;

            html += '<div class="row" id="eq-' + q.id + '"' + coordAttrs + '>';
            html += '<div class="row-icon"><i class="fa-solid fa-circle' + (isRecent ? ' eq-pulse' : '') + '" style="color:' + color + '; font-size:0.5rem"></i></div>';
            html += '<div class="row-label" style="color:' + color + '">M ' + mag.toFixed(1) + '</div>';
            html += '<div class="row-text">' + esc(place) + '</div>';
            html += '<div class="row-meta">' + relativeTime(ts) + '</div>';
            html += '</div>';
        });

        if (sorted.length > STATE.sigShowCount) {
            html += '<div class="load-more" id="sig-load-more">Load more (' + (sorted.length - STATE.sigShowCount) + ' remaining)</div>';
        }
    }

    el.innerHTML = html;

    var loadMore = document.getElementById('sig-load-more');
    if (loadMore) {
        loadMore.addEventListener('click', function() {
            STATE.sigShowCount += 10;
            renderSignificant(STATE.sigQuakes);
        });
    }
}

// ===== FILTER =====

function filterEarthquakes(q, coords) {
    if (coords) {
        STATE.filterLat = coords.lat;
        STATE.filterLon = coords.lon;
        STATE.filterCity = q;
        STATE.showCount = 10;
        if (STATE.allQuakes.length) {
            renderQuakeList(STATE.allQuakes, STATE.allQuakes.length, isMetric());
        }
    } else {
        // Geocode the query then filter
        fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(q) + '&format=json&limit=1')
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.length) {
                    filterEarthquakes(q, { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) });
                }
            }).catch(function() {});
    }
}

function clearEarthquakeFilter() {
    STATE.filterLat = null;
    STATE.filterLon = null;
    STATE.filterCity = null;
    STATE.showCount = 10;
    if (STATE.allQuakes.length) {
        renderQuakeList(STATE.allQuakes, STATE.allQuakes.length, isMetric());
    }
    if (STATE.sigQuakes.length) {
        renderSignificant(STATE.sigQuakes);
    }
}

function initEqSearch() {
    var input = document.getElementById('q');
    if (!input) return;
    // Restore current filter value into the new input
    if (STATE.filterCity) {
        input.value = STATE.filterCity;
    } else {
        var urlQ = new URLSearchParams(window.location.search).get('q');
        if (urlQ) input.value = urlQ;
    }
    earthDataSearch({
        path: '/earthquakes',
        onSelect: function(q, coords) {
            filterEarthquakes(q, coords);
        },
        onClear: function() {
            clearEarthquakeFilter();
        }
    });
}

// ===== TIMELINE CHART =====

function initChart() {
    var wrap = document.getElementById('eq-chart-wrap');
    if (!wrap) return;
    var canvas = wrap.querySelector('canvas');
    var tooltip = wrap.querySelector('.eq-chart-tooltip');
    if (!canvas || !tooltip) return;

    STATE.chartCanvas = canvas;
    STATE.chartTooltip = tooltip;

    // Tab switching
    var tabs = document.getElementById('eq-chart-tabs');
    var rangeToggle = document.getElementById('eq-range-toggle');
    if (tabs) {
        tabs.addEventListener('click', function(e) {
            var btn = e.target.closest('.chart-tab');
            if (!btn) return;
            tabs.querySelectorAll('.chart-tab').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            STATE.activeChartTab = btn.getAttribute('data-tab');
            STATE.chartDots = [];
            tooltip.style.display = 'none';
            drawChart();
        });
    }
    var rangeSlider = document.getElementById('eq-range-slider');
    function positionRangeSlider() {
        if (!rangeToggle || !rangeSlider) return;
        var active = rangeToggle.querySelector('.unit-opt[data-range="' + STATE.activityRange + '"]');
        if (active) {
            rangeSlider.style.left = active.offsetLeft + 'px';
            rangeSlider.style.width = active.offsetWidth + 'px';
        }
    }
    if (rangeToggle) {
        rangeToggle.addEventListener('click', function(e) {
            var btn = e.target.closest('.unit-opt');
            if (!btn) return;
            rangeToggle.querySelectorAll('.unit-opt').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            STATE.activityRange = btn.getAttribute('data-range');
            positionRangeSlider();
            STATE.chartDots = [];
            tooltip.style.display = 'none';
            drawChart();
        });
    }

    var dpr = window.devicePixelRatio || 1;
    function resize() {
        var rect = wrap.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        drawChart();
    }

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 100);
    });

    canvas.addEventListener('mousemove', function(e) { chartHover(e, wrap); });
    canvas.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
    });
    canvas.addEventListener('touchstart', function(e) {
        chartHover(e.touches[0], wrap);
    }, { passive: true });

    window.addEventListener('themechange', drawChart);
    resize();
    positionRangeSlider();

    var expandBtn = document.getElementById('eq-chart-expand');
    if (expandBtn) {
        expandBtn.addEventListener('click', function() {
            openChartModal(STATE, drawChart, chartHover, 'Earthquake Timeline');
        });
    }
}

function drawChart() {
    var is30d = STATE.activityRange === '30d';
    if (STATE.activeChartTab === 'activity') {
        is30d ? drawActivity30dChart() : drawActivityChart();
        return;
    }
    drawMagnitudeChart(is30d);
}

function drawMagnitudeChart(is30d) {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    // Get theme colors from computed styles
    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 36 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var now = Date.now();
    var timeSpan = is30d ? 30 * 86400000 : 86400000;
    var tStart = now - timeSpan;

    var quakes = is30d ? STATE.monthQuakes : STATE.chartQuakes;

    // Determine y-axis range
    var maxMag = 2;
    quakes.forEach(function(q) {
        var m = parseFloat(q.properties.mag) || 0;
        if (m > maxMag) maxMag = m;
    });
    maxMag = Math.ceil(maxMag + 0.5);
    if (maxMag < 4) maxMag = 4;

    // Draw horizontal gridlines + y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var m = 0; m <= maxMag; m++) {
        var y = pad.top + plotH - (m / maxMag) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText('M' + m, pad.left - 6 * dpr, y);
    }

    // Draw vertical gridlines + x-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if (is30d) {
        for (var day = 0; day <= 30; day += 5) {
            var x = pad.left + (day / 30) * plotW;
            if (day > 0 && day < 30) {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = dpr;
                ctx.beginPath();
                ctx.moveTo(x, pad.top);
                ctx.lineTo(x, pad.top + plotH);
                ctx.stroke();
            }
            ctx.fillStyle = textDim;
            var label = day === 0 ? '30d' : day === 30 ? 'now' : (30 - day) + 'd';
            ctx.fillText(label, x, pad.top + plotH + 8 * dpr);
        }
    } else {
        for (var hr = 0; hr <= 24; hr += 4) {
            var t = now - (24 - hr) * 3600000;
            var x = pad.left + (hr / 24) * plotW;
            if (hr > 0 && hr < 24) {
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = dpr;
                ctx.beginPath();
                ctx.moveTo(x, pad.top);
                ctx.lineTo(x, pad.top + plotH);
                ctx.stroke();
            }
            ctx.fillStyle = textDim;
            var d = new Date(t);
            var hr12 = d.getHours() % 12 || 12;
            var ampm = d.getHours() >= 12 ? 'pm' : 'am';
            ctx.fillText(hr12 + ampm, x, pad.top + plotH + 8 * dpr);
        }
    }

    // Plot earthquake dots (oldest first so newest render on top)
    var sorted = quakes.slice().sort(function(a, b) {
        return (a.properties.time || 0) - (b.properties.time || 0);
    });

    // Store positions for hover detection
    STATE.chartDots = [];

    sorted.forEach(function(q) {
        var mag = parseFloat(q.properties.mag) || 0;
        var ts = q.properties.time || 0;
        if (ts < tStart || ts > now) return;

        var xPct = (ts - tStart) / timeSpan;
        var yPct = mag / maxMag;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        var r = (is30d ? (1.5 + mag * 0.8) : (2.5 + mag * 1.2)) * dpr;
        var color = magColor(mag);

        ctx.globalAlpha = is30d ? 0.5 : 0.7;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.globalAlpha = 1;

        STATE.chartDots.push({
            x: cx / dpr, y: cy / dpr, r: r / dpr + 4,
            mag: mag, place: q.properties.place || 'Unknown', time: q.properties.time
        });
    });

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

function drawActivityChart() {
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

    var now = Date.now();
    var t24h = now - 86400000;

    // Bucket earthquakes into 24 one-hour intervals
    var buckets = [];
    for (var i = 0; i < 24; i++) buckets[i] = 0;

    STATE.chartQuakes.forEach(function(q) {
        var ts = q.properties.time || 0;
        if (ts < t24h || ts > now) return;
        var bucket = Math.floor((ts - t24h) / 3600000);
        if (bucket >= 24) bucket = 23;
        buckets[bucket]++;
    });

    // Determine y-axis range
    var maxCount = 1;
    buckets.forEach(function(c) { if (c > maxCount) maxCount = c; });
    maxCount = Math.ceil(maxCount * 1.2);
    if (maxCount < 4) maxCount = 4;

    // Determine nice y-axis step
    var yStep;
    if (maxCount <= 5) yStep = 1;
    else if (maxCount <= 12) yStep = 2;
    else if (maxCount <= 30) yStep = 5;
    else yStep = Math.ceil(maxCount / 6 / 5) * 5;

    // Draw horizontal gridlines + y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var v = 0; v <= maxCount; v += yStep) {
        var y = pad.top + plotH - (v / maxCount) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(v, pad.left - 6 * dpr, y);
    }

    // Draw vertical gridlines + x-axis labels (every 4h)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var hr = 0; hr <= 24; hr += 4) {
        var t = now - (24 - hr) * 3600000;
        var x = pad.left + (hr / 24) * plotW;
        if (hr > 0 && hr < 24) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotH);
            ctx.stroke();
        }
        ctx.fillStyle = textDim;
        var d = new Date(t);
        var hr12 = d.getHours() % 12 || 12;
        var ampm = d.getHours() >= 12 ? 'pm' : 'am';
        ctx.fillText(hr12 + ampm, x, pad.top + plotH + 8 * dpr);
    }

    // Build line points (center of each hour bucket)
    var points = [];
    STATE.chartDots = [];
    for (var b = 0; b < 24; b++) {
        var xPct = (b + 0.5) / 24;
        var yPct = buckets[b] / maxCount;
        var px = pad.left + xPct * plotW;
        var py = pad.top + plotH - yPct * plotH;
        points.push({ x: px, y: py, count: buckets[b], bucket: b });
        // Store for hover detection
        var bucketStart = t24h + b * 3600000;
        STATE.chartDots.push({
            x: px / dpr, y: py / dpr, bucket: b,
            count: buckets[b], bucketStart: bucketStart
        });
    }

    if (points.length === 0) return;

    // Draw filled area under the line
    var lineColor = '#06b6d4';
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + plotH);
    points.forEach(function(p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(points[points.length - 1].x, pad.top + plotH);
    ctx.closePath();

    var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw the line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var p = 1; p < points.length; p++) {
        ctx.lineTo(points[p].x, points[p].y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2 * dpr;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw dots on line
    points.forEach(function(pt) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();
    });

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

function drawActivity30dChart() {
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

    var now = Date.now();
    var t30d = now - 30 * 86400000;

    // Bucket earthquakes into 30 one-day intervals
    var buckets = [];
    for (var i = 0; i < 30; i++) buckets[i] = 0;

    STATE.monthQuakes.forEach(function(q) {
        var ts = q.properties.time || 0;
        if (ts < t30d || ts > now) return;
        var bucket = Math.floor((ts - t30d) / 86400000);
        if (bucket >= 30) bucket = 29;
        buckets[bucket]++;
    });

    // Determine y-axis range
    var maxCount = 1;
    buckets.forEach(function(c) { if (c > maxCount) maxCount = c; });
    maxCount = Math.ceil(maxCount * 1.2);
    if (maxCount < 4) maxCount = 4;

    // Determine nice y-axis step
    var yStep;
    if (maxCount <= 5) yStep = 1;
    else if (maxCount <= 12) yStep = 2;
    else if (maxCount <= 50) yStep = 5;
    else if (maxCount <= 200) yStep = 20;
    else if (maxCount <= 500) yStep = 50;
    else yStep = Math.ceil(maxCount / 6 / 100) * 100;

    // Draw horizontal gridlines + y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var v = 0; v <= maxCount; v += yStep) {
        var y = pad.top + plotH - (v / maxCount) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(v, pad.left - 6 * dpr, y);
    }

    // Draw vertical gridlines + x-axis labels (every 5 days)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (var day = 0; day <= 30; day += 5) {
        var x = pad.left + (day / 30) * plotW;
        if (day > 0 && day < 30) {
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = dpr;
            ctx.beginPath();
            ctx.moveTo(x, pad.top);
            ctx.lineTo(x, pad.top + plotH);
            ctx.stroke();
        }
        ctx.fillStyle = textDim;
        var label = day === 0 ? '30d' : day === 30 ? 'now' : (30 - day) + 'd';
        ctx.fillText(label, x, pad.top + plotH + 8 * dpr);
    }

    // Build line points (center of each day bucket)
    var points = [];
    STATE.chartDots = [];
    for (var b = 0; b < 30; b++) {
        var xPct = (b + 0.5) / 30;
        var yPct = buckets[b] / maxCount;
        var px = pad.left + xPct * plotW;
        var py = pad.top + plotH - yPct * plotH;
        points.push({ x: px, y: py, count: buckets[b], bucket: b });
        var bucketStart = t30d + b * 86400000;
        STATE.chartDots.push({
            x: px / dpr, y: py / dpr, bucket: b,
            count: buckets[b], bucketStart: bucketStart, type: '30d'
        });
    }

    if (points.length === 0) return;

    // Draw filled area under the line
    var lineColor = '#06b6d4';
    ctx.beginPath();
    ctx.moveTo(points[0].x, pad.top + plotH);
    points.forEach(function(p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(points[points.length - 1].x, pad.top + plotH);
    ctx.closePath();

    var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
    grad.addColorStop(0, 'rgba(6, 182, 212, 0.3)');
    grad.addColorStop(1, 'rgba(6, 182, 212, 0)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw the line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (var p = 1; p < points.length; p++) {
        ctx.lineTo(points[p].x, points[p].y);
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2 * dpr;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Draw dots on line
    points.forEach(function(pt) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3 * dpr, 0, Math.PI * 2);
        ctx.fillStyle = lineColor;
        ctx.fill();
    });

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

function chartHover(e, wrap) {
    var tooltip = STATE.chartTooltip;
    if (!tooltip || !STATE.chartDots) return;

    var rect = STATE.chartCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    if (STATE.activeChartTab === 'activity') {
        // Snap to closest bucket by x position
        var closest = null;
        var closestDist = Infinity;
        var snapDist = STATE.activityRange === '30d' ? 20 : 30;
        STATE.chartDots.forEach(function(dot) {
            var dx = Math.abs(mx - dot.x);
            if (dx < closestDist) {
                closest = dot;
                closestDist = dx;
            }
        });

        if (closest && closestDist < snapDist) {
            var timeLabel;
            if (STATE.activityRange === '30d') {
                var dayDate = new Date(closest.bucketStart);
                var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                timeLabel = months[dayDate.getMonth()] + ' ' + dayDate.getDate();
            } else {
                var startD = new Date(closest.bucketStart);
                var endD = new Date(closest.bucketStart + 3600000);
                function fmtHr(d) {
                    var h = d.getHours() % 12 || 12;
                    var ap = d.getHours() >= 12 ? 'pm' : 'am';
                    return h + ap;
                }
                timeLabel = fmtHr(startD) + ' – ' + fmtHr(endD);
            }
            tooltip.innerHTML =
                '<span style="color:#06b6d4;font-weight:700">' + closest.count + ' earthquake' + (closest.count !== 1 ? 's' : '') + '</span>' +
                '<br><span style="color:var(--text-muted);font-size:0.6rem">' + timeLabel + '</span>';
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
        return;
    }

    var closest = null;
    var closestDist = Infinity;
    STATE.chartDots.forEach(function(dot) {
        var dx = mx - dot.x;
        var dy = my - dot.y;
        var dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < dot.r && dist < closestDist) {
            closest = dot;
            closestDist = dist;
        }
    });

    if (closest) {
        var metric = isMetric();
        var place = convertPlace(closest.place, metric);
        var d = new Date(closest.time);
        var hr12 = d.getHours() % 12 || 12;
        var ampm = d.getHours() >= 12 ? 'PM' : 'AM';
        var timeStr = hr12 + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ampm;
        tooltip.innerHTML =
            '<span style="color:' + magColor(closest.mag) + ';font-weight:700">M ' + closest.mag.toFixed(1) + '</span> ' +
            esc(place) +
            '<br><span style="color:var(--text-muted);font-size:0.6rem">' + timeStr + '</span>';
        tooltip.style.display = 'block';

        // Position tooltip
        var wrapRect = wrap.getBoundingClientRect();
        var tx = e.clientX - wrapRect.left + 12;
        var ty = e.clientY - wrapRect.top - 10;
        // Keep tooltip in bounds
        if (tx + 180 > wrapRect.width) tx = e.clientX - wrapRect.left - 180;
        if (ty < 0) ty = 10;
        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
    } else {
        tooltip.style.display = 'none';
    }
}

// ===== MAP MODAL =====

function initMapModal() {
    var modal = document.createElement('div');
    modal.className = 'lightbox';
    modal.id = 'eq-map-modal';
    modal.innerHTML =
        '<div class="map-panel" id="eq-map-panel">' +
            '<div class="map-panel-header">' +
                '<span class="map-panel-mag" id="eq-map-mag"></span>' +
                '<span class="map-panel-place" id="eq-map-place"></span>' +
                '<button class="map-panel-close" id="eq-map-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="map-panel-map" id="eq-map"></div>' +
        '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', closeEqMap);
    document.getElementById('eq-map-panel').addEventListener('click', function(e) { e.stopPropagation(); });
    document.getElementById('eq-map-close').addEventListener('click', closeEqMap);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeEqMap(); });

    function handleRowClick(e) {
        var row = e.target.closest('[data-lat]');
        if (!row) return;
        var place = row.querySelector('.row-text') ? row.querySelector('.row-text').textContent : '';
        openEqMap(parseFloat(row.dataset.lat), parseFloat(row.dataset.lng), row.dataset.mag, place);
    }

    document.querySelector(SELECTORS.content).addEventListener('click', handleRowClick);
    var sigEl = document.getElementById('eq-significant');
    if (sigEl) sigEl.addEventListener('click', handleRowClick);
}

function openEqMap(lat, lng, mag, place) {
    var modal = document.getElementById('eq-map-modal');
    var magEl = document.getElementById('eq-map-mag');
    magEl.textContent = 'M ' + mag;
    magEl.style.color = magColor(parseFloat(mag));
    document.getElementById('eq-map-place').textContent = place;
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';

    setTimeout(function() {
        if (!STATE.map) {
            STATE.map = L.map('eq-map', { zoomControl: true }).setView([lat, lng], 7);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
                maxZoom: 18
            }).addTo(STATE.map);
        } else {
            STATE.map.setView([lat, lng], 7);
        }

        if (STATE.marker) STATE.map.removeLayer(STATE.marker);
        var color = magColor(parseFloat(mag));
        STATE.marker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: '',
                html: '<div style="width:14px;height:14px;border-radius:50%;background:' + color + ';border:2px solid rgba(255,255,255,0.5);box-shadow:0 0 10px ' + color + '"></div>',
                iconSize: [14, 14],
                iconAnchor: [7, 7]
            })
        }).addTo(STATE.map);

        STATE.map.invalidateSize();
    }, 50);
}

function closeEqMap() {
    var modal = document.getElementById('eq-map-modal');
    if (modal) modal.classList.remove('open');
    document.body.style.overflow = '';
}
