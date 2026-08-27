import EmptyState from "@/components/common/EmptyState";

export default function NotFoundPage() {
  return (
    <EmptyState
      icon="search_off"
      title="Page not found"
      description="The page you're looking for doesn't exist or may have moved."
      action={{ label: "Go home", onClick: () => (window.location.href = "/") }}
    />
  );
}
