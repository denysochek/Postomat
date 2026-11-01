// Тема оформлення — світла / темна / системна
import type { SavedState } from '../types.js';

const THEME_KEY = 'postomat-theme';

export type Theme = 'light' | 'dark' | 'system';

export class ThemeManager {
  private current: Theme = 'system';
  private listeners: Set<(theme: 'light' | 'dark') => void> = new Set();

  constructor() {
    this.load();
    this.apply();
    this.watchSystem();
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(THEME_KEY);
      if (raw === 'light' || raw === 'dark' || raw === 'system') {
        this.current = raw;
      }
    } catch {
      // ігноруємо помилки localStorage
    }
  }

  save(): void {
    try { localStorage.setItem(THEME_KEY, this.current); } catch {}
  }

  get(): Theme { return this.current; }

  isDark(): 'light' | 'dark' {
    if (this.current === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return this.current;
  }

  set(theme: Theme): void {
    this.current = theme;
    this.save();
    this.apply();
  }

  private apply(): void {
    const resolved = this.isDark();
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
    this.listeners.forEach(fn => fn(resolved));
  }

  private watchSystem(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (this.current === 'system') this.apply();
    };
    media.addEventListener?.('change', handler);
  }

  onChange(fn: (resolved: 'light' | 'dark') => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const themeManager = new ThemeManager();
