// Централізоване сховище стану додатка
import type { Parcel, ParcelChange, ParcelDirection, SavedState, CarrierId } from '../types.js';
import { carrierRegistry, type CarrierAdapter } from '../carriers/registry.ts';
import { themeManager, type Theme } from './theme.ts';

const STORAGE_KEY = 'postomat-state';
const POLL_INTERVAL_MS = 300_000; // 5 хвилин
const BACKOFF_BASE_MS = 300_000;

export class ParcelStore {
  parcels: Parcel[] = [];
  accountIDs: Record<CarrierId, string | undefined> = {};
  lastRefresh: Date | null = null;
  theme: Theme = 'system';
  carriers: Record<CarrierId, { enabled: boolean; accountID?: string }> = {
    novaposhta: { enabled: true },
    ukrposhta: { enabled: true },
    meest: { enabled: true },
  };

  connected = false;
  busy = false;
  error: string | null = null;
  notificationsEnabled = false;
  pinned = false;
  loginAtLaunch = false;
  showCompleted = false;
  selectedDirection: ParcelDirection = 'incoming';
  demo = false;

  private listeners: Set<(snapshot: ParcelStore) => void> = new Set();
  private timer: ReturnType<typeof setInterval> | null = null;
  private generation = 0;
  private retryCount = 0;
  private lastAttempt = -Infinity;

  constructor(saved?: Partial<SavedState>) {
    if (saved?.parcels) this.parcels = saved.parcels;
    if (saved?.accountIDs) this.accountIDs = saved.accountIDs as Record<CarrierId, string | undefined>;
    if (saved?.lastRefresh) this.lastRefresh = new Date(saved.lastRefresh);
    if (saved?.theme) this.theme = saved.theme;
    if (saved?.carriers) this.carriers = { ...this.carriers, ...saved.carriers };
    this.connected = Object.values(this.accountIDs).some(Boolean);
    themeManager.set(this.theme);
    this.startPolling();
  }

  subscribe(fn: (snapshot: ParcelStore) => void): () => void {
    this.listeners.add(fn);
    fn(this);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    const snapshot = { ...this };
    this.listeners.forEach(fn => fn(snapshot));
  }

  visibleParcels(): Parcel[] {
    return this.parcels.filter(
      p => p.direction === this.selectedDirection && (this.showCompleted || !p.isDelivered)
    );
  }

  activeCount(direction: ParcelDirection): number {
    return this.parcels.filter(p => p.direction === direction && !p.isDelivered).length;
  }

  isDelivered(parcel: Parcel): boolean {
    return ['9', '10', '11'].includes(parcel.code);
  }

  isReady(parcel: Parcel): boolean {
    return ['7', '8'].includes(parcel.code);
  }

  async refresh(force = false): Promise<void> {
    if (this.demo || this.busy) return;
    if (!force && Date.now() - this.lastAttempt < Math.min(3_600_000, BACKOFF_BASE_MS * 2 ** this.retryCount)) return;
    if (!this.connected && this.parcels.length === 0) return;

    const gen = ++this.generation;
    this.busy = true;
    this.lastAttempt = Date.now();
    this.emit();

    try {
      const enabledCarriers = carrierRegistry.enabled(this.carriers);
      const grouped: Record<CarrierId, string[]> = {} as Record<CarrierId, string[]>;

      for (const adapter of enabledCarriers) {
        grouped[adapter.config.id] = this.parcels
          .filter(p => p.carrier === adapter.config.id)
          .map(p => p.id);
      }

      // Якщо немає збережених посилок, демонстраційний режим
      if (Object.values(grouped).every(v => v.length === 0)) {
        this.loadDemo();
        return;
      }

      const results = await carrierRegistry.trackByCarrier(grouped, { direction: this.selectedDirection });

      if (gen !== this.generation) return;

      this.applyResults(results);
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
  }

  private applyResults(incoming: Parcel[]): void {
    const map = new Map(this.parcels.map(p => [p.id, p]));
    const changes: ParcelChange[] = [];

    for (const parcel of incoming) {
      const old = map.get(parcel.id);
      if (!old) {
        map.set(parcel.id, parcel);
        continue;
      }
      const oldFp = `${old.code}|${old.status.trim()}`;
      const newFp = `${parcel.code}|${parcel.status.trim()}`;
      if (oldFp !== newFp) {
        changes.push({ old, new: parcel, shouldOpenWidget: !this.isReady(old) && this.isReady(parcel) });
      }
      map.set(parcel.id, parcel);
    }

    this.parcels = [...map.values()].sort((a, b) => {
      if (this.isDelivered(a) !== this.isDelivered(b)) return this.isDelivered(a) ? 1 : -1;
      return b.id.localeCompare(a.id);
    });

    for (const change of changes) {
      this.notify(change);
    }
  }

  async add(trackingNumber: string, title = '', direction: ParcelDirection = 'incoming', carrier?: CarrierId): Promise<boolean> {
    const detected = carrier ?? carrierRegistry.detectCarrier(trackingNumber);
    if (!detected) {
      this.error = 'Не вдалося визначити перевізника за номером ТТН.';
      return false;
    }

    const adapter = carrierRegistry.get(detected);
    if (!adapter) return false;

    const normalized = adapter.normalizeNumber(trackingNumber);
    if (!adapter.validateNumber(normalized)) {
      this.error = `Некоректний номер ТТН для ${adapter.config.name}.`;
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
      const rows = await adapter.track([normalized], { direction });
      if (gen !== this.generation) return false;
      if (rows.length !== 1) {
        this.error = 'Посилку не знайдено. Перевірте номер ТТН.';
        return false;
      }
      const parcel = rows[0];
      parcel.isManual = true;
      if (!parcel.direction) parcel.direction = direction;
      if (title.trim()) parcel.title = title.trim();

      this.parcels = [...this.parcels, parcel].sort((a, b) => {
        if (this.isDelivered(a) !== this.isDelivered(b)) return this.isDelivered(a) ? 1 : -1;
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
  }

  remove(id: string): void {
    this.parcels = this.parcels.filter(p => p.id !== id);
    this.persist();
    this.emit();
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    themeManager.set(theme);
    this.persist();
    this.emit();
  }

  setCarrierEnabled(carrierId: CarrierId, enabled: boolean): void {
    this.carriers[carrierId].enabled = enabled;
    this.persist();
    this.emit();
  }

  setAccountID(carrierId: CarrierId, id: string | undefined): void {
    this.accountIDs[carrierId] = id;
    this.connected = Object.values(this.accountIDs).some(Boolean);
    this.persist();
    this.emit();
  }

  togglePinned(): void {
    this.pinned = !this.pinned;
    this.emit();
  }

  setShowCompleted(value: boolean): void {
    this.showCompleted = value;
    this.emit();
  }

  setDirection(direction: ParcelDirection): void {
    this.selectedDirection = direction;
    this.emit();
  }

  setDemo(value: boolean): void {
    this.demo = value;
    if (value) this.loadDemo();
    this.emit();
  }

  private loadDemo(): void {
    const now = new Date();
    this.parcels = [
      {
        id: '20450000000001', carrier: 'novaposhta', title: 'Книжки на вихідні',
        status: 'Прибув у відділення', code: '7', origin: 'Львів',
        destination: 'Київ · Відділення № 24', expected: '', updatedAt: now,
        direction: 'incoming', isManual: false,
      },
      {
        id: 'RA123456789UA', carrier: 'ukrposhta', title: 'Замовлення з інтернет-магазину',
        status: 'Відправлено з 센дру', code: '2', origin: 'Київ',
        destination: 'Одеса · Відділення № 15', expected: '', updatedAt: now,
        direction: 'incoming', isManual: false,
      },
      {
        id: '5001234567890', carrier: 'meest', title: 'Подарунок для друга',
        status: 'У сортованому центрі', code: '3', origin: 'Харків',
        destination: 'Львів · Відділення Meest', expected: '18.09.2026', updatedAt: now,
        direction: 'outgoing', isManual: false,
      },
      {
        id: '20450000000004', carrier: 'novaposhta', title: 'Настільна гра',
        status: 'Отримано', code: '9', origin: 'Київ',
        destination: 'Одеса · Відділення № 8', expected: '', updatedAt: now,
        direction: 'outgoing', isManual: false,
      },
    ];
    this.lastRefresh = now;
    this.error = null;
    this.retryCount = 0;
  }

  private notify(_change: ParcelChange): void {
    if (!this.notificationsEnabled) return;
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Postomat', {
        body: 'Статус посилки змінився',
        icon: '/assets/icon-192.png',
      });
    }
  }

  private persist(): void {
    if (this.demo) return;
    try {
      const state: SavedState = {
        parcels: this.parcels,
        accountIDs: this.accountIDs,
        lastRefresh: this.lastRefresh,
        theme: this.theme,
        carriers: this.carriers,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ігноруємо помилки запису
    }
  }

  private startPolling(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
  }

  destroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
