---
"swarm-mail": minor
---

## 📊 Analytics Queries: Four Golden Signals for Swarms

> "Without data, you're just another person with an opinion." — W. Edwards Deming

Five pre-built analytics queries based on Google's SRE Four Golden Signals:

### The Queries

1. **Latency** - Task duration by strategy (avg/P95 completion times)
2. **Traffic** - Events per hour (time-series with bucketing)
3. **Errors** - Failed tasks by agent (failure tracking)
4. **Saturation** - Active reservations (resource usage)
5. **Conflicts** - Most contested files (hotspot detection)

### Usage

```typescript
import { runAnalyticsQuery, ANALYTICS_QUERIES } from 'swarm-mail'

// List available queries
ANALYTICS_QUERIES.forEach(q => console.log(q.name, q.description))

// Run a query
const result = await runAnalyticsQuery(db, 'latency', {
  since: new Date(Date.now() - 24 * 60 * 60 * 1000), // last 24h
  format: 'table' // or 'json', 'csv'
})
```

### Why This Matters

Event sourcing gives us the data. These queries give us the answers:
- Which decomposition strategies are fastest?
- Which agents fail most often?
- Which files cause the most contention?
- How busy is the swarm right now?

All queries use parameterized SQL (security) and support time filtering.
