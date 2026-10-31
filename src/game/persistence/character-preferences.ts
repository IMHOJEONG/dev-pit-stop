import { isAppearance } from '../player/appearance';
import type { Appearance } from '../player/appearance';
import type { SaveStorage } from './expedition-storage';
const KEY = 'wild-atlas-character-v1';
export class CharacterPreferences {
  constructor(private storage: SaveStorage | null) {}
  load(): Appearance | null {
    try {
      const raw = this.storage?.getItem(KEY);
      const value: unknown = raw ? JSON.parse(raw) : null;
      return isAppearance(value) ? { ...value } : null;
    } catch {
      return null;
    }
  }
  save(appearance: Appearance) {
    try {
      if (!this.storage) return false;
      this.storage.setItem(KEY, JSON.stringify(appearance));
      return true;
    } catch {
      return false;
    }
  }
}
