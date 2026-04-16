/**
 * Dialer intake: address autocomplete, duplicate check, AI-style scoring.
 * Depends on globals: fetchAuthJSON (from index.html)
 */
(function (global) {
  'use strict';

  const DEBOUNCE_MS = 950;
  const AUTOCOMPLETE_MIN = 3;
  const CACHE_MAX = 20;
  const cache = new Map();

  let inputEl = null;
  let wrapEl = null;
  let dropdownEl = null;
  let badgeEl = null;
  let panelEl = null;
  let latEl = null;
  let lngEl = null;
  let overrideCb = null;
  let fetchAuth = null;
  let getLeadId = null;
  let onOpenCrmLead = null;

  let predictions = [];
  let activeIndex = -1;
  let debounceTimer = null;
  let googleLoadPromise = null;
  let lastNormalized = '';
  let lastRaw = '';
  let duplicateInfo = null;
  let scoreInfo = null;

  function simpleKey(obj) {
    return JSON.stringify(obj);
  }

  function cacheGet(key) {
    if (cache.has(key)) {
      const v = cache.get(key);
      cache.delete(key);
      cache.set(key, v);
      return v;
    }
    return null;
  }

  function cacheSet(key, val) {
    cache.set(key, val);
    while (cache.size > CACHE_MAX) {
      const first = cache.keys().next().value;
      cache.delete(first);
    }
  }

  function ensureHidden(id) {
    let el = document.getElementById(id);
    if (el) return el;
    const form = (inputEl && inputEl.form) || document.getElementById('dialer-intake-form');
    if (!form) return null;
    el = document.createElement('input');
    el.type = 'hidden';
    el.id = id;
    el.name = id;
    form.appendChild(el);
    return el;
  }

  function hideDropdown() {
    if (dropdownEl) {
      dropdownEl.innerHTML = '';
      dropdownEl.style.display = 'none';
    }
    predictions = [];
    activeIndex = -1;
  }

  function formatNominatim(item) {
    if (!item) return '';
    const a = item.address || {};
    const street = [a.house_number, a.road || a.pedestrian || a.residential]
      .filter(Boolean)
      .join(' ')
      .trim();
    const city = a.city || a.town || a.village || a.hamlet || a.suburb || '';
    const zip = a.postcode || '';
    let state = (a.state || '').trim();
    if (state.length > 2) {
      const m = String(item.display_name || '').match(/\b([A-Z]{2})\s+(\d{5})\b/);
      if (m) state = m[1];
    }
    if (street && (city || state || zip)) {
      const parts = [street, city, state, zip].filter(Boolean);
      if (state && zip) return `${street}, ${city}, ${state} ${zip}`.replace(/\s+/g, ' ').trim();
      return parts.join(', ').replace(/\s+/g, ' ').trim();
    }
    return (item.display_name || '').split(',').slice(0, 4).join(',').trim();
  }

  async function nominatimSearch(q) {
    if (fetchAuth) {
      try {
        const data = await fetchAuth(
          `/api/intake/geocode-suggest?q=${encodeURIComponent(q)}`
        );
        if (Array.isArray(data) && data.length > 0) return data;
      } catch (e) {
        console.warn('Geocode proxy unavailable', e);
      }
    }
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        q
      )}&format=json&addressdetails=1&limit=8&countrycodes=us`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' }
      });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }

  function loadGoogleMaps(key) {
    if (global.google && global.google.maps && global.google.maps.places) {
      return Promise.resolve();
    }
    if (googleLoadPromise) return googleLoadPromise;
    googleLoadPromise = new Promise((resolve, reject) => {
      const cb = '__gmaps_init_' + Date.now();
      global[cb] = function () {
        try {
          delete global[cb];
        } catch (e) {
          /* ignore */
        }
        resolve();
      };
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        key
      )}&libraries=places&callback=${cb}`;
      s.async = true;
      s.defer = true;
      s.onerror = function () {
        reject(new Error('Google Maps script failed'));
      };
      document.head.appendChild(s);
    });
    return googleLoadPromise.catch(function (err) {
      googleLoadPromise = null;
      return Promise.reject(err);
    });
  }

  function googlePredictions(input) {
    return new Promise((resolve) => {
      try {
        const svc = new global.google.maps.places.AutocompleteService();
        svc.getPlacePredictions({ input, types: ['address'] }, (res, status) => {
          const St = global.google.maps.places.PlacesServiceStatus;
          if (status === St.ZERO_RESULTS) {
            resolve([]);
            return;
          }
          if (status === St.OK && res && res.length) {
            resolve(res);
            return;
          }
          resolve([]);
        });
      } catch (e) {
        resolve([]);
      }
    });
  }

  function googlePlaceDetails(placeId) {
    return new Promise((resolve, reject) => {
      const geocoder = new global.google.maps.Geocoder();
      geocoder.geocode({ placeId }, (results, status) => {
        if (status === 'OK' && results && results[0]) {
          resolve(results[0]);
        } else {
          reject(new Error(status));
        }
      });
    });
  }

  function formatFromGoogleResult(result) {
    const comps = result.address_components || [];
    let streetNumber = '';
    let route = '';
    let city = '';
    let state = '';
    let zip = '';
    for (let i = 0; i < comps.length; i++) {
      const c = comps[i];
      const types = c.types || [];
      if (types.includes('street_number')) streetNumber = c.long_name;
      if (types.includes('route')) route = c.long_name;
      if (types.includes('locality')) city = c.long_name;
      if (types.includes('administrative_area_level_1')) state = c.short_name;
      if (types.includes('postal_code')) zip = c.long_name;
    }
    const street = [streetNumber, route].filter(Boolean).join(' ');
    if (!street && result.formatted_address) {
      return result.formatted_address;
    }
    return `${street}, ${city}, ${state} ${zip}`.replace(/\s+/g, ' ').trim();
  }

  function setLatLng(lat, lng) {
    latEl = ensureHidden('intake-lat');
    lngEl = ensureHidden('intake-lng');
    if (latEl) latEl.value = lat != null && !Number.isNaN(+lat) ? String(lat) : '';
    if (lngEl) lngEl.value = lng != null && !Number.isNaN(+lng) ? String(lng) : '';
  }

  function renderDropdown(items, isGoogle) {
    if (!dropdownEl) return;
    dropdownEl.innerHTML = '';
    if (!items.length) {
      dropdownEl.style.display = 'none';
      return;
    }
    dropdownEl.style.display = 'block';
    items.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'intake-address-suggest-item';
      div.setAttribute('role', 'option');
      if (isGoogle) {
        div.textContent = item.description || '';
        div.dataset.placeId = item.place_id || '';
      } else {
        div.textContent = formatNominatim(item);
        div.dataset.lat = item.lat;
        div.dataset.lon = item.lon;
        div.dataset.raw = JSON.stringify(item);
      }
      if (idx === activeIndex) div.classList.add('active');
      div.addEventListener('mousedown', function (e) {
        e.preventDefault();
        selectItem(item, isGoogle);
      });
      dropdownEl.appendChild(div);
    });
  }

  async function selectItem(item, isGoogle) {
    hideDropdown();
    if (isGoogle) {
      try {
        await loadGoogleMaps(global.GOOGLE_PLACES_KEY);
        const det = await googlePlaceDetails(item.place_id);
        const line = formatFromGoogleResult(det);
        inputEl.value = line;
        const loc = det.geometry && det.geometry.location;
        const lat = loc.lat();
        const lng = loc.lng();
        setLatLng(lat, lng);
        lastRaw = line;
        lastNormalized = line;
        runIntelligencePipeline();
      } catch (e) {
        console.warn('Google place details failed', e);
        inputEl.value = item.description || '';
        setLatLng('', '');
        runIntelligencePipeline();
      }
    } else {
      const line = formatNominatim(item);
      inputEl.value = line;
      setLatLng(item.lat, item.lon);
      lastRaw = line;
      lastNormalized = line;
      runIntelligencePipeline();
    }
  }

  async function onInputTyping() {
    const q = (inputEl.value || '').trim();
    lastRaw = q;
    hideDropdown();
    if (q.length < AUTOCOMPLETE_MIN) return;

    if (global.GOOGLE_PLACES_KEY && !global.googlePlacesLoadFailed) {
      try {
        await loadGoogleMaps(global.GOOGLE_PLACES_KEY);
        const preds = await googlePredictions(q);
        if (preds.length) {
          predictions = preds;
          activeIndex = 0;
          renderDropdown(preds, true);
          return;
        }
      } catch (e) {
        console.warn('Google Places unavailable, using OSM', e);
        global.googlePlacesLoadFailed = true;
      }
    }

    const data = await nominatimSearch(q);
    predictions = data;
    activeIndex = data.length ? 0 : -1;
    renderDropdown(data, false);
  }

  function scheduleIntelligence() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      runIntelligencePipeline();
    }, DEBOUNCE_MS);
  }

  async function runIntelligencePipeline() {
    if (!inputEl || !fetchAuth) return;
    const address = (inputEl.value || '').trim();
    if (address.length < 3) {
      clearPanel();
      return;
    }

    const lat = latEl && latEl.value ? parseFloat(latEl.value) : null;
    const lng = lngEl && lngEl.value ? parseFloat(lngEl.value) : null;
    const normalizedAddress = lastNormalized || address;
    const excludeLeadId = getLeadId ? getLeadId() : null;

    const payloadBase = {
      address,
      normalizedAddress,
      lat: lat != null && !Number.isNaN(lat) ? lat : null,
      lng: lng != null && !Number.isNaN(lng) ? lng : null,
      excludeLeadId
    };

    const occ = document.getElementById('intake-occupancy-type');
    const occupancyType = occ && occ.value ? occ.value : undefined;

    const cacheKeyCheck = simpleKey({ a: 'chk', ...payloadBase });
    const cacheKeyScore = simpleKey({ a: 'scr', address, occupancyType });

    try {
      let checkRes = cacheGet(cacheKeyCheck);
      let scoreRes = cacheGet(cacheKeyScore);

      const pCheck =
        checkRes != null
          ? Promise.resolve(checkRes)
          : fetchAuth('/api/intake/address-check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payloadBase)
            }).then((r) => {
              cacheSet(cacheKeyCheck, r);
              return r;
            });

      const pScore =
        scoreRes != null
          ? Promise.resolve(scoreRes)
          : fetchAuth('/api/intake/score-address', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address, occupancyType })
            }).then((r) => {
              cacheSet(cacheKeyScore, r);
              return r;
            });

      const settled = await Promise.allSettled([pCheck, pScore]);

      if (settled[0].status === 'fulfilled') {
        checkRes = settled[0].value;
        duplicateInfo = checkRes;
      } else {
        console.warn('address-check failed', settled[0].reason);
        duplicateInfo = { exists: false, confidence: 0 };
        checkRes = null;
      }

      if (settled[1].status === 'fulfilled') {
        scoreRes = settled[1].value;
        scoreInfo = scoreRes;
      } else {
        console.warn('score-address failed', settled[1].reason);
        scoreInfo = null;
        scoreRes = null;
      }

      renderPanel(checkRes, scoreRes);
      updateBadge(scoreRes);
      notifyIntakeComplete();
    } catch (e) {
      console.warn('Intelligence pipeline failed', e);
    }
  }

  function tierStyle(tier) {
    if (tier === 'hot') return { label: 'HOT \uD83D\uDD25', bg: '#b91c1c', fg: '#fff' };
    if (tier === 'warm') return { label: 'WARM', bg: '#ea580c', fg: '#fff' };
    return { label: 'COLD', bg: '#6b7280', fg: '#fff' };
  }

  function updateBadge(scoreRes) {
    if (!badgeEl) return;
    if (!scoreRes || scoreRes.score == null || Number.isNaN(Number(scoreRes.score))) {
      badgeEl.style.display = 'none';
      badgeEl.textContent = '';
      return;
    }
    const score = Number(scoreRes.score);
    let tier = scoreRes.tier || 'cold';
    if (!Number.isNaN(score)) {
      if (score >= 80) tier = 'hot';
      else if (score >= 50) tier = 'warm';
      else tier = 'cold';
    }
    const st = tierStyle(tier);
    let bg = st.bg;
    if (!Number.isNaN(score)) {
      if (score >= 80) bg = '#b91c1c';
      else if (score >= 50) bg = '#ea580c';
      else bg = '#6b7280';
    }
    badgeEl.style.display = 'inline-flex';
    badgeEl.style.background = bg;
    badgeEl.style.color = '#fff';
    badgeEl.textContent = `${st.label} ${Number.isNaN(score) ? '' : Math.round(score)}`;
    badgeEl.title = (scoreRes.riskFlags || []).join('\n') || '';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderPanel(checkRes, scoreRes) {
    if (!panelEl) return;
    let html = '';

    if (!checkRes && !scoreRes) {
      html +=
        '<div class="intake-intel-muted">Address insights temporarily unavailable. You can still enter the address manually.</div>';
    }

    if (checkRes && checkRes.exists) {
      const lead = checkRes.existingLead || {};
      html += `<div class="intake-dup-banner" data-duplicate="true">
        <strong>\u26A0 Duplicate Lead Detected</strong>
        <div class="intake-dup-preview">
          <button type="button" class="secondary small" id="intake-view-dup-lead">View Existing Lead</button>
          <span>${escapeHtml(lead.ownerName || 'Unknown owner')} \u2014 ${escapeHtml(
        lead.status || ''
      )}${lead.lastUpdated ? ' \u2014 ' + escapeHtml(String(lead.lastUpdated).slice(0, 10)) : ''}</span>
        </div>
        <label class="intake-dup-override-label"><input type="checkbox" id="intake-duplicate-override"> I confirm this is a different deal (override duplicate warning)</label>
      </div>`;
    } else if (checkRes && checkRes.exists === false) {
      html += `<div class="intake-verify-banner">\u2713 New Lead Verified</div>`;
    }

    if (scoreRes && Array.isArray(scoreRes.riskFlags) && scoreRes.riskFlags.length) {
      html += `<div class="intake-risk-flags">${scoreRes.riskFlags
        .slice(0, 5)
        .map((f) => `<span class="intake-risk-chip">${escapeHtml(f)}</span>`)
        .join(' ')}</div>`;
    }

    panelEl.innerHTML = html;

    overrideCb = document.getElementById('intake-duplicate-override');
    if (overrideCb) {
      overrideCb.addEventListener('change', notifyIntakeComplete);
    }
    const viewBtn = document.getElementById('intake-view-dup-lead');
    if (viewBtn && checkRes && checkRes.exists && checkRes.existingLead && checkRes.existingLead.id) {
      viewBtn.addEventListener('click', function () {
        const id = checkRes.existingLead.id;
        const hint = checkRes.existingLead.ownerName || '';
        if (onOpenCrmLead) onOpenCrmLead(id, hint);
      });
    }
  }

  function clearPanel() {
    duplicateInfo = null;
    scoreInfo = null;
    if (panelEl) panelEl.innerHTML = '';
    if (badgeEl) {
      badgeEl.style.display = 'none';
      badgeEl.textContent = '';
    }
    if (overrideCb) overrideCb.checked = false;
    notifyIntakeComplete();
  }

  function notifyIntakeComplete() {
    if (typeof global.checkIntakeComplete === 'function') global.checkIntakeComplete();
  }

  function onKeyDown(e) {
    if (!dropdownEl || dropdownEl.style.display === 'none') return;
    const items = dropdownEl.querySelectorAll('.intake-address-suggest-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = Math.min(activeIndex + 1, items.length - 1);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = Math.max(activeIndex - 1, 0);
      items.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    } else if (e.key === 'Enter') {
      if (activeIndex >= 0 && predictions[activeIndex]) {
        e.preventDefault();
        const isGoogle = !!(predictions[activeIndex] && predictions[activeIndex].place_id);
        selectItem(predictions[activeIndex], isGoogle);
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  }

  function init(options) {
    fetchAuth = options.fetchAuthJSON;
    getLeadId = options.getCurrentLeadId || function () {
      return null;
    };
    onOpenCrmLead =
      options.onOpenCrmLead ||
      function () {
        /* noop */
      };

    inputEl = document.getElementById('intake-property-address');
    if (!inputEl || !fetchAuth) return;

    wrapEl = inputEl.closest('.intake-address-wrap') || inputEl.parentElement;
    dropdownEl = document.getElementById('intake-address-dropdown');
    badgeEl = document.getElementById('intake-lead-score-badge');
    panelEl = document.getElementById('intake-address-intelligence-panel');

    latEl = ensureHidden('intake-lat');
    lngEl = ensureHidden('intake-lng');

    inputEl.addEventListener('input', function () {
      lastNormalized = '';
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(onInputTyping, 280);
      scheduleIntelligence();
    });
    inputEl.addEventListener('keydown', onKeyDown);
    inputEl.addEventListener('blur', function () {
      setTimeout(hideDropdown, 200);
    });

    const occ = document.getElementById('intake-occupancy-type');
    if (occ) {
      occ.addEventListener('change', function () {
        scheduleIntelligence();
      });
    }

    document.addEventListener('click', function (ev) {
      if (wrapEl && !wrapEl.contains(ev.target)) hideDropdown();
    });
  }

  function reset() {
    hideDropdown();
    clearPanel();
    lastNormalized = '';
    lastRaw = '';
    setLatLng('', '');
    global.googlePlacesLoadFailed = false;
  }

  function refreshFromForm() {
    lastNormalized = (inputEl && inputEl.value) || '';
    scheduleIntelligence();
  }

  function isSendToCloserBlocked() {
    if (!duplicateInfo || !duplicateInfo.exists) return false;
    const o = document.getElementById('intake-duplicate-override');
    return !(o && o.checked);
  }

  function getScoreForSubmit() {
    return scoreInfo
      ? { score: scoreInfo.score, tier: scoreInfo.tier }
      : { score: null, tier: null };
  }

  global.AddressIntelligence = {
    init,
    reset,
    refreshFromForm,
    isSendToCloserBlocked,
    getScoreForSubmit
  };
})(typeof window !== 'undefined' ? window : globalThis);
