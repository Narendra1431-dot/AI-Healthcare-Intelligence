/**
 * Demo mode — synthetic data is used throughout the platform.
 * Surfaced persistently in the top navigation per the product brief.
 */
import { create } from 'zustand';
import { getDemoReadiness } from './api';

interface DemoState {
  isDemo: boolean;
  environment: string;
  note?: string;
  loaded: boolean;
  detect: () => Promise<void>;
  setDemo: (v: boolean) => void;
}

export const useDemoStore = create<DemoState>((set, get) => ({
  isDemo: true,
  environment: 'synthetic',
  note: undefined,
  loaded: false,
  detect: async () => {
    try {
      const data = await getDemoReadiness();
      set({
        isDemo: !!data.demo_mode,
        environment: data.environment || 'synthetic',
        note: data.clinical_safety_note || data.privacy_note,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
  setDemo: (v) => set({ isDemo: v }),
}));
