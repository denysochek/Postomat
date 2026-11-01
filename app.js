import { ParcelStore } from './store/parcel-store.js';
import { themeManager } from './store/theme.js';
import { carrierRegistry } from './carriers/registry.js';
import type { ParcelDirection, CarrierId } from './types.js';

const $ = (id: string) => document.getElementById(id) as HTMLElement;
const symbols: Record<string, string> = {
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
};

const icon = (name: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${symbols[name] || symbols.box}</svg>`;
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

document.querySelectorAll<HTMLElement>('[data-icon]').forEach(node => {
  node.innerHTML = icon(node.dataset.icon!);
});

let store: ParcelStore | null = null;
let currentSnapshot: any = null;
let showCompleted = false;
let selectedDirection: ParcelDirection = 'incoming';
let revealSequence = 0;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function toast(message: string) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}

async function run(action: () => Promise<unknown>) {
  try { return await action(); } catch { toast('Не вдалося виконати дію. Спробуйте ще раз.'); }
}

function parcelCard(parcel: any): string {
  const delivered = ['9', '10', '11'].includes(parcel.code);
  const ready = ['7', '8'].includes(parcel.code);
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

  const isStale = Date.now() - new Date(parcel.updatedAt).getTime() > 900_000;

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
    <div style="font-size:10px; color:var(--muted); font-family:ui-monospace;">
      ${parcel.carrier === 'novaposhta' ? 'НП' : parcel.carrier === 'ukrposhta' ? 'Укр' : 'Міст'}
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

function render(state: any) {
  currentSnapshot = state;
  const reveal = state.revealRequest;
  const shouldReveal = reveal && reveal.sequence !== revealSequence;

  if (shouldReveal) {
    revealSequence = reveal.sequence;
    selectedDirection = reveal.direction;
    if (reveal.completed) showCompleted = true;
  }

  $('demo-banner').hidden = !state.demo;
  $('pin').classList.toggle('active', state.pinned);
  $('pin').setAttribute('aria-pressed', String(state.pinned));
  $('connection-dot').className = `dot ${state.error ? 'error-dot' : state.connected || state.parcels.length ? 'connected' : ''}`;
  $('last-refresh').textContent = state.busy
    ? 'Перевіряємо статуси…'
    : state.lastRefresh ? `Оновлено ${new Date(state.lastRefresh).toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' })}`
    : state.awaitingLogin ? 'Очікуємо на вхід' : 'Готовий до підключення';
  $('refresh').disabled = state.busy || state.demo;

  const key = JSON.stringify([state.parcels, state.connected, state.awaitingLogin, state.error, state.notifications, showCompleted, selectedDirection]);
  const contentEl = $('content');

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
    const tabOf = (p: any) => p.direction === 'outgoing' ? 'outgoing' : 'incoming';
    const parcels = state.parcels.filter((p: any) => tabOf(p) === selectedDirection);
    const active = parcels.filter((p: any) => !['9', '10', '11'].includes(p.code));
    const visible = showCompleted ? parcels : active;

    const tabs = [
      ['incoming', 'Отримання', '↙'],
      ['outgoing', 'Відправлення', '↗'],
    ].map(([direction, label, arrow]) => `
      <button data-direction="${direction}" aria-pressed="${direction === selectedDirection}" class="direction-tab ${direction === selectedDirection ? 'selected' : ''}">
        <span>${arrow}</span>${label}<span class="tab-count">${state.parcels.filter((p: any) => tabOf(p) === direction && !['9', '10', '11'].includes(p.code)).length}</span>
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
${!state.notifications ? '<button id="enable-notifications" class="enable-notifications">Увімкнути сповіщення про зміни</button>' : ''}
`;
    const scrollEl = document.querySelector('.parcel-scroll') as HTMLElement;
    const scroll = scrollEl?.scrollTop || 0;
    requestAnimationFrame(() => { if (scrollEl) scrollEl.scrollTop = scroll; });
  }

  if (shouldReveal) {
    const el = document.querySelector(`[data-parcel-id="${reveal.id}"]`) as HTMLElement;
    el?.scrollIntoView({ block: 'start' });
  }

  $('account-label').textContent = state.connected ? 'Акаунт підключено' : 'Акаунт не підключено';
  $('account-open').textContent = state.connected ? 'Відкрити акаунт' : 'Увійти за телефоном';
  $('account-signout').hidden = !state.connected;
  $('setting-pin').checked = state.pinned;
  $('setting-theme').checked = state.theme === 'dark';
  $('setting-notifications').checked = state.notifications;
  $('setting-autostart').checked = state.loginAtLaunch;
  $('add-submit').disabled = state.busy || state.demo;
  $('version').textContent = `Postomat ${state.version}`;
}

// Ініціалізація
(async () => {
  const saved = localStorage.getItem('postomat-state');
  store = new ParcelStore(saved ? JSON.parse(saved) : undefined);

  // Theme toggle
  const themeBtn = $('theme-toggle');
  themeBtn.onclick = () => {
    const next = store!.theme === 'dark' ? 'light' : 'dark';
    store!.setTheme(next);
    themeBtn.dataset.icon = next === 'dark' ? 'sun' : 'theme';
    themeBtn.innerHTML = icon(next === 'dark' ? 'sun' : 'theme');
  };

  // Subscribe to store changes
  const unsub = store.subscribe((snapshot: any) => {
    render({ ...snapshot, version: '1.0.0', revealRequest: snapshot.revealRequest });
  });

  // Initial render
  render({ ...store, version: '1.0.0' });

  // Pin button
  $('pin').onclick = () => run(() => { store!.togglePinned(); return Promise.resolve(); });

  // Settings
  $('settings').onclick = () => $('settings-dialog').showModal();

  // Refresh
  $('refresh').onclick = () => run(() => store!.refresh(true));

  // Hide / minimize
  $('hide').onclick = () => run(() => { /* minimize to tray handled by host */ });
  $('minimize').onclick = () => run(() => { /* minimize */ });

  // Quit
  $('quit').onclick = () => run(() => { if (typeof window.nova !== 'undefined') window.nova.quit(); });

  // Account open / signout
  $('account-open').onclick = () => { $('settings-dialog').close(); run(() => { /* signIn handled by host */ }); };
  $('account-signout').onclick = () => run(() => { store!.setDemo(false); store!.parcels = []; store!.emit(); });

  // Toggle settings
  $('setting-pin').onchange = (e) => run(() => { store!.togglePinned(); return Promise.resolve(); });
  $('setting-theme').onchange = (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    store!.setTheme(checked ? 'dark' : 'light');
    themeBtn.dataset.icon = checked ? 'sun' : 'theme';
    themeBtn.innerHTML = icon(checked ? 'sun' : 'theme');
  };
  $('setting-autostart').onchange = (e) => run(() => { store!.loginAtLaunch = (e.target as HTMLInputElement).checked; store!.emit(); return Promise.resolve(); });
  $('setting-notifications').onchange = (e) => {
    store!.notificationsEnabled = (e.target as HTMLInputElement).checked;
    store!.emit();
  };
  $('notification-test').onclick = () => run(async () => {
    $('notification-result').textContent = 'Тестове сповіщення надіслано.';
    toast('Тестове сповіщення надіслано');
  });

  // Show completed toggle
  $('show-completed').onclick = () => { showCompleted = !showCompleted; render(currentSnapshot); };

  // Enable notifications
  $('enable-notifications').onclick = () => run(async () => {
    store!.notificationsEnabled = true;
    store!.emit();
    toast('Сповіщення про зміни ввімкнено');
  });

  // Add parcel
  document.addEventListener('click', (event) => {
    const close = (event.target as HTMLElement).closest('[data-close]');
    if (close) (document.getElementById(close.dataset.close!) as HTMLDialogElement)?.close();

    if ((event.target as HTMLElement).closest('[data-add]')) {
      $('add-error').hidden = true;
      $('add-form').reset();
      $('parcel-direction').value = selectedDirection;
      $('add-dialog').showModal();
    }

    if ((event.target as HTMLElement).closest('#signin')) {
      run(() => { /* signIn handled by host */ });
    }

    const tab = (event.target as HTMLElement).closest('[data-direction]');
    if (tab) {
      selectedDirection = tab.dataset.direction as ParcelDirection;
      render(currentSnapshot);
      document.querySelector('.parcel-scroll')?.scrollTo?.({ top: 0 });
    }

    const copy = (event.target as HTMLElement).closest('[data-copy]');
    if (copy) {
      run(async () => {
        await navigator.clipboard.writeText(copy.dataset.copy!);
        toast('ТТН скопійовано');
      });
    }
  });

  $('add-form').onsubmit = (event) => {
    event.preventDefault();
    $('add-error').hidden = true;
    $('add-submit').disabled = true;

    run(async () => {
      const number = $('tracking-number').value;
      const title = $('parcel-title').value;
      const direction = $('parcel-direction').value as ParcelDirection;
      const ok = await store!.add(number, title, direction);
      if (ok) {
        $('add-dialog').close();
        render(currentSnapshot);
      } else {
        $('add-error').textContent = store!.error || 'Не вдалося додати посилку.';
        $('add-error').hidden = false;
      }
    }).finally(() => {
      $('add-submit').disabled = currentSnapshot.busy || currentSnapshot.demo;
    });
  };

  // Expose API for Electron host
  if (typeof window !== 'undefined') {
    (window as any).postomat = {
      state: () => ({ ...currentSnapshot, version: '1.0.0' }),
      refresh: () => store!.refresh(true),
      add: (n: string, t: string, d: ParcelDirection) => store!.add(n, t, d),
      signIn: () => { /* handled by host */ },
      signOut: () => { store!.setDemo(false); store!.parcels = []; store!.emit(); },
      setTheme: (t: 'light' | 'dark' | 'system') => store!.setTheme(t),
      subscribe: (cb: (s: any) => void) => store!.subscribe(cb),
    };
  }
})();
