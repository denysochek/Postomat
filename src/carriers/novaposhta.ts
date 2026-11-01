// Адаптер Нова пошта (публічний API + кабінет через WebView у нативному додатку)
import type { CarrierConfig, Parcel, ParcelDirection } from '../types.js';
import { BaseCarrier } from './base.ts';

export class NovaPoshtaCarrier extends BaseCarrier {
  config: CarrierConfig = {
    id: 'novaposhta',
    name: 'Нова пошта',
    shortName: 'НП',
    color: '#f5453b',
    symbol: '📦',
    ttnPattern: /^[0-9]{14}$/,
    ttnLength: 14,
    supportsAccount: true,
    trackingUrl: (ttn: string) => `https://novaposhta.ua/tracking/${ttn}`,
  };

  validateNumber(number: string): boolean {
    return this.config.ttnPattern.test(number);
  }

  normalizeNumber(input: string): string {
    return super.normalizeNumber(input);
  }

  async track(numbers: string[], options?: { direction?: ParcelDirection }): Promise<Parcel[]> {
    if (!numbers.length) return [];
    const direction = options?.direction ?? 'incoming';
    const all: Parcel[] = [];
    const API = 'https://api.novaposhta.ua/v2.0/json/';

    for (let offset = 0; offset < numbers.length; offset += 100) {
      const batch = numbers.slice(offset, offset + 100);
      const response = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: '',
          modelName: 'TrackingDocument',
          calledMethod: 'getStatusDocuments',
          methodProperties: {
            Documents: batch.map(n => ({ DocumentNumber: n })),
            Language: 'UA',
          },
        }),
        signal: AbortSignal.timeout(25000),
      });

      if (!response.ok) throw new Error('Нова пошта тимчасово не відповідає.');
      const body = await response.json();
      if (body.success !== true || !Array.isArray(body.data)) {
        throw new Error('Не вдалося отримати статус від Нова пошти.');
      }

      for (const row of body.data) {
        const parcel = this.makeParcel(row as Record<string, any>, 'novaposhta', direction);
        if (parcel) all.push(parcel);
      }
    }
    return all;
  }
}
