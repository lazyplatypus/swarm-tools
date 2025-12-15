# swarm-mail

```
                                _.------._
                               .'   .--.   '.        🐝
                              /   .'    '.   \    🐝
                             |   /   __   \   |      🐝
       🐝                    |  |   (  )   |  |  🐝
            🐝    _  _       |  |   |__|   |  |
                 ( \/ )       \  '.      .'  /    🐝
       🐝    ____/    \____    '.  '----'  .'
           /    \    /    \     '-._____.-'           🐝
          /  ()  \  /  ()  \
         |   /\   ||   /\   |     ███████╗██╗    ██╗ █████╗ ██████╗ ███╗   ███╗
         |  /__\  ||  /__\  |     ██╔════╝██║    ██║██╔══██╗██╔══██╗████╗ ████║
          \      /  \      /      ███████╗██║ █╗ ██║███████║██████╔╝██╔████╔██║
       🐝  '----'    '----'       ╚════██║██║███╗██║██╔══██║██╔══██╗██║╚██╔╝██║
                                  ███████║╚███╔███╔╝██║  ██║██║  ██║██║ ╚═╝ ██║
             🐝                   ╚══════╝ ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝
                    🐝
       🐝                         ███╗   ███╗ █████╗ ██╗██╗
                                  ████╗ ████║██╔══██╗██║██║         🐝
            🐝                    ██╔████╔██║███████║██║██║
                                  ██║╚██╔╝██║██╔══██║██║██║    🐝
       🐝        🐝               ██║ ╚═╝ ██║██║  ██║██║███████╗
                                  ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝╚══════╝       🐝
                 🐝
                             ⚡ Actor-Model Primitives for Agent Coordination ⚡
```

Event sourcing primitives for multi-agent coordination. Local-first, no external servers.

```
┌─────────────────────────────────────────────────────────────┐
│                     SWARM MAIL STACK                        │
├─────────────────────────────────────────────────────────────┤
│  TIER 3: COORDINATION                                       │
│  └── ask<Req, Res>() - Request/Response (RPC-style)        │
│                                                             │
│  TIER 2: PATTERNS                                           │
│  ├── DurableMailbox - Actor inbox with typed envelopes     │
│  └── DurableLock - CAS-based mutual exclusion              │
│                                                             │
│  TIER 1: PRIMITIVES                                         │
│  ├── DurableCursor - Checkpointed stream reader            │
│  └── DurableDeferred - Distributed promise                 │
│                                                             │
│  STORAGE                                                    │
│  └── PGLite (Embedded Postgres) + Migrations               │
└─────────────────────────────────────────────────────────────┘
```

## Install

```bash
bun add swarm-mail
```

## Usage

### Event Store

Append-only event log with automatic projection updates:

```typescript
import { getSwarmMail } from "swarm-mail";

// Create swarm mail instance (automatically creates PGlite adapter)
const swarmMail = await getSwarmMail("/my/project");

// Append events
await swarmMail.appendEvent({
  type: "agent_registered",
  agent_name: "WorkerA",
  task_description: "Implementing auth",
  timestamp: Date.now(),
});

// Query projections
const agents = await swarmMail.getAgents();
const messages = await swarmMail.getInbox("WorkerA", { limit: 5 });
```

### Durable Primitives (Effect-TS)

Built on Effect-TS for type-safe, composable coordination:

```typescript
import { DurableMailbox, DurableLock, ask } from 'swarm-mail'
import { Effect } from 'effect'

// Actor mailbox
const mailbox = DurableMailbox.create<MyMessage>('worker-a')
await Effect.runPromise(
  mailbox.send({ type: 'task', payload: 'do something' })
)

// File locking
const lock = DurableLock.create('src/auth.ts')
await Effect.runPromise(
  lock.acquire({ ttl: 60000 }).pipe(
    Effect.flatMap(() => /* do work */),
    Effect.ensuring(lock.release())
  )
)

// Request/response
const response = await Effect.runPromise(
  ask<Request, Response>('other-agent', { type: 'get-types' })
)
```

### Database Adapter

Dependency injection for testing and flexibility:

```typescript
import { DatabaseAdapter, createSwarmMailAdapter } from 'swarm-mail'

// Implement your own adapter
const customAdapter: DatabaseAdapter = {
  query: async (sql, params) => /* ... */,
  exec: async (sql) => /* ... */,
  transaction: async (fn) => /* ... */,
  close: async () => /* ... */
}

// Use custom adapter
const swarmMail = createSwarmMailAdapter(customAdapter, '/my/project')

// Or use the convenience layer (built-in PGLite)
import { getSwarmMail, createInMemorySwarmMail } from 'swarm-mail'
const swarmMail = await getSwarmMail('/my/project') // persistent
const swarmMail = await createInMemorySwarmMail() // in-memory
```

## Event Types

```typescript
type SwarmMailEvent =
  | { type: "agent_registered"; agent_name: string; task_description?: string }
  | {
      type: "message_sent";
      from: string;
      to: string[];
      subject: string;
      body: string;
    }
  | { type: "message_read"; message_id: number; agent_name: string }
  | {
      type: "file_reserved";
      agent_name: string;
      paths: string[];
      exclusive: boolean;
    }
  | { type: "file_released"; agent_name: string; paths: string[] }
  | {
      type: "swarm_checkpointed";
      epic_id: string;
      progress: number;
      state: object;
    }
  | { type: "decomposition_generated"; epic_id: string; subtasks: object[] }
  | {
      type: "subtask_outcome";
      bead_id: string;
      success: boolean;
      duration_ms: number;
    };
```

## Projections

Materialized views derived from events:

| Projection          | Description                        |
| ------------------- | ---------------------------------- |
| `agents`            | Active agents per project          |
| `messages`          | Agent inbox/outbox with recipients |
| `file_reservations` | Current file locks with TTL        |
| `swarm_contexts`    | Checkpoint state for recovery      |
| `eval_records`      | Outcome data for learning          |

## Architecture

- **Append-only log** - Events are immutable, projections are derived
- **Local-first** - PGLite embedded Postgres, no external servers
- **Effect-TS** - Type-safe, composable, testable
- **Exactly-once** - DurableCursor checkpoints position

## API Reference

### SwarmMailAdapter

```typescript
interface SwarmMailAdapter {
  // Events
  appendEvent(event: SwarmMailEvent): Promise<{ id: number; sequence: number }>;
  getEvents(options?: {
    limit?: number;
    after?: number;
  }): Promise<StoredEvent[]>;

  // Agents
  getAgents(): Promise<Agent[]>;
  getAgent(name: string): Promise<Agent | null>;

  // Messages
  getInbox(agent: string, options?: InboxOptions): Promise<Message[]>;
  getMessage(id: number): Promise<Message | null>;
  getThread(threadId: string): Promise<Message[]>;

  // Reservations
  getReservations(): Promise<Reservation[]>;
  getReservationsForAgent(agent: string): Promise<Reservation[]>;
  checkConflicts(paths: string[], excludeAgent?: string): Promise<Conflict[]>;

  // Swarm Context
  getSwarmContext(epicId: string): Promise<SwarmContext | null>;

  // Debug
  debugEvents(options?: DebugOptions): Promise<DebugEvent[]>;
  debugAgent(name: string): Promise<AgentDebugInfo>;
}
```

## License

MIT
