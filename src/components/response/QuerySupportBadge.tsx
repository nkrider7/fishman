import { Button } from "@/components/ui/button";
import {
  querySupportLabel,
  shouldOfferQueryFallback,
  type QueryFallbackMethod,
  type QueryHostCapability,
  type QuerySupportStatus,
} from "@/http-methods";
import type { ApiResponse } from "@/types/response";
import { cn } from "@/utils/cn";

interface QuerySupportBadgeProps {
  method: string;
  response: ApiResponse;
  capability: QueryHostCapability | null;
  onRetryAs?: (fallback: QueryFallbackMethod) => void;
}

function resolveStatus(
  method: string,
  response: ApiResponse,
  capability: QueryHostCapability | null,
): QuerySupportStatus {
  if (capability?.status && capability.status !== "unknown") {
    return capability.status;
  }
  if (
    method.toUpperCase() === "QUERY" &&
    (response.status === 405 || response.status === 501)
  ) {
    return "rejected";
  }
  return capability?.status ?? "unknown";
}

export function QuerySupportBadge({
  method,
  response,
  capability,
  onRetryAs,
}: QuerySupportBadgeProps) {
  if (method.toUpperCase() !== "QUERY" && !capability) return null;

  const status = resolveStatus(method, response, capability);
  const offerFallback = shouldOfferQueryFallback(method, response);

  if (method.toUpperCase() !== "QUERY" && status === "unknown") return null;

  const tone =
    status === "supported"
      ? "text-emerald-500"
      : status === "rejected"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {(method.toUpperCase() === "QUERY" || status !== "unknown") && (
        <>
          <span className="text-[10px] text-border select-none" aria-hidden>
            ·
          </span>
          <span className={cn("text-[11px]", tone)}>
            {querySupportLabel(status)}
          </span>
        </>
      )}
      {offerFallback && onRetryAs && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-1.5 text-[10px]"
            title="Retry as POST"
            onClick={() => onRetryAs("POST")}
          >
            → POST
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-1.5 text-[10px]"
            title="Retry as GET (body dropped)"
            onClick={() => onRetryAs("GET")}
          >
            → GET
          </Button>
        </>
      )}
    </div>
  );
}
