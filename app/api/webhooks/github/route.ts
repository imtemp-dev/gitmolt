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

  // Handle installation events — track which repos have GitMolt App
  if (eventName === "installation" || eventName === "installation_repositories") {
    const supabase = createServerClient();
    const repos = eventName === "installation"
      ? (payload.repositories ?? [])
      : (payload.repositories_added ?? []);

    for (const repo of repos) {
      const fullName = repo.full_name ?? "";
      const [owner, name] = fullName.split("/");
      if (owner && name) {
        await supabase.from("repos").upsert({
          owner, name, full_name: fullName,
          description: repo.description ?? null,
          installed_at: new Date().toISOString(),
          active: true,
        }, { onConflict: "full_name" });
      }
    }

    // Handle removed repos
    const removed = eventName === "installation_repositories"
      ? (payload.repositories_removed ?? [])
      : [];
    for (const repo of removed) {
      const fullName = repo.full_name ?? "";
      await supabase.from("repos").update({ active: false }).eq("full_name", fullName);
    }

    // Handle uninstall
    if (eventName === "installation" && payload.action === "deleted") {
      for (const repo of payload.repositories ?? []) {
        await supabase.from("repos").update({ active: false }).eq("full_name", repo.full_name ?? "");
      }
    }

    return new Response("OK", { status: 200 });
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
