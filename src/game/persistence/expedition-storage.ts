import { SAVE_KEY, validateSave } from './save-data';
import type { SaveData } from './save-data';
import type { Resource } from '../resources/catalog';

export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export function browserStorage(): SaveStorage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}
export class ExpeditionStorage {
  constructor(
    private storage: SaveStorage | null,
    private resources: Resource[],
  ) {}
  load(): SaveData | null {
    try {
      const raw = this.storage?.getItem(SAVE_KEY);
      return raw ? validateSave(JSON.parse(raw), this.resources.length) : null;
    } catch {
      return null;
    }
  }
  save(data: SaveData): boolean {
    try {
      if (!this.storage) return false;
      this.storage.setItem(SAVE_KEY, JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }
}
