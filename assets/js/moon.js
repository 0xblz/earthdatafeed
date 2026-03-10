// ===== MOON PHASE MODULE =====

var MOON_OPTIONS = {
    newMoonEpoch: 947182440,
    synodicMonth: 29.53058770576,
    avgDistance: 384400,
    distVariation: 20600
};

var MOON_STATE = {
    now: 0,
    moonAge: 0,
    phaseFraction: 0,
    illumination: 0,
    lunationNumber: 0,
    calShowCount: 10,
    calPhases: []
};

function earthDataMoon() {
    MOON_STATE.now = Date.now() / 1000;
    calculateMoonData();
    renderMoon();
}

function calculateMoonData() {
    var daysSince = (MOON_STATE.now - MOON_OPTIONS.newMoonEpoch) / 86400;
    var lunations = daysSince / MOON_OPTIONS.synodicMonth;
    MOON_STATE.lunationNumber = Math.floor(lunations);
    MOON_STATE.moonAge = (lunations - MOON_STATE.lunationNumber) * MOON_OPTIONS.synodicMonth;
    MOON_STATE.phaseFraction = MOON_STATE.moonAge / MOON_OPTIONS.synodicMonth;
    MOON_STATE.illumination = Math.round((1 - Math.cos(MOON_STATE.phaseFraction * 2 * Math.PI)) / 2 * 100);
}

function moonPhase(frac) {
    if (frac < 0.0625) return { name: 'New Moon', icon: 'fa-circle', iconStyle: 'fa-regular', color: '#555' };
    if (frac < 0.1875) return { name: 'Waxing Crescent', icon: 'fa-moon', iconStyle: 'fa-solid', color: '#eab308' };
    if (frac < 0.3125) return { name: 'First Quarter', icon: 'fa-circle-half-stroke', iconStyle: 'fa-solid', color: '#f59e0b' };
    if (frac < 0.4375) return { name: 'Waxing Gibbous', icon: 'fa-moon', iconStyle: 'fa-solid', color: '#f59e0b' };
    if (frac < 0.5625) return { name: 'Full Moon', icon: 'fa-circle', iconStyle: 'fa-solid', color: '#fbbf24' };
    if (frac < 0.6875) return { name: 'Waning Gibbous', icon: 'fa-moon', iconStyle: 'fa-solid', color: '#f59e0b' };
    if (frac < 0.8125) return { name: 'Last Quarter', icon: 'fa-circle-half-stroke', iconStyle: 'fa-solid', color: '#f59e0b' };
    if (frac < 0.9375) return { name: 'Waning Crescent', icon: 'fa-moon', iconStyle: 'fa-solid', color: '#eab308' };
    return { name: 'New Moon', icon: 'fa-circle', iconStyle: 'fa-regular', color: '#555' };
}

function phaseRowColor(name) {
    var map = { 'New Moon': '#555', 'First Quarter': '#f59e0b', 'Full Moon': '#fbbf24', 'Last Quarter': '#f59e0b' };
    return map[name] || '#888';
}

function calculateDistance() {
    var metric = (localStorage.getItem('ed_units') || 'imperial') === 'metric';
    var anomaly = 2 * Math.PI * MOON_STATE.phaseFraction;
    var distanceKm = Math.round(MOON_OPTIONS.avgDistance - MOON_OPTIONS.distVariation * Math.cos(anomaly + 0.5));
    if (metric) return { value: distanceKm, unit: 'km' };
    return { value: Math.round(distanceKm * 0.621371), unit: 'mi' };
}

function calculateAngularSize() {
    var anomaly = 2 * Math.PI * MOON_STATE.phaseFraction;
    var distanceKm = Math.round(MOON_OPTIONS.avgDistance - MOON_OPTIONS.distVariation * Math.cos(anomaly + 0.5));
    return Math.round(3474.8 / distanceKm * 206265 / 60 * 10) / 10;
}

function getPhaseVisual() {
    var visuals = ['🌑','🌒','🌓','🌔','🌕','🌖','🌗','🌘'];
    return visuals[Math.floor(MOON_STATE.phaseFraction * 8) % 8];
}

function getUpcomingPhases() {
    var targets = [
        { frac: 0.00, name: 'New Moon', icon: 'fa-circle', iconStyle: 'fa-regular' },
        { frac: 0.25, name: 'First Quarter', icon: 'fa-circle-half-stroke', iconStyle: 'fa-solid' },
        { frac: 0.50, name: 'Full Moon', icon: 'fa-circle', iconStyle: 'fa-solid' },
        { frac: 0.75, name: 'Last Quarter', icon: 'fa-circle-half-stroke', iconStyle: 'fa-solid' }
    ];
    var upcoming = [];
    targets.forEach(function(target) {
        var targetAge = target.frac * MOON_OPTIONS.synodicMonth;
        var daysUntil = targetAge - MOON_STATE.moonAge;
        if (daysUntil <= 0) daysUntil += MOON_OPTIONS.synodicMonth;
        var dateTs = Math.floor(MOON_STATE.now + daysUntil * 86400);
        upcoming.push({ name: target.name, icon: target.icon, iconStyle: target.iconStyle, date: dateTs, days: Math.round(daysUntil * 10) / 10 });
    });
    upcoming.sort(function(a, b) { return a.days - b.days; });
    return upcoming;
}

function getMonthPhases() {
    var targets = [
        { frac: 0.00, name: 'New Moon', icon: 'fa-circle', iconStyle: 'fa-regular' },
        { frac: 0.25, name: 'First Quarter', icon: 'fa-circle-half-stroke', iconStyle: 'fa-solid' },
        { frac: 0.50, name: 'Full Moon', icon: 'fa-circle', iconStyle: 'fa-solid' },
        { frac: 0.75, name: 'Last Quarter', icon: 'fa-circle-half-stroke', iconStyle: 'fa-solid' }
    ];
    var phases = [];
    for (var offset = -1; offset <= 7; offset++) {
        targets.forEach(function(target) {
            var baseLunation = MOON_STATE.lunationNumber + offset;
            var phaseTs = Math.floor(MOON_OPTIONS.newMoonEpoch + (baseLunation + target.frac) * MOON_OPTIONS.synodicMonth * 86400);
            var daysUntil = (phaseTs - MOON_STATE.now) / 86400;
            phases.push({ name: target.name, icon: target.icon, iconStyle: target.iconStyle, date: phaseTs, days: Math.round(daysUntil * 10) / 10 });
        });
    }
    var currentMonthStart = new Date();
    currentMonthStart.setDate(1); currentMonthStart.setHours(0, 0, 0, 0);
    var currentMonthTs = Math.floor(currentMonthStart.getTime() / 1000);
    phases = phases.filter(function(p) { return p.date >= currentMonthTs; });
    phases.sort(function(a, b) { return a.date - b.date; });
    return phases;
}

function moonFormatNumber(n, decimals) {
    return n.toFixed(decimals || 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function renderMoon() {
    var phase = moonPhase(MOON_STATE.phaseFraction);
    var distance = calculateDistance();
    var angularSize = calculateAngularSize();
    var visual = getPhaseVisual();
    var upcoming = getUpcomingPhases();
    var monthPhases = getMonthPhases();
    var fullDays = 0;
    upcoming.forEach(function(u) { if (u.name === 'Full Moon') fullDays = u.days; });

    var html = '';
    html += '<div class="data-banner data-banner-moon">';
    html += '<div class="data-banner-content">';
    html += '<div class="data-hero-value moon-phase-icon">' + visual + '</div>';
    html += '<div class="data-hero-label" style="color:' + phase.color + ';font-size:1.5rem">' + phase.name + '</div>';
    html += '<div class="data-hero-sub">Lunation ' + MOON_STATE.lunationNumber + ' &middot; Day ' + moonFormatNumber(MOON_STATE.moonAge, 1) + ' of ' + moonFormatNumber(MOON_OPTIONS.synodicMonth, 1) + '</div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="card-grid">';
    html += '<div class="card"><div class="card-icon"><i class="' + phase.iconStyle + ' ' + phase.icon + '" style="color:' + phase.color + '"></i></div><div class="card-value" style="color:' + phase.color + '">' + MOON_STATE.illumination + '%</div><div class="card-label">Illumination</div></div>';
    html += '<div class="card"><div class="card-icon"><i class="fa-solid fa-hourglass-half c-cyan"></i></div><div class="card-value c-cyan">' + moonFormatNumber(MOON_STATE.moonAge, 1) + '</div><div class="card-label">Moon Age (days)</div></div>';
    html += '<div class="card"><div class="card-icon"><i class="fa-solid fa-ruler c-purple"></i></div><div class="card-value c-purple">' + moonFormatNumber(distance.value, 0) + '</div><div class="card-label">Distance (' + distance.unit + ')</div></div>';
    html += '<div class="card"><div class="card-icon"><i class="fa-solid fa-circle c-amber"></i></div><div class="card-value c-amber">' + angularSize + '&prime;</div><div class="card-label">Angular Size</div></div>';
    html += '</div>';

    html += '<div class="badges">';
    html += '<div class="badge"><i class="fa-solid fa-calendar c-blue"></i><span class="label">Cycle</span><span class="value">' + Math.round(MOON_STATE.phaseFraction * 100) + '%</span></div>';
    html += '<div class="badge"><i class="fa-solid fa-hashtag c-muted"></i><span class="label">Lunation</span><span class="value">#' + MOON_STATE.lunationNumber + '</span></div>';
    html += '<div class="badge"><i class="fa-solid fa-circle c-amber"></i><span class="label">Full Moon</span><span class="value">' + (fullDays <= 1 ? 'today' : 'in ' + Math.round(fullDays) + 'd') + '</span></div>';
    html += '</div>';

    document.querySelector('#moon-content').innerHTML = html;

    MOON_STATE.calPhases = monthPhases;
    renderMoonCalendar();
}

function renderMoonCalendar() {
    var phases = MOON_STATE.calPhases;
    var calHtml = '';
    calHtml += '<div class="section-title"><i class="fa-solid fa-calendar-days"></i> Phase Calendar';
    calHtml += '<span class="c-muted" style="margin-left:auto; font-size:0.65rem">' + phases.length + ' phases</span></div>';
    if (!phases.length) {
        calHtml += '<div class="empty"><i class="fa-solid fa-circle-exclamation"></i> No phase data</div>';
    } else {
        var visible = phases.slice(0, MOON_STATE.calShowCount);
        visible.forEach(function(mp) {
            var d = new Date(mp.date * 1000);
            var color = phaseRowColor(mp.name);
            var isPast = mp.date < MOON_STATE.now;
            calHtml += '<div class="row"' + (isPast ? ' style="opacity:0.5"' : '') + '>';
            calHtml += '<div class="row-icon"><i class="' + mp.iconStyle + ' ' + mp.icon + '" style="color:' + color + '; font-size:0.65rem"></i></div>';
            calHtml += '<div class="row-label" style="color:' + color + '">' + mp.name + '</div>';
            calHtml += '<div class="row-text">' + d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) + '</div>';
            var daysLabel = mp.days <= 0 ? 'past' : mp.days < 1 ? 'today' : Math.round(mp.days) + 'd';
            calHtml += '<div class="row-meta"><span class="utc-time" data-ts="' + mp.date + '" data-format="time">' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }) + ' UTC</span> &middot; ' + daysLabel + '</div>';
            calHtml += '</div>';
        });

        if (phases.length > MOON_STATE.calShowCount) {
            calHtml += '<div class="load-more" id="moon-cal-load-more">Load more (' + (phases.length - MOON_STATE.calShowCount) + ' remaining)</div>';
        }
    }
    document.querySelector('#moon-calendar').innerHTML = calHtml;

    var loadMore = document.getElementById('moon-cal-load-more');
    if (loadMore) {
        loadMore.addEventListener('click', function() {
            MOON_STATE.calShowCount += 10;
            renderMoonCalendar();
        });
    }

    if (typeof convertUtcTimes === 'function') convertUtcTimes();
}
