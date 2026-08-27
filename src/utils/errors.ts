// Normalizes Firestore/Functions errors into a message safe to show in
// the UI's ErrorState component. We deliberately do not fall back to
// mock data anywhere data fetching fails — callers should render an
// ErrorState with a Retry action instead.
export function toUserMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "Unable to load data. Please try again.";
}
