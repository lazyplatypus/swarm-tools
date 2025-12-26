/**
 * WebSocket hook for real-time event streaming
 * 
 * Simple native WebSocket with manual reconnection.
 * If this works, we can add partysocket back later.
 */

import { useEffect, useRef, useState } from "react";
import type { AgentEvent } from "../lib/types";

export type WebSocketState = 
  | "connecting" 
  | "connected" 
  | "reconnecting" 
  | "disconnected" 
  | "error";

export interface UseSwarmSocketOptions {
  /** Called when events are received */
  onEvents?: (events: AgentEvent[]) => void;
}

/**
 * Hook for connecting to the swarm dashboard WebSocket
 * 
 * Handles React StrictMode double-mount by using refs for mutable state
 * and deduplicating events by ID.
 */
export function useSwarmSocket(url: string, options: UseSwarmSocketOptions = {}) {
  const [state, setState] = useState<WebSocketState>("connecting");
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [retryCount, setRetryCount] = useState(0);
  
  // Refs for mutable state that persists across StrictMode remounts
  const wsRef = useRef<WebSocket | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  
  // Store callback in ref
  const onEventsRef = useRef(options.onEvents);
  onEventsRef.current = options.onEvents;

  useEffect(() => {
    // Reset unmounted flag on mount
    unmountedRef.current = false;
    
    const connect = () => {
      if (unmountedRef.current) return;
      
      // Close existing connection if any (handles StrictMode remount)
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log("[WS] Closing existing connection before reconnect");
        wsRef.current.close(1000, "Reconnecting");
      }
      
      console.log("[WS] Connecting to:", url);
      setState("connecting");
      
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) return;
        console.log("[WS] OPEN - connected");
        setState("connected");
        setRetryCount(0);
        // DON'T clear events - deduplication handles duplicates
        // This fixes React StrictMode double-mount losing events
        
        // Subscribe from offset 0 to get all events
        console.log("[WS] Sending subscribe...");
        ws.send(JSON.stringify({ type: "subscribe", offset: 0 }));
      };

      ws.onclose = (event) => {
        if (unmountedRef.current) return;
        console.log("[WS] CLOSE:", event.code, event.reason);
        
        if (event.code === 1000) {
          setState("disconnected");
        } else {
          setState("reconnecting");
          setRetryCount((c) => c + 1);
          
          // Reconnect after delay
          retryTimeoutRef.current = setTimeout(() => {
            if (!unmountedRef.current) connect();
          }, 2000);
        }
      };

      ws.onerror = (event) => {
        if (unmountedRef.current) return;
        console.error("[WS] ERROR:", event);
        setState("error");
      };

      ws.onmessage = (event) => {
        if (unmountedRef.current) return;
        
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === "connected") {
            console.log("[WS] Server confirmed connection");
            return;
          }
          
          if (data.type === "heartbeat" || data.type === "pong") {
            return;
          }
          
          if (data.type === "event" && data.data) {
            const agentEvent = JSON.parse(data.data) as AgentEvent;
            // Deduplicate by id - only add if not already present
            setEvents((prev) => {
              if (prev.some((e) => e.id === agentEvent.id)) {
                return prev; // Already have this event
              }
              // Log first few events, then throttle
              if (prev.length < 10) {
                console.log("[WS] Event:", agentEvent.type, agentEvent.agent_name || "");
              } else if (prev.length === 10) {
                console.log("[WS] ... (throttling event logs)");
              }
              return [...prev, agentEvent];
            });
            onEventsRef.current?.([agentEvent]);
          }
        } catch (err) {
          console.error("[WS] Parse error:", err);
        }
      };
    };

    connect();

    return () => {
      console.log("[WS] Cleanup - setting unmounted");
      unmountedRef.current = true;
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close(1000, "Component unmount");
      }
    };
  }, [url]);

  return {
    state,
    events,
    retryCount,
  };
}

// Re-export for backwards compatibility
export { useSwarmSocket as useWebSocket };
