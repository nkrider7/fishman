import { useMemo } from "react";
import { prepareHtmlForPreview } from "@/utils/responseFormat";
import { cn } from "@/utils/cn";

interface HtmlResponsePreviewProps {
  html: string;
  className?: string;
}

/**
 * Renders HTML responses in a sandboxed iframe.
 * Scripts are disabled; external styles/images may load for faithful layout preview.
 */
export function HtmlResponsePreview({ html, className }: HtmlResponsePreviewProps) {
  const srcDoc = useMemo(() => prepareHtmlForPreview(html), [html]);

  if (!html.trim()) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center bg-muted/20 text-sm text-muted-foreground",
          className,
        )}
      >
        (empty body)
      </div>
    );
  }

  return (
    <iframe
      title="HTML response preview"
      sandbox="allow-same-origin allow-popups-to-escape-sandbox"
      srcDoc={srcDoc}
      className={cn("h-full w-full border-0 bg-white", className)}
    />
  );
}
