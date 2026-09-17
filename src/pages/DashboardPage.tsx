import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useAdminRole } from "@/hooks/useAdminRole";
import { adminHomePathForRole, adminMenuLabelForRole } from "@/utils/roleAccess";
import { useAsync } from "@/hooks/useAsync";
import { useUnreadNotificationsCount } from "@/hooks/useUnreadNotificationsCount";
import { getUserBookings } from "@/services/bookingService";
import { getUserReports } from "@/services/reportService";
import { formatCurrencyInr } from "@/services/pricingService";
import type { Booking, BookingStatus } from "@/types/booking";
import DashboardSkeleton from "@/components/common/DashboardSkeleton";
import ErrorState from "@/components/common/ErrorState";
import EmptyState from "@/components/common/EmptyState";

const IN_PROGRESS_STATUSES: BookingStatus[] = [
  "confirmed",
  "assigned",
  "on_the_way",
  "arrived",
  "sample_collected",
  "received_at_lab",
  "testing",
];

const STATUS_LABELS: Record<string, string> = {
  payment_pending: "Awaiting payment",
  confirmed: "Confirmed",
  assigned: "Collector assigned",
  on_the_way: "On the way",
  arrived: "Arrived",
  sample_collected: "Sample collected",
  received_at_lab: "Received at lab",
  testing: "Testing",
  report_ready: "Report ready",
  completed: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export default function DashboardPage() {
  // bookings/reports are keyed by the Supabase uuid, not the Firebase
  // user.uid — see src/supabase/identity.ts.
  const { profile, supabaseUserId } = useAuth();
  const { role } = useAdminRole();
  const bookings = useAsync(() => (supabaseUserId ? getUserBookings(supabaseUserId) : Promise.resolve([])), [supabaseUserId]);
  const reports = useAsync(() => (supabaseUserId ? getUserReports(supabaseUserId) : Promise.resolve([])), [supabaseUserId]);
  const unreadCount = useUnreadNotificationsCount();

  const stats = useMemo(() => {
    const b = bookings.data ?? [];
    return {
      upcoming: b.filter((x) => IN_PROGRESS_STATUSES.includes(x.bookingStatus)).length,
      completed: b.filter((x) => x.bookingStatus === "completed").length,
      reportsAvailable: (reports.data ?? []).filter((r) => r.status === "ready").length,
      pendingActions: b.filter((x) => x.bookingStatus === "payment_pending").length,
    };
  }, [bookings.data, reports.data]);

  const nextAppointment: Booking | undefined = useMemo(() => {
    const upcoming = (bookings.data ?? [])
      .filter((x) => IN_PROGRESS_STATUSES.includes(x.bookingStatus))
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming[0];
  }, [bookings.data]);

  const greetingName = profile?.name?.split(" ")[0] ?? "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (bookings.loading || reports.loading) return <DashboardSkeleton />;
  if (bookings.error) return <ErrorState message={bookings.error} onRetry={bookings.retry} />;
  if (reports.error) return <ErrorState message={reports.error} onRetry={reports.retry} />;

  return (
    <div className="mh2-dashboard">
      <div>
        <h1 className="mh2-dashboard__greeting-title">
          {greeting}, {greetingName}
        </h1>
        <p className="mh2-dashboard__greeting-sub">Here's what's happening with your health bookings.</p>
      </div>

      <div className="mh2-stat-grid">
        <div className="mh2-stat-card">
          <div className="mh2-stat-card__value">{stats.upcoming}</div>
          <p className="mh2-stat-card__label">Upcoming bookings</p>
        </div>
        <div className="mh2-stat-card">
          <div className="mh2-stat-card__value">{stats.completed}</div>
          <p className="mh2-stat-card__label">Completed tests</p>
        </div>
        <div className="mh2-stat-card">
          <div className="mh2-stat-card__value">{stats.reportsAvailable}</div>
          <p className="mh2-stat-card__label">Reports available</p>
        </div>
        <div className="mh2-stat-card">
          <div className="mh2-stat-card__value">{stats.pendingActions}</div>
          <p className="mh2-stat-card__label">Pending actions</p>
        </div>
      </div>

      <div className="mh2-quick-grid">
        <Link to="/tests" className="mh2-quick-action">
          <span className="mi" aria-hidden="true">science</span>
          Book a Test
        </Link>
        <Link to="/packages" className="mh2-quick-action">
          <span className="mi" aria-hidden="true">inventory_2</span>
          Book a Package
        </Link>
        <Link to="/bookings" className="mh2-quick-action">
          <span className="mi" aria-hidden="true">calendar_month</span>
          My Bookings
        </Link>
        <Link to="/reports" className="mh2-quick-action">
          <span className="mi" aria-hidden="true">description</span>
          My Reports
        </Link>
        {/* Staff only — driven by the role on the caller's Firestore
            authorization record, so a normal customer never sees it.
            Hiding it is a convenience; AdminProtectedRoute and
            firestore.rules are what actually deny access to /admin. */}
        {adminHomePathForRole(role) && (
          <Link to={adminHomePathForRole(role)!} className="mh2-quick-action is-accent">
            <span className="mi" aria-hidden="true">admin_panel_settings</span>
            {adminMenuLabelForRole(role)}
          </Link>
        )}
      </div>

      {unreadCount > 0 && (
        <Link to="/notifications" className="mh2-dashboard__notify-banner">
          <span className="mi" aria-hidden="true">notifications</span>
          You have {unreadCount} unread notification{unreadCount > 1 ? "s" : ""}
        </Link>
      )}

      <div>
        <h2 className="mh2-dashboard__section-title" style={{ marginBottom: "var(--space-sm)" }}>
          Upcoming appointment
        </h2>
        {!nextAppointment && (
          <EmptyState icon="event_available" title="No upcoming appointments" description="Book a test to see it here." />
        )}
        {nextAppointment && (
          <Link to={`/track/${nextAppointment.id}`} className="mh2-card" style={{ display: "block" }}>
            <p style={{ fontWeight: 700 }}>{nextAppointment.reference}</p>
            <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
              {nextAppointment.date} • {nextAppointment.collectionType === "home" ? "Home collection" : "Center visit"}
            </p>
            <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
              {STATUS_LABELS[nextAppointment.bookingStatus]}
            </p>
          </Link>
        )}
      </div>

      <div>
        <div className="mh2-dashboard__section-head">
          <h2 className="mh2-dashboard__section-title">Recent bookings</h2>
          <Link to="/bookings" className="text-soft" style={{ fontSize: "var(--text-sm)" }}>
            View all
          </Link>
        </div>
        {(bookings.data ?? []).length === 0 && <EmptyState icon="calendar_month" title="No bookings yet" />}
        {(bookings.data ?? []).length > 0 && (
          <div style={{ display: "grid", gap: "var(--space-sm)" }}>
            {(bookings.data ?? []).slice(0, 3).map((b) => (
              <Link key={b.id} to={`/bookings/${b.id}`} className="mh2-card" style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <p style={{ fontWeight: 700 }}>{b.reference}</p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{b.items.map((i) => i.name).join(", ")}</p>
                </div>
                <div style={{ textAlign: "right" }}>
                  <p style={{ fontWeight: 700 }}>{formatCurrencyInr(b.finalAmount)}</p>
                  <p className="text-soft" style={{ fontSize: "var(--text-sm)" }}>{STATUS_LABELS[b.bookingStatus]}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
