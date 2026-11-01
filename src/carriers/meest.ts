// Адаптер Meest (публічний трекінг)
import type { CarrierConfig, Parcel, ParcelDirection } from '../types.js';
import { BaseCarrier } from './base.ts';

export class MeestCarrier extends BaseCarrier {
  config: CarrierConfig = {
    id: 'meest',
    name: 'Meest',
    shortName: 'Міст',
    color: '#00a651',
    symbol: '🚚',
    ttnPattern: /^[0-9]{10,14}$/,
    ttnLength: 11,
    supportsAccount: false,
    trackingUrl: (ttn: string) => `https://meest.com/uk/tracking/${ttn}`,
  };

  validateNumber(number: string): boolean {
    return /^[0-9]{10,14}$/.test(number);
  }

  normalizeNumber(input: string): string {
    return super.normalizeNumber(input);
  }

  async track(numbers: string[], options?: { direction?: ParcelDirection }): Promise<Parcel[]> {
    if (!numbers.length) return [];
    const direction = options?.direction ?? 'incoming';
    const all: Parcel[] = [];

    for (const ttn of numbers) {
      try {
        const response = await fetch(`https://api.meest.com/v1/tracking/${encodeURIComponent(ttn)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          // Альтернативний endpoint
          const alt = await fetch(`https://tracking.meest.net/api/track?ttn=${encodeURIComponent(ttn)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(15000),
          });
          if (!alt.ok) continue;
          const data = await alt.json();
          const parcel = this.parseMeestResponse(data, ttn, direction);
          if (parcel) all.push(parcel);
          continue;
        }

        const data = await response.json();
        const parcel = this.parseMeestResponse(data, ttn, direction);
        if (parcel) all.push(parcel);
      } catch {
        continue;
      }
    }
    return all;
  }

  private parseMeestResponse(data: any, ttn: string, direction: ParcelDirection): Parcel | null {
    try {
      const track = data.tracking || data.result || data || {};
      const status = track.statusDescription || track.status || 'Статус не відомо';
      const code = String(track.statusCode || track.code || '0');
      return {
        id: ttn,
        carrier: 'meest',
        title: track.cargoDescription || track.description || 'Посилка Meest',
        status,
        code,
        origin: track.senderCity || '',
        destination: track.recipientCity || track.postOffice || '',
        expected: track.expectedDate || '',
        updatedAt: new Date(track.lastUpdate || track.updatedAt || Date.now()),
        direction,
        isManual: false,
      };
    } catch {
      return null;
    }
  }
}
