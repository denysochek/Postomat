// Типи даних для всіх перевізників
export type CarrierId = 'novaposhta' | 'ukrposhta' | 'meest';

export type ParcelDirection = 'incoming' | 'outgoing';
export type ParcelStatusCode = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11';

export interface Parcel {
  id: string;                 // ТТН / номер відправлення
  carrier: CarrierId;         // Перевізник
  title: string;              // Опис вмісту
  status: string;             # Текстовий статус
  code: string;               # Код статусу (стандтизований)
  origin: string;             # Місце відправлення
  destination: string;        # Місце отримання / відділення
  expected: string;           # Очікувана дата доставки
  updatedAt: Date;            # Час останнього оновлення
  direction: ParcelDirection; # Напрямок
  isManual: boolean;          # Додано вручну чи з акаунту
}

export interface ParcelChange {
  old: Parcel;
  new: Parcel;
  shouldOpenWidget: boolean;
}

export interface TrackResult {
  kind: 'success' | 'expired' | 'login' | 'loading' | 'error';
  accountID?: string;
  rows?: Parcel[];
  message?: string;
}

export interface CarrierConfig {
  id: CarrierId;
  name: string;
  shortName: string;
  color: string;
  symbol: string;
  ttnPattern: RegExp;
  ttnLength: number;
  supportsAccount: boolean;
  trackingUrl: (ttn: string) => string;
}

export interface CarrierAdapter {
  config: CarrierConfig;
  track(numbers: string[], options?: { direction?: ParcelDirection }): Promise<Parcel[]>;
  validateNumber(number: string): boolean;
  normalizeNumber(input: string): string;
  trackingUrl(ttn: string): string;
}

export interface SavedState {
  parcels: Parcel[];
  accountID?: Record<CarrierId, string>;
  lastRefresh?: Date;
  theme: 'light' | 'dark' | 'system';
  carriers: Record<CarrierId, { enabled: boolean; accountID?: string }>;
}
