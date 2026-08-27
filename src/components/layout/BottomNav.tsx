import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/", label: "Home", icon: "home", end: true },
  { to: "/tests", label: "Tests", icon: "science" },
  { to: "/bookings", label: "Bookings", icon: "calendar_month" },
  { to: "/reports", label: "Reports", icon: "description" },
  { to: "/profile", label: "Profile", icon: "person" },
];

export default function BottomNav() {
  return (
    <nav className="mh-bottomnav" aria-label="Primary">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          className={({ isActive }) => (isActive ? "active" : undefined)}
        >
          <span className="mi">{item.icon}</span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
