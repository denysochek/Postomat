// Реєстр перевізників — централізований доступ до всіх адаптерів
import { NovaPoshtaCarrier } from './novaposhta.ts';
import { UkrposhtaCarrier } from './ukrposhta.ts';
import { MeestCarrier } from './meest.ts';
import type { CarrierId, CarrierAdapter, ParcelDirection, Parcel } from '../types.js';

export class CarrierRegistry {
  private adapters: Map<CarrierId, CarrierAdapter> = new Map();

  constructor() {
    this.register('novaposhta', new NovaPoshtaCarrier());
    this.register('meest', new MeestCarrier());
    this.register('ukrposhta', new UkrposhtaCarrier());
  }

  private register(id: CarrierId, adapter: CarrierAdapter): void {
    this.adapters.set(id, adapter);
  }

  get(id: CarrierId): CarrierAdapter | undefined {
    return this.adapters.get(id);
  }

  all(): CarrierAdapter[] {
    return [...this.adapters.values()];
  }

  enabled(carriers: Record<CarrierId, { enabled: boolean }>): CarrierAdapter[] {
    return this.all().filter(a => carriers[a.id]?.enabled !== false);
  }

  // Визначає перевізника за шаблоном ТТН
  detectCarrier(ttn: string): CarrierId | null {
    for (const adapter of this.all()) {
      if (adapter.validateNumber(ttn)) {
        return adapter.config.id;
      }
    }
    return null;
  }

  // Трекінг кількох ТТН через відповідні перевізники
  async trackByCarrier(
    grouped: Record<CarrierId, string[]>,
    options?: { direction?: ParcelDirection }
  ): Promise<Parcel[]> {
    const results: Parcel[] = [];
    await Promise.all(
      Object.entries(grouped).map(async ([carrierId, numbers]) => {
        const id = carrierId as CarrierId;
        const adapter = this.get(id);
        if (!adapter || !numbers.length) return;
        try {
          const parcels = await adapter.track(numbers, options);
          results.push(...parcels);
        } catch {
          // Продовжуємо з іншими перевізниками навіть якщо один не вдався
        }
      })
    );
    return results;
  }
}

export const carrierRegistry = new CarrierRegistry();
