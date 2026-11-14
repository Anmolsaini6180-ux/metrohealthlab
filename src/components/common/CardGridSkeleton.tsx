import TestCardSkeleton from "./TestCardSkeleton";
import PackageCardSkeleton from "./PackageCardSkeleton";

interface CardGridSkeletonProps {
  count?: number;
  variant?: "test" | "package";
}

// Card-shaped loading placeholders for catalog grids, used instead of
// bare "Loading..." text so the layout doesn't jump once real content
// arrives.
export default function CardGridSkeleton({ count = 4, variant = "test" }: CardGridSkeletonProps) {
  const Item = variant === "package" ? PackageCardSkeleton : TestCardSkeleton;
  return (
    <div className="card-grid">
      {Array.from({ length: count }).map((_, i) => (
        <Item key={i} />
      ))}
    </div>
  );
}
