/**
 * Shared search autocomplete + AJAX results loader.
 *
 * Usage:
 *   earthDataSearch({ path: '/weather', loadingText: 'Loading weather data...', emptyIcon: 'fa-cloud-sun', emptyText: 'Enter a city or place name' });
 */
function earthDataSearch(config) {
    var input = document.getElementById('q');
    var dropdown = document.getElementById('ac-dropdown');
    var results = document.getElementById('results');
    var form = input.closest('form');
    var clearBtn = document.getElementById('search-clear');
    var timer = null;
    var active = -1;
    var items = [];

    // Inject geolocation button
    var geoBtn = document.createElement('button');
    geoBtn.type = 'button';
    geoBtn.className = 'search-geolocate';
    geoBtn.id = 'search-geolocate';
    geoBtn.setAttribute('aria-label', 'Use current location');
    geoBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
    clearBtn.parentNode.insertBefore(geoBtn, clearBtn);

    var STORAGE_KEY = 'ed_location';
    var baseTitle = document.title;

    function setTitle(q) {
        if (!q) { document.title = baseTitle; return; }
        var location = q.split(',')[0].trim();
        var parts = baseTitle.split(' — ');
        document.title = parts[0] + ' in ' + location + (parts[1] ? ' — ' + parts[1] : '');
        var ogTitle = parts[0] + ' in ' + location;
        document.querySelector('meta[property="og:title"]').setAttribute('content', ogTitle);
        document.querySelector('meta[name="twitter:title"]').setAttribute('content', ogTitle);
    }

    function clearRightPanel() {
        var right = document.querySelector('.home-right .page-content');
        if (right) right.innerHTML = '';
    }

    function toggleClear() {
        var hasText = input.value.length > 0;
        clearBtn.classList.toggle('visible', hasText);
        geoBtn.classList.toggle('visible', !hasText);
    }
    toggleClear();
    clearBtn.addEventListener('click', function() {
        input.value = '';
        toggleClear();
        input.focus();
        closeDropdown();
        setTitle('');
        clearRightPanel();
        if (config.onClear) {
            history.pushState(null, '', config.path);
            config.onClear();
        } else if (config.saveLocation) {
            localStorage.removeItem(STORAGE_KEY);
            if (window.updateLogoFlag) updateLogoFlag();
            history.pushState(null, '', config.path);
            if (results) results.innerHTML = '<div class="empty"><i class="fa-solid ' + config.emptyIcon + '"></i> ' + config.emptyText + '</div>';
        }
    });

    geoBtn.addEventListener('click', function() {
        if (!navigator.geolocation) return;
        geoBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
        geoBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(function(pos) {
            var lat = pos.coords.latitude;
            var lon = pos.coords.longitude;
            fetch('https://nominatim.openstreetmap.org/reverse?' + new URLSearchParams({
                lat: lat, lon: lon, format: 'json', addressdetails: '1'
            }), { headers: { 'Accept': 'application/json' } })
            .then(function(r) { return r.json(); })
            .then(function(data) {
                geoBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
                geoBtn.disabled = false;
                if (!data) return;
                var addr = data.address || {};
                var place = addr.city || addr.town || addr.village || addr.hamlet || addr.suburb || addr.neighbourhood || '';
                var state = addr.state || addr.province || addr.region || '';
                var country = addr.country || '';
                var parts = [place, state, country].filter(Boolean);
                var q = parts.join(', ') || data.display_name || (lat + ',' + lon);
                loadResults(q, { lat: lat, lon: lon });
            })
            .catch(function() {
                geoBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
                geoBtn.disabled = false;
            });
        }, function() {
            geoBtn.innerHTML = '<i class="fa-solid fa-crosshairs"></i>';
            geoBtn.disabled = false;
        }, { timeout: 10000 });
    });

    function closeDropdown() {
        dropdown.classList.remove('open');
        dropdown.innerHTML = '';
        input.classList.remove('open-dropdown');
        active = -1;
        items = [];
    }

    function openDropdown() {
        dropdown.classList.add('open');
        input.classList.add('open-dropdown');
    }

    function setActive(idx) {
        items.forEach(function(el, i) { el.classList.toggle('active', i === idx); });
        active = idx;
    }

    function loadResults(q, coords) {
        closeDropdown();
        input.value = q;
        input.blur();
        resetInputScroll();
        toggleClear();
        history.pushState(null, '', config.path + '?q=' + encodeURIComponent(q));
        setTitle(q);

        // If onSelect callback is provided, use it instead of AJAX
        if (config.onSelect) {
            config.onSelect(q, coords || null);
            return;
        }

        results.innerHTML = '<div class="loading"><i class="fa-solid fa-spinner fa-spin"></i> ' + config.loadingText + '</div>';
        fetch(config.path + '?q=' + encodeURIComponent(q), { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then(function(r) { return r.text(); })
            .then(function(html) {
                var doc = new DOMParser().parseFromString(html, 'text/html');
                var nr = doc.getElementById('results');
                if (nr) {
                    results.innerHTML = nr.innerHTML;
                    if (config.saveLocation) {
                        var loc = nr.querySelector('#loc-resolve');
                        if (loc) {
                            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                                q: loc.dataset.q,
                                lat: parseFloat(loc.dataset.lat),
                                lon: parseFloat(loc.dataset.lon),
                                name: loc.dataset.name
                            }));
                        }
                    }
                } else {
                    results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Failed to load data.</div>';
                }
            })
            .catch(function() {
                results.innerHTML = '<div class="error-msg"><i class="fa-solid fa-triangle-exclamation"></i> Network error. Try again.</div>';
            });
    }

    function shortenName(r) {
        var addr = r.address || {};
        var main = (r.display_name || '').split(', ')[0] || r.name || '';
        var state = addr.state || addr.province || addr.region || '';
        var country = addr.country || '';

        var sub = '';
        if (state && country) sub = state + ', ' + country;
        else if (country) sub = country;
        else if (state) sub = state;

        return { main: main, sub: sub };
    }

    var savedInputValue = '';

    input.addEventListener('pointerdown', function() {
        if (this.value) {
            savedInputValue = this.value;
            this.value = '';
            toggleClear();
            closeDropdown();
        }
    });

    function resetInputScroll() {
        setTimeout(function() {
            input.scrollLeft = 0;
            input.setSelectionRange(0, 0);
        }, 0);
    }

    input.addEventListener('blur', function() {
        if (!this.value && savedInputValue) {
            this.value = savedInputValue;
            toggleClear();
        }
        resetInputScroll();
    });

    input.addEventListener('input', function() {
        toggleClear();
        clearTimeout(timer);
        var val = this.value.trim();
        if (val.length < 2) { closeDropdown(); return; }
        timer = setTimeout(function() {
            dropdown.innerHTML = '<div class="dropdown-spinner"><i class="fa-solid fa-spinner fa-spin"></i></div>';
            openDropdown();
            var params = { q: val, format: 'json', limit: '6', addressdetails: '1' };
            if (config.nominatimParams) {
                for (var k in config.nominatimParams) params[k] = config.nominatimParams[k];
            }
            var url = 'https://nominatim.openstreetmap.org/search?' + new URLSearchParams(params);
            fetch(url, { headers: { 'Accept': 'application/json' } })
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (!data.length) { closeDropdown(); return; }
                    dropdown.innerHTML = '';
                    active = -1;
                    items = [];
                    var seen = new Set();
                    data.forEach(function(r) {
                        var info = shortenName(r);
                        var key = info.main + '|' + info.sub;
                        if (seen.has(key)) return;
                        seen.add(key);
                        var type = r.type || '';
                        var icon = 'fa-location-dot';
                        if (/city|town|village/.test(type)) icon = 'fa-city';
                        else if (/postcode/.test(type)) icon = 'fa-hashtag';
                        else if (/state|county/.test(type)) icon = 'fa-map';
                        var el = document.createElement('div');
                        el.className = 'dropdown-item';
                        el.innerHTML = '<i class="fa-solid ' + icon + '"></i>'
                            + '<span class="item-main">' + info.main + '</span>'
                            + '<span class="item-sub">' + info.sub + '</span>';
                        el.addEventListener('click', function() { loadResults(info.main + ', ' + info.sub, { lat: parseFloat(r.lat), lon: parseFloat(r.lon) }); });
                        dropdown.appendChild(el);
                        items.push(el);
                    });
                    openDropdown();
                })
                .catch(function() { closeDropdown(); });
        }, 350);
    });

    input.addEventListener('keydown', function(e) {
        if (!items.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active < items.length - 1 ? active + 1 : 0); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active > 0 ? active - 1 : items.length - 1); }
        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); items[active].click(); }
        else if (e.key === 'Escape') { closeDropdown(); }
    });

    document.addEventListener('click', function(e) {
        if (!e.target.closest('.search-wrap')) closeDropdown();
    });

    form.addEventListener('submit', function(e) {
        var val = input.value.trim();
        if (val) { e.preventDefault(); loadResults(val); }
    });

    window.addEventListener('popstate', function() {
        var params = new URLSearchParams(window.location.search);
        var q = params.get('q') || '';
        input.value = q;
        toggleClear();
        setTitle(q);
        if (q) loadResults(q);
        else {
            clearRightPanel();
            if (config.onClear) config.onClear();
            else if (results) results.innerHTML = '<div class="empty"><i class="fa-solid ' + config.emptyIcon + '"></i> ' + config.emptyText + '</div>';
        }
    });

    // Populate input from URL query param on page load
    var urlQ = new URLSearchParams(window.location.search).get('q');
    if (urlQ) {
        input.value = urlQ;
        toggleClear();
        resetInputScroll();
        setTitle(urlQ);
    }

    // Auto-load from saved location if no query in URL
    if (config.saveLocation && !urlQ) {
        try {
            var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (saved && saved.q) {
                input.value = saved.q;
                toggleClear();
                loadResults(saved.q);
            }
        } catch (e) {}
    }
}
