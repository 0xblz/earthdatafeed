// ===== SHARED CONSTANTS =====
var FONT = '"Ubuntu", sans-serif';
var RECENT_QUAKE_MS = 3600000; // 1 hour

// ===== SHARED UTILITY FUNCTIONS =====

function getUnits() {
    return localStorage.getItem('ed_units') || 'imperial';
}

function isMetric() {
    return getUnits() === 'metric';
}

function esc(str) {
    var d = document.createElement('span');
    d.textContent = str;
    return d.innerHTML;
}

// Simple in-memory cache
var _cache = {};
function cached(key, fetcher, ttl) {
    ttl = ttl || 300000;
    var now = Date.now();
    if (_cache[key] && (now - _cache[key].ts) < ttl) {
        return Promise.resolve(_cache[key].data);
    }
    return fetcher().then(function(data) {
        _cache[key] = { data: data, ts: now };
        return data;
    });
}

// Haversine distance
function haversine(lat1, lon1, lat2, lon2, metric) {
    var r = metric ? 6371 : 3959;
    var dlat = (lat2 - lat1) * Math.PI / 180;
    var dlon = (lon2 - lon1) * Math.PI / 180;
    var a = Math.sin(dlat / 2) * Math.sin(dlat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dlon / 2) * Math.sin(dlon / 2);
    return r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// Dispatch 'themechange' when data-theme attribute changes
new MutationObserver(function() {
    window.dispatchEvent(new Event('themechange'));
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

// ===== CHART EXPAND MODAL =====
var _chartModal = null;

function getChartModal() {
    if (_chartModal) return _chartModal;
    var modal = document.createElement('div');
    modal.className = 'lightbox';
    modal.id = 'chart-modal';
    modal.innerHTML =
        '<div class="chart-modal-panel">' +
            '<div class="chart-modal-header">' +
                '<span class="chart-modal-title" id="chart-modal-title"></span>' +
                '<button class="map-panel-close" id="chart-modal-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="chart-modal-body">' +
                '<canvas id="chart-modal-canvas"></canvas>' +
                '<div class="chart-modal-tooltip"></div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);

    modal.addEventListener('click', closeChartModal);
    modal.querySelector('.chart-modal-panel').addEventListener('click', function(e) { e.stopPropagation(); });
    document.getElementById('chart-modal-close').addEventListener('click', closeChartModal);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeChartModal(); });

    _chartModal = {
        el: modal,
        canvas: document.getElementById('chart-modal-canvas'),
        tooltip: modal.querySelector('.chart-modal-tooltip'),
        title: document.getElementById('chart-modal-title'),
        drawFn: null,
        hoverFn: null,
        stateRef: null,
        origCanvas: null,
        origTooltip: null
    };

    var mc = _chartModal;
    mc.canvas.addEventListener('mousemove', function(e) {
        if (mc.hoverFn) mc.hoverFn(e, mc.canvas.parentElement);
    });
    mc.canvas.addEventListener('mouseleave', function() {
        mc.tooltip.style.display = 'none';
    });
    mc.canvas.addEventListener('touchstart', function(e) {
        if (mc.hoverFn) mc.hoverFn(e.touches[0], mc.canvas.parentElement);
    }, { passive: true });

    window.addEventListener('resize', function() {
        if (mc.el.classList.contains('open') && mc.drawFn) {
            sizeModalCanvas();
            mc.drawFn();
        }
    });
    window.addEventListener('themechange', function() {
        if (mc.el.classList.contains('open') && mc.drawFn) mc.drawFn();
    });

    return _chartModal;
}

function sizeModalCanvas() {
    var mc = _chartModal;
    if (!mc) return;
    var body = mc.canvas.parentElement;
    var dpr = window.devicePixelRatio || 1;
    var rect = body.getBoundingClientRect();
    mc.canvas.width = rect.width * dpr;
    mc.canvas.height = rect.height * dpr;
    mc.canvas.style.width = rect.width + 'px';
    mc.canvas.style.height = rect.height + 'px';
}

function openChartModal(stateObj, drawFn, hoverFn, title) {
    var mc = getChartModal();
    mc.origCanvas = stateObj.chartCanvas;
    mc.origTooltip = stateObj.chartTooltip;
    mc.stateRef = stateObj;
    mc.drawFn = drawFn;
    mc.hoverFn = hoverFn;
    mc.title.textContent = title || '';
    mc.el.classList.add('open');
    document.body.style.overflow = 'hidden';

    stateObj.chartCanvas = mc.canvas;
    stateObj.chartTooltip = mc.tooltip;

    sizeModalCanvas();
    drawFn();
}

function closeChartModal() {
    var mc = _chartModal;
    if (!mc || !mc.el.classList.contains('open')) return;
    mc.el.classList.remove('open');
    document.body.style.overflow = '';

    if (mc.stateRef && mc.origCanvas) {
        mc.stateRef.chartCanvas = mc.origCanvas;
        mc.stateRef.chartTooltip = mc.origTooltip;
        // Redraw original chart
        var dpr = window.devicePixelRatio || 1;
        var wrap = mc.origCanvas.parentElement;
        var rect = wrap.getBoundingClientRect();
        mc.origCanvas.width = rect.width * dpr;
        mc.origCanvas.height = rect.height * dpr;
        mc.origCanvas.style.width = rect.width + 'px';
        mc.origCanvas.style.height = rect.height + 'px';
        mc.drawFn();
    }
    mc.drawFn = null;
    mc.hoverFn = null;
    mc.stateRef = null;
    mc.origCanvas = null;
    mc.origTooltip = null;
}

function weatherAlertIcon(event) {
    var e = (event || '').toLowerCase();
    if (/tornado/.test(e)) return 'fa-tornado';
    if (/hurricane|typhoon|tropical/.test(e)) return 'fa-hurricane';
    if (/thunder|lightning/.test(e)) return 'fa-cloud-bolt';
    if (/flood|flash/.test(e)) return 'fa-house-flood-water';
    if (/snow|blizzard|winter/.test(e)) return 'fa-snowflake';
    if (/ice|freez|frost/.test(e)) return 'fa-icicles';
    if (/wind|gale|squall/.test(e)) return 'fa-wind';
    if (/fog/.test(e)) return 'fa-smog';
    if (/heat|excessive/.test(e)) return 'fa-temperature-arrow-up';
    if (/cold|chill/.test(e)) return 'fa-temperature-arrow-down';
    if (/fire|red flag/.test(e)) return 'fa-fire';
    if (/dust/.test(e)) return 'fa-smog';
    if (/marine|surf|rip|coast|beach|sea|wave/.test(e)) return 'fa-water';
    if (/avalanche/.test(e)) return 'fa-mountain';
    if (/volcano|ash/.test(e)) return 'fa-volcano';
    return 'fa-triangle-exclamation';
}

function relativeTime(tsMs) {
    var diff = Date.now() - tsMs;
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return sec + 's ago';
    if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
    if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
    return Math.floor(sec / 86400) + 'd ago';
}
