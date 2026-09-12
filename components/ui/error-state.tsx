import { Button } from "./button";

export interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  description = "The page could not be loaded. Please try again.",
  onRetry,
}: ErrorStateProps) {
  return (
    <div role="alert" className="rounded-none border border-red-200 bg-red-50 p-6">
      <h2 className="font-semibold text-red-950">{title}</h2>
      <p className="mt-2 leading-6 text-red-800">{description}</p>
      {onRetry ? (
        <Button type="button" variant="secondary" size="sm" onClick={onRetry} className="mt-5">
          Try again
        </Button>
      ) : null}
    </div>
  );
}
