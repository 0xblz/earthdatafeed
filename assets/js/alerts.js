// ===== ALERTS MODULE (for index.html) =====
// Set to true to show all alert types with fake data for UI testing
var TEST_ALERTS = false;

function earthDataAlerts() {
    var el = document.getElementById('alerts');
    var first = true;
    var showCount = 5;
    var metric = typeof isMetric === 'function' ? isMetric() : ((localStorage.getItem('ed_units') || 'imperial') === 'metric');

    function convertPlace(place) {
        if (metric) return place;
        return place.replace(/(\d+)\s*km\b/g, function(match, km) {
            return Math.round(parseInt(km) * 0.621371) + ' mi';
        });
    }

    function scaleColor(n) {
        var c = ['#22c55e', '#eab308', '#f59e0b', '#f97316', '#ef4444', '#dc2626'];
        return c[Math.min(Math.max(n, 0), 5)];
    }

    function timeAgo(tsMs) {
        var diff = Math.floor((Date.now() - tsMs) / 1000);
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function load() {
        var loc = null;
        try {
            loc = JSON.parse(localStorage.getItem('ed_location'));
        } catch (e) {}

        if (first) {
            var initLabel = loc ? 'Local Alerts' : 'Global Alerts';
            el.innerHTML = '<div class="section-title"><i class="fa-solid fa-bell"></i> ' + initLabel + '</div><div class="loading"><i class="fa-solid fa-spinner fa-spin"></i></div>';
            first = false;
        }

        var alerts = [];
        var promises = [];
        var gScale = 0;

        // NOAA Scales
        promises.push(
            fetch('https://services.swpc.noaa.gov/products/noaa-scales.json')
                .then(function(r) { return r.json(); })
                .then(function(scales) {
                    if (!scales || !scales['0']) return;
                    var r = parseInt(scales['0']['R']['Scale']) || 0;
                    var s = parseInt(scales['0']['S']['Scale']) || 0;
                    var g = parseInt(scales['0']['G']['Scale']) || 0;
                    if (r >= 1) alerts.push({ icon: 'fa-broadcast-tower', color: scaleColor(r), text: 'Radio Blackout R' + r, detail: scales['0']['R']['Text'] || '', link: '/solar/#flares' });
                    if (s >= 1) alerts.push({ icon: 'fa-radiation', color: scaleColor(s), text: 'Solar Radiation Storm S' + s, detail: scales['0']['S']['Text'] || '', link: '/solar/#scales' });
                    if (g >= 1) alerts.push({ icon: 'fa-wand-magic-sparkles', color: scaleColor(g), text: 'Geomagnetic Storm G' + g, detail: 'Aurora possible', link: '/aurora/#visibility' });
                    gScale = g;
                })
                .catch(function() {})
        );

        // Kp index
        promises.push(
            fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (!data || data.length < 2) return;
                    var last = data[data.length - 1];
                    var kp = parseFloat(last[1]) || 0;
                    var kpTs = last[0] ? new Date(last[0]).getTime() : 0;
                    var kpColor = kp >= 8 ? '#dc2626' : (kp >= 7 ? '#ef4444' : (kp >= 5 ? '#f59e0b' : (kp >= 4 ? '#eab308' : (kp >= 3 ? '#22c55e' : '#06b6d4'))));
                    if (kp >= 4) alerts.push({ icon: 'fa-wand-magic-sparkles', color: kpColor, text: 'Active Geomagnetic Conditions', detail: 'Kp ' + kp, meta: kpTs ? timeAgo(kpTs) : '', link: '/aurora/#kp-' + kpTs, kpAlert: true });
                })
                .catch(function() {})
        );

        // Bz (IMF)
        promises.push(
            fetch('https://services.swpc.noaa.gov/products/solar-wind/mag-1-day.json')
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (!data || data.length < 2) return;
                    var bz = null, bzTs = 0;
                    for (var i = data.length - 1; i >= 1; i--) {
                        if (data[i][3] !== null && data[i][3] !== '') { bz = parseFloat(data[i][3]); bzTs = data[i][0] ? new Date(data[i][0]).getTime() : 0; break; }
                    }
                    if (bz !== null && bz <= -10) alerts.push({ icon: 'fa-wand-magic-sparkles', color: '#f59e0b', text: 'Southward Bz — Aurora Favorable', detail: bz.toFixed(1) + ' nT', meta: bzTs ? timeAgo(bzTs) : '', link: '/aurora/#visibility' });
                })
                .catch(function() {})
        );

        // Solar wind speed
        promises.push(
            fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-1-day.json')
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (!data || data.length < 2) return;
                    var speed = null, speedTs = 0;
                    for (var i = data.length - 1; i >= 1; i--) {
                        if (data[i][2] !== null && data[i][2] !== '') { speed = parseFloat(data[i][2]); speedTs = data[i][0] ? new Date(data[i][0]).getTime() : 0; break; }
                    }
                    if (speed !== null && speed >= 600) alerts.push({ icon: 'fa-wind', color: '#f59e0b', text: 'Elevated Solar Wind', detail: metric ? Math.round(speed) + ' km/s' : Math.round(speed * 0.621371) + ' mi/s', meta: speedTs ? timeAgo(speedTs) : '', link: '/solar/#scales' });
                })
                .catch(function() {})
        );

        // Moon phase (no fetch — pure calculation)
        var _e = 947182440, _s = 29.53058770576;
        var _a = (((Date.now() / 1000 - _e) / 86400 / _s) % 1) * _s;
        var _toFull = _s / 2 - _a; if (_toFull < 0) _toFull += _s;
        var _toNew = _s - _a;
        if (_toFull < 1 || _toFull > _s - 1) alerts.push({ icon: 'fa-circle', color: '#fbbf24', text: 'Full Moon', detail: '', meta: 'Tonight', link: '/moon/' });
        else if (_toFull < 2) alerts.push({ icon: 'fa-circle', color: '#fbbf24', text: 'Full Moon', detail: '', meta: 'Tomorrow', link: '/moon/' });
        if (_toNew < 1 || _a < 1) alerts.push({ icon: 'fa-circle', color: '#555', text: 'New Moon', detail: '', meta: 'Tonight', link: '/moon/' });
        else if (_toNew < 2) alerts.push({ icon: 'fa-circle', color: '#555', text: 'New Moon', detail: '', meta: 'Tomorrow', link: '/moon/' });

        // Earthquakes
        if (loc && loc.lat && loc.lon) {
            var start = new Date(Date.now() - 86400000).toISOString();
            promises.push(
                fetch('https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=' + loc.lat + '&longitude=' + loc.lon + '&maxradiuskm=500&starttime=' + start + '&orderby=time&limit=5')
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (!data || !data.features) return;
                        data.features.forEach(function(f) {
                            var mag = Math.round((f.properties.mag || 0) * 10) / 10;
                            var place = f.properties.place || 'Unknown';
                            var color = mag >= 6 ? '#ef4444' : (mag >= 5 ? '#f97316' : (mag >= 4 ? '#f59e0b' : (mag >= 3 ? '#eab308' : (mag >= 2 ? '#06b6d4' : '#22c55e'))));
                            alerts.push({ icon: 'fa-circle', color: color, text: 'M' + mag + ' Earthquake', detail: convertPlace(place), meta: timeAgo(f.properties.time), link: '/earthquakes/#eq-' + f.id, quake: true, ts: f.properties.time });
                        });
                    })
                    .catch(function() {})
            );
        } else {
            promises.push(
                fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson')
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (!data || !data.features) return;
                        data.features.filter(function(f) { return (f.properties.mag || 0) >= 4; }).slice(0, 10).forEach(function(f) {
                            var mag = Math.round((f.properties.mag || 0) * 10) / 10;
                            var place = f.properties.place || 'Unknown';
                            var color = mag >= 6 ? '#ef4444' : (mag >= 5 ? '#f97316' : (mag >= 4 ? '#f59e0b' : (mag >= 3 ? '#eab308' : (mag >= 2 ? '#06b6d4' : '#22c55e'))));
                            alerts.push({ icon: 'fa-circle', color: color, text: 'M' + mag + ' Earthquake', detail: convertPlace(place), meta: timeAgo(f.properties.time), link: '/earthquakes/#eq-' + f.id, quake: true, ts: f.properties.time });
                        });
                    })
                    .catch(function() {})
            );
        }

        // Location-based alerts
        if (loc && loc.lat && loc.lon) {
            promises.push(
                fetch('https://api.weather.gov/alerts/active?point=' + loc.lat + ',' + loc.lon)
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (!data || !data.features) return;
                        var sevColors = { 'Extreme': '#dc2626', 'Severe': '#ef4444', 'Moderate': '#f59e0b', 'Minor': '#eab308' };
                        data.features.slice(0, 3).forEach(function(a) {
                            var event = a.properties.event || '';
                            var sev = a.properties.severity || 'Minor';
                            var expires = a.properties.expires ? new Date(a.properties.expires) : null;
                            var expMeta = '';
                            if (expires) {
                                var diffH = Math.round((expires.getTime() - Date.now()) / 3600000);
                                if (diffH > 0) expMeta = 'until ' + diffH + 'h';
                            }
                            var link = '/weather/' + (loc.q ? '?q=' + encodeURIComponent(loc.q) : '');
                            alerts.push({ icon: weatherAlertIcon(event), color: sevColors[sev] || '#eab308', text: event, detail: sev, meta: expMeta, link: link });
                        });
                    })
                    .catch(function() {})
            );

            promises.push(
                fetch('https://air-quality-api.open-meteo.com/v1/air-quality?latitude=' + loc.lat + '&longitude=' + loc.lon + '&current=us_aqi')
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (!data || !data.current) return;
                        var aqi = parseInt(data.current.us_aqi) || 0;
                        if (aqi >= 101) {
                            var label = 'Unhealthy for Sensitive Groups', color = '#f97316';
                            if (aqi >= 301) { label = 'Hazardous'; color = '#7f1d1d'; }
                            else if (aqi >= 201) { label = 'Very Unhealthy'; color = '#8b5cf6'; }
                            else if (aqi >= 151) { label = 'Unhealthy'; color = '#ef4444'; }
                            var link = '/air/' + (loc.q ? '?q=' + encodeURIComponent(loc.q) : '');
                            alerts.push({ icon: 'fa-smog', color: color, text: 'AQI ' + aqi + ' — ' + label, detail: 'Air quality alert', link: link });
                        }
                    })
                    .catch(function() {})
            );

            promises.push(
                fetch('https://api.open-meteo.com/v1/forecast?latitude=' + loc.lat + '&longitude=' + loc.lon + '&current=uv_index&timezone=auto&forecast_days=1')
                    .then(function(r) { return r.json(); })
                    .then(function(data) {
                        if (!data || !data.current) return;
                        var uvi = Math.round((data.current.uv_index || 0) * 10) / 10;
                        if (uvi >= 6) {
                            var label = 'High', color = '#f97316';
                            if (uvi >= 11) { label = 'Extreme'; color = '#8b5cf6'; }
                            else if (uvi >= 8) { label = 'Very High'; color = '#ef4444'; }
                            var link = '/uv/' + (loc.q ? '?q=' + encodeURIComponent(loc.q) : '');
                            alerts.push({ icon: 'fa-sun', color: color, text: 'UV ' + uvi + ' — ' + label, detail: 'Sun protection needed', link: link });
                        }
                    })
                    .catch(function() {})
            );
        }

        Promise.all(promises).then(function() {
            if (TEST_ALERTS) {
                alerts = [
                    { icon: 'fa-broadcast-tower', color: '#ef4444', text: 'Radio Blackout R4', detail: 'Severe', link: '/solar/#flares' },
                    { icon: 'fa-radiation', color: '#f59e0b', text: 'Solar Radiation Storm S2', detail: 'Moderate', link: '/solar/#scales' },
                    { icon: 'fa-wand-magic-sparkles', color: '#ef4444', text: 'Geomagnetic Storm G4', detail: 'Aurora possible', link: '/aurora/#visibility' },
                    { icon: 'fa-wand-magic-sparkles', color: '#f59e0b', text: 'Active Geomagnetic Conditions', detail: 'Kp 5.7', meta: '12m ago', link: '/aurora/#kp-history', kpAlert: true },
                    { icon: 'fa-wand-magic-sparkles', color: '#f59e0b', text: 'Southward Bz — Aurora Favorable', detail: '-14.2 nT', meta: '3m ago', link: '/aurora/#visibility' },
                    { icon: 'fa-wind', color: '#f59e0b', text: 'Elevated Solar Wind', detail: '720 km/s', meta: '5m ago', link: '/solar/#scales' },
                    { icon: 'fa-circle', color: '#fbbf24', text: 'Full Moon', detail: '', meta: 'Tonight', link: '/moon/' },
                    { icon: 'fa-circle', color: '#555', text: 'New Moon', detail: '', meta: 'Tomorrow', link: '/moon/' },
                    { icon: 'fa-circle', color: '#ef4444', text: 'M6.1 Earthquake', detail: '12 km E of Anchorage', meta: '1h ago', link: '/earthquakes/', quake: true, ts: Date.now() - 1800000 },
                    { icon: 'fa-circle', color: '#f97316', text: 'M5.2 Earthquake', detail: '42 km NW of Los Angeles', meta: '2h ago', link: '/earthquakes/', quake: true, ts: Date.now() - 7200000 },
                    { icon: 'fa-circle', color: '#f59e0b', text: 'M4.1 Earthquake', detail: '18 km S of San Jose', meta: '5h ago', link: '/earthquakes/', quake: true, ts: Date.now() - 18000000 },
                    { icon: 'fa-circle', color: '#eab308', text: 'M3.3 Earthquake', detail: '8 km N of Seattle', meta: '9h ago', link: '/earthquakes/', quake: true, ts: Date.now() - 32400000 },
                    { icon: 'fa-circle', color: '#06b6d4', text: 'M2.5 Earthquake', detail: '5 km W of Portland', meta: '12h ago', link: '/earthquakes/', quake: true, ts: Date.now() - 43200000 },
                    { icon: 'fa-tornado', color: '#ef4444', text: 'Tornado Warning', detail: 'Severe', meta: 'until 2h', link: '/weather/' },
                    { icon: 'fa-snowflake', color: '#f59e0b', text: 'Winter Storm Warning', detail: 'Moderate', meta: 'until 18h', link: '/weather/' },
                    { icon: 'fa-smog', color: '#8b5cf6', text: 'AQI 215 — Very Unhealthy', detail: 'Air quality alert', link: '/air/' },
                    { icon: 'fa-smog', color: '#f97316', text: 'AQI 142 — Unhealthy for Sensitive Groups', detail: 'Air quality alert', link: '/air/' },
                    { icon: 'fa-sun', color: '#8b5cf6', text: 'UV 11.2 — Extreme', detail: 'Sun protection needed', link: '/uv/' },
                    { icon: 'fa-sun', color: '#ef4444', text: 'UV 9.4 — Very High', detail: 'Sun protection needed', link: '/uv/' }
                ];
            }
            if (gScale >= 1) alerts = alerts.filter(function(a) { return !a.kpAlert; });
            var alertLabel = loc ? 'Local Alerts' : 'Global Alerts';
            var locClear = '';
            if (loc && loc.name) {
                var parts = (loc.name || '').split(',');
                var city = parts[0].trim();
                var region = parts.length > 1 ? parts[1].trim() : '';
                var locText = region ? city + ', ' + region : city;
                locClear = '<span id="alerts-loc-label" style="margin-left:auto"><a href="#" id="alerts-clear-loc" class="loc-clear"><i class="fa-solid fa-location-dot"></i> ' + esc(locText) + ' <i class="fa-solid fa-xmark"></i></a></span>';
            }
            var html = '<div class="section-title"><i class="fa-solid fa-bell"></i> ' + alertLabel + locClear + '</div>';
            if (!alerts.length) {
                html += '<div class="empty"><i class="fa-solid fa-check"></i> No alerts for your area</div>';
            } else {
                alerts.slice(0, showCount).forEach(function(a) {
                    var iconClass = 'fa-solid ' + a.icon;
                    var iconStyle = 'color:' + a.color;
                    if (a.quake) {
                        iconClass += (a.ts && a.ts > Date.now() - RECENT_QUAKE_MS ? ' eq-pulse' : '');
                        iconStyle += '; font-size:0.5rem';
                    }
                    html += '<div class="row" onclick="location.href=\'' + a.link + '\'" style="cursor:pointer">'
                        + '<span class="row-icon"><i class="' + iconClass + '" style="' + iconStyle + '"></i></span>'
                        + '<span class="row-label" style="color:' + a.color + '">' + (a.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>'
                        + '<span class="row-text c-muted">' + (a.detail || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>'
                        + (a.meta ? '<span class="row-meta">' + (a.meta || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' : '')
                        + '</div>';
                });
                if (alerts.length > showCount) {
                    html += '<div class="load-more" id="alerts-load-more">Load more (' + (alerts.length - showCount) + ' remaining)</div>';
                }
            }
            el.innerHTML = html;
            var loadMoreBtn = document.getElementById('alerts-load-more');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', function() {
                    showCount += 5;
                    load();
                });
            }
            var alertsClearBtn = document.getElementById('alerts-clear-loc');
            if (alertsClearBtn) {
                alertsClearBtn.addEventListener('click', function(e) {
                    e.preventDefault();
                    localStorage.removeItem('ed_location');
                    if (window.updateLogoFlag) updateLogoFlag();
                    location.reload();
                });
            }
        });
    }

    load();
    setInterval(load, 60000);
}
