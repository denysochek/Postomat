// Базовий клас для адаптерів перевізників
import type { CarrierAdapter, CarrierConfig, Parcel, ParcelDirection } from './types.js';

export abstract class BaseCarrier implements CarrierAdapter {
  abstract config: CarrierConfig;

  normalizeNumber(input: string): string {
    return String(input ?? '').replace(/[\s-]/g, '');
  }

  abstract validateNumber(number: string): boolean;
  abstract track(numbers: string[], options?: { direction?: ParcelDirection }): Promise<Parcel[]>;

  trackingUrl(ttn: string): string {
    return this.config.trackingUrl(ttn);
  }

  protected parseDate(value: string | number | null): Date | null {
    if (!value) return null;
    const d = new Date(String(value));
    return isNaN(d.getTime()) ? null : d;
  }

  protected makeParcel(row: Record<string, any>, carrier: CarrierId, direction: ParcelDirection = 'incoming'): Parcel | null {
    const text = (keys: string[]): string => {
      for (const key of keys) {
        const v = row[key];
        if ((typeof v === 'string' || typeof v === 'number') && String(v).trim()) return String(v).trim();
      }
      return '';
    };

    const id = text(['Number', 'IntDocNumber', 'DocumentNumber', 'trackNumber', 'TTN']);
    if (!this.validateNumber(id)) return null;

    const status = text(['Status', 'TrackingStatus', 'StatusDescription', 'status', 'statusDescription']);
    const code = text(['StatusCode', 'TrackingStatusCode', 'statusCode', 'code']);
    if (!status || !code) return null;

    return {
      id,
      carrier,
      title: text(['Description', 'CargoDescriptionString', 'CargoDescription', 'DescriptionOfCargo', 'cargoDescription']) || 'Посилка',
      status,
      code,
      origin: text(['CitySender', 'CitySenderDescription', 'senderCity']),
      destination: text(['WarehouseRecipient', 'RecipientAddress', 'RecipientAddressDescription', 'CityRecipient', 'recipientCity']),
      expected: text(['ScheduledDeliveryDate', 'ExpectedDeliveryDate', 'expectedDate']),
      updatedAt: this.parseDate(text(['UpdatedAt', 'DateTime', 'date'])) ?? new Date(),
      direction,
      isManual: false,
    };
  }
}
