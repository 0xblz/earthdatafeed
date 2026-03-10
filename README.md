# Earth

Live environmental data. Jekyll static site with vanilla JavaScript.

Live at [earthdatafeed.com](https://earthdatafeed.com)

## Pages

- **Home** — Dashboard with NASA EPIC Earth gallery, monitoring links with live badges (temp, AQI, UV when location set, earthquake count) and clear-location control (left); "Planetary Overview" tabbed panel (right on desktop, stacked on mobile): Earthquakes tab shows a live 3D earthquake globe, Solar System tab shows a 2D canvas orrery with all planets + Pluto (zoom/pan); plus Global/Local Alerts section
- **Weather** — Split layout: left has current conditions (large temp display with local time), cards, badges, 7-day trend chart with 8 tabs, live radar modal via RainViewer, NWS active alerts at top when present; right has 7-day forecast rows (Open-Meteo + NWS)
- **Air Quality** — Split layout: left has AQI, cards, 72-hour AQI trend chart, AQI scale; right has pollutant breakdown and 3-day forecast rows (Open-Meteo)
- **UV Index** — Split layout: left has current UV, cards, daily UV curve chart, UV scale; right has today's hourly UV and multi-day forecast rows (Open-Meteo)
- **Tides** — Split layout: left has current station, water level, tide curve chart, today's tides; right has 3-day forecast rows and nearest stations list with station switching (NOAA CO-OPS)
- **Moon** — Split layout: left has phase banner, illumination, distance, badges; right has phase calendar with days-until
- **Solar** — Split layout: left has X-ray flux chart, Kp index, solar wind, 3-day forecast; right has recent flares list (NOAA SWPC)
- **Earthquakes** — Split layout: left has city search filter (sort by distance), timeline chart with Magnitude/Activity tabs and 24h/30d range toggle, feed with pulsing dots for recent quakes; right has 3D earthquake globe with M4+/largest/total overlays and M4+ earthquake list (USGS)
- **Aurora** — Split layout: left has hero banner, Kp bar chart, Bz, hemispheric power, visibility guide; right has 3-day forecast rows and Kp index history (NOAA SWPC)
- **Satellite** — NASA GIBS imagery map with 16 layers (True Color, Night Lights, Fires, Sea Surface Temp, Snow Cover, Vegetation, Aerosol, Cloud Top Temp, Water Vapor, Carbon Monoxide, Chlorophyll, Sea Ice, Land Surface Temp, Flood Extent, Precipitation, Dust Score), date picker, opacity slider (MapLibre GL)

## Stack

- Jekyll static site, no build step beyond Jekyll; `jekyll-sitemap` generates sitemap.xml
- Vanilla JavaScript (no frameworks) + Three.js (homepage globe, via importmap CDN) + MapLibre GL (satellite map, via CDN)
- SCSS with `@import` (8 partials)
- Font Awesome icons
- All data fetched client-side from public APIs (no API keys needed)
- `world-atlas@2` + `topojson-client@3` for procedural globe land-mass texture (CDN, homepage only)

## Project Structure

```
llms.txt             # LLM-readable site description (llmstxt.org spec)
robots.txt           # Crawl directives + sitemap reference
manifest.json        # Web app manifest (standalone PWA on iOS)
_config.yml          # Jekyll config, site URL, SCSS settings
_layouts/default.html # Base layout (head, header, dashboard-scroll, footer)
_includes/
  head.html          # Meta tags, SEO, OG, JSON-LD (WebSite + Dataset + BreadcrumbList), stylesheets, theme init script
  header.html        # Logo, country flag badge, nav, unit toggle, theme toggle
  footer.html        # Links, GA4 analytics, convertUtcTimes()
_sass/
  _variables.scss    # Google Fonts import (Ubuntu), CSS custom properties (:root)
  _base.scss         # Reset, body, links
  _animations.scss   # Keyframes, stagger delays, reduced-motion
  _layout.scss       # Container, header, footer, nav, dashboard grid, home split layout, toggles
  _components.scss   # Cards, sub-grid, badges, rows, section titles, data-hero, data-banner (shimmer), canvas charts, visibility box, load-more, flare count
  _forms.scss        # Search form, autocomplete dropdown, open-dropdown state
  _utilities.scss    # Color classes, probability levels, scale levels, solar flare classes
  _responsive.scss   # Mobile (<=600px), light mode (auto + forced via data-theme)
assets/
  css/style.scss     # Entry point (@import all partials)
  js/
    utils.js         # FONT, RECENT_QUAKE_MS, getUnits(), isMetric(), esc(), cached(), haversine(), relativeTime(), weatherAlertIcon()
    search.js        # earthDataSearch() — autocomplete + onSelect callback
    epic.js          # earthDataEpic() — NASA EPIC gallery with lightbox (latest Earth thumbnails)
    alerts.js        # earthDataAlerts() — homepage Global/Local Alerts with scroll-to links, clear-location control, TEST_ALERTS flag
    globe.js         # Three.js earthquake globe (homepage + earthquakes page) — procedural digital texture, 24h earthquake dots, drag/zoom/tooltip/click; always shows M4+/largest/total stat overlays; when ed_location is set: centers on location (north-up), shows blue pin + ripple, compass reset; on earthquakes page reuses data from earthquakes.js via window.eqGlobeData, otherwise self-fetches; pauses when orrery tab is active
    orrery.js        # 2D canvas solar system orrery (homepage + solar page) — Keplerian orbital elements (J2000), all 8 planets + Pluto, square-root AU scaling, zoom (scroll/pinch) + pan (drag), double-click to reset; lazy-initialised on first tab switch, pauses when hidden
    moon.js          # earthDataMoon() — lunar phase calculations + render
    weather.js       # loadWeather() — Open-Meteo current + 7-day trend chart (8 tabs) + forecast rows (right column); NWS active alerts at top (US only); radar card opens RainViewer modal
    air.js           # loadAir() — Open-Meteo AQI + 72h AQI trend chart + pollutants + 3-day forecast rows (right column)
    uv.js            # loadUV() — Open-Meteo UV index + daily UV curve chart + today's hourly UV + multi-day forecast rows (right column)
    tides.js         # loadTides() — NOAA CO-OPS tide predictions + tide curve chart; 3-day forecast rows + renderStations() for right column load-more with station switching
    solar.js         # earthDataSolar() — SWPC X-ray flux chart, Kp, solar wind; renderFlares() for right column load-more
    earthquakes.js   # earthDataEarthquakes() — USGS 24h + 30d feeds, city search filter (sort by distance via haversine), timeline chart with Magnitude/Activity tabs and 24h/30d range toggle, M4+ list (right column under globe), pulsing dots for recent quakes, shares data with globe.js via window.eqGlobeData; renderQuakeList() for load-more/filter, renderSignificant() for right column, scroll-to
    aurora.js        # earthDataAurora() — SWPC Kp bar chart, Bz, hemispheric power; hero banner with static aurora image; 3-day forecast rows + renderKpHistory() for right column load-more, scroll-to
    satellite.js     # earthDataSatellite() — MapLibre GL map with 16 NASA GIBS raster layers, scrollable layer tabs (chart-tabs), date picker, opacity slider
```

## Conventions

- **Function naming:** `earthData*()` for auto-init modules, `load*()` for search-triggered modules.
- **JS module pattern:** Each file uses `OPTIONS`, `SELECTORS`, `STATE` objects at top.
- **localStorage keys:** `ed_units` (imperial/metric), `ed_theme` (dark/light), `ed_location` (saved lat/lon/name/cc).
- **Theme toggle:** Sets `data-theme` attribute on `<html>`. A script in `<head>` applies saved theme before CSS loads to prevent flash. When no `data-theme` is set, follows OS preference via `prefers-color-scheme`.
- **Country flag:** Header shows country flag emoji badge on globe icon via `updateLogoFlag()` when `ed_location.cc` is set.
- **Reusable components:** `.data-banner` (photo banner with frosted glass circle overlay and shimmer animation — used by weather, air, uv, tides, moon, aurora; per-page image class `.data-banner-{page}`), `.data-hero` (big centered value — used by solar; weather has larger 5rem variant via `:has(.weather-hero-unit)`), `.visibility-box` (aurora), `.load-more` (earthquakes, solar, aurora), `.chart-tabs`/`.chart-tab` (scrollable tab bar — used by homepage earth tabs, satellite layers), `.eq-pulse` (pulsing ring on recent earthquake dots — used by earthquakes page and homepage alerts), `.eq-count-badge` (inline colored value badges — used by homepage monitoring list for temp, AQI, UV, earthquake count), `.loc-clear` (clear-location link — used by homepage monitoring header and alerts header), `.card-action` (clickable card with hover highlight — used by weather radar card). `weatherAlertIcon()` in utils.js maps alert event names to Font Awesome icons (tornado, flood, snow, wind, fire, etc.) — used by nws.js, alerts.js, and weather.js. Canvas charts (`.eq-chart`, `.solar-chart`, `.aurora-chart`, `.air-chart`, `.weather-chart`, `.uv-chart`, `.tide-chart`) share base styles in `_components.scss` — each page implements its own `init*Chart()`, `draw*Chart()`, and hover handler. `FONT` constant in utils.js is used by all canvas chart font declarations.
- **Search pages** (weather, air, uv, tides, earthquakes) use `earthDataSearch()` with an `onSelect` callback that triggers client-side API fetching. Earthquakes also supports `onClear` to reset the distance filter.
- **Auto-refresh pages** (solar, earthquakes, aurora) re-fetch every 60 seconds via `setInterval`.
- **Load more:** Earthquakes, solar flares, aurora Kp history, significant quakes, and tide stations show limited rows initially with a "Load more" button. Each uses an extracted render function (`renderQuakeList`, `renderFlares`, `renderKpHistory`, `renderSignificant`, `renderStations`) so only the list re-renders, not the full page.
- **Scroll-to from alerts:** Homepage alerts link to specific rows/sections on target pages using hash fragments (e.g. `#eq-{id}`, `#kp-{timestamp}`, `#flare-{timestamp}`, `#visibility`, `#scales`). Target pages auto-expand and scroll on first render.
- **Unit toggle** in header writes to `ed_units` in localStorage + cookie, then reloads.
- **All API calls are client-side.** No server-side code. All external APIs support CORS and need no keys.
- **XSS safety:** Use `esc()` from utils.js when inserting user-provided text into HTML.
- **SEO:** Every page needs `page_title`, `page_description`, `page_keywords` in front matter. Dashboard pages also have `page_dataset` (renders Dataset JSON-LD); index has `page_schema` (renders WebApplication JSON-LD). Non-home pages get BreadcrumbList JSON-LD automatically.
- **Test alerts:** Set `TEST_ALERTS = true` in alerts.js to show all alert types with fake data for UI testing.

## External APIs

| API | Used By | Base URL |
|-----|---------|----------|
| Open-Meteo | weather, air, uv, alerts, homepage badges | `https://api.open-meteo.com` |
| Open-Meteo AQ | air, alerts, homepage badges | `https://air-quality-api.open-meteo.com` |
| NOAA NWS | alerts, weather | `https://api.weather.gov` |
| RainViewer | weather (radar) | `https://www.rainviewer.com` |
| NOAA SWPC | solar, aurora, alerts | `https://services.swpc.noaa.gov` |
| NOAA CO-OPS | tides | `https://api.tidesandcurrents.noaa.gov` |
| USGS | earthquakes, alerts | `https://earthquake.usgs.gov` |
| NASA EPIC | homepage gallery | `https://epic.gsfc.nasa.gov` |
| NASA GIBS | satellite | `https://gibs.earthdata.nasa.gov` |
| Nominatim | search, geocoding | `https://nominatim.openstreetmap.org` |


## Development

```
jekyll serve          # Local dev server
jekyll build          # Build to _site/
```
