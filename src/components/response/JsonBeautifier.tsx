import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "@/components/ui/button";
import { minifyJson, tryFormatJson } from "@/utils/requestBuilder";
import { Copy, Download, Minimize2, Sparkles } from "lucide-react";

interface JsonBeautifierProps {
  body: string;
}

export function JsonBeautifier({ body }: JsonBeautifierProps) {
  const [display, setDisplay] = useState(body);

  const handlePretty = () => setDisplay(tryFormatJson(body));
  const handleMinify = () => setDisplay(minifyJson(body));

  const handleCopy = async () => {
    await navigator.clipboard.writeText(display);
  };

  const handleDownload = async () => {
    const path = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: "response.json",
    });
    if (path) {
      await writeTextFile(path, display);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={handlePretty}>
        <Sparkles className="h-3 w-3" />
        Pretty
      </Button>
      <Button variant="ghost" size="sm" onClick={handleMinify}>
        <Minimize2 className="h-3 w-3" />
        Minify
      </Button>
      <Button variant="ghost" size="sm" onClick={handleCopy}>
        <Copy className="h-3 w-3" />
        Copy
      </Button>
      <Button variant="ghost" size="sm" onClick={handleDownload}>
        <Download className="h-3 w-3" />
        Download
      </Button>
    </div>
  );
}
