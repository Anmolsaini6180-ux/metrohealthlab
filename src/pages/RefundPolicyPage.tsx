import { useAsync } from "@/hooks/useAsync";
import { getSiteContent } from "@/services/siteContentService";
import RichText from "@/components/common/RichText";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";

export default function RefundPolicyPage() {
  const content = useAsync(() => getSiteContent("refund_policy"), []);

  return (
    <article style={{ maxWidth: 720 }}>
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>
        {content.data?.title || "Cancellation & refund policy"}
      </h1>
      {content.loading && <LoadingState rows={3} />}
      {content.error && <ErrorState message={content.error} onRetry={content.retry} />}
      {content.data && (
        content.data.body?.trim() ? (
          <RichText text={content.data.body} />
        ) : (
          <p className="text-soft">
            Our cancellation and refund policy is being finalized and will be published here shortly.
          </p>
        )
      )}
    </article>
  );
}
