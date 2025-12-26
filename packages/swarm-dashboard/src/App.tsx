/**
 * Main App component - Swarm Dashboard
 * 
 * Architecture:
 * - WebSocket connection to localhost:4483/ws for real-time updates (4483 = HIVE on phone keypad)
 * - Uses partysocket for battle-tested reconnection logic
 * - AgentsPane and EventsPane derive state from WS events
 * - CellsPane polls REST API every 5s
 * - Layout provides responsive 3-column grid
 */

import { Layout } from "./components";
import { AgentsPane } from "./components/AgentsPane";
import { EventsPane } from "./components/EventsPane";
import { CellsPane } from "./components/CellsPane";
import { useSwarmSocket } from "./hooks";
import "./App.css";

const WS_URL = "ws://localhost:4483/ws";

/**
 * Swarm Dashboard - Real-time multi-agent coordination UI
 * 
 * Shows:
 * - Active agents with current tasks (WebSocket-driven)
 * - Live event stream with filtering (WebSocket-driven)
 * - Cell hierarchy tree with status (REST polling)
 */
function App() {
  const { state, events } = useSwarmSocket(WS_URL);

  return (
    <Layout>
      {/* AgentsPane - derives agent status from events */}
      <AgentsPane events={events} state={state} />
      
      {/* EventsPane - shows live event stream */}
      <EventsPane events={events} />
      
      {/* CellsPane - polls REST API for cell tree */}
      <CellsPane />
    </Layout>
  );
}

export default App;
