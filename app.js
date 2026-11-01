// Postomat — self-contained web app (plain JS, no TypeScript build needed)
(function () {
  'use strict';

  // ============ TYPES & CONSTANTS ============
  const CARRIER_CONFIGS = {
    novaposhta: { id: 'novaposhta', name: 'Нова пошта', shortName: 'НП', color: '#f5453b', symbol: '📦', ttnPattern: /^[0-9]{14}$/, ttnLength: 14, supportsAccount: true },
    ukrposhta: { id: 'ukrposhta', name: 'Укрпошта', shortName: 'Укр', color: '#0057b7', symbol: '📮', ttnPattern: /^[A-Z]{2}[0-9]{9}[A-Z]{2}$|^[0-9]{11,14}$/, ttnLength: 13, supportsAccount: false },
    meest: { id: 'meest', name: 'Meest', shortName: 'Міст', color: '#00a651', symbol: '🚚', ttnPattern: /^[0-9]{10,14}$/, ttnLength: 11, supportsAccount: false },
  };

  const STORAGE_KEY = 'postomat-state';
  const THEME_KEY = 'postomat-theme';
  const POLL_INTERVAL_MS = 300000;

  // ============ HELPERS ============
  const $ = (id) => document.getElementById(id);
  const symbols = {
    box: '<path d="m12 3 9 5-9 5-9-5 9-5Z M3 8v9l9 5 9-5V8 M12 13v9 M7.5 5.5l9 5"/>',
    pin: '<path d="m16 3 5 5-3 1-4 5v4l-3-3-6 6 M4 10h4l5-4 1-3 M4 10l10 10"/>',
    settings: '<path d="M3 6h5m4 0h9 M3 12h11m4 0h3 M3 18h3m4 0h11"/><circle cx="10" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="8" cy="18" r="2"/>',
    refresh: '<path d="M20 7v5h-5 M4 17a8 8 0 0 0 14 1 M20 7A8 8 0 0 0 6 5L3 8 M3 3v5h5"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4"/><circle cx="19" cy="4" r="3"/>',
    arrow: '<path d="M6 18 18 6 M6 6h12v12"/>',
    plus: '<path d="M12 5v14 M5 12h14"/>',
    shield: '<path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z M8 12l3 3 5-6"/>',
    truck: '<path d="M3 4h11v12H3z M14 8h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
    location: '<path d="M18 9c0 5-6 12-6 12S6 14 6 9a6 6 0 1 1 12 0Z"/><circle cx="12" cy="9" r="2"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4 M17 3v4 M3 10h18 M8 14h2 M14 14h2"/>',
    tray: '<path d="m3 14 3-9h12l3 9v6H3v-6Z M3 14h5l2 3h4l2-3h5"/>',
    theme: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 1 21 12.79"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41"/>',
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${symbols[name] || symbols.box}</svg>`;
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const now = () => Date.now();

  // ============ CARRIER ADAPTERS ============
  function normalizeNumber(input) {
    return String(input ?? '').replace(/[\s-]/g, '');
  }

  function validateNumber(carrier, number) {
    const cfg = CARRIER_CONFIGS[carrier];
    if (!cfg) return false;
    if (carrier === 'ukrposhta') {
      return /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/i.test(number) || /^[0-9]{11,14}$/.test(number);
    }
    return cfg.ttnPattern.test(number);
  }

  function detectCarrier(ttn) {
    const normalized = normalizeNumber(ttn).toUpperCase();
    if (CARRIER_CONFIGS.novaposhta.ttnPattern.test(normalized)) return 'novaposhta';
    if (CARRIER_CONFIGS.ukrposhta.ttnPattern.test(normalized)) return 'ukrposhta';
    if (CARRIER_CONFIGS.meest.ttnPattern.test(normalized)) return 'meest';
    return null;
  }

  function makeParcel(row, carrier, direction) {
    const text = (...keys) => {
      for (const key of keys) {
        const v = row[key];
        if ((typeof v === 'string' || typeof v === 'number') && String(v).trim()) return String(v).trim();
      }
      return '';
    };
    const id = text('Number', 'IntDocNumber', 'DocumentNumber', 'trackNumber', 'TTN', 'ttn');
    const cfg = CARRIER_CONFIGS[carrier];
    if (!cfg || !validateNumber(carrier, id)) return null;
    const status = text('Status', 'TrackingStatus', 'StatusDescription', 'status', 'statusDescription');
    const code = text('StatusCode', 'TrackingStatusCode', 'statusCode', 'code');
    if (!status || !code) return null;
    return {
      id, carrier,
      title: text('Description', 'CargoDescriptionString', 'CargoDescription', 'DescriptionOfCargo', 'cargoDescription') || 'Посилка',
      status, code,
      origin: text('CitySender', 'CitySenderDescription', 'senderCity'),
      destination: text('WarehouseRecipient', 'RecipientAddress', 'RecipientAddressDescription', 'CityRecipient', 'recipientCity', 'postOffice'),
      expected: text('ScheduledDeliveryDate', 'ExpectedDeliveryDate', 'expectedDate'),
      updatedAt: Date.now(),
      direction: direction || 'incoming',
      isManual: false,
    };
  }

  async function trackNovaPoshta(numbers, direction) {
    const all = [];
    const API = 'https://api.novaposhta.ua/v2.0/json/';
    for (let offset = 0; offset < numbers.length; offset += 100) {
      const batch = numbers.slice(offset, offset + 100);
      try {
        const response = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: '',
            modelName: 'TrackingDocument',
            calledMethod: 'getStatusDocuments',
            methodProperties: { Documents: batch.map(n => ({ DocumentNumber: n })), Language: 'UA' },
          }),
          signal: AbortSignal.timeout(25000),
        });
        if (!response.ok) throw new Error('Нова пошта тимчасово не відповідає.');
        const body = await response.json();
        if (body.success !== true || !Array.isArray(body.data)) throw new Error('Не вдалося отримати статус від Нова пошти.');
        for (const row of body.data) {
          const p = makeParcel(row, 'novaposhta', direction);
          if (p) all.push(p);
        }
      } catch (e) {
        console.warn('Nova Poshta track error:', e);
      }
    }
    return all;
  }

  async function trackUkrposhta(numbers, direction) {
    const all = [];
    for (const ttn of numbers) {
      try {
        const response = await fetch(`https://www.ukrposhta.ua/tracking/api/v1/track/${encodeURIComponent(ttn)}`, {
          method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
        });
        let data;
        if (!response.ok) {
          const alt = await fetch(`https://tracking.ukrposhta.ua/api/track?ttn=${encodeURIComponent(ttn)}`, {
            method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
          });
          if (!alt.ok) continue;
          data = await alt.json();
        } else {
          data = await response.json();
        }
        const track = data.tracking || data.result || data;
        const p = {
          id: ttn, carrier: 'ukrposhta',
          title: track.cargoDescription || track.description || 'Посилка Укрпошти',
          status: track.statusDescription || track.status || 'Статус не відомо',
          code: String(track.statusCode || track.code || '0'),
          origin: track.senderCity || '',
          destination: track.recipientCity || track.postOffice || '',
          expected: track.expectedDate || '',
          updatedAt: Date.now(),
          direction: direction || 'incoming',
          isManual: false,
        };
        all.push(p);
      } catch (e) {
        console.warn('Ukrposhta track error:', e);
      }
    }
    return all;
  }

  async function trackMeest(numbers, direction) {
    const all = [];
    for (const ttn of numbers) {
      try {
        const response = await fetch(`https://api.meest.com/v1/tracking/${encodeURIComponent(ttn)}`, {
          method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
        });
        let data;
        if (!response.ok) {
          const alt = await fetch(`https://tracking.meest.net/api/track?ttn=${encodeURIComponent(ttn)}`, {
            method: 'GET', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000),
          });
          if (!alt.ok) continue;
          data = await alt.json();
        } else {
          data = await response.json();
        }
        const track = data.tracking || data.result || data || {};
        const p = {
          id: ttn, carrier: 'meest',
          title: track.cargoDescription || track.description || 'Посилка Meest',
          status: track.statusDescription || track.status || 'Статус не відомо',
          code: String(track.statusCode || track.code || '0'),
          origin: track.senderCity || '',
          destination: track.recipientCity || track.postOffice || '',
          expected: track.expectedDate || '',
          updatedAt: Date.now(),
          direction: direction || 'incoming',
          isManual: false,
        };
        all.push(p);
      } catch (e) {
        console.warn('Meest track error:', e);
      }
    }
    return all;
  }

  async function trackByCarrier(grouped, direction) {
    const results = [];
    const tasks = Object.entries(grouped).map(async ([carrierId, numbers]) => {
      if (!numbers.length) return;
      let parcels = [];
      if (carrierId === 'novaposhta') parcels = await trackNovaPoshta(numbers, direction);
      else if (carrierId === 'ukrposhta') parcels = await trackUkrposhta(numbers, direction);
      else if (carrierId === 'meest') parcels = await trackMeest(numbers, direction);
      results.push(...parcels);
    });
    await Promise.all(tasks);
    return results;
  }

  // ============ THEME MANAGER ============
  const themeManager = {
    current: 'system',
    load() {
      try {
        const raw = localStorage.getItem(THEME_KEY);
        if (raw === 'light' || raw === 'dark' || raw === 'system') this.current = raw;
      } catch {}
    },
    save() {
      try { localStorage.setItem(THEME_KEY, this.current); } catch {}
    },
    isDark() {
      if (this.current === 'system') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return this.current;
    },
    set(theme) {
      this.current = theme;
      this.save();
      this.apply();
    },
    apply() {
      const resolved = this.isDark();
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.classList.toggle('dark', resolved === 'dark');
    },
    watchSystem() {
      if (!window.matchMedia) return;
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener?.('change', () => {
        if (this.current === 'system') this.apply();
      });
    },
  };
  themeManager.load();
  themeManager.apply();
  themeManager.watchSystem();

  // ============ PARCEL STORE ============
  function isDelivered(parcel) { return ['9', '10', '11'].includes(parcel.code); }
  function isReady(parcel) { return ['7', '8'].includes(parcel.code); }

  const store = {
    parcels: [],
    accountIDs: {},
    lastRefresh: null,
    theme: 'system',
    carriers: {
      novaposhta: { enabled: true },
      ukrposhta: { enabled: true },
      meest: { enabled: true },
    },
    connected: false,
    busy: false,
    error: null,
    notificationsEnabled: false,
    pinned: false,
    loginAtLaunch: false,
    showCompleted: false,
    selectedDirection: 'incoming',
    demo: false,
    listeners: new Set(),
    timer: null,
    generation: 0,
    retryCount: 0,
    lastAttempt: -Infinity,

    subscribe(fn) {
      this.listeners.add(fn);
      fn(this);
      return () => this.listeners.delete(fn);
    },
    emit() {
      const snapshot = Object.assign({}, this);
      this.listeners.forEach(fn => fn(snapshot));
    },
    visibleParcels() {
      return this.parcels.filter(p => p.direction === this.selectedDirection && (this.showCompleted || !isDelivered(p)));
    },
    activeCount(direction) {
      return this.parcels.filter(p => p.direction === direction && !isDelivered(p)).length;
    },
    persist() {
      if (this.demo) return;
      try {
        const state = {
          parcels: this.parcels,
          accountIDs: this.accountIDs,
          lastRefresh: this.lastRefresh,
          theme: this.theme,
          carriers: this.carriers,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {}
    },
    loadDemo() {
      const now = Date.now();
      this.parcels = [
        { id: '20450000000001', carrier: 'novaposhta', title: 'Книжки на вихідні', status: 'Прибув у відділення', code: '7', origin: 'Львів', destination: 'Київ · Відділення № 24', expected: '', updatedAt: now, direction: 'incoming', isManual: false },
        { id: 'RA123456789UA', carrier: 'ukrposhta', title: 'Замовлення з інтернет-магазину', status: 'Відправлено з центру', code: '2', origin: 'Київ', destination: 'Одеса · Відділення № 15', expected: '', updatedAt: now, direction: 'incoming', isManual: false },
        { id: '5001234567890', carrier: 'meest', title: 'Подарунок для друга', status: 'У сортованому центрі', code: '3', origin: 'Харків', destination: 'Львів · Відділення Meest', expected: '18.09.2026', updatedAt: now, direction: 'outgoing', isManual: false },
        { id: '20450000000004', carrier: 'novaposhta', title: 'Настільна гра', status: 'Отримано', code: '9', origin: 'Київ', destination: 'Одеса · Відділення № 8', expected: '', updatedAt: now, direction: 'outgoing', isManual: false },
      ];
      this.lastRefresh = new Date(now);
      this.error = null;
      this.retryCount = 0;
    },
    async refresh(force) {
      if (this.demo || this.busy) return;
      if (!force && Date.now() - this.lastAttempt < Math.min(3600000, 300000 * Math.pow(2, this.retryCount))) return;
      if (!this.connected && this.parcels.length === 0) return;

      const gen = ++this.generation;
      this.busy = true;
      this.lastAttempt = Date.now();
      this.emit();

      try {
        const enabledCarriers = Object.keys(this.carriers).filter(c => this.carriers[c].enabled);
        const grouped = {};
        for (const c of enabledCarriers) {
          grouped[c] = this.parcels.filter(p => p.carrier === c).map(p => p.id);
        }

        if (Object.values(grouped).every(v => v.length === 0)) {
          this.loadDemo();
          this.emit();
          return;
        }

        const results = await trackByCarrier(grouped, this.selectedDirection);

        if (gen !== this.generation) return;

        // Apply results
        const map = new Map(this.parcels.map(p => [p.id, p]));
        for (const parcel of results) {
          const old = map.get(parcel.id);
          if (old) {
            parcel.isManual = old.isManual;
            if (parcel.title === 'Посилка') parcel.title = old.title;
          }
          map.set(parcel.id, parcel);
        }
        this.parcels = [...map.values()].sort((a, b) => {
          if (isDelivered(a) !== isDelivered(b)) return isDelivered(a) ? 1 : -1;
          return b.id.localeCompare(a.id);
        });

        this.lastRefresh = new Date();
        this.error = null;
        this.retryCount = 0;
        this.persist();
      } catch (err) {
        if (gen !== this.generation) return;
        this.error = err instanceof Error ? err.message : 'Не вдалося оновити статуси.';
        this.retryCount = Math.min(4, this.retryCount + 1);
      } finally {
        this.busy = false;
        this.emit();
      }
    },
    async add(trackingNumber, title, direction, carrier) {
      const detected = carrier || detectCarrier(trackingNumber);
      if (!detected) {
        this.error = 'Не вдалося визначити перевізника за номером ТТН.';
        return false;
      }
      const cfg = CARRIER_CONFIGS[detected];
      if (!cfg) return false;

      const normalized = normalizeNumber(trackingNumber).toUpperCase();
      if (!validateNumber(detected, normalized)) {
        this.error = `Некоректний номер ТТН для ${cfg.name}.`;
        return false;
      }
      if (this.parcels.some(p => p.id === normalized)) {
        this.error = 'Ця посилка вже відстежується.';
        return false;
      }
      if (this.busy) return false;

      const gen = ++this.generation;
      this.busy = true;
      this.emit();

      try {
        let rows = [];
        const grouped = { [detected]: [normalized] };
        rows = await trackByCarrier(grouped, direction || 'incoming');

        if (gen !== this.generation) return false;
        if (rows.length !== 1) {
          this.error = 'Посилку не знайдено. Перевірте номер ТТН або перевірте інтернет.';
          return false;
        }
        const parcel = rows[0];
        parcel.isManual = true;
        if (!parcel.direction) parcel.direction = direction || 'incoming';
        if (title && title.trim()) parcel.title = title.trim();

        this.parcels = [...this.parcels, parcel].sort((a, b) => {
          if (isDelivered(a) !== isDelivered(b)) return isDelivered(a) ? 1 : -1;
          return b.id.localeCompare(a.id);
        });
        this.selectedDirection = parcel.direction;
        this.lastRefresh = new Date();
        this.error = null;
        this.persist();
        return true;
      } catch (err) {
        if (gen !== this.generation) return false;
        this.error = err instanceof Error ? err.message : 'Не вдалося додати посилку.';
        return false;
      } finally {
        this.busy = false;
        this.emit();
      }
    },
    remove(id) {
      this.parcels = this.parcels.filter(p => p.id !== id);
      this.persist();
      this.emit();
    },
    setTheme(theme) {
      this.theme = theme;
      themeManager.set(theme);
      this.persist();
      this.emit();
    },
    setCarrierEnabled(carrierId, enabled) {
      this.carriers[carrierId].enabled = enabled;
      this.persist();
      this.emit();
    },
    togglePinned() { this.pinned = !this.pinned; this.emit(); },
    setShowCompleted(value) { this.showCompleted = value; this.emit(); },
    setDirection(direction) { this.selectedDirection = direction; this.emit(); },
    setDemo(value) {
      this.demo = value;
      if (value) this.loadDemo();
      this.emit();
    },
  };

  // Load saved state
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.parcels) store.parcels = parsed.parcels;
      if (parsed.accountIDs) store.accountIDs = parsed.accountIDs;
      if (parsed.lastRefresh) store.lastRefresh = new Date(parsed.lastRefresh);
      if (parsed.theme) store.theme = parsed.theme;
      if (parsed.carriers) store.carriers = Object.assign({}, store.carriers, parsed.carriers);
      store.connected = Object.values(store.accountIDs).some(Boolean);
      themeManager.set(store.theme);
    }
  } catch {}

  // Start polling
  store.timer = setInterval(() => store.refresh(), POLL_INTERVAL_MS);

  // ============ UI RENDERING ============
  let showCompleted = false;
  let selectedDirection = 'incoming';
  let revealSequence = 0;
  let toastTimer = null;
  let currentSnapshot = null;

  function toast(message) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
  }

  function parcelCard(parcel) {
    const delivered = isDelivered(parcel);
    const ready = isReady(parcel);
    const phase = delivered ? 3 : ready ? 2 : ['1', '2'].includes(parcel.code) ? 0 : 1;
    const directionText = parcel.direction === 'outgoing' ? 'Відправлення' : 'Отримання';
    const directionArrow = parcel.direction === 'outgoing' ? '↗' : '↙';
    const stageText = ready
      ? (parcel.direction === 'outgoing' ? 'ЧЕКАЄ НА ОТРИМУВАЧА' : 'МОЖНА ЗАБИРАТИ')
      : delivered ? 'ОТРИМАНО'
      : ['1', '2'].includes(parcel.code) ? 'ОЧІКУЄ ВІДПРАВКИ' : 'У ДОРОЗІ';
    const stageIcon = ready ? 'box' : delivered ? 'check' : 'truck';
    const stageColorClass = ready ? 'ready' : delivered ? 'delivered' : '';
    const carrierName = parcel.carrier === 'novaposhta' ? 'Нова пошта' : parcel.carrier === 'ukrposhta' ? 'Укрпошта' : 'Meest';
    const carrierClass = parcel.carrier;
    const isStale = Date.now() - new Date(parcel.updatedAt).getTime() > 900000;

    return `
<article data-parcel-id="${escape(parcel.id)}" class="parcel-card ${stageColorClass}">
  <div class="card-stage">
    ${icon(stageIcon)}
    <span>${stageText}</span>
    <span class="carrier-badge ${carrierClass}">${carrierName}</span>
    <span class="direction" title="${directionText}">${directionArrow}</span>
  </div>
  <div style="display:flex; justify-content:space-between; align-items:flex-start;">
    <div style="flex:1;">
      <h2 class="parcel-title" title="${escape(parcel.title)}">${escape(parcel.title)}</h2>
      <button class="ttn" data-copy="${escape(parcel.id)}" title="Скопіювати ТТН">${escape(parcel.id)}</button>
    </div>
  </div>
  <div class="progress" aria-label="Етап доставки ${phase + 1} із 4">
    ${[0, 1, 2, 3].map(i => `<span class="${i <= phase ? 'done' : ''}"></span>`).join('')}
  </div>
  <p class="status">${escape(parcel.status)}</p>
  ${parcel.destination ? `<div class="detail">${icon('location')}<span>${escape(parcel.destination)}</span></div>` : ''}
  ${parcel.expected && !delivered && !ready ? `<div class="detail expected">${icon('calendar')}<span>Очікуємо: ${escape(parcel.expected)}</span></div>` : ''}
  ${isStale ? '<p class="stale">Статус може бути застарілим</p>' : ''}
</article>`;
  }

  function render(state) {
    currentSnapshot = state;
    const reveal = state.revealRequest;
    const shouldReveal = reveal && reveal.sequence !== revealSequence;

    if (shouldReveal) {
      revealSequence = reveal.sequence;
      selectedDirection = reveal.direction;
      if (reveal.completed) showCompleted = true;
    }

    const demoBanner = $('demo-banner');
    if (demoBanner) demoBanner.hidden = !state.demo;

    const pinBtn = $('pin');
    if (pinBtn) {
      pinBtn.classList.toggle('active', state.pinned);
      pinBtn.setAttribute('aria-pressed', String(state.pinned));
    }

    const connDot = $('connection-dot');
    if (connDot) connDot.className = `dot ${state.error ? 'error-dot' : state.connected || state.parcels.length ? 'connected' : ''}`;

    const lastRefresh = $('last-refresh');
    if (lastRefresh) {
      lastRefresh.textContent = state.busy
        ? 'Перевіряємо статуси…'
        : state.lastRefresh ? `Оновлено ${new Date(state.lastRefresh).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
        : state.awaitingLogin ? 'Очікуємо на вхід' : 'Готовий до підключення';
    }

    const refreshBtn = $('refresh');
    if (refreshBtn) refreshBtn.disabled = state.busy || state.demo;

    const contentEl = $('content');
    if (!contentEl) return;

    if (!state.parcels.length && !state.connected) {
      contentEl.innerHTML = `
<section class="onboarding">
  <p class="eyebrow">ВАША ДОСТАВКА, ПОРУЧ</p>
  <h1>Посилки.<br>Під контролем.</h1>
  <p class="intro">Відстежуйте посилки Нової пошти, Укрпошти та Meest просто з робочого столу.</p>
  <div class="benefit">
    <div class="bell-circle">${icon('bell')}</div>
    <div>
      <strong>Статус змінився? Ви знатимете.</strong>
      <p>Перевірка кожні 5 хвилин, поки комп’ютер не спить.</p>
    </div>
  </div>
  <button id="signin" class="primary-button wide">${state.awaitingLogin ? 'Продовжити вхід' : 'Увійти за номером телефону'}${icon('arrow')}</button>
  <button class="text-button manual-add" data-add>або додати посилку за ТТН</button>
  ${state.error ? `<p class="error" role="alert">${escape(state.error)}</p>` : ''}
</section>`;
    } else {
      const tabOf = (p) => p.direction === 'outgoing' ? 'outgoing' : 'incoming';
      const parcels = state.parcels.filter(p => tabOf(p) === selectedDirection);
      const active = parcels.filter(p => !['9', '10', '11'].includes(p.code));
      const visible = showCompleted ? parcels : active;

      const tabs = [
        ['incoming', 'Отримання', '↙'],
        ['outgoing', 'Відправлення', '↗'],
      ].map(([direction, label, arrow]) => `
        <button data-direction="${direction}" aria-pressed="${direction === selectedDirection}" class="direction-tab ${direction === selectedDirection ? 'selected' : ''}">
          <span>${arrow}</span>${label}<span class="tab-count">${state.parcels.filter(p => tabOf(p) === direction && !['9', '10', '11'].includes(p.code)).length}</span>
        </button>
      `).join('');

      contentEl.innerHTML = `
<div class="list-heading">
  <h1>${selectedDirection === 'outgoing' ? 'Відправлення' : 'Отримання'}</h1>
  <button class="icon-button" data-add aria-label="Додати ТТН" title="Додати ТТН">${icon('plus')}</button>
</div>
<div class="direction-tabs" role="group" aria-label="Напрямок посилок">${tabs}</div>
<div class="list-subheading">
  <span class="connection">${icon(state.connected ? 'shield' : 'box')}${state.connected ? 'Акаунт підключено' : 'Відстеження за ТТН'}</span>
  <button id="show-completed" class="text-button">${showCompleted ? 'Лише активні' : 'Усі посилки'}</button>
</div>
${state.error ? `<p class="error list-error" role="alert">${escape(state.error)}</p>` : ''}
<div class="parcel-scroll">
${visible.length ? visible.map(parcelCard).join('') : `
<div class="empty">${icon('tray')}<strong>${selectedDirection === 'outgoing' ? 'Відправлених посилок поки немає' : 'Посилок до вас поки немає'}</strong>
<p>Нові посилки з’являться після перевірки.<br>Також можна додати ТТН вручну.</p></div>`}
</div>
${!state.notificationsEnabled ? '<button id="enable-notifications" class="enable-notifications">Увімкнути сповіщення про зміни</button>' : ''}
`;
    }

    if (shouldReveal) {
      const el = document.querySelector(`[data-parcel-id="${reveal.id}"]`);
      el?.scrollIntoView({ block: 'start' });
    }

    const accountLabel = $('account-label');
    if (accountLabel) accountLabel.textContent = state.connected ? 'Акаунт підключено' : 'Акаунт не підключено';

    const accountOpen = $('account-open');
    if (accountOpen) accountOpen.textContent = state.connected ? 'Відкрити акаунт' : 'Увійти за телефоном';

    const accountSignout = $('account-signout');
    if (accountSignout) accountSignout.hidden = !state.connected;

    const settingPin = $('setting-pin');
    if (settingPin) settingPin.checked = state.pinned;

    const settingTheme = $('setting-theme');
    if (settingTheme) settingTheme.checked = state.theme === 'dark';

    const settingNotif = $('setting-notifications');
    if (settingNotif) settingNotif.checked = state.notificationsEnabled;

    const settingAutostart = $('setting-autostart');
    if (settingAutostart) settingAutostart.checked = state.loginAtLaunch;

    const addSubmit = $('add-submit');
    if (addSubmit) addSubmit.disabled = state.busy || state.demo;

    const version = $('version');
    if (version) version.textContent = `Postomat ${state.version || '1.0.0'}`;

    const themeToggle = $('theme-toggle');
    if (themeToggle) {
      themeToggle.innerHTML = icon(state.theme === 'dark' ? 'sun' : 'theme');
    }
  }

  // ============ INITIALIZATION ============
  document.querySelectorAll('[data-icon]').forEach(node => {
    node.innerHTML = icon(node.dataset.icon);
  });

  // Initialize store from saved state
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed.parcels) store.parcels = parsed.parcels;
      if (parsed.accountIDs) store.accountIDs = parsed.accountIDs;
      if (parsed.lastRefresh) store.lastRefresh = new Date(parsed.lastRefresh);
      if (parsed.theme) store.theme = parsed.theme;
      if (parsed.carriers) store.carriers = Object.assign({}, store.carriers, parsed.carriers);
      store.connected = Object.values(store.accountIDs).some(Boolean);
      themeManager.set(store.theme);
    } catch {}
  }

  // If no parcels, load demo
  if (store.parcels.length === 0 && !store.connected) {
    store.setDemo(true);
  }

  // Subscribe to store changes
  store.subscribe((snapshot) => {
    render(Object.assign({}, snapshot, { version: '1.0.0' }));
  });

  // Initial render
  render(Object.assign({}, store, { version: '1.0.0' }));

  // Theme toggle
  const themeBtn = $('theme-toggle');
  if (themeBtn) {
    themeBtn.onclick = () => {
      const next = store.theme === 'dark' ? 'light' : 'dark';
      store.setTheme(next);
    };
  }

  // Pin button
  const pinBtn = $('pin');
  if (pinBtn) {
    pinBtn.onclick = () => { store.togglePinned(); };
  }

  // Settings
  const settingsBtn = $('settings');
  if (settingsBtn) {
    settingsBtn.onclick = () => $('settings-dialog').showModal();
  }

  // Refresh
  const refreshBtn = $('refresh');
  if (refreshBtn) {
    refreshBtn.onclick = () => store.refresh(true);
  }

  // Hide / minimize
  const hideBtn = $('hide');
  if (hideBtn) hideBtn.onclick = () => {};
  const minimizeBtn = $('minimize');
  if (minimizeBtn) minimizeBtn.onclick = () => {};

  // Quit
  const quitBtn = $('quit');
  if (quitBtn) {
    quitBtn.onclick = () => {
      if (window.nova && window.nova.quit) window.nova.quit();
      else window.close();
    };
  }

  // Account open / signout
  const accountOpen = $('account-open');
  if (accountOpen) {
    accountOpen.onclick = () => { $('settings-dialog').close(); };
  }
  const accountSignout = $('account-signout');
  if (accountSignout) {
    accountSignout.onclick = () => {
      store.parcels = [];
      store.accountIDs = {};
      store.connected = false;
      store.persist();
      store.emit();
    };
  }

  // Toggle settings
  const settingPin = $('setting-pin');
  if (settingPin) {
    settingPin.onchange = (e) => { store.togglePinned(); };
  }
  const settingTheme = $('setting-theme');
  if (settingTheme) {
    settingTheme.onchange = (e) => {
      const checked = e.target.checked;
      store.setTheme(checked ? 'dark' : 'light');
    };
  }
  const settingAutostart = $('setting-autostart');
  if (settingAutostart) {
    settingAutostart.onchange = (e) => { store.loginAtLaunch = e.target.checked; store.emit(); };
  }
  const settingNotif = $('setting-notifications');
  if (settingNotif) {
    settingNotif.onchange = (e) => {
      store.notificationsEnabled = e.target.checked;
      store.emit();
      if (e.target.checked && 'Notification' in window) {
        Notification.requestPermission();
      }
    };
  }
  const notifTest = $('notification-test');
  if (notifTest) {
    notifTest.onclick = () => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Postomat', { body: 'Сповіщення працюють!' });
      }
      toast('Тестове сповіщення надіслано');
    };
  }

  // Show completed toggle
  document.addEventListener('click', (event) => {
    const target = event.target;
    const close = target.closest('[data-close]');
    if (close) {
      const dlg = document.getElementById(close.dataset.close);
      if (dlg) dlg.close();
    }

    if (target.closest('[data-add]')) {
      const addError = $('add-error');
      if (addError) addError.hidden = true;
      const form = $('add-form');
      if (form) form.reset();
      const dir = $('parcel-direction');
      if (dir) dir.value = selectedDirection;
      const dlg = $('add-dialog');
      if (dlg) dlg.showModal();
    }

    const signin = target.closest('#signin');
    if (signin) {}

    const tab = target.closest('[data-direction]');
    if (tab) {
      selectedDirection = tab.dataset.direction;
      store.selectedDirection = selectedDirection;
      store.emit();
      const scroll = document.querySelector('.parcel-scroll');
      if (scroll) scroll.scrollTo({ top: 0 });
    }

    const copy = target.closest('[data-copy]');
    if (copy) {
      navigator.clipboard.writeText(copy.dataset.copy).then(() => {
        toast('ТТН скопійовано');
      }).catch(() => {});
    }

    const showCompletedBtn = target.closest('#show-completed');
    if (showCompletedBtn) {
      showCompleted = !showCompleted;
      store.showCompleted = showCompleted;
      store.emit();
    }

    const enableNotif = target.closest('#enable-notifications');
    if (enableNotif) {
      store.notificationsEnabled = true;
      store.emit();
      toast('Сповіщення про зміни ввімкнено');
    }
  });

  // Add parcel form
  const addForm = $('add-form');
  if (addForm) {
    addForm.onsubmit = (event) => {
      event.preventDefault();
      const addError = $('add-error');
      if (addError) addError.hidden = true;
      const addSubmit = $('add-submit');
      if (addSubmit) addSubmit.disabled = true;

      const number = $('tracking-number').value;
      const title = $('parcel-title').value;
      const direction = $('parcel-direction').value;

      store.add(number, title, direction).then(ok => {
        if (ok) {
          const dlg = $('add-dialog');
          if (dlg) dlg.close();
        } else {
          if (addError) {
            addError.textContent = store.error || 'Не вдалося додати посилку.';
            addError.hidden = false;
          }
        }
      }).finally(() => {
        if (addSubmit) addSubmit.disabled = store.busy || store.demo;
      });
    };
  }

  // Expose for Electron host
  window.postomat = {
    state: () => Object.assign({}, currentSnapshot, { version: '1.0.0' }),
    refresh: () => store.refresh(true),
    add: (n, t, d) => store.add(n, t, d),
    signIn: () => {},
    signOut: () => { store.parcels = []; store.accountIDs = {}; store.connected = false; store.persist(); store.emit(); },
    setTheme: (t) => store.setTheme(t),
    subscribe: (cb) => store.subscribe(cb),
  };

  // Auto-refresh on load
  setTimeout(() => {
    if (store.parcels.length > 0) store.refresh(true);
  }, 2000);

})();
