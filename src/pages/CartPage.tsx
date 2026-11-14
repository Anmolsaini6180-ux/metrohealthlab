import { Link, useNavigate } from "react-router-dom";
import { useCart } from "@/hooks/useCart";
import { formatCurrencyInr } from "@/services/pricingService";
import EmptyState from "@/components/common/EmptyState";
import Seo from "@/components/common/Seo";

export default function CartPage() {
  const { items, labName, removeItem, subtotal, mrpTotal } = useCart();
  const navigate = useNavigate();
  const discount = mrpTotal - subtotal;

  return (
    <div className="mh2-cart">
      <Seo title="Your Cart" description="Review the tests and packages you've added before booking." path="/cart" index={false} />
      <h1 className="mh2-booking__title" style={{ marginBottom: "var(--space-sm)" }}>
        Cart
      </h1>

      {items.length === 0 ? (
        <EmptyState
          icon="shopping_cart"
          title="Your cart is empty"
          description="Add a test or package to get started."
          action={{ label: "Browse packages", onClick: () => navigate("/packages") }}
        />
      ) : (
        <>
          {labName && <p className="mh2-cart__lab">Selected lab: {labName}</p>}

          <div className="mh2-cart__items" role="list">
            {items.map((item) => {
              const off = item.mrp && item.mrp > item.price ? Math.round(((item.mrp - item.price) / item.mrp) * 100) : null;
              return (
                <div className="mh2-cart__item" role="listitem" key={`${item.itemType}-${item.refId}`}>
                  <div className="mh2-cart__item-body">
                    <p className="mh2-cart__item-name">{item.name}</p>
                    <p className="mh2-cart__item-prices">
                      <span>{formatCurrencyInr(item.price)}</span>
                      {off !== null && (
                        <>
                          <s>{formatCurrencyInr(item.mrp!)}</s>
                          <span className="mh2-cart__item-off">{off}% off</span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="mh2-btn mh2-btn--outline mh2-btn--sm"
                    onClick={() => removeItem(item.itemType, item.refId)}
                  >
                    Remove
                  </button>
                </div>
              );
            })}
          </div>

          <Link to="/packages" className="mh2-add-row">
            <span className="mi" aria-hidden="true">add_circle</span>
            Add more tests
          </Link>

          <div className="mh2-order-summary">
            <p className="mh2-order-summary__title">Bill Summary</p>
            <div className="mh2-order-summary__row">
              <span>Cart MRP</span>
              <span>{formatCurrencyInr(mrpTotal)}</span>
            </div>
            {discount > 0 && (
              <div className="mh2-order-summary__row">
                <span>Total discount</span>
                <span>-{formatCurrencyInr(discount)}</span>
              </div>
            )}
            <hr className="mh2-order-summary__rule" />
            <div className="mh2-order-summary__row is-total">
              <span>To be paid</span>
              <span>{formatCurrencyInr(subtotal)}</span>
            </div>
          </div>

          <button className="mh2-btn mh2-btn--primary" style={{ width: "100%" }} onClick={() => navigate("/book")}>
            Continue
            <span className="mi" aria-hidden="true">arrow_forward</span>
          </button>
        </>
      )}
    </div>
  );
}
