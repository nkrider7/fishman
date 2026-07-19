import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { extractOperationNames } from "@/graphql";

interface GraphQLOperationSelectProps {
  query: string;
  operationName: string | null;
  onChange: (operationName: string | null) => void;
}

export function GraphQLOperationSelect({
  query,
  operationName,
  onChange,
}: GraphQLOperationSelectProps) {
  const names = extractOperationNames(query);
  const value = operationName?.trim() || "";

  if (names.length > 1) {
    return (
      <div className="flex min-w-[180px] flex-1 flex-col gap-1">
        <Label htmlFor="graphql-operation" className="text-[11px] text-muted-foreground">
          Operation
        </Label>
        <Select
          value={value || names[0]}
          onValueChange={(v) => onChange(v || null)}
        >
          <SelectTrigger id="graphql-operation" className="h-8">
            <SelectValue placeholder="Select operation" />
          </SelectTrigger>
          <SelectContent>
            {names.map((name) => (
              <SelectItem key={name} value={name}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className="flex min-w-[180px] flex-1 flex-col gap-1">
      <Label htmlFor="graphql-operation" className="text-[11px] text-muted-foreground">
        Operation name
      </Label>
      <Input
        id="graphql-operation"
        className="h-8"
        placeholder={names[0] ?? "Optional"}
        value={value}
        onChange={(e) => onChange(e.target.value.trim() ? e.target.value : null)}
      />
    </div>
  );
}
