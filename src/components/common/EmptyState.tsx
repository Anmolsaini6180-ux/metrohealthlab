interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

export default function EmptyState({ icon = "inbox", title, description, action }: EmptyStateProps) {
  return (
    <div className="state-block">
      <span className="mi" style={{ fontSize: 32 }}>
        {icon}
      </span>
      <p style={{ fontWeight: 600, color: "var(--color-ink)" }}>{title}</p>
      {description && <p style={{ fontSize: "var(--text-sm)" }}>{description}</p>}
      {action && (
        <button className="btn btn-primary" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
