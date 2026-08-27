import { Outlet } from "react-router-dom";
import Header from "@/components/layout/Header";
import BottomNav from "@/components/layout/BottomNav";
import Footer from "@/components/layout/Footer";
import { firebaseConfigured } from "@/firebase/config";
import FirebaseSetupNotice from "@/components/common/FirebaseSetupNotice";
import InstallAppPrompt from "@/components/common/InstallAppPrompt";

export default function MainLayout() {
  return (
    <div className="app-shell">
      <Header />
      <main className="app-main">
        <div className="container" style={{ paddingBlock: "var(--space-md)" }}>
          {firebaseConfigured ? <Outlet /> : <FirebaseSetupNotice />}
        </div>
      </main>
      {/* Footer sits outside <main> so its full-width background band
          renders edge-to-edge (its own inner .container keeps the text
          aligned with page content), and so app-main's bottom padding
          — which reserves room for the fixed mobile bottom nav — is
          applied below the footer rather than between content and
          footer, which previously left the footer sitting under the
          bottom nav on mobile. */}
      {firebaseConfigured && <Footer />}
      <InstallAppPrompt />
      <BottomNav />
    </div>
  );
}
