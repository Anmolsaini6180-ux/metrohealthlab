import { useAsync } from "@/hooks/useAsync";
import { getSiteContent } from "@/services/siteContentService";
import RichText from "@/components/common/RichText";
import LoadingState from "@/components/common/LoadingState";
import ErrorState from "@/components/common/ErrorState";
import Seo from "@/components/common/Seo";

export default function PrivacyPage() {
  const content = useAsync(() => getSiteContent("privacy"), []);
  const hasRealContent = !!content.data?.body?.trim();

  return (
    <article style={{ maxWidth: 720 }}>
      {/* noindex while the placeholder "being finalized" text is all
          there is to show — a genuinely empty legal page in search
          results helps no one and reads as thin content to Google. */}
      <Seo
        title={content.data?.title || "Privacy Policy"}
        description="Metro Health Lab's privacy policy — how we handle your personal and health information."
        path="/privacy"
        index={hasRealContent}
      />
      <h1 style={{ fontSize: "var(--text-2xl)", marginBottom: "var(--space-md)" }}>
        {content.data?.title || "Privacy policy"}
      </h1>
      {content.loading && <LoadingState rows={3} />}
      {content.error && <ErrorState message={content.error} onRetry={content.retry} />}
      {content.data && (
        content.data.body?.trim() ? (
          <RichText text={content.data.body} />
        ) : (
          <p className="text-soft">
            Our privacy policy is being finalized and will be published here shortly.
          </p>
        )
      )}
    </article>
  );
}
