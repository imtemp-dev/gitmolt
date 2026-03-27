export function log(
  level: "info" | "warn" | "error",
  message: string,
  data?: Record<string, unknown>
): void {
  const entry = JSON.stringify({
    time: new Date().toISOString(),
    level,
    message,
    ...data,
  });
  process.stderr.write(entry + "\n");
}
