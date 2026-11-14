import { useLocation } from "react-router-dom";
import EmptyState from "@/components/common/EmptyState";
import Seo from "@/components/common/Seo";

// This app's Vercel rewrite ("/(.*)" -> "/index.html", see vercel.json)
// means EVERY unmatched URL still gets a real HTTP 200 from the server
// — a classic SPA "soft 404": there is no edge function here to check
// whether a path is real before deciding the status code. The
// documented, honest mitigation for exactly this situation is a
// reliable noindex on the client-rendered result once React itself has
// determined the route doesn't exist, so Google's post-render indexing
// decision drops it even though the raw transport status was 200. This
// is a disclosed architecture limitation, not a claim that this page
// now returns a real 404 status.
export default function NotFoundPage() {
  const location = useLocation();
  return (
    <>
      <Seo
        title="Page Not Found"
        description="The page you're looking for doesn't exist or may have moved."
        path={location.pathname}
        index={false}
      />
      <EmptyState
        icon="search_off"
        title="Page not found"
        description="The page you're looking for doesn't exist or may have moved."
        action={{ label: "Go home", onClick: () => (window.location.href = "/") }}
      />
    </>
  );
}
