import { useAsync } from "@/hooks/useAsync";
import { getSiteContent } from "@/services/siteContentService";
import RichText from "@/components/common/RichText";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import Seo from "@/components/common/Seo";

export default function TermsPage() {
  const content = useAsync(() => getSiteContent("terms"), []);
  const hasRealContent = !!content.data?.body?.trim();

  return (
    <article style={{ maxWidth: 720 }}>
      <Seo
        title={content.data?.title || "Terms of Service"}
        description="Metro Health Lab's terms of service for booking diagnostic tests and health packages."
        path="/terms"
        index={hasRealContent}
      />
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>
        {content.data?.title || "Terms of service"}
      </h1>
      {content.loading && <LoadingState rows={3} />}
      {content.error && <ErrorState message={content.error} onRetry={content.retry} />}
      {content.data && (
        content.data.body?.trim() ? (
          <RichText text={content.data.body} />
        ) : (
          <p className="text-soft">
            Our terms of service are being finalized and will be published here shortly.
          </p>
        )
      )}
    </article>
  );
}
