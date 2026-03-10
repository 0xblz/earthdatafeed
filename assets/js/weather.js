/**
 * Weather module - Open-Meteo Forecast API integration
 * Handles current conditions, 7-day forecast worldwide
 */

// ===== OPTIONS =====
var OPTIONS = {
    apiTimeout: 10000,
    cacheTime: 300000, // 5 minutes
    userAgent: 'EarthData/1.0 (earthdatafeed.com)'
};

// ===== SELECTORS =====
var SELECTORS = {
    results: '#results',
    forecast: '#weather-forecast'
};

// ===== STATE =====
var STATE = {
    currentLocation: null,
    loading: false,
    chartCanvas: null,
    chartTooltip: null,
    chartPoints: [],
    chartHourly: [],
    chartHumidity: [],
    chartWind: [],
    chartWindUnit: 'km/h',
    chartPressure: [],
    chartPressureUnit: 'hPa',
    chartVisibility: [],
    chartVisUnit: 'km',
    chartFeelsLike: [],
    chartDewpoint: [],
    chartCloud: [],
    activeChartTab: 'temp'
};

// ===== WMO WEATHER CODES =====
var WMO_CODES = {
    0: { desc: 'Clear Sky', icon: 'fa-sun', color: '#f59e0b' },
    1: { desc: 'Mainly Clear', icon: 'fa-sun', color: '#f59e0b' },
    2: { desc: 'Partly Cloudy', icon: 'fa-cloud-sun', color: '#6b7280' },
    3: { desc: 'Overcast', icon: 'fa-cloud', color: '#6b7280' },
    45: { desc: 'Fog', icon: 'fa-smog', color: '#6b7280' },
    48: { desc: 'Depositing Rime Fog', icon: 'fa-smog', color: '#6b7280' },
    51: { desc: 'Light Drizzle', icon: 'fa-cloud-rain', color: '#3b82f6' },
    53: { desc: 'Moderate Drizzle', icon: 'fa-cloud-rain', color: '#3b82f6' },
    55: { desc: 'Dense Drizzle', icon: 'fa-cloud-rain', color: '#3b82f6' },
    56: { desc: 'Light Freezing Drizzle', icon: 'fa-icicles', color: '#93c5fd' },
    57: { desc: 'Dense Freezing Drizzle', icon: 'fa-icicles', color: '#93c5fd' },
    61: { desc: 'Slight Rain', icon: 'fa-cloud-rain', color: '#3b82f6' },
    63: { desc: 'Moderate Rain', icon: 'fa-cloud-rain', color: '#3b82f6' },
    65: { desc: 'Heavy Rain', icon: 'fa-cloud-showers-heavy', color: '#3b82f6' },
    66: { desc: 'Light Freezing Rain', icon: 'fa-icicles', color: '#93c5fd' },
    67: { desc: 'Heavy Freezing Rain', icon: 'fa-icicles', color: '#93c5fd' },
    71: { desc: 'Slight Snowfall', icon: 'fa-snowflake', color: '#93c5fd' },
    73: { desc: 'Moderate Snowfall', icon: 'fa-snowflake', color: '#93c5fd' },
    75: { desc: 'Heavy Snowfall', icon: 'fa-snowflake', color: '#93c5fd' },
    77: { desc: 'Snow Grains', icon: 'fa-snowflake', color: '#93c5fd' },
    80: { desc: 'Slight Rain Showers', icon: 'fa-cloud-rain', color: '#3b82f6' },
    81: { desc: 'Moderate Rain Showers', icon: 'fa-cloud-rain', color: '#3b82f6' },
    82: { desc: 'Violent Rain Showers', icon: 'fa-cloud-showers-heavy', color: '#3b82f6' },
    85: { desc: 'Slight Snow Showers', icon: 'fa-snowflake', color: '#93c5fd' },
    86: { desc: 'Heavy Snow Showers', icon: 'fa-snowflake', color: '#93c5fd' },
    95: { desc: 'Thunderstorm', icon: 'fa-cloud-bolt', color: '#ef4444' },
    96: { desc: 'Thunderstorm with Slight Hail', icon: 'fa-cloud-bolt', color: '#ef4444' },
    99: { desc: 'Thunderstorm with Heavy Hail', icon: 'fa-cloud-bolt', color: '#ef4444' }
};

// ===== INIT =====
function init() {
    var params = new URLSearchParams(window.location.search);
    var q = params.get('q');
    if (q) {
        loadWeather(q);
    }
}

// ===== MAIN LOAD FUNCTION =====
function loadWeather(query) {
    if (STATE.loading) return;
    STATE.loading = true;

    var results = document.querySelector(SELECTORS.results);
    results.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> Loading weather data...</div>';
    document.querySelector(SELECTORS.forecast).innerHTML = '';

    // Geocode via Nominatim
    geocode(query)
        .then(function(geo) {
            if (!geo) {
                results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Location not found. Try a city name or place.</div>';
                STATE.loading = false;
                return;
            }

            STATE.currentLocation = geo;

            // Save to localStorage
            var STORAGE_KEY = 'ed_location';
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                q: query,
                lat: geo.lat,
                lon: geo.lon,
                name: geo.name,
                cc: geo.cc
            }));
            if (window.updateLogoFlag) updateLogoFlag();

            // Fetch weather data from Open-Meteo
            return fetchWeatherData(geo.lat, geo.lon);
        })
        .then(function(data) {
            if (!data) return;
            renderWeather(data);
            STATE.loading = false;
        })
        .catch(function(err) {
            console.error('Weather error:', err);
            results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load weather data. ' + esc(err.message || 'Try again.') + '</div>';
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

// ===== FETCH WEATHER DATA =====
function fetchWeatherData(lat, lon) {
    var url = 'https://api.open-meteo.com/v1/forecast?' + new URLSearchParams({
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,visibility,dewpoint_2m,precipitation',
        hourly: 'temperature_2m,relative_humidity_2m,wind_speed_10m,surface_pressure,visibility,apparent_temperature,dewpoint_2m,cloud_cover',
        daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset',
        timezone: 'auto',
        forecast_days: '7'
    });

    var weatherPromise = fetch(url, {
        headers: { 'Accept': 'application/json' }
    })
    .then(function(r) {
        if (!r.ok) throw new Error('Weather data unavailable for this location');
        return r.json();
    });

    var alertsPromise = fetch('https://api.weather.gov/alerts/active?point=' + lat + ',' + lon)
        .then(function(r) { return r.json(); })
        .then(function(data) { return (data && data.features) ? data.features : []; })
        .catch(function() { return []; });

    return Promise.all([weatherPromise, alertsPromise])
    .then(function(results) {
        var w = results[0];
        var alertFeatures = results[1];

        if (!w || !w.current) throw new Error('Invalid weather response');

        var c = w.current;
        var current = parseCurrentConditions(c);

        // Daily forecast
        var forecast = [];
        if (w.daily && w.daily.time) {
            for (var i = 0; i < w.daily.time.length; i++) {
                forecast.push({
                    date: w.daily.time[i],
                    code: w.daily.weather_code[i],
                    tempMax: w.daily.temperature_2m_max[i],
                    tempMin: w.daily.temperature_2m_min[i],
                    precip: w.daily.precipitation_sum[i],
                    windMax: w.daily.wind_speed_10m_max[i],
                    windDir: w.daily.wind_direction_10m_dominant[i],
                    sunrise: w.daily.sunrise[i],
                    sunset: w.daily.sunset[i]
                });
            }
        }

        // Raw hourly data for charts
        var hourlyRaw = [];
        if (w.hourly && w.hourly.time) {
            for (var j = 0; j < w.hourly.time.length; j++) {
                hourlyRaw.push({
                    time: w.hourly.time[j],
                    temp: w.hourly.temperature_2m[j],
                    humidity: w.hourly.relative_humidity_2m ? w.hourly.relative_humidity_2m[j] : null,
                    wind: w.hourly.wind_speed_10m ? w.hourly.wind_speed_10m[j] : null,
                    pressure: w.hourly.surface_pressure ? w.hourly.surface_pressure[j] : null,
                    visibility: w.hourly.visibility ? w.hourly.visibility[j] : null,
                    feelsLike: w.hourly.apparent_temperature ? w.hourly.apparent_temperature[j] : null,
                    dewpoint: w.hourly.dewpoint_2m ? w.hourly.dewpoint_2m[j] : null,
                    cloud: w.hourly.cloud_cover ? w.hourly.cloud_cover[j] : null
                });
            }
        }

        // Parse NWS alerts
        var sevColors = { 'Extreme': '#dc2626', 'Severe': '#ef4444', 'Moderate': '#f59e0b', 'Minor': '#eab308' };
        var alerts = alertFeatures.map(function(a) {
            var sev = a.properties.severity || 'Minor';
            return {
                event: a.properties.event || '',
                severity: sev,
                color: sevColors[sev] || '#eab308',
                headline: a.properties.headline || '',
                description: a.properties.description || '',
                expires: a.properties.expires || ''
            };
        });

        return {
            current: current,
            forecast: forecast,
            hourlyRaw: hourlyRaw,
            alerts: alerts,
            location: STATE.currentLocation,
            timezone: w.timezone || null
        };
    });
}

// ===== PARSE CURRENT CONDITIONS =====
function parseCurrentConditions(c) {
    var metric = isMetric();
    var rawTempC = c.temperature_2m;
    var rawFeelsC = c.apparent_temperature;
    var rawDewpointC = c.dewpoint_2m;
    var humidity = c.relative_humidity_2m;
    var code = c.weather_code;
    var windKmh = c.wind_speed_10m;
    var gustKmh = c.wind_gusts_10m;
    var windDeg = c.wind_direction_10m;
    var pressureHpa = c.surface_pressure;
    var visibilityM = c.visibility;
    var cloud = c.cloud_cover;
    var precip = c.precipitation;

    var temp, feelsLike, tempUnit, wind, windGust, windUnit, dewpoint, dewpointUnit, pressure, pressureUnit, visibility, visUnit;

    if (metric) {
        temp = rawTempC !== null ? Math.round(rawTempC) : null;
        feelsLike = rawFeelsC !== null ? Math.round(rawFeelsC) : null;
        tempUnit = '°C';
        wind = windKmh !== null ? Math.round(windKmh) : null;
        windGust = gustKmh !== null ? Math.round(gustKmh) : null;
        windUnit = 'km/h';
        dewpoint = rawDewpointC !== null ? Math.round(rawDewpointC) : null;
        dewpointUnit = '°C';
        pressure = pressureHpa !== null ? Math.round(pressureHpa) : null;
        pressureUnit = 'hPa';
        visibility = visibilityM !== null ? (visibilityM / 1000).toFixed(1) : null;
        visUnit = 'km';
    } else {
        temp = rawTempC !== null ? Math.round(rawTempC * 9 / 5 + 32) : null;
        feelsLike = rawFeelsC !== null ? Math.round(rawFeelsC * 9 / 5 + 32) : null;
        tempUnit = '°F';
        wind = windKmh !== null ? Math.round(windKmh * 0.621371) : null;
        windGust = gustKmh !== null ? Math.round(gustKmh * 0.621371) : null;
        windUnit = 'mph';
        dewpoint = rawDewpointC !== null ? Math.round(rawDewpointC * 9 / 5 + 32) : null;
        dewpointUnit = '°F';
        pressure = pressureHpa !== null ? (pressureHpa / 33.8639).toFixed(2) : null;
        pressureUnit = 'inHg';
        visibility = visibilityM !== null ? (visibilityM / 1609.34).toFixed(1) : null;
        visUnit = 'mi';
    }

    // Wind direction label
    var dirLabel = '--';
    if (windDeg !== null) {
        var dirs = ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
        dirLabel = dirs[Math.round(windDeg / 22.5) % 16];
    }

    var wmo = WMO_CODES[code] || WMO_CODES[0];

    return {
        temp: temp,
        feelsLike: feelsLike,
        tempUnit: tempUnit,
        humidity: humidity !== null ? Math.round(humidity) : null,
        wind: wind,
        windGust: windGust,
        windUnit: windUnit,
        dirLabel: dirLabel,
        desc: wmo.desc,
        icon: wmo.icon,
        color: wmo.color,
        dewpoint: dewpoint,
        dewpointUnit: dewpointUnit,
        pressure: pressure,
        pressureUnit: pressureUnit,
        visibility: visibility,
        visUnit: visUnit,
        cloud: cloud !== null ? Math.round(cloud) : null,
        precip: precip,
        code: code
    };
}

// ===== RENDER WEATHER =====
function renderWeather(data) {
    var results = document.querySelector(SELECTORS.results);
    var html = '';

    // Location header
    html += '<span id="loc-resolve" data-lat="' + data.location.lat + '" data-lon="' + data.location.lon + '" data-q="' + esc(data.location.query) + '" data-name="' + esc(data.location.name) + '" hidden></span>';

    // NWS Active Alerts
    if (data.alerts && data.alerts.length > 0) {
        html += '<div class="section-title"><i class="fa-solid fa-triangle-exclamation"></i> Active Alerts</div>';
        html += '<div style="margin-bottom:var(--sp-4)">';
        data.alerts.forEach(function(a) {
            html += '<div class="row" style="align-items:flex-start;gap:var(--sp-3)">'
                + '<span class="row-icon" style="margin-top:2px"><i class="fa-solid ' + weatherAlertIcon(a.event) + '" style="color:' + a.color + '"></i></span>'
                + '<span style="flex:1;min-width:0">'
                + '<div class="row-label" style="color:' + a.color + '">' + esc(a.event) + ' <span class="c-muted" style="font-weight:400;font-size:0.7rem">— ' + esc(a.severity) + '</span></div>'
                + (a.headline ? '<div class="row-text" style="font-size:0.7rem;margin-top:2px;white-space:normal">' + esc(a.headline) + '</div>' : '')
                + '</span>'
                + '</div>';
        });
        html += '</div>';
    }



    // Current conditions
    var c = data.current;

    html += '<div class="data-banner data-banner-weather" style="background-image:url(/assets/images/' + weatherBgImage(c.code) + ')">';
    html += '<div class="data-banner-content">';
    html += '<div class="data-hero-value">' + (c.temp !== null ? c.temp + '<span class="weather-hero-unit">' + c.tempUnit + '</span>' : '--') + '</div>';
    html += '<div class="data-hero-label"><i class="fa-solid ' + c.icon + '"></i> ' + esc(c.desc) + '</div>';
    if (data.timezone) {
        try {
            var localTime = new Date().toLocaleTimeString('en-US', { timeZone: data.timezone, hour: 'numeric', minute: '2-digit' });
            html += '<div class="data-hero-sub" style="color:rgba(255,255,255,0.6)">' + localTime + '</div>';
        } catch (e) {}
    }
    html += '</div>';
    html += '</div>';

    html += '<div class="card-grid">';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-droplet c-blue"></i></div>';
    html += '<div class="card-value">' + (c.humidity !== null ? c.humidity + '%' : '--') + '</div>';
    html += '<div class="card-label">Humidity</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-wind c-cyan"></i></div>';
    html += '<div class="card-value">' + (c.wind !== null ? c.wind : '--') + '</div>';
    html += '<div class="card-label">' + c.dirLabel + ' ' + c.windUnit + (c.windGust ? ' (G' + c.windGust + ')' : '') + '</div>';
    html += '</div>';
    html += '<div class="card">';
    html += '<div class="card-icon"><i class="fa-solid fa-eye c-purple"></i></div>';
    html += '<div class="card-value">' + (c.visibility !== null ? c.visibility : '--') + '</div>';
    html += '<div class="card-label">Visibility ' + c.visUnit + '</div>';
    html += '</div>';
    html += '<div class="card card-action" id="radar-card" data-lat="' + data.location.lat + '" data-lon="' + data.location.lon + '" data-name="' + esc(data.location.name) + '">';
    html += '<div class="card-icon"><i class="fa-solid fa-satellite-dish c-green"></i></div>';
    html += '<div class="card-value" style="font-size:0.85rem">Live</div>';
    html += '<div class="card-label">Radar</div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="badges">';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-temperature-arrow-down c-blue"></i>';
    html += '<span class="label">Feels Like</span>';
    html += '<span class="value">' + (c.feelsLike !== null ? c.feelsLike + ' ' + c.tempUnit : '--') + '</span>';
    html += '</div>';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-temperature-low c-blue"></i>';
    html += '<span class="label">Dewpoint</span>';
    html += '<span class="value">' + (c.dewpoint !== null ? c.dewpoint + ' ' + c.dewpointUnit : '--') + '</span>';
    html += '</div>';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-gauge c-green"></i>';
    html += '<span class="label">Pressure</span>';
    html += '<span class="value">' + (c.pressure !== null ? c.pressure + ' ' + c.pressureUnit : '--') + '</span>';
    html += '</div>';
    html += '<div class="badge">';
    html += '<i class="fa-solid fa-cloud c-muted"></i>';
    html += '<span class="label">Cloud Cover</span>';
    html += '<span class="value">' + (c.cloud !== null ? c.cloud + '%' : '--') + '</span>';
    html += '</div>';
    html += '</div>';

    // Hourly chart data
    var metric = isMetric();
    STATE.chartHourly = (data.hourlyRaw || []).map(function(h) {
        return {
            time: h.time,
            temp: metric ? h.temp : (h.temp * 9 / 5 + 32)
        };
    });
    STATE.chartUnit = metric ? '°C' : '°F';
    STATE.chartHumidity = (data.hourlyRaw || []).map(function(h) {
        return { time: h.time, value: h.humidity };
    });
    STATE.chartWind = (data.hourlyRaw || []).map(function(h) {
        return { time: h.time, value: metric ? h.wind : (h.wind !== null ? h.wind * 0.621371 : null) };
    });
    STATE.chartWindUnit = metric ? 'km/h' : 'mph';
    STATE.chartPressure = (data.hourlyRaw || []).map(function(h) {
        return { time: h.time, value: metric ? h.pressure : (h.pressure !== null ? h.pressure / 33.8639 : null) };
    });
    STATE.chartPressureUnit = metric ? 'hPa' : 'inHg';
    STATE.chartVisibility = (data.hourlyRaw || []).map(function(h) {
        return { time: h.time, value: metric ? (h.visibility !== null ? h.visibility / 1000 : null) : (h.visibility !== null ? h.visibility / 1609.34 : null) };
    });
    STATE.chartVisUnit = metric ? 'km' : 'mi';
    STATE.chartFeelsLike = (data.hourlyRaw || []).map(function(h) {
        return { time: h.time, value: metric ? h.feelsLike : (h.feelsLike !== null ? h.feelsLike * 9 / 5 + 32 : null) };
    });
    STATE.chartDewpoint = (data.hourlyRaw || []).map(function(h) {
        return { time: h.time, value: metric ? h.dewpoint : (h.dewpoint !== null ? h.dewpoint * 9 / 5 + 32 : null) };
    });
    STATE.chartCloud = (data.hourlyRaw || []).map(function(h) {
        return { time: h.time, value: h.cloud };
    });
    STATE.activeChartTab = 'temp';

    html += '<div class="section-title"><i class="fa-solid fa-chart-line"></i> 7-Day Forecast</div>';
    html += '<div class="chart-tabs" id="weather-chart-tabs">';
    html += '<button class="chart-tab active" data-tab="temp">Temperature</button>';
    html += '<button class="chart-tab" data-tab="feelslike">Feels Like</button>';
    html += '<button class="chart-tab" data-tab="humidity">Humidity</button>';
    html += '<button class="chart-tab" data-tab="visibility">Visibility</button>';
    html += '<button class="chart-tab" data-tab="wind">Wind</button>';
    html += '<button class="chart-tab" data-tab="dewpoint">Dew Point</button>';
    html += '<button class="chart-tab" data-tab="pressure">Pressure</button>';
    html += '<button class="chart-tab" data-tab="cloud">Cloud Cover</button>';
    html += '</div>';
    html += '<div class="weather-chart" id="weather-chart-wrap">';
    html += '<canvas></canvas>';
    html += '<div class="weather-chart-tooltip"></div>';
    html += '<button class="chart-expand-btn" id="weather-chart-expand" aria-label="Expand chart"><i class="fa-solid fa-expand"></i></button>';
    html += '</div>';

    results.innerHTML = html;

    // 7-day forecast (right column)
    var forecastHtml = '';
    if (data.forecast && data.forecast.length > 0) {
        forecastHtml += '<div class="section-title"><i class="fa-solid fa-calendar-days"></i> 7-Day Forecast</div>';

        data.forecast.forEach(function(day) {
            var wmo = WMO_CODES[day.code] || WMO_CODES[0];
            var hi, lo, windVal, windU, precipVal, precipU;

            if (metric) {
                hi = Math.round(day.tempMax);
                lo = Math.round(day.tempMin);
                windVal = Math.round(day.windMax);
                windU = 'km/h';
                precipVal = day.precip.toFixed(1);
                precipU = 'mm';
            } else {
                hi = Math.round(day.tempMax * 9 / 5 + 32);
                lo = Math.round(day.tempMin * 9 / 5 + 32);
                windVal = Math.round(day.windMax * 0.621371);
                windU = 'mph';
                precipVal = (day.precip / 25.4).toFixed(2);
                precipU = 'in';
            }

            var dateLabel = formatDate(day.date);
            var details = esc(wmo.desc) + ' · ' + windVal + ' ' + windU;
            if (day.precip > 0) {
                details += ' · ' + precipVal + ' ' + precipU;
            }

            forecastHtml += '<div class="row row-wrap">';
            forecastHtml += '<div class="row-icon"><i class="fa-solid ' + wmo.icon + '" style="color:' + wmo.color + '"></i></div>';
            forecastHtml += '<div class="row-label">' + dateLabel + '</div>';
            forecastHtml += '<div class="row-text right">' + hi + '° / ' + lo + '°</div>';
            forecastHtml += '<div class="row-detail">' + details + '</div>';
            forecastHtml += '</div>';
        });
    }
    document.querySelector(SELECTORS.forecast).innerHTML = forecastHtml;

    initWeatherChart();
    initRadarCard();
}

// ===== RADAR MODAL =====

function initRadarCard() {
    var card = document.getElementById('radar-card');
    if (!card) return;

    card.addEventListener('click', function () {
        var lat = card.getAttribute('data-lat');
        var lon = card.getAttribute('data-lon');
        var name = card.getAttribute('data-name') || 'Radar';
        openRadarModal(parseFloat(lat), parseFloat(lon), name);
    });
}

function openRadarModal(lat, lon, name) {
    // Remove existing modal if any
    var existing = document.getElementById('radar-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.className = 'lightbox open';
    modal.id = 'radar-modal';
    modal.innerHTML =
        '<div class="chart-modal-panel" style="height:min(80vh,600px);display:flex;flex-direction:column">' +
            '<div class="chart-modal-header">' +
                '<span class="chart-modal-title"><i class="fa-solid fa-satellite-dish"></i> Radar — ' + esc(name) + '</span>' +
                '<button class="map-panel-close" id="radar-modal-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div style="flex:1;min-height:0">' +
                '<iframe id="radar-iframe" style="width:100%;height:100%;border:none;border-radius:0 0 var(--radius) var(--radius)" loading="lazy"></iframe>' +
            '</div>' +
        '</div>';

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    // RainViewer embed — free, live, no API key
    var iframe = document.getElementById('radar-iframe');
    iframe.src = 'https://www.rainviewer.com/map.html?loc=' + lat + ',' + lon + ',8&oFa=1&oC=1&oU=0&oCS=1&oF=0&oAP=1&c=1&o=83&lm=1&layer=radar&sm=1&sn=1';

    function close() {
        modal.remove();
        document.body.style.overflow = '';
    }

    modal.addEventListener('click', function (e) {
        if (e.target === modal) close();
    });
    document.getElementById('radar-modal-close').addEventListener('click', close);
    var onKey = function (e) {
        if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
    };
    document.addEventListener('keydown', onKey);
}

// ===== TEMPERATURE TREND CHART =====

function initWeatherChart() {
    var wrap = document.getElementById('weather-chart-wrap');
    if (!wrap) return;
    var canvas = wrap.querySelector('canvas');
    var tooltip = wrap.querySelector('.weather-chart-tooltip');
    if (!canvas || !tooltip) return;

    STATE.chartCanvas = canvas;
    STATE.chartTooltip = tooltip;

    // Tab switching
    var tabs = document.getElementById('weather-chart-tabs');
    if (tabs) {
        tabs.addEventListener('click', function(e) {
            var btn = e.target.closest('.chart-tab');
            if (!btn) return;
            tabs.querySelectorAll('.chart-tab').forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            STATE.activeChartTab = btn.getAttribute('data-tab');
            STATE.chartPoints = [];
            tooltip.style.display = 'none';
            drawWeatherChart();
        });
    }

    var dpr = window.devicePixelRatio || 1;
    function resize() {
        var rect = wrap.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        drawWeatherChart();
    }

    var resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 100);
    });

    canvas.addEventListener('mousemove', function(e) { weatherChartHover(e, wrap); });
    canvas.addEventListener('mouseleave', function() {
        tooltip.style.display = 'none';
    });
    canvas.addEventListener('touchstart', function(e) {
        weatherChartHover(e.touches[0], wrap);
    }, { passive: true });

    window.addEventListener('themechange', drawWeatherChart);
    resize();

    // Expand button
    var expandBtn = document.getElementById('weather-chart-expand');
    if (expandBtn) {
        expandBtn.addEventListener('click', function() {
            var tabNames = { temp: 'Temperature', feelslike: 'Feels Like', humidity: 'Humidity', visibility: 'Visibility', wind: 'Wind', dewpoint: 'Dew Point', pressure: 'Pressure', cloud: 'Cloud Cover' };
            var title = tabNames[STATE.activeChartTab] || '7-Day Forecast';
            openChartModal(STATE, drawWeatherChart, weatherChartHover, title);
        });
    }
}

function tempColor(temp, unit) {
    // Normalize to Celsius for thresholds
    var c = unit === '°F' ? (temp - 32) * 5 / 9 : temp;
    if (c >= 35) return '#ef4444';
    if (c >= 25) return '#f97316';
    if (c >= 15) return '#f59e0b';
    if (c >= 5) return '#22c55e';
    if (c >= -5) return '#06b6d4';
    return '#3b82f6';
}

function drawWeatherChart() {
    var tab = STATE.activeChartTab;
    if (tab === 'humidity') { drawHumidityChart(); return; }
    if (tab === 'wind') { drawWindChart(); return; }
    if (tab === 'pressure') { drawPressureChart(); return; }
    if (tab === 'visibility') { drawVisibilityChart(); return; }
    if (tab === 'feelslike') { drawFeelsLikeChart(); return; }
    if (tab === 'dewpoint') { drawDewpointChart(); return; }
    if (tab === 'cloud') { drawCloudChart(); return; }
    drawTempChart();
}

function drawTempChart() {
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

    // Y-axis range from data
    var minTemp = Infinity;
    var maxTemp = -Infinity;
    data.forEach(function(d) {
        if (d.temp < minTemp) minTemp = d.temp;
        if (d.temp > maxTemp) maxTemp = d.temp;
    });
    // Add padding and round to nice numbers
    var range = maxTemp - minTemp;
    var padding = Math.max(range * 0.15, 2);
    minTemp = Math.floor(minTemp - padding);
    maxTemp = Math.ceil(maxTemp + padding);
    var tempRange = maxTemp - minTemp;

    // Horizontal gridlines + y-axis labels
    var step = tempRange <= 15 ? 2 : (tempRange <= 30 ? 5 : 10);
    var firstGrid = Math.ceil(minTemp / step) * step;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var g = firstGrid; g <= maxTemp; g += step) {
        var y = pad.top + plotH - ((g - minTemp) / tempRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(g + '°', pad.left - 6 * dpr, y);
    }

    // Time range
    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0];
    var tMax = times[times.length - 1];
    var tRange = tMax - tMin;
    if (tRange <= 0) return;

    // X-axis: day labels at midnight boundaries
    drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor);

    // Draw temperature line as segments colored by temp
    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var temp = data[i].temp;
        if (temp === null || temp === undefined) continue;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = (temp - minTemp) / tempRange;

        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;

        points.push({ cx: cx, cy: cy, temp: temp, time: ts });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: Math.round(temp), time: ts,
            unit: STATE.chartUnit,
            color: tempColor(temp, STATE.chartUnit)
        });
    }

    // Fill under the line
    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].cx, pad.top + plotH);
        for (var i = 0; i < points.length; i++) {
            ctx.lineTo(points[i].cx, points[i].cy);
        }
        ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
        ctx.closePath();

        var avgTemp = 0;
        points.forEach(function(p) { avgTemp += p.temp; });
        avgTemp /= points.length;
        var fillColor = tempColor(avgTemp, STATE.chartUnit);

        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, fillColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Draw line segments
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var i = 1; i < points.length; i++) {
        var prev = points[i - 1];
        var curr = points[i];
        var avgTemp = (prev.temp + curr.temp) / 2;
        ctx.strokeStyle = tempColor(avgTemp, STATE.chartUnit);
        ctx.beginPath();
        ctx.moveTo(prev.cx, prev.cy);
        ctx.lineTo(curr.cx, curr.cy);
        ctx.stroke();
    }

    // "Now" line
    drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr);
}

function drawHumidityChart() {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';
    var lineColor = '#3b82f6';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 36 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartHumidity;
    if (!data.length) return;

    // Y-axis: 0-100%
    var minVal = 0;
    var maxVal = 100;
    var valRange = 100;

    // Gridlines
    var step = 20;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var g = 0; g <= 100; g += step) {
        var y = pad.top + plotH - (g / valRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(g + '%', pad.left - 6 * dpr, y);
    }

    // Time range
    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0];
    var tMax = times[times.length - 1];
    var tRange = tMax - tMin;
    if (tRange <= 0) return;

    drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor);

    // Build points
    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var val = data[i].value;
        if (val === null || val === undefined) continue;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = val / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        points.push({ cx: cx, cy: cy, val: val, time: ts });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: Math.round(val), time: ts,
            unit: '%',
            color: lineColor
        });
    }

    // Fill
    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].cx, pad.top + plotH);
        for (var i = 0; i < points.length; i++) ctx.lineTo(points[i].cx, points[i].cy);
        ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, lineColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].cx, points[i].cy);
        else ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.stroke();

    drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr);
}

function drawWindChart() {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';
    var lineColor = '#06b6d4';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 36 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartWind;
    if (!data.length) return;

    // Y-axis from data
    var minVal = 0;
    var maxVal = -Infinity;
    data.forEach(function(d) {
        if (d.value !== null && d.value > maxVal) maxVal = d.value;
    });
    var padding = Math.max(maxVal * 0.15, 5);
    maxVal = Math.ceil(maxVal + padding);
    var valRange = maxVal - minVal;

    // Gridlines
    var step = valRange <= 20 ? 5 : (valRange <= 50 ? 10 : 20);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var g = 0; g <= maxVal; g += step) {
        var y = pad.top + plotH - (g / valRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(g, pad.left - 6 * dpr, y);
    }

    // Time range
    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0];
    var tMax = times[times.length - 1];
    var tRange = tMax - tMin;
    if (tRange <= 0) return;

    drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor);

    // Build points
    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var val = data[i].value;
        if (val === null || val === undefined) continue;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = val / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        points.push({ cx: cx, cy: cy, val: val, time: ts });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: Math.round(val), time: ts,
            unit: ' ' + STATE.chartWindUnit,
            color: lineColor
        });
    }

    // Fill
    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].cx, pad.top + plotH);
        for (var i = 0; i < points.length; i++) ctx.lineTo(points[i].cx, points[i].cy);
        ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, lineColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].cx, points[i].cy);
        else ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.stroke();

    drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr);
}

function drawPressureChart() {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';
    var lineColor = '#22c55e';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 42 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartPressure;
    if (!data.length) return;

    var isImperial = STATE.chartPressureUnit === 'inHg';

    // Y-axis from data
    var minVal = Infinity;
    var maxVal = -Infinity;
    data.forEach(function(d) {
        if (d.value !== null && d.value !== undefined) {
            if (d.value < minVal) minVal = d.value;
            if (d.value > maxVal) maxVal = d.value;
        }
    });
    var range = maxVal - minVal;
    var padding = Math.max(range * 0.15, isImperial ? 0.1 : 3);
    minVal = isImperial ? Math.floor((minVal - padding) * 100) / 100 : Math.floor(minVal - padding);
    maxVal = isImperial ? Math.ceil((maxVal + padding) * 100) / 100 : Math.ceil(maxVal + padding);
    var valRange = maxVal - minVal;

    // Gridlines
    var step = isImperial ? 0.1 : (valRange <= 15 ? 2 : (valRange <= 30 ? 5 : 10));
    var firstGrid = isImperial ? Math.ceil(minVal / step) * step : Math.ceil(minVal / step) * step;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var g = firstGrid; g <= maxVal + step * 0.01; g += step) {
        var y = pad.top + plotH - ((g - minVal) / valRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(isImperial ? g.toFixed(1) : Math.round(g), pad.left - 6 * dpr, y);
    }

    // Time range
    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0];
    var tMax = times[times.length - 1];
    var tRange = tMax - tMin;
    if (tRange <= 0) return;

    drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor);

    // Build points
    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var val = data[i].value;
        if (val === null || val === undefined) continue;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = (val - minVal) / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        points.push({ cx: cx, cy: cy, val: val, time: ts });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: isImperial ? val.toFixed(2) : Math.round(val), time: ts,
            unit: ' ' + STATE.chartPressureUnit,
            color: lineColor
        });
    }

    // Fill
    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].cx, pad.top + plotH);
        for (var i = 0; i < points.length; i++) ctx.lineTo(points[i].cx, points[i].cy);
        ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, lineColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].cx, points[i].cy);
        else ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.stroke();

    drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr);
}

function drawVisibilityChart() {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';
    var lineColor = '#a855f7';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 36 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartVisibility;
    if (!data.length) return;

    // Y-axis from data, starting at 0
    var minVal = 0;
    var maxVal = -Infinity;
    data.forEach(function(d) {
        if (d.value !== null && d.value > maxVal) maxVal = d.value;
    });
    var padding = Math.max(maxVal * 0.15, 1);
    maxVal = Math.ceil(maxVal + padding);
    var valRange = maxVal - minVal;

    // Gridlines
    var step = valRange <= 10 ? 2 : (valRange <= 30 ? 5 : 10);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var g = 0; g <= maxVal; g += step) {
        var y = pad.top + plotH - (g / valRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(g, pad.left - 6 * dpr, y);
    }

    // Time range
    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0];
    var tMax = times[times.length - 1];
    var tRange = tMax - tMin;
    if (tRange <= 0) return;

    drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor);

    // Build points
    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var val = data[i].value;
        if (val === null || val === undefined) continue;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = val / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        points.push({ cx: cx, cy: cy, val: val, time: ts });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: val.toFixed(1), time: ts,
            unit: ' ' + STATE.chartVisUnit,
            color: lineColor
        });
    }

    // Fill
    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].cx, pad.top + plotH);
        for (var i = 0; i < points.length; i++) ctx.lineTo(points[i].cx, points[i].cy);
        ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, lineColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Line
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].cx, points[i].cy);
        else ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.stroke();

    drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr);
}

function drawFeelsLikeChart() {
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

    var data = STATE.chartFeelsLike;
    if (!data.length) return;

    var minVal = Infinity, maxVal = -Infinity;
    data.forEach(function(d) {
        if (d.value !== null && d.value !== undefined) {
            if (d.value < minVal) minVal = d.value;
            if (d.value > maxVal) maxVal = d.value;
        }
    });
    var range = maxVal - minVal;
    var padding = Math.max(range * 0.15, 2);
    minVal = Math.floor(minVal - padding);
    maxVal = Math.ceil(maxVal + padding);
    var valRange = maxVal - minVal;

    var step = valRange <= 15 ? 2 : (valRange <= 30 ? 5 : 10);
    var firstGrid = Math.ceil(minVal / step) * step;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var g = firstGrid; g <= maxVal; g += step) {
        var y = pad.top + plotH - ((g - minVal) / valRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(Math.round(g) + '°', pad.left - 6 * dpr, y);
    }

    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0], tMax = times[times.length - 1], tRange = tMax - tMin;
    if (tRange <= 0) return;

    drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor);

    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var val = data[i].value;
        if (val === null || val === undefined) continue;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = (val - minVal) / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        var color = tempColor(val, STATE.chartUnit);
        points.push({ cx: cx, cy: cy, val: val, time: ts, color: color });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: Math.round(val), time: ts,
            unit: STATE.chartUnit,
            color: color
        });
    }

    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].cx, pad.top + plotH);
        for (var i = 0; i < points.length; i++) ctx.lineTo(points[i].cx, points[i].cy);
        ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
        ctx.closePath();
        var avgVal = 0;
        points.forEach(function(p) { avgVal += p.val; });
        avgVal /= points.length;
        var fillColor = tempColor(avgVal, STATE.chartUnit);
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, fillColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (var i = 1; i < points.length; i++) {
        var prev = points[i - 1];
        var curr = points[i];
        var avgVal = (prev.val + curr.val) / 2;
        ctx.strokeStyle = tempColor(avgVal, STATE.chartUnit);
        ctx.beginPath();
        ctx.moveTo(prev.cx, prev.cy);
        ctx.lineTo(curr.cx, curr.cy);
        ctx.stroke();
    }

    drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr);
}

function drawDewpointChart() {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';
    var lineColor = '#06b6d4';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 36 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartDewpoint;
    if (!data.length) return;

    var minVal = Infinity, maxVal = -Infinity;
    data.forEach(function(d) {
        if (d.value !== null && d.value !== undefined) {
            if (d.value < minVal) minVal = d.value;
            if (d.value > maxVal) maxVal = d.value;
        }
    });
    var range = maxVal - minVal;
    var padding = Math.max(range * 0.15, 2);
    minVal = Math.floor(minVal - padding);
    maxVal = Math.ceil(maxVal + padding);
    var valRange = maxVal - minVal;

    var step = valRange <= 15 ? 2 : (valRange <= 30 ? 5 : 10);
    var firstGrid = Math.ceil(minVal / step) * step;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var g = firstGrid; g <= maxVal; g += step) {
        var y = pad.top + plotH - ((g - minVal) / valRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(Math.round(g) + '°', pad.left - 6 * dpr, y);
    }

    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0], tMax = times[times.length - 1], tRange = tMax - tMin;
    if (tRange <= 0) return;

    drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor);

    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var val = data[i].value;
        if (val === null || val === undefined) continue;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = (val - minVal) / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        points.push({ cx: cx, cy: cy, val: val, time: ts });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: Math.round(val), time: ts,
            unit: STATE.chartUnit,
            color: lineColor
        });
    }

    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].cx, pad.top + plotH);
        for (var i = 0; i < points.length; i++) ctx.lineTo(points[i].cx, points[i].cy);
        ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, lineColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].cx, points[i].cy);
        else ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.stroke();

    drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr);
}

function drawCloudChart() {
    var canvas = STATE.chartCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.width;
    var h = canvas.height;

    var style = getComputedStyle(document.documentElement);
    var textDim = style.getPropertyValue('--text-dim').trim() || '#444';
    var borderColor = style.getPropertyValue('--border').trim() || '#1a1a1a';
    var lineColor = '#6b7280';

    ctx.clearRect(0, 0, w, h);

    var pad = { top: 16 * dpr, right: 16 * dpr, bottom: 28 * dpr, left: 36 * dpr };
    var plotW = w - pad.left - pad.right;
    var plotH = h - pad.top - pad.bottom;

    var data = STATE.chartCloud;
    if (!data.length) return;

    var valRange = 100;

    var step = 20;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = (10 * dpr) + 'px ' + FONT;
    for (var g = 0; g <= 100; g += step) {
        var y = pad.top + plotH - (g / valRange) * plotH;
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = dpr;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(w - pad.right, y);
        ctx.stroke();
        ctx.fillStyle = textDim;
        ctx.fillText(g + '%', pad.left - 6 * dpr, y);
    }

    var times = data.map(function(d) { return new Date(d.time).getTime(); });
    var tMin = times[0], tMax = times[times.length - 1], tRange = tMax - tMin;
    if (tRange <= 0) return;

    drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor);

    STATE.chartPoints = [];
    var points = [];
    for (var i = 0; i < data.length; i++) {
        var val = data[i].value;
        if (val === null || val === undefined) continue;
        var ts = times[i];
        var xPct = (ts - tMin) / tRange;
        var yPct = val / valRange;
        var cx = pad.left + xPct * plotW;
        var cy = pad.top + plotH - yPct * plotH;
        points.push({ cx: cx, cy: cy, val: val, time: ts });
        STATE.chartPoints.push({
            x: cx / dpr, y: cy / dpr,
            value: Math.round(val), time: ts,
            unit: '%',
            color: lineColor
        });
    }

    if (points.length > 1) {
        ctx.beginPath();
        ctx.moveTo(points[0].cx, pad.top + plotH);
        for (var i = 0; i < points.length; i++) ctx.lineTo(points[i].cx, points[i].cy);
        ctx.lineTo(points[points.length - 1].cx, pad.top + plotH);
        ctx.closePath();
        var grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        grad.addColorStop(0, lineColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.globalAlpha = 0.1;
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (var i = 0; i < points.length; i++) {
        if (i === 0) ctx.moveTo(points[i].cx, points[i].cy);
        else ctx.lineTo(points[i].cx, points[i].cy);
    }
    ctx.stroke();

    drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr);
}

// Shared: draw x-axis day labels at midnight boundaries
function drawXAxisDays(ctx, data, tMin, tRange, pad, plotW, plotH, dpr, textDim, borderColor) {
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
}

// Shared: draw "Now" dashed line
function drawNowLine(ctx, tMin, tMax, tRange, pad, plotW, plotH, dpr) {
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

function weatherChartHover(e, wrap) {
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
        var timeStr = days[d.getDay()] + ' ' + hr12 + ' ' + ampm;
        tooltip.innerHTML =
            '<span style="color:' + closest.color + ';font-weight:700">' + closest.value + closest.unit + '</span>' +
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

function weatherBgImage(code) {
    if (code >= 95) return 'weather-storm.jpg';          // Thunderstorms
    if (code >= 85) return 'weather-snow.jpg';            // Snow showers
    if (code >= 80) return 'weather-rain.jpg';            // Rain showers
    if (code >= 71 && code <= 77) return 'weather-snow.jpg';  // Snowfall
    if (code >= 66 && code <= 67) return 'weather-sleet.jpg'; // Freezing rain
    if (code >= 61 && code <= 65) return 'weather-rain.jpg';  // Rain
    if (code >= 56 && code <= 57) return 'weather-sleet.jpg'; // Freezing drizzle
    if (code >= 51 && code <= 55) return 'weather-rain.jpg';  // Drizzle
    if (code >= 45 && code <= 48) return 'weather-fog.jpg';   // Fog
    if (code === 3) return 'weather-cloudy.jpg';              // Overcast
    if (code === 2) return 'weather-cloudy.jpg';              // Partly cloudy
    return 'weather-clear.jpg';                               // Clear / mainly clear
}

function formatDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return days[d.getDay()] + ' ' + months[d.getMonth()] + ' ' + d.getDate();
}

// Auto-load on page load
document.addEventListener('DOMContentLoaded', init);
