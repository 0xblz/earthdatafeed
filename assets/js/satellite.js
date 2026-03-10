function earthDataSatellite() {
  var container = document.getElementById('sat-content');

  var layers = [
    { id: 'truecolor', name: 'True Color', layer: 'MODIS_Terra_CorrectedReflectance_TrueColor', format: 'jpg', matrix: 'GoogleMapsCompatible_Level9', maxZoom: 9 },
    { id: 'nightlights', name: 'Night Lights', layer: 'VIIRS_SNPP_DayNightBand_AtSensor_M15', format: 'png', matrix: 'GoogleMapsCompatible_Level8', maxZoom: 8 },
    { id: 'fires', name: 'Fires', layer: 'MODIS_Terra_Thermal_Anomalies_Day', format: 'png', matrix: 'GoogleMapsCompatible_Level6', maxZoom: 6 },
    { id: 'sst', name: 'Sea Surface Temp', layer: 'MODIS_Terra_L2_Sea_Surface_Temp_Day', format: 'png', matrix: 'GoogleMapsCompatible_Level7', maxZoom: 7 },
    { id: 'snow', name: 'Snow Cover', layer: 'MODIS_Terra_NDSI_Snow_Cover', format: 'png', matrix: 'GoogleMapsCompatible_Level8', maxZoom: 8 },
    { id: 'ndvi', name: 'Vegetation', layer: 'MODIS_Terra_NDVI_8Day', format: 'png', matrix: 'GoogleMapsCompatible_Level8', maxZoom: 8 },
    { id: 'aerosol', name: 'Aerosol Index', layer: 'MODIS_Terra_Aerosol', format: 'png', matrix: 'GoogleMapsCompatible_Level6', maxZoom: 6 },
    { id: 'cloud', name: 'Cloud Top Temp', layer: 'MODIS_Terra_Cloud_Top_Temp_Day', format: 'png', matrix: 'GoogleMapsCompatible_Level6', maxZoom: 6 },
    { id: 'vapor', name: 'Water Vapor', layer: 'MODIS_Terra_Water_Vapor_5km_Day', format: 'png', matrix: 'GoogleMapsCompatible_Level6', maxZoom: 6 },
    { id: 'co', name: 'Carbon Monoxide', layer: 'AIRS_L2_Carbon_Monoxide_500hPa_Volume_Mixing_Ratio_Day', format: 'png', matrix: 'GoogleMapsCompatible_Level6', maxZoom: 6 },
    { id: 'chlorophyll', name: 'Chlorophyll', layer: 'MODIS_Terra_Chlorophyll_A', format: 'png', matrix: 'GoogleMapsCompatible_Level7', maxZoom: 7 },
    { id: 'seaice', name: 'Sea Ice', layer: 'MODIS_Terra_Sea_Ice', format: 'png', matrix: 'GoogleMapsCompatible_Level7', maxZoom: 7 },
    { id: 'lst', name: 'Land Surface Temp', layer: 'MODIS_Terra_Land_Surface_Temp_Day', format: 'png', matrix: 'GoogleMapsCompatible_Level7', maxZoom: 7 },
    { id: 'flood', name: 'Flood Extent', layer: 'VIIRS_SNPP_Flood_Detection', format: 'png', matrix: 'GoogleMapsCompatible_Level8', maxZoom: 8 },
    { id: 'precip', name: 'Precipitation', layer: 'IMERG_Precipitation_Rate', format: 'png', matrix: 'GoogleMapsCompatible_Level6', maxZoom: 6 },
    { id: 'dust', name: 'Dust Score', layer: 'MODIS_Combined_MAIAC_L2G_DustOpticalDepth', format: 'png', matrix: 'GoogleMapsCompatible_Level6', maxZoom: 6 }
  ];

  var activeIndex = 0;
  var map;

  function getSavedCenter() {
    try {
      var loc = JSON.parse(localStorage.getItem('ed_location'));
      if (loc && loc.lat && loc.lon) return [loc.lon, loc.lat];
    } catch (e) {}
    return [0, 20];
  }

  function defaultDate() {
    var d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  function tileUrl(layer, date) {
    return 'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/' +
      layer.layer + '/default/' + date + '/' + layer.matrix +
      '/{z}/{y}/{x}.' + layer.format;
  }

  // Build DOM
  container.innerHTML =
    '<div class="sat-controls">' +
      '<div class="chart-tabs" id="sat-layers"></div>' +
      '<div class="sat-options">' +
        '<div class="sat-option">' +
          '<label class="sat-label" for="sat-date"><i class="fa-solid fa-calendar-day"></i> Date</label>' +
          '<input type="date" id="sat-date" class="sat-input" value="' + defaultDate() + '">' +
        '</div>' +
        '<div class="sat-option">' +
          '<label class="sat-label" for="sat-opacity"><i class="fa-solid fa-circle-half-stroke"></i> Opacity</label>' +
          '<input type="range" id="sat-opacity" class="sat-slider" min="0" max="100" value="100">' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="sat-map-wrap">' +
      '<div id="sat-map" class="sat-map"></div>' +
      '<div class="sat-active-label" id="sat-active-label"></div>' +
    '</div>';

  // Render layer buttons
  var layersEl = document.getElementById('sat-layers');
  layers.forEach(function(l, i) {
    var btn = document.createElement('button');
    btn.className = 'chart-tab' + (i === 0 ? ' active' : '');
    btn.textContent = l.name;
    btn.setAttribute('data-index', i);
    btn.addEventListener('click', function() { switchLayer(i); });
    layersEl.appendChild(btn);
  });

  // Init map
  var dateInput = document.getElementById('sat-date');
  var opacityInput = document.getElementById('sat-opacity');
  var activeLabel = document.getElementById('sat-active-label');

  map = new maplibregl.Map({
    container: 'sat-map',
    style: {
      version: 8,
      sources: {
        'base': {
          type: 'raster',
          tiles: ['https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}@2x.png'],
          tileSize: 256,
          attribution: '&copy; CARTO'
        },
        'gibs': {
          type: 'raster',
          tiles: [tileUrl(layers[0], dateInput.value)],
          tileSize: 256,
          maxzoom: layers[0].maxZoom
        }
      },
      layers: [
        { id: 'base', type: 'raster', source: 'base' },
        { id: 'gibs', type: 'raster', source: 'gibs', paint: { 'raster-opacity': 1 } }
      ]
    },
    center: getSavedCenter(),
    zoom: getSavedCenter()[0] === 0 ? 2 : 3,
    attributionControl: false
  });

  map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');

  // Add location marker if saved
  var savedCenter = getSavedCenter();
  if (savedCenter[0] !== 0 || savedCenter[1] !== 20) {
    var dot = document.createElement('div');
    dot.className = 'sat-loc-dot';
    new maplibregl.Marker({ element: dot }).setLngLat(savedCenter).addTo(map);
  }

  updateLabel();

  function switchLayer(index) {
    activeIndex = index;

    // Update button states
    var btns = layersEl.querySelectorAll('.chart-tab');
    btns.forEach(function(b, i) { b.classList.toggle('active', i === index); });

    // Rebuild tile source
    rebuildSource();
    updateLabel();
  }

  function rebuildSource() {
    var active = layers[activeIndex];
    var url = tileUrl(active, dateInput.value);

    if (map.getLayer('gibs')) map.removeLayer('gibs');
    if (map.getSource('gibs')) map.removeSource('gibs');

    map.addSource('gibs', {
      type: 'raster',
      tiles: [url],
      tileSize: 256,
      maxzoom: active.maxZoom
    });

    map.addLayer({
      id: 'gibs',
      type: 'raster',
      source: 'gibs',
      paint: { 'raster-opacity': parseInt(opacityInput.value, 10) / 100 }
    });
  }

  function updateLabel() {
    activeLabel.innerHTML = '<i class="fa-solid fa-satellite c-cyan"></i> ' + layers[activeIndex].name;
  }

  // Date change
  dateInput.addEventListener('change', function() { rebuildSource(); });

  // Opacity change
  opacityInput.addEventListener('input', function() {
    var val = parseInt(this.value, 10) / 100;
    if (map.getLayer('gibs')) {
      map.setPaintProperty('gibs', 'raster-opacity', val);
    }
  });
}
