/**
 * Aurora Page
 * Fetches NOAA SWPC aurora data: Kp index, G-scale, Bz, hemispheric power
 */

// ===== OPTIONS =====
var OPTIONS = {
    refreshInterval: 60000
};

// ===== SELECTORS =====
var SELECTORS = {
    content: '#aurora-content',
    kpHistory: '#aurora-kp-history'
};

// ===== STATE =====
var STATE = {
    refreshTimer: null,
    kpShowCount: 24,
    chartCanvas: null,
    chartTooltip: null,
    chartBars: [],
    chartKpData: [],
    forecastHtml: ''
};

// ===== INIT =====
function earthDataAurora() {
    loadAuroraData();
    STATE.refreshTimer = setInterval(loadAuroraData, OPTIONS.refreshInterval);
}

// ===== CORE FUNCTIONS =====

function loadAuroraData() {
    var urls = {
        kp: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
        scales: 'https://services.swpc.noaa.gov/products/noaa-scales.json',
        mag: 'https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json',
        plasma: 'https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json',
        hp: 'https://services.swpc.noaa.gov/text/aurora-nowcast-hemi-power.txt'
    };

    Promise.all([
        fetch(urls.kp).then(function(r) { return r.json(); }).catch(function() { return []; }),
        fetch(urls.scales).then(function(r) { return r.json(); }).catch(function() { return {}; }),
        fetch(urls.mag).then(function(r) { return r.json(); }).catch(function() { return []; }),
        fetch(urls.plasma).then(function(r) { return r.json(); }).catch(function() { return []; }),
        fetch(urls.hp).then(function(r) { return r.text(); }).then(parseHemiPower).catch(function() { return []; })
    ]).then(function(data) {
        renderAurora(data[0], data[1], data[2], data[3], data[4]);
    }).catch(function() {
        document.querySelector(SELECTORS.content).innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load aurora data.</div>';
        document.querySelector(SELECTORS.kpHistory).innerHTML = '';
    });
}

function renderAurora(kpData, scales, mag, plasma, hp) {
    var currentKp = getCurrentKp(kpData);
    var kpNum = currentKp !== null ? currentKp : 0;

    var gScale = parseInt(scales['0'].G.Scale) || 0;
    var bz = getBz(mag);
    var bzNum = bz !== '--' ? parseFloat(bz) : 0;
    var bt = getBt(mag);
    var wind = getSolarWind(plasma);
    var hpNorth = getHemisphericPower(hp);

    var forecast = getForecast(scales);
    var kpHistory = getKpHistory(kpData);
    var visibility = auroraVisibility(kpNum);

    var html = '';

    // Kp Index hero
    html += '<div class="data-banner data-banner-aurora">';
    html += '<div class="data-banner-content">';
    html += '<div class="data-hero-value">' + (currentKp !== null ? currentKp.toFixed(1) : '--') + '</div>';
    html += '<div class="data-hero-label"><i class="fa-solid fa-magnet"></i> Kp Index</div>';
    html += '<div class="data-hero-sub" style="color:rgba(255,255,255,0.6)">' + kpDescription(kpNum) + '</div>';
    html += '</div>';
    html += '</div>';

    // Current conditions
    html += '<div class="card-grid">';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-globe" style="color:' + (gScale >= 3 ? '#ef4444' : (gScale >= 1 ? '#f59e0b' : '#22c55e')) + '"></i></div>';
    html += '<div class="card-value level-' + Math.min(gScale, 5) + '">G' + gScale + '</div>';
    html += '<div class="card-label">Geomagnetic</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-arrow-down-long bz-arrow" style="color:' + bzColor(bzNum) + '"></i></div>';
    html += '<div class="card-value" style="color:' + bzColor(bzNum) + '">' + bz + ' <small style="font-size:0.6rem">nT</small></div>';
    html += '<div class="card-label">Bz (IMF)</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-bolt" style="color:' + hpLevel(typeof hpNorth === 'number' ? hpNorth : 0) + '"></i></div>';
    html += '<div class="card-value" style="color:' + hpLevel(typeof hpNorth === 'number' ? hpNorth : 0) + '">' + hpNorth + '</div>';
    html += '<div class="card-label">Power (GW)</div>';
    html += '</div>';
    html += '</div>';

    // Solar wind badges
    html += '<div class="badges">';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-wind c-cyan"></i>';
    html += '<span class="label">Solar Wind</span>';
    html += '<span class="value c-cyan">' + wind.speed + ' km/s</span>';
    html += '</div>';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-atom c-purple"></i>';
    html += '<span class="label">Density</span>';
    html += '<span class="value c-purple">' + wind.density + ' p/cm&sup3;</span>';
    html += '</div>';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-circle-dot c-blue"></i>';
    html += '<span class="label">Bt</span>';
    html += '<span class="value c-blue">' + bt + ' nT</span>';
    html += '</div>';
    html += '</div>';

    // Kp bar chart
    STATE.chartKpData = kpData.length > 1 ? kpData.slice(1) : [];
    html += '<div class="aurora-chart" id="aurora-chart-wrap">';
    html += '<canvas></canvas>';
    html += '<div class="aurora-chart-tooltip"></div>';
    html += '<button class="chart-expand-btn" id="aurora-chart-expand" aria-label="Expand chart"><i class="fa-solid fa-expand"></i></button>';
    html += '</div>';

    // Aurora visibility
    html += '<div class="section-title" id="visibility"><i class="fa-solid fa-eye"></i> Aurora Visibility</div>';
    html += '<div class="visibility-box">';
    html += '<div class="visibility-header">';
    html += '<i class="fa-solid fa-location-crosshairs ' + visibility.class + '"></i>';
    html += '<span class="visibility-value ' + visibility.class + '">' + visibility.label + '</span>';
    html += '<span class="visibility-label" style="margin-left:auto">' + kpDescription(kpNum) + '</span>';
    html += '</div>';
    html += '<div class="visibility-detail"><i class="fa-solid fa-compass"></i> Visible to ~' + visibility.lat + ' latitude</div>';
    html += '<div class="visibility-detail"><i class="fa-solid fa-map-location-dot"></i> ' + visibility.locations + '</div>';
    html += '<div class="visibility-detail"><i class="fa-solid fa-arrow-down-long"></i> Bz ' + (bzNum < 0 ? 'southward — favorable for aurora' : 'northward — less favorable for aurora') + '</div>';
    html += '</div>';

    document.querySelector(SELECTORS.content).innerHTML = html;

    // 3-day forecast (right column, above Kp history)
    var forecastHtml = '';
    forecastHtml += '<div class="section-title"><i class="fa-solid fa-calendar-days"></i> 3-Day Forecast</div>';
    forecast.forEach(function(day) {
        var gScale = day.gScale;
        var dateLabel = formatDateLabel(day.date);
        var estKp = gScale >= 5 ? 9 : (gScale >= 4 ? 8 : (gScale >= 3 ? 7 : (gScale >= 2 ? 6 : (gScale >= 1 ? 5 : 2))));
        var dayVis = auroraVisibility(estKp);
        var details = (gScale > 0 ? day.gText : 'No Storm') + ' · Visible ~' + dayVis.lat;

        forecastHtml += '<div class="row row-wrap">';
        forecastHtml += '<div class="row-icon"><i class="fa-solid fa-star level-' + Math.min(gScale, 5) + '"></i></div>';
        forecastHtml += '<div class="row-label">' + dateLabel + '</div>';
        forecastHtml += '<div class="row-text right level-' + Math.min(gScale, 5) + '">G' + gScale + '</div>';
        forecastHtml += '<div class="row-detail">' + details + '</div>';
        forecastHtml += '</div>';
    });

    STATE.forecastHtml = forecastHtml;

    initAuroraChart();
    renderKpHistory(kpHistory);

    if (location.hash && !STATE.scrolled) {
        var hashId = location.hash.substring(1);
        var target = document.getElementById(hashId);
        if (!target && hashId.indexOf('kp-') === 0 && kpHistory.length > STATE.kpShowCount) {
            STATE.kpShowCount = kpHistory.length;
            renderKpHistory(kpHistory);
            target = document.getElementById(hashId);
        }
        if (target) {
            STATE.scrolled = true;
            if (hashId.indexOf('kp-') === 0) {
                target.style.background = 'var(--hover-bg)';
            }
            setTimeout(function() {
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 50);
        }
    }
}

function renderKpHistory(kpHistory) {
    var kpHtml = STATE.forecastHtml || '';
    kpHtml += '<div class="section-title" id="kp-history">';
    kpHtml += '<i class="fa-solid fa-chart-line"></i> Kp Index History';
    kpHtml += '<span class="c-muted" style="margin-left:auto; font-size:0.65rem">' + kpHistory.length + ' readings</span>';
    kpHtml += '</div>';

    if (kpHistory.length === 0) {
        kpHtml += '<div class="empty"><i class="fa-solid fa-circle-exclamation"></i> No Kp data available</div>';
    } else {
        var visible = kpHistory.slice(0, STATE.kpShowCount);
        visible.forEach(function(entry) {
            var kp = entry.kp;
            var color = kpColor(kp);
            var time = entry.time;
            var ts = time ? new Date(time).getTime() : 0;
            var timeDisplay = time ? formatDateTime(time) : '';
            var rel = time ? relativeTimeFromDate(time) : '';

            kpHtml += '<div class="row" id="kp-' + ts + '">';
            kpHtml += '<div class="row-icon"><i class="fa-solid fa-circle" style="color:' + color + '; font-size:0.5rem"></i></div>';
            kpHtml += '<div class="row-label" style="color:' + color + '">Kp ' + kp.toFixed(1) + '</div>';
            kpHtml += '<div class="row-text">' + timeDisplay + '</div>';
            kpHtml += '<div class="row-meta">' + rel + '</div>';
            kpHtml += '</div>';
        });

        if (kpHistory.length > STATE.kpShowCount) {
            kpHtml += '<div class="load-more" id="kp-load-more">Load more (' + (kpHistory.length - STATE.kpShowCount) + ' remaining)</div>';
        }
    }

    document.querySelector(SELECTORS.kpHistory).innerHTML = kpHtml;

    var loadMore = document.getElementById('kp-load-more');
    if (loadMore) {
        loadMore.addEventListener('click', function() {
            STATE.kpShowCount += 24;
            renderKpHistory(kpHistory);
        });
    }
}

// ===== KP BAR CHART =====

function initAuroraChart() {
    var wrap = document.getElementById('aurora-chart-wrap');
    if (!wrap) return;
    var canvas = wrap.querySelector('canvas');
    var tooltip = wrap.querySelector('.aurora-chart-tooltip');
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
        drawAuroraChart();
    }

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 100);
    });

    canvas.addEventListener('mousemove', function(e) { auroraChartHover(e, wrap); });
    canvas.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
    });
    canvas.addEventListener('touchstart', function(e) {
        auroraChartHover(e.touches[0], wrap);
    }, { passive: true });

    window.addEventListener('themechange', drawAuroraChart);
    resize();

    var expandBtn = document.getElementById('aurora-chart-expand');
    if (expandBtn) {
        expandBtn.addEventListener('click', function() {
            openChartModal(STATE, drawAuroraChart, auroraChartHover, 'Kp Index');
        });
    }
}

function drawAuroraChart() {
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

    var data = STATE.chartKpData;
    if (!data.length) return;

    var maxKp = 9;

    // Horizontal gridlines + y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    var kpLines = [0, 3, 5, 7, 9];
    kpLines.forEach(function(kp) {
        var y = pad.top + plotH - (kp / maxKp) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(kp, pad.left - 6 * dpr, y);
    });

    // Storm threshold label at Kp 5
    var stormY = pad.top + plotH - (5 / maxKp) * plotH;
    ctx.strokeStyle = kpColor(5) + '40';
    ctx.lineWidth = dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(pad.left, stormY);
    ctx.lineTo(w - pad.right, stormY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Parse times and find range
    var entries = data.map(function(entry) {
        return { time: new Date(entry[0]).getTime(), kp: parseFloat(entry[1]) };
    });
    var tMin = entries[0].time;
    var tMax = entries[entries.length - 1].time + 3 * 3600000; // extend by one bar width
    var tRange = tMax - tMin;
    if (tRange <= 0) return;

    var barWidth = (3 * 3600000 / tRange) * plotW;
    var gap = Math.max(1 * dpr, barWidth * 0.08);

    // X-axis day labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var labeledDays = {};
    entries.forEach(function(entry) {
        var d = new Date(entry.time);
        var dayKey = d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
        if (!labeledDays[dayKey] && d.getHours() < 3) {
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

    // Draw bars
    STATE.chartBars = [];
    entries.forEach(function(entry) {
        var kp = entry.kp;
        var xPct = (entry.time - tMin) / tRange;
        var barH = (kp / maxKp) * plotH;
        var bx = pad.left + xPct * plotW + gap / 2;
        var by = pad.top + plotH - barH;
        var bw = barWidth - gap;

        ctx.fillStyle = kpColor(kp);
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        var r = Math.min(2 * dpr, bw / 4);
        ctx.moveTo(bx + r, by);
        ctx.lineTo(bx + bw - r, by);
        ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
        ctx.lineTo(bx + bw, pad.top + plotH);
        ctx.lineTo(bx, pad.top + plotH);
        ctx.lineTo(bx, by + r);
        ctx.quadraticCurveTo(bx, by, bx + r, by);
        ctx.fill();
        ctx.globalAlpha = 1;

        STATE.chartBars.push({
            x: bx / dpr, y: by / dpr,
            w: bw / dpr, h: barH / dpr,
            kp: kp, time: entry.time
        });
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

function auroraChartHover(e, wrap) {
    var tooltip = STATE.chartTooltip;
    if (!tooltip || !STATE.chartBars) return;

    var rect = STATE.chartCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    var hit = null;
    STATE.chartBars.forEach(function(bar) {
        if (mx >= bar.x && mx <= bar.x + bar.w) {
            hit = bar;
        }
    });

    if (hit) {
        var d = new Date(hit.time);
        var hr12 = d.getHours() % 12 || 12;
        var ampm = d.getHours() >= 12 ? 'PM' : 'AM';
        var endD = new Date(hit.time + 3 * 3600000);
        var endHr12 = endD.getHours() % 12 || 12;
        var endAmpm = endD.getHours() >= 12 ? 'PM' : 'AM';
        var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        var dateStr = months[d.getMonth()] + ' ' + d.getDate();
        var timeStr = hr12 + ' ' + ampm + ' – ' + endHr12 + ' ' + endAmpm;

        tooltip.innerHTML =
            '<span style="color:' + kpColor(hit.kp) + ';font-weight:700">Kp ' + hit.kp.toFixed(1) + '</span>' +
            '<br><span style="color:var(--text-muted);font-size:0.6rem">' + dateStr + ', ' + timeStr + '</span>';
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

function getCurrentKp(kpData) {
    if (kpData.length > 1) {
        var last = kpData[kpData.length - 1];
        return parseFloat(last[1]);
    }
    return null;
}

function getBz(mag) {
    if (mag.length > 1) {
        for (var i = mag.length - 1; i > 0; i--) {
            if (mag[i][3] !== null && mag[i][3] !== '') {
                return parseFloat(mag[i][3]).toFixed(1);
            }
        }
    }
    return '--';
}

function getBt(mag) {
    if (mag.length > 1) {
        for (var i = mag.length - 1; i > 0; i--) {
            if (mag[i][6] !== null && mag[i][6] !== '') {
                return parseFloat(mag[i][6]).toFixed(1);
            }
        }
    }
    return '--';
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

function parseHemiPower(text) {
    var lines = text.split('\n');
    var entries = [];
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line || line.charAt(0) === '#') continue;
        var parts = line.split(/\s+/);
        if (parts.length >= 3) {
            entries.push({ hp_north: parseFloat(parts[2]) });
        }
    }
    return entries;
}

function getHemisphericPower(hp) {
    if (hp.length > 0) {
        var last = hp[hp.length - 1];
        return Math.round(parseFloat(last.hp_north) || 0);
    }
    return '--';
}

function getForecast(scales) {
    var forecast = [];
    for (var i = 1; i <= 3; i++) {
        if (scales[i]) {
            var d = scales[i];
            forecast.push({
                date: d.DateStamp || '',
                gScale: parseInt(d.G.Scale) || 0,
                gText: d.G.Text || 'none'
            });
        }
    }
    return forecast;
}

function getKpHistory(kpData) {
    if (kpData.length <= 1) return [];
    var entries = kpData.slice(1).reverse();
    var history = [];
    entries.forEach(function(entry) {
        history.push({
            kp: parseFloat(entry[1]),
            time: entry[0]
        });
    });
    return history;
}

function auroraVisibility(kp) {
    if (kp >= 9) return { lat: '30°N / 30°S', locations: 'Southern US, Northern Mexico, Southern Europe, Southern Australia', class: 'prob-vhigh', label: 'Extreme' };
    if (kp >= 8) return { lat: '35°N / 35°S', locations: 'Central US, Mediterranean, Southern Australia', class: 'prob-vhigh', label: 'Very High' };
    if (kp >= 7) return { lat: '40°N / 40°S', locations: 'Northern US states, Central Europe, New Zealand', class: 'prob-high', label: 'High' };
    if (kp >= 6) return { lat: '45°N / 45°S', locations: 'Oregon, Montana, Southern Canada, UK', class: 'prob-high', label: 'Moderate-High' };
    if (kp >= 5) return { lat: '50°N / 50°S', locations: 'Pacific NW, Upper Midwest, UK, Scandinavia', class: 'prob-med', label: 'Moderate' };
    if (kp >= 4) return { lat: '55°N / 55°S', locations: 'Alaska, Northern Canada, Scandinavia, Iceland', class: 'prob-med', label: 'Low-Moderate' };
    if (kp >= 3) return { lat: '60°N / 60°S', locations: 'Alaska, Northern Scandinavia, Iceland', class: 'prob-low', label: 'Low' };
    return { lat: '65°N+ / 65°S+', locations: 'Arctic and Antarctic regions only', class: 'prob-low', label: 'Very Low' };
}

function kpDescription(kp) {
    if (kp >= 8) return 'Severe geomagnetic storm';
    if (kp >= 7) return 'Strong geomagnetic storm';
    if (kp >= 6) return 'Moderate geomagnetic storm';
    if (kp >= 5) return 'Minor geomagnetic storm';
    if (kp >= 4) return 'Active conditions';
    if (kp >= 3) return 'Unsettled conditions';
    if (kp >= 2) return 'Quiet conditions';
    return 'Very quiet conditions';
}

function kpColor(kp) {
    if (kp >= 8) return '#dc2626';
    if (kp >= 7) return '#ef4444';
    if (kp >= 5) return '#f59e0b';
    if (kp >= 4) return '#eab308';
    if (kp >= 3) return '#22c55e';
    return '#06b6d4';
}

function bzColor(bz) {
    if (bz <= -10) return '#22c55e';
    if (bz <= -5) return '#eab308';
    if (bz < 0) return '#f59e0b';
    return '#ef4444';
}

function hpLevel(hp) {
    if (hp >= 100) return '#ef4444';
    if (hp >= 50) return '#f59e0b';
    if (hp >= 20) return '#eab308';
    return '#22c55e';
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
