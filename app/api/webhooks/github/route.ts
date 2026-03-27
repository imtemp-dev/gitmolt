import { verifySignature, extractEvent } from "@/lib/webhook";
import { getServerConfig } from "@/lib/config";
import { createServerClient } from "@/lib/supabase/server";

export async function POST(request: Request): Promise<Response> {
  const config = getServerConfig();
  const body = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(body, signature, config.githubWebhookSecret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(body);
  } catch {
    return new Response("Invalid payload", { status: 400 });
  }

  const eventName = request.headers.get("x-github-event") ?? "";
  const deliveryId = request.headers.get("x-github-delivery");
  if (!deliveryId) {
    return new Response("Missing delivery ID", { status: 400 });
  }

  const event = extractEvent(eventName, payload, deliveryId);
  if (!event) return new Response("Ignored", { status: 200 });

  const supabase = createServerClient();
  const { error } = await supabase.from("events").insert(event);
  if (error && error.code !== "23505") {
    console.error("Supabase insert error:", error);
    return new Response("Failed to store event", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}
