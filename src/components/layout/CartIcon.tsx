import { Link } from "react-router-dom";
import { useCart } from "@/hooks/useCart";

// Same icon-btn/badge-dot visual language as NotificationBell — a
// persistent, always-visible way back into the cart, matching the
// reference's own sticky "N item(s) added — Go to cart" bar.
export default function CartIcon() {
  const { items } = useCart();
  return (
    <Link className="icon-btn" to="/cart" aria-label="Cart">
      <span className="mi">shopping_cart</span>
      {items.length > 0 && <span className="mh-badge-dot">{items.length > 9 ? "9+" : items.length}</span>}
    </Link>
  );
}
