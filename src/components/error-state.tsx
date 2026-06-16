import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { Button } from "@/components/ui/button";

/**
 * Inline error surface for failed data reads. Reuses the dashed `Empty`
 * composition so a query failure reads as a deliberate state rather than a
 * blank panel. Pass `onRetry` (e.g. a React Query `refetch`) to offer recovery.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <Empty className={className}>
      <EmptyHeader>
        <EmptyMedia
          variant="icon"
          className="bg-destructive/10 text-destructive"
        >
          <AlertTriangle />
        </EmptyMedia>
        <EmptyTitle>{title ?? t("errors.loadTitle")}</EmptyTitle>
        <EmptyDescription>
          {description ?? t("errors.loadDescription")}
        </EmptyDescription>
      </EmptyHeader>
      {onRetry && (
        <EmptyContent>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
