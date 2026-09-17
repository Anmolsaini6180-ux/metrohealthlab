import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { CartItem } from "@/types/cart";

const CART_KEY = "mh_cart_v1";

function readStoredCart(): CartItem[] {
  try {
    const raw = sessionStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

// A cart is fulfilled by one lab visit — create_website_booking_cart
// requires every item's pricing row to share a lab_id, so this is
// enforced here too rather than only surfacing as a server error at
// checkout.
export type AddItemResult = "added" | "already-in-cart" | "different-lab";

interface CartContextValue {
  items: CartItem[];
  labId: string | null;
  labName: string | null;
  /** Adds unless the cart already holds a different lab's item(s) — see AddItemResult. */
  addItem: (item: CartItem) => AddItemResult;
  /** Clears the cart first, then adds — used after the customer confirms swapping labs. */
  replaceCart: (item: CartItem) => void;
  removeItem: (itemType: CartItem["itemType"], refId: string) => void;
  clear: () => void;
  subtotal: number;
  mrpTotal: number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => readStoredCart());

  useEffect(() => {
    try {
      sessionStorage.setItem(CART_KEY, JSON.stringify(items));
    } catch {
      // best-effort persistence only — a full cart still works for this tab/session
    }
  }, [items]);

  const addItem = useCallback(
    (item: CartItem): AddItemResult => {
      let result: AddItemResult = "added";
      setItems((current) => {
        if (current.some((i) => i.itemType === item.itemType && i.refId === item.refId)) {
          result = "already-in-cart";
          return current;
        }
        if (current.length > 0 && current[0].labId !== item.labId) {
          result = "different-lab";
          return current;
        }
        return [...current, item];
      });
      return result;
    },
    []
  );

  const replaceCart = useCallback((item: CartItem) => {
    setItems([item]);
  }, []);

  const removeItem = useCallback((itemType: CartItem["itemType"], refId: string) => {
    setItems((current) => current.filter((i) => !(i.itemType === itemType && i.refId === refId)));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const subtotal = items.reduce((sum, i) => sum + i.price, 0);
  const mrpTotal = items.reduce((sum, i) => sum + (i.mrp ?? i.price), 0);

  return (
    <CartContext.Provider
      value={{
        items,
        labId: items[0]?.labId ?? null,
        labName: items[0]?.labName ?? null,
        addItem,
        replaceCart,
        removeItem,
        clear,
        subtotal,
        mrpTotal,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
