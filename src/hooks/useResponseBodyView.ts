import { useEffect, useMemo, useState } from "react";
import {
  detectResponseFormat,
  resolveResponseFormat,
  type ResponseFormat,
} from "@/utils/responseFormat";
import { isJsonContent } from "@/utils/requestBuilder";

export function useResponseBodyView(body: string, headers: Record<string, string>) {
  const detectedFormat = useMemo(
    () => detectResponseFormat(headers, body),
    [headers, body],
  );

  const [format, setFormat] = useState<ResponseFormat>("auto");
  const [previewEnabled, setPreviewEnabled] = useState(false);
  const [jsonViewMode, setJsonViewMode] = useState<"code" | "tree">("code");
  const [bodyRevision, setBodyRevision] = useState(0);

  useEffect(() => {
    setFormat("auto");
    setPreviewEnabled(detectedFormat === "html");
    setJsonViewMode("code");
    setBodyRevision((value) => value + 1);
  }, [body, detectedFormat]);

  const effectiveFormat = resolveResponseFormat(format, headers, body);
  const isHtml = effectiveFormat === "html";
  const isJson = effectiveFormat === "json";
  const showPreview = isHtml && previewEnabled;

  const handleFormatChange = (next: ResponseFormat) => {
    setFormat(next);
    const resolved =
      next === "auto" ? detectResponseFormat(headers, body) : next;
    setPreviewEnabled(resolved === "html");
  };

  return {
    format,
    previewEnabled,
    jsonViewMode,
    bodyRevision,
    effectiveFormat,
    isHtml,
    isJson,
    showPreview,
    isJsonBody: isJsonContent(body),
    setPreviewEnabled,
    setJsonViewMode,
    handleFormatChange,
  };
}

export type ResponseBodyViewState = ReturnType<typeof useResponseBodyView>;
