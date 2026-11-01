// Адаптер Укрпошти (публічний трекінг API)
import type { CarrierConfig, Parcel, ParcelDirection } from '../types.js';
import { BaseCarrier } from './base.ts';

export class UkrposhtaCarrier extends BaseCarrier {
  config: CarrierConfig = {
    id: 'ukrposhta',
    name: 'Укрпошта',
    shortName: 'Укр',
    color: '#0057b7',
    symbol: '📮',
    ttnPattern: /^[A-Z]{2}[0-9]{9}[A-Z]{2}$|^[0-9]{11,14}$/,
    ttnLength: 13,
    supportsAccount: false,
    trackingUrl: (ttn: string) => `https://www.ukrposhta.ua/tracking/${ttn}`,
  };

  validateNumber(number: string): boolean {
    // Укрпошта ТТН може бути у форматі RA123456789UA або числовий 11-14 цифр
    return /^[A-Z]{2}[0-9]{9}[A-Z]{2}$/i.test(number) || /^[0-9]{11,14}$/.test(number);
  }

  normalizeNumber(input: string): string {
    return super.normalizeNumber(input).toUpperCase();
  }

  async track(numbers: string[], options?: { direction?: ParcelDirection }): Promise<Parcel[]> {
    if (!numbers.length) return [];
    const direction = options?.direction ?? 'incoming';
    const all: Parcel[] = [];

    for (const ttn of numbers) {
      try {
        // Укрпошта має публічний API трекінгу
        const response = await fetch(`https://www.ukrposhta.ua/tracking/api/v1/track/${encodeURIComponent(ttn)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
          // Fallback: спробуємо альтернативний endpoint
          const alt = await fetch(`https://tracking.ukrposhta.ua/api/track?ttn=${encodeURIComponent(ttn)}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: AbortSignal.timeout(15000),
          });
          if (!alt.ok) continue;
          const data = await alt.json();
          const parcel = this.parseUkrposhtaResponse(data, ttn, direction);
          if (parcel) all.push(parcel);
          continue;
        }

        const data = await response.json();
        const parcel = this.parseUkrposhtaResponse(data, ttn, direction);
        if (parcel) all.push(parcel);
      } catch {
        // Пропускаємо помилки окремих ТТН, не зупиняємо całą синхронізацію
        continue;
      }
    }
    return all;
  }

  private parseUkrposhtaResponse(data: any, ttn: string, direction: ParcelDirection): Parcel | null {
    try {
      const track = data.tracking || data.result || data;
      const status = track.statusDescription || track.status || 'Статус не відомо';
      const code = String(track.statusCode || track.code || '0');
      return {
        id: ttn,
        carrier: 'ukrposhta',
        title: track.cargoDescription || track.description || 'Посилка Укрпошти',
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
