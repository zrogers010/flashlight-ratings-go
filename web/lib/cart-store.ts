import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  id: number;
  brand: string;
  name: string;
  image_url?: string;
  asin: string;
  price_usd?: number;
  quantity: number;
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity">) => void;
  removeItem: (id: number) => void;
  updateQuantity: (id: number, qty: number) => void;
  clear: () => void;
  totalItems: () => number;
  has: (id: number) => boolean;
};

export function extractAsin(amazonUrl?: string): string | null {
  if (!amazonUrl) return null;
  const match = amazonUrl.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      addItem: (item) =>
        set((state) => {
          const existing = state.items.find((i) => i.id === item.id);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
              ),
            };
          }
          return { items: [...state.items, { ...item, quantity: 1 }] };
        }),
      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),
      updateQuantity: (id, qty) =>
        set((state) => {
          if (qty <= 0) {
            return { items: state.items.filter((i) => i.id !== id) };
          }
          return {
            items: state.items.map((i) =>
              i.id === id ? { ...i, quantity: qty } : i
            ),
          };
        }),
      clear: () => set({ items: [] }),
      totalItems: () =>
        get().items.reduce((sum, i) => sum + i.quantity, 0),
      has: (id) => get().items.some((i) => i.id === id),
    }),
    { name: "flashlight-cart" }
  )
);
