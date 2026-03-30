import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_COMPARE = 5;

type CompareItem = {
  id: number;
  brand: string;
  name: string;
  image_url?: string;
};

type CompareState = {
  items: CompareItem[];
  add: (item: CompareItem) => void;
  remove: (id: number) => void;
  clear: () => void;
  has: (id: number) => boolean;
};

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      items: [],
      add: (item) =>
        set((state) => {
          if (state.items.length >= MAX_COMPARE) return state;
          if (state.items.some((i) => i.id === item.id)) return state;
          return { items: [...state.items, item] };
        }),
      remove: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),
      clear: () => set({ items: [] }),
      has: (id) => get().items.some((i) => i.id === id),
    }),
    { name: "flashlight-compare" }
  )
);
