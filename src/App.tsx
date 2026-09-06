import { Route, Routes } from "react-router-dom";
import MainLayout from "@/layouts/MainLayout";
import ProtectedRoute from "@/components/common/ProtectedRoute";

import HomePage from "@/pages/HomePage";
import TestsPage from "@/pages/TestsPage";
import TestDetailPage from "@/pages/TestDetailPage";
import PackagesPage from "@/pages/PackagesPage";
import PackageDetailPage from "@/pages/PackageDetailPage";
// LabsPage and RadiologyPage are deliberately unrouted below (disabled,
// not deleted) — the files and their route imports below stay so
// either can be turned back on by uncommenting.
// import LabsPage from "@/pages/LabsPage";
import HealthConcernsPage from "@/pages/HealthConcernsPage";
// import RadiologyPage from "@/pages/RadiologyPage";
import ArticlesPage from "@/pages/ArticlesPage";
import ArticleDetailPage from "@/pages/ArticleDetailPage";
import BookingFlowPage from "@/pages/BookingFlowPage";
import BookingsPage from "@/pages/BookingsPage";
import BookingDetailPage from "@/pages/BookingDetailPage";
import TrackBookingPage from "@/pages/TrackBookingPage";
import ReportsPage from "@/pages/ReportsPage";
import ProfilePage from "@/pages/ProfilePage";
import FamilyPage from "@/pages/FamilyPage";
import AddressesPage from "@/pages/AddressesPage";
import NotificationsPage from "@/pages/NotificationsPage";
import SupportPage from "@/pages/SupportPage";
import AboutPage from "@/pages/AboutPage";
import ContactPage from "@/pages/ContactPage";
import PrivacyPage from "@/pages/PrivacyPage";
import TermsPage from "@/pages/TermsPage";
import RefundPolicyPage from "@/pages/RefundPolicyPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import NotFoundPage from "@/pages/NotFoundPage";
import AdminProtectedRoute from "@/components/common/AdminProtectedRoute";
import AdminLayout from "@/layouts/AdminLayout";
import AdminLoginPage from "@/pages/admin/AdminLoginPage";
import AdminDashboardPage from "@/pages/admin/AdminDashboardPage";
import AdminBookingsPage from "@/pages/admin/AdminBookingsPage";
import AdminTestsPage from "@/pages/admin/AdminTestsPage";
import AdminCategoriesPage from "@/pages/admin/AdminCategoriesPage";
import AdminPackagesPage from "@/pages/admin/AdminPackagesPage";
import AdminLabsPage from "@/pages/admin/AdminLabsPage";
import AdminPricingPage from "@/pages/admin/AdminPricingPage";
import AdminOffersPage from "@/pages/admin/AdminOffersPage";
import AdminBannersPage from "@/pages/admin/AdminBannersPage";
import AdminCouponsPage from "@/pages/admin/AdminCouponsPage";
import AdminSlotsPage from "@/pages/admin/AdminSlotsPage";
import AdminServiceAreasPage from "@/pages/admin/AdminServiceAreasPage";
import AdminMarketingPage from "@/pages/admin/AdminMarketingPage";
import AdminCampaignsPage from "@/pages/admin/AdminCampaignsPage";
import AdminLeadsPage from "@/pages/admin/AdminLeadsPage";
import AdminSegmentsPage from "@/pages/admin/AdminSegmentsPage";
import AdminCustomersPage from "@/pages/admin/AdminCustomersPage";
import AdminReportsPage from "@/pages/admin/AdminReportsPage";
import AdminMediaPage from "@/pages/admin/AdminMediaPage";
import AdminPaymentsPage from "@/pages/admin/AdminPaymentsPage";
import AdminNotificationsPage from "@/pages/admin/AdminNotificationsPage";
import AdminSupportPage from "@/pages/admin/AdminSupportPage";
import AdminArticlesPage from "@/pages/admin/AdminArticlesPage";
import AdminContentPage from "@/pages/admin/AdminContentPage";
import AdminBrandingSettingsPage from "@/pages/admin/AdminBrandingSettingsPage";
import AdminTeamPage from "@/pages/admin/AdminTeamPage";
import AdminTeamPerformancePage from "@/pages/admin/AdminTeamPerformancePage";
import AdminFinancePage from "@/pages/admin/AdminFinancePage";
import AgentProtectedRoute from "@/components/common/AgentProtectedRoute";
import AgentDashboardPage from "@/pages/AgentDashboardPage";
import AdminAuditLogsPage from "@/pages/admin/AdminAuditLogsPage";
import ScrollToTop from "@/components/common/ScrollToTop";
import OffersPage from "@/pages/OffersPage";
import AdminBookingDashboardPage from "@/pages/admin/AdminBookingDashboardPage";

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/tests" element={<TestsPage />} />
        <Route path="/tests/:slug" element={<TestDetailPage />} />
        <Route path="/packages" element={<PackagesPage />} />
        <Route path="/packages/:slug" element={<PackageDetailPage />} />
        {/* <Route path="/labs" element={<LabsPage />} /> */}
        <Route path="/offers" element={<OffersPage />} />
        <Route path="/health-concerns" element={<HealthConcernsPage />} />
        {/* <Route path="/radiology" element={<RadiologyPage />} /> */}
        <Route path="/articles" element={<ArticlesPage />} />
        <Route path="/articles/:slug" element={<ArticleDetailPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/addresses"
          element={
            <ProtectedRoute>
              <AddressesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile/patients"
          element={
            <ProtectedRoute>
              <FamilyPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/book"
          element={
            <ProtectedRoute>
              <BookingFlowPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings"
          element={
            <ProtectedRoute>
              <BookingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bookings/:id"
          element={
            <ProtectedRoute>
              <BookingDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/track/:bookingId"
          element={
            <ProtectedRoute>
              <TrackBookingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <ProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/family"
          element={
            <ProtectedRoute>
              <FamilyPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/addresses"
          element={
            <ProtectedRoute>
              <AddressesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/support"
          element={
            <ProtectedRoute>
              <SupportPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Admin routes use their own AdminLayout — no customer header/
          footer/bottom-nav. React Router ranks these more specific
          paths above the customer tree's generic "*" catch-all
          regardless of declaration order, so there's no ambiguity. */}
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route
        path="/admin"
        element={
          <AdminProtectedRoute>
            <AdminLayout />
          </AdminProtectedRoute>
        }
      >
        <Route index element={<AdminDashboardPage />} />
        <Route path="bookings" element={<AdminBookingsPage />} />
        <Route path="bookings/dashboard" element={<AdminBookingDashboardPage />} />
        <Route path="tests" element={<AdminTestsPage />} />
        <Route path="categories" element={<AdminCategoriesPage />} />
        <Route path="packages" element={<AdminPackagesPage />} />
        <Route path="labs" element={<AdminLabsPage />} />
        <Route path="pricing" element={<AdminPricingPage />} />
        <Route path="marketing/offers" element={<AdminOffersPage />} />
        <Route path="marketing/banners" element={<AdminBannersPage />} />
        <Route path="marketing/coupons" element={<AdminCouponsPage />} />
        <Route path="slots" element={<AdminSlotsPage />} />
        <Route path="service-areas" element={<AdminServiceAreasPage />} />
        <Route path="marketing" element={<AdminMarketingPage />} />
        <Route path="marketing/campaigns" element={<AdminCampaignsPage />} />
        <Route path="marketing/leads" element={<AdminLeadsPage />} />
        <Route path="marketing/segments" element={<AdminSegmentsPage />} />
        <Route path="customers" element={<AdminCustomersPage />} />
        <Route path="reports" element={<AdminReportsPage />} />
        <Route path="payments" element={<AdminPaymentsPage />} />
        <Route path="notifications" element={<AdminNotificationsPage />} />
        <Route path="support" element={<AdminSupportPage />} />
        <Route path="content/articles" element={<AdminArticlesPage />} />
        <Route path="content/media" element={<AdminMediaPage />} />
        <Route path="content/pages" element={<AdminContentPage />} />
        <Route path="settings/branding" element={<AdminBrandingSettingsPage />} />
        <Route path="team" element={<AdminTeamPage />} />
        {/* Settings -> Admin & Staff. Same screen as /admin/team, which
            stays valid so existing links and bookmarks keep working. */}
        <Route path="settings/staff" element={<AdminTeamPage />} />
        <Route path="team/performance" element={<AdminTeamPerformancePage />} />
        <Route path="finance" element={<AdminFinancePage />} />
        <Route path="security/audit-logs" element={<AdminAuditLogsPage />} />
      </Route>

      <Route
        path="/agent"
        element={
          <AgentProtectedRoute>
            <AdminLayout />
          </AgentProtectedRoute>
        }
      >
        <Route index element={<AgentDashboardPage />} />
        </Route>
      </Routes>
    </>
  );
}
