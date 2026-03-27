export interface ToolResponse {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export function ok(text: string): ToolResponse {
  return { content: [{ type: "text", text }] };
}

export function err(text: string): ToolResponse {
  return { content: [{ type: "text", text }], isError: true };
}
