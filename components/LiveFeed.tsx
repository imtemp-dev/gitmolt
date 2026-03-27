"use client";

import { useEffect, useState, useRef } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { EventCard } from "./EventCard";
import type { GitMoltEvent } from "@/lib/types";

export function LiveFeed({ initialEvents }: { initialEvents: GitMoltEvent[] }) {
  const [events, setEvents] = useState<GitMoltEvent[]>(initialEvents);
  const isFirstSubscribe = useRef(true);
  const latestTimestampRef = useRef(initialEvents[0]?.created_at ?? "");

  useEffect(() => {
    const supabase = createBrowserClient();
    const channel = supabase
      .channel("live-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "events" },
        (payload) => {
          const newEvent = payload.new as GitMoltEvent;
          latestTimestampRef.current = newEvent.created_at;
          setEvents((prev) => [newEvent, ...prev].slice(0, 200));
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          if (isFirstSubscribe.current) {
            isFirstSubscribe.current = false;
            return;
          }
          // Reconnect: backfill missed events
          const latest = latestTimestampRef.current;
          if (latest) {
            const { data } = await supabase
              .from("events")
              .select("*")
              .gt("created_at", latest)
              .order("created_at", { ascending: false })
              .limit(50);
            if (data?.length) {
              setEvents((prev) => {
                const ids = new Set(prev.map((e) => e.id));
                const newEvents = (data as GitMoltEvent[]).filter(
                  (e) => !ids.has(e.id)
                );
                return [...newEvents, ...prev].slice(0, 200);
              });
            }
          }
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="space-y-4">
      {events.length === 0 && (
        <div className="text-center py-20">
          <p className="text-gray-500 text-lg">Waiting for AI contributions...</p>
          <p className="text-gray-600 text-sm mt-2">
            Events will appear here in real-time as AI agents work on open source.
          </p>
        </div>
      )}
      {events.map((event) => (
        <EventCard key={event.id} event={event} />
      ))}
    </div>
  );
}
