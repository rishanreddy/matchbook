# Offline Scouting Manager - Modernization Plan
## Rewrite Strategy Document

**Timeline:** 1-2 months before competition  
**Branch:** `rewrite-modernization`  
**Inspiration:** Lovat.app's polished UX and workflow patterns

---

## Executive Summary

Transform the Flask-based scouting app into a modern, production-ready offline-first application with:
- **React + Electron** desktop app with PWA capabilities for mobile web access
- **SQLite database** for robust data management while maintaining offline-first design
- **Extremely simple sync** via QR codes, CSV export/import, and optional local network (when available)
- **Lovat-inspired UI** with clean design, intuitive workflows, and smart features
- **Pre-loaded match schedules** from The Blue Alliance API with intelligent scout assignment
- **Advanced analytics** focusing on data not available from existing APIs (TBA/Statbotics)

### Core Philosophy: Keep What Works, Fix What Doesn't
- ✅ **Keep:** Offline-first workflow, flexible form builder, device-based identity, USB/CSV export
- ✅ **Improve:** UI/UX, data model robustness, sync simplicity, scout assignment clarity, analytics depth
- ✅ **Add:** QR code sync, smart assignment, better analytics, modern design system

---

## Database Architecture Decision

### Options Evaluated

We evaluated 7 offline-first database solutions for this project:

| Solution | ORM Support | Offline-First | Sync | Electron Fit | Complexity | Recommendation |
|----------|-------------|---------------|------|--------------|------------|----------------|
| **SQLite + Drizzle** | ✅ Excellent | ✅ Native | Custom | ✅ Perfect | Medium | **✅ CHOSEN** |
| **RxDB** | ⚠️ Partial | ✅ Strong | Built-in | ✅ Good | High | ⭐ Runner-up |
| **ElectricSQL** | ❌ No | ✅ Strong | Backend-dependent | ⚠️ OK | High | ❌ Too complex |
| **PowerSync** | ❌ No | ✅ Strong | Backend service | ⚠️ Beta | High | ❌ Too heavy |
| **PouchDB** | ❌ Weak | ✅ Strong | Built-in | ✅ Good | Medium | ❌ Aging |
| **WatermelonDB** | ⚠️ ORM-like | ✅ Strong | BYO | ❌ Mobile-focused | High | ❌ Wrong fit |
| **Dexie.js** | ⚠️ Typed API | ✅ Browser-strong | Dexie Cloud | ⚠️ IndexedDB | Medium | ❌ Wrong storage |

### Why SQLite + Drizzle ORM (Primary Choice)

**✅ Pros:**
1. **True Type Safety** - Drizzle provides full TypeScript ORM with autocomplete, compile-time type checking
2. **Electron-Native** - SQLite via better-sqlite3 is perfect for Node.js, no browser constraints
3. **Battle-Tested** - SQLite is the most deployed database in the world, proven reliability
4. **Easy Backup** - Copy .sqlite file to USB, open in DB Browser, export to CSV
5. **Full Control** - Design sync protocol exactly for FRC needs (QR/CSV/network)
6. **Zero Runtime Overhead** - Drizzle is compile-time only, tiny bundle
7. **Competition-Ready** - Most predictable behavior, lowest hidden risk
8. **Fast Development** - Straightforward schema, queries, migrations
9. **Rich Querying** - Full SQL power for complex analytics aggregations
10. **Proven in Electron** - VS Code, Obsidian, many apps use SQLite

**⚠️ Cons:**
1. **Sync is DIY** - Must implement sync protocol (but we get exactly what we need)
2. **Conflict resolution** - Must design strategy (event-sourcing solves this elegantly)

**For Your Use Case:** ✅ Best fit
- 1-2 month timeline? SQLite + Drizzle is fastest reliable path.
- Unreliable network? SQLite works 100% offline with zero dependencies.
- 6 Windows laptops? Simple file copy backup, easy troubleshooting.
- Need CSV export? Trivial with Drizzle queries.

### Why RxDB (Alternative Choice)

**✅ Pros:**
1. **Built-in replication** - Don't write sync code, use prebuilt replication
2. **Conflict resolution** - First-class conflict handlers out of the box
3. **Reactive** - Automatic UI updates when data changes (great for React)
4. **Multiple topologies** - P2P, hub-and-spoke, CouchDB, custom backends
5. **Explicit Electron docs** - Good guidance for desktop apps
6. **Active development** - Modern, well-maintained project

**⚠️ Cons:**
1. **Not SQL** - Document-based NoSQL, less familiar querying
2. **Steeper learning curve** - More concepts to learn (RxDB + RxJS)
3. **Storage adapter licensing** - Best Electron adapters may require premium license
4. **Still need CSV/QR** - Would implement fallback sync anyway
5. **Heavier runtime** - Larger bundle size, more dependencies

**For Your Use Case:** ⭐ Runner-up
- If you want replication "for free" and can invest in learning curve
- Still good choice, but SQLite + Drizzle is more straightforward for competition deadline

### Why NOT ElectricSQL

**Why it's compelling:**
- Very modern local-first architecture
- Strong community momentum
- Excellent docs

**Why it doesn't fit:**
- Designed for read-heavy sync, write-path is BYO
- Requires Postgres backend + Electric service
- Too much infrastructure for 6 laptops at a competition
- Better for SaaS apps with central DB, not peer-to-peer scouts

### Why NOT PowerSync

**Why it's compelling:**
- Purpose-built for offline sync
- Good conflict docs

**Why it doesn't fit:**
- Requires backend service to be running
- Node SDK is beta (too risky for production)
- Overkill for event-level scouting (not season-long platform)

### Why NOT PouchDB

**Why it's compelling:**
- Battle-tested CouchDB replication protocol
- Works offline very well

**Why it doesn't fit:**
- ORM/type-safety story is weak (old JavaScript patterns)
- Community energy lower than modern alternatives
- Would spend time wrapping it in type-safe abstractions anyway
- If we want built-in sync, RxDB is better modern choice

### Why NOT WatermelonDB

**Why it's compelling:**
- Strong local DB model
- Good performance

**Why it doesn't fit:**
- React Native/mobile-first, Electron not first-class
- Sync docs explicitly list limitations
- More work to adapt to desktop than starting with Electron-native solution

### Why NOT Dexie.js

**Why it's compelling:**
- Great IndexedDB developer experience
- Excellent TypeScript support

**Why it doesn't fit:**
- IndexedDB is browser/renderer process storage (not main process SQLite file)
- Backup/export workflow more complex than copying .sqlite file
- Dexie Cloud is proprietary (self-host sync is more work)
- Better fit for PWAs than Electron desktop apps

---

## Architecture Overview

### Tech Stack

#### Frontend
- **Framework:** React 18+ with TypeScript
- **Desktop Runtime:** Electron (cross-platform, proven, great offline support)
- **PWA Support:** Progressive Web App manifest for mobile browser access
- **UI Library:** Mantine UI v7 (unique design, excellent DX, comprehensive components, built-in dark mode)
- **Design System:** Custom theme on top of Mantine for distinctive personality
- **Form Engine:** SurveyJS (keep existing - it's excellent, proven, and flexible)
- **Charts:** Recharts (modern, composable, great TypeScript support) + Chart.js for compatibility
- **State Management:** Zustand (lightweight, simple)
- **QR Code:** qrcode.react (generation) + html5-qrcode (scanning with webcam)
- **Data Sync:** PouchDB for conflict-free replication (CouchDB protocol, offline-first)

#### Backend/Storage
- **Primary Recommendation: SQLite + Drizzle ORM + Custom Sync**
  - **Database:** better-sqlite3 (one SQLite file per device, native Node.js)
  - **ORM:** Drizzle ORM (type-safe TypeScript, excellent DX, zero-runtime overhead)
  - **Sync Strategy:** Custom hub-and-spoke + QR + CSV fallback (full control, maximum reliability)
  - **Why:** Best for competition environment, predictable delivery, easy backup/export
  
- **Alternative: RxDB (if you want built-in replication)**
  - **Database:** RxDB with SQLite adapter for Electron
  - **Query:** RxDB's typed collections (not SQL, but excellent TypeScript support)
  - **Sync:** Built-in replication engine with conflict resolution
  - **Why:** Proven local-first DB, but adds complexity and licensing considerations
  
- **Not Recommended:** ElectricSQL, PowerSync (too much backend infra for timeline), PouchDB (aging ecosystem, weak ORM), WatermelonDB (mobile-focused)
  
- **API Layer:** Electron IPC for desktop, optional Express for PWA mode
- **External APIs:** The Blue Alliance (TBA) v3 API, Statbotics API (read-only, pre-fetch)

#### Build & Deployment
- **Package Manager:** pnpm (fast, efficient)
- **Build Tool:** Vite (lightning-fast dev experience)
- **Desktop Packager:** Electron Builder (creates .exe, .dmg, .AppImage)
- **Code Quality:** ESLint, Prettier, TypeScript strict mode
- **Testing:** Vitest (unit), Playwright (E2E)

### Directory Structure

```
offline-scouting-manager/
├── electron/                    # Electron main process
│   ├── main.ts                  # App entrypoint
│   ├── preload.ts               # Secure IPC bridge
│   └── database/                # SQLite setup & migrations
├── src/                         # React app (renderer process)
│   ├── main.tsx                 # React entrypoint
│   ├── App.tsx                  # Root component
│   ├── routes/                  # React Router pages
│   │   ├── scout/               # Scouting interface
│   │   ├── analysis/            # Analysis dashboard
│   │   ├── settings/            # Configuration
│   │   └── setup/               # First-run wizard
│   ├── components/              # Reusable UI components
│   │   ├── ui/                  # shadcn/ui components
│   │   ├── charts/              # Chart components
│   │   ├── forms/               # Form components
│   │   └── sync/                # QR/sync UI
│   ├── lib/                     # Core libraries
│   │   ├── db/                  # Database client & queries
│   │   ├── sync/                # Sync protocol (QR, CSV, network)
│   │   ├── analytics/           # Analysis calculations
│   │   ├── apis/                # TBA/Statbotics clients
│   │   └── utils/               # Helpers
│   ├── stores/                  # Zustand state stores
│   └── assets/                  # Static assets
├── migrations/                  # Database migrations
├── docs/                        # Documentation
└── scripts/                     # Build/setup scripts
```

---

## Data Model (SQLite + Drizzle ORM Schema)

### Why This Approach?

**Event Sourcing for Conflict Avoidance:**
- Store append-only events instead of mutable rows
- Each scout action is an immutable event with UUID
- Derived views compute current state from event log
- Sync becomes "merge event logs" not "resolve conflicts"
- Dramatically reduces hard conflicts at competitions

**Type-Safe TypeScript Queries:**
```typescript
// Example Drizzle query with full TypeScript autocomplete
const teamStats = await db
  .select({
    teamNumber: scoutingEvents.teamNumber,
    avgAutoScore: sql<number>`AVG(${scoutingEvents.autoScore})`,
    matchCount: sql<number>`COUNT(*)`,
  })
  .from(scoutingEvents)
  .where(eq(scoutingEvents.eventId, '2025casd'))
  .groupBy(scoutingEvents.teamNumber);
```

### Drizzle Schema Definitions

#### `events` Table
```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const events = sqliteTable('events', {
  id: text('id').primaryKey(),              // "2025casd"
  name: text('name').notNull(),             // "San Diego Regional"
  season: integer('season').notNull(),      // 2025
  startDate: text('start_date'),            // ISO date
  endDate: text('end_date'),
  syncedAt: text('synced_at'),              // Last TBA sync
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
```

#### `devices` Table
```typescript
export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),              // Hardware-derived stable ID
  name: text('name').notNull(),             // "Scout Laptop 3"
  isPrimary: integer('is_primary', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text('last_seen_at'),
});
```

#### `scouts` Table
```typescript
export const scouts = sqliteTable('scouts', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  deviceId: text('device_id').references(() => devices.id),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
```

#### `matches` Table
```typescript
export const matches = sqliteTable('matches', {
  key: text('key').primaryKey(),            // "2025casd_qm1"
  eventId: text('event_id').notNull().references(() => events.id),
  compLevel: text('comp_level'),            // "qm", "sf", "f"
  setNumber: integer('set_number'),
  matchNumber: integer('match_number').notNull(),
  predictedTime: text('predicted_time'),    // ISO timestamp
  // Alliance data stored as JSON for flexibility
  redAlliance: text('red_alliance', { mode: 'json' }).$type<string[]>(),  // ["254", "1678", "1323"]
  blueAlliance: text('blue_alliance', { mode: 'json' }).$type<string[]>(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
```

#### `assignments` Table
```typescript
export const assignments = sqliteTable('assignments', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  matchKey: text('match_key').notNull().references(() => matches.key),
  position: text('position').notNull(),     // "red_1", "red_2", "blue_3"
  teamNumber: text('team_number').notNull(),
  scoutId: integer('scout_id').references(() => scouts.id),
  deviceId: text('device_id').references(() => devices.id),
  status: text('status').default('pending'), // "pending", "scouting", "completed"
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  // Unique constraint: one assignment per match position
  uniqMatchPosition: unique('uniq_match_position').on(table.matchKey, table.position),
}));
```

#### `formSchemas` Table
```typescript
export const formSchemas = sqliteTable('form_schemas', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull().references(() => events.id),
  version: integer('version').notNull(),
  schema: text('schema', { mode: 'json' }).$type<SurveyJSON>(), // SurveyJS schema
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});
```

#### `scoutingEvents` Table (Event-Sourced!)
**Core observation data - append-only event log**

```typescript
export const scoutingEvents = sqliteTable('scouting_events', {
  // Event identity (immutable)
  id: text('id').primaryKey(),              // UUID v4
  originDeviceId: text('origin_device_id').notNull(), // Device that created event (never changes)
  
  // Match context
  matchKey: text('match_key').notNull().references(() => matches.key),
  teamNumber: text('team_number').notNull(),
  position: text('position').notNull(),     // "red_1", etc.
  
  // Scout tracking
  scoutId: integer('scout_id').references(() => scouts.id),
  deviceId: text('device_id').notNull().references(() => devices.id), // Current device
  
  // Timestamps (immutable)
  eventTimestamp: text('event_timestamp').notNull(), // When scout observed this
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`), // When inserted locally
  
  // Form data
  schemaVersion: integer('schema_version').notNull(),
  autoScore: real('auto_score'),            // Required system field
  teleopScore: real('teleop_score'),        // Required system field
  endgameScore: real('endgame_score'),      // Required system field
  
  // All SurveyJS responses as JSON
  formData: text('form_data', { mode: 'json' }).$type<Record<string, any>>(),
  
  // Special flags
  isNoShow: integer('is_no_show', { mode: 'boolean' }).default(false),
  isBrokenRobot: integer('is_broken_robot', { mode: 'boolean' }).default(false),
  
  // Sync metadata
  syncHash: text('sync_hash').notNull().unique(), // SHA256 for deduplication
}, (table) => ({
  // Indexes for common queries
  idxMatchTeam: index('idx_match_team').on(table.matchKey, table.teamNumber),
  idxTeamNumber: index('idx_team_number').on(table.teamNumber),
  idxOriginDevice: index('idx_origin_device').on(table.originDeviceId),
}));
```

**Sync Hash Calculation:**
```typescript
import crypto from 'crypto';

function calculateSyncHash(event: {
  originDeviceId: string;
  matchKey: string;
  teamNumber: string;
  position: string;
  eventTimestamp: string;
}): string {
  const data = JSON.stringify({
    originDeviceId: event.originDeviceId,
    matchKey: event.matchKey,
    teamNumber: event.teamNumber,
    position: event.position,
    eventTimestamp: event.eventTimestamp,
  });
  return crypto.createHash('sha256').update(data).digest('hex');
}
```

This ensures the same observation from the same device is never duplicated, even if synced multiple times via different paths (QR → CSV → network).

#### `syncLog` Table
```typescript
export const syncLog = sqliteTable('sync_log', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').default(sql`CURRENT_TIMESTAMP`),
  method: text('method').notNull(),         // "qr_import", "csv_import", "network_sync", "hub_sync"
  direction: text('direction').notNull(),   // "import", "export", "bidirectional"
  deviceId: text('device_id').references(() => devices.id),
  recordsCount: integer('records_count'),
  status: text('status'),                   // "success", "partial", "failed"
  notes: text('notes'),
});
```

#### `analysisCache` Table
```typescript
export const analysisCache = sqliteTable('analysis_cache', {
  id: integer('id', { mode: 'number' }).primaryKey({ autoIncrement: true }),
  eventId: text('event_id').notNull().references(() => events.id),
  teamNumber: text('team_number').notNull(),
  cacheKey: text('cache_key').notNull(),    // "avg_auto_score", "consistency_rating"
  value: text('value', { mode: 'json' }).$type<any>(),
  computedAt: text('computed_at').default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  uniqCache: unique('uniq_cache').on(table.eventId, table.teamNumber, table.cacheKey),
}));
```

### Derived Views (Computed from Events)

#### `currentScoutingData` View
Materializes latest "current state" from event log:

```typescript
// Drizzle doesn't have view support yet, so we create this as a SQL view manually
// Then query it like a table

const createCurrentScoutingDataView = `
CREATE VIEW IF NOT EXISTS current_scouting_data AS
SELECT 
  se.*,
  m.match_number,
  m.comp_level,
  s.name as scout_name
FROM scouting_events se
JOIN matches m ON se.match_key = m.key
LEFT JOIN scouts s ON se.scout_id = s.id
ORDER BY se.created_at DESC;
`;
```

Query it in TypeScript:
```typescript
const currentData = await db.execute(sql`SELECT * FROM current_scouting_data`);
```

### Sync Protocol Design

**Sync Packet Format (for QR/Network transfer):**
```typescript
interface SyncPacket {
  version: number;               // Protocol version (e.g., 1)
  sourceDevice: string;          // Device exporting data
  timestamp: string;             // Export timestamp
  events: Array<{                // Only send scouting events
    id: string;
    originDeviceId: string;
    matchKey: string;
    teamNumber: string;
    position: string;
    eventTimestamp: string;
    schemaVersion: number;
    autoScore: number | null;
    teleopScore: number | null;
    endgameScore: number | null;
    formData: Record<string, any>;
    syncHash: string;
    // ... other fields
  }>;
}
```

**Import Logic (Idempotent):**
```typescript
async function importSyncPacket(packet: SyncPacket) {
  // Drizzle insert with onConflictDoNothing (uses UNIQUE sync_hash)
  const result = await db
    .insert(scoutingEvents)
    .values(packet.events)
    .onConflictDoNothing()  // Ignore duplicates based on sync_hash
    .execute();
  
  // Log sync operation
  await db.insert(syncLog).values({
    method: packet.method || 'unknown',
    direction: 'import',
    deviceId: packet.sourceDevice,
    recordsCount: result.rowsAffected || 0,
    status: 'success',
    notes: `Imported ${result.rowsAffected} new events`,
  });
  
  // Invalidate analysis cache
  await db.delete(analysisCache).execute();
}
```

**Export Logic:**
```typescript
async function exportSyncPacket(sinceTimestamp?: string): Promise<SyncPacket> {
  const events = await db
    .select()
    .from(scoutingEvents)
    .where(sinceTimestamp ? gt(scoutingEvents.createdAt, sinceTimestamp) : undefined)
    .execute();
  
  return {
    version: 1,
    sourceDevice: getCurrentDeviceId(),
    timestamp: new Date().toISOString(),
    events: events.map(e => ({ ...e })),
  };
}
```

### Conflict Resolution Strategy

**Because we use event-sourcing, conflicts are rare:**

1. **Duplicate events:** Prevented by unique `sync_hash`
2. **Same match, different scouts:** Both events kept (may indicate mis-assignment)
3. **Corrected observations:** Scout can create new event with `corrects: <previous_event_id>` field
4. **Assignment changes:** Audit log shows all assignments, UI displays current state

**Manual conflict UI:**
If duplicate observations detected:
```
┌─────────────────────────────────────────┐
│ ⚠️ Duplicate Observation Detected        │
│                                         │
│ Match: Qual 42 - Team 254 - Red 1       │
│                                         │
│ Scout A (Laptop 3):                     │
│ • Auto: 18pts  Teleop: 42pts            │
│ • Time: 10:15:30                        │
│                                         │
│ Scout B (Laptop 5):                     │
│ • Auto: 20pts  Teleop: 40pts            │
│ • Time: 10:15:45                        │
│                                         │
│ [KEEP SCOUT A] [KEEP SCOUT B] [KEEP BOTH]│
└─────────────────────────────────────────┘
```

Keep both by default (analysis can average), admin can mark one as invalid.

### Database Migrations

Use Drizzle Kit for type-safe migrations:

```bash
# Generate migration from schema changes
npx drizzle-kit generate:sqlite

# Apply migrations
npx drizzle-kit push:sqlite
```

Example migration file (auto-generated):
```sql
-- Migration: 0001_create_initial_schema.sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  season INTEGER NOT NULL,
  start_date TEXT,
  end_date TEXT,
  synced_at TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ... other tables
```

---

## Feature Specifications

### 1. Smart Scouting Interface (Priority: HIGH)

#### Problem Solved
Current app: scouts manually enter team number and can watch the wrong robot.

#### Solution
**Pre-Assigned Match Cards**

Each scout sees:
1. **Current Assignment Card** (large, prominent)
   - Match number (e.g., "Qual 42")
   - Alliance position (e.g., "Red 2")
   - Team number (e.g., "1678")
   - Team name (from TBA)
   - Countdown to match start
   - Robot photo (from TBA, if available)

2. **Context-Aware Form**
   - Form title: "Scouting Team 1678 - Red 2 - Q42"
   - Auto/Teleop/Endgame sections appear based on match phase (future enhancement)
   - Quick "No Show" or "Broken Robot" buttons for edge cases

3. **Upcoming Assignments**
   - Next 3 assignments shown below
   - Tap to swap/trade assignments with another scout (future)

#### UI Design
```
┌─────────────────────────────────────────┐
│ 🎯 Your Current Assignment              │
│                                         │
│   Qualification Match 42                │
│   Red Alliance - Position 2             │
│                                         │
│   Team 1678 - Citrus Circuits          │
│   [Robot Photo]                         │
│                                         │
│   Match starts in: 3:42                │
│                                         │
│   [START SCOUTING] ────────────────────│
└─────────────────────────────────────────┘
│                                         │
│ 📋 Upcoming Assignments                │
│   Q43: Blue 1 - Team 254                │
│   Q44: Red 3 - Team 971                 │
│   Q45: Blue 2 - Team 1323               │
└─────────────────────────────────────────┘
```

---

### 2. Simplified Sync System (Priority: HIGH)

#### The Challenge
- No reliable WiFi at events
- Need to aggregate data from 6 laptops
- Keep it EXTREMELY simple for scouts

#### Multi-Method Sync Strategy

**Method 1: QR Code Sync (Primary)**
- **Library:** `qrcode.react` for generation + `html5-qrcode` for scanning
- Each device can generate QR codes containing recent scouting data
- Other devices scan QR via webcam to import
- For large datasets, automatic chunking with progress indicator
- Compression via `lz-string` (battle-tested compression library)
- Lovat-inspired UI: clean QR display, auto-advance through sequence
- Error correction level H (high redundancy for low-quality scans)

**Method 2: CSV Export/Import (Backup)**
- Export button creates timestamped CSV on desktop
- Import via drag-drop or file picker
- Maintains backward compatibility with old data
- Can open in Excel for manual inspection

**Method 3: Local Network Sync (Optional, when available)**
- **Hub-and-spoke architecture:** One laptop runs simple Express API
- Scout devices HTTP POST sync packets to hub when reachable
- Hub returns new events back to scout (bidirectional sync)
- Uses `axios` for HTTP requests with retries
- Auto-discovery optional (manual IP entry more reliable)
- Show sync status indicator (green = synced, yellow = pending, gray = offline)
- Completely optional, degrades gracefully to QR/CSV when offline

**Method 4: USB Drive Sync**
- Export SQLite database file (.sqlite) to USB via Electron file dialog
- Import .sqlite file on analysis laptop (merge event logs via Drizzle)
- Can also export/import as JSON for human readability
- Simplest method, most reliable

#### Sync UI Flow
```
Analysis Laptop (Primary Device):

┌─────────────────────────────────────────┐
│ 📊 Data Collection Status               │
│                                         │
│ Scout Laptop 1  ✓ 34 matches (2m ago)  │
│ Scout Laptop 2  ✓ 31 matches (1m ago)  │
│ Scout Laptop 3  ⚠️ 28 matches (15m ago) │
│ Scout Laptop 4  ✓ 35 matches (just now)│
│ Scout Laptop 5  ✓ 33 matches (3m ago)  │
│ Scout Laptop 6  ❌ No data yet          │
│                                         │
│ Total: 161 match observations           │
│                                         │
│ [SYNC VIA QR]  [IMPORT CSV/DB]         │
│ [🔄 NETWORK SYNC] (WiFi detected)      │
└─────────────────────────────────────────┘
```

Scout Laptop Export:

```
┌─────────────────────────────────────────┐
│ 📤 Share Your Data                      │
│                                         │
│ You have 34 unsynced observations       │
│                                         │
│ Choose sync method:                     │
│                                         │
│ 📱 [QR CODE] ←── Recommended            │
│    Show QR codes for analysis laptop   │
│    to scan                              │
│                                         │
│ 💾 [EXPORT CSV]                         │
│    Save to USB drive                    │
│                                         │
│ 📡 [NETWORK SYNC]                       │
│    Auto-sync over WiFi (when available)│
└─────────────────────────────────────────┘
```

---

### 3. Advanced Analytics Dashboard (Priority: MEDIUM)

#### Core Principle
**Only compute metrics NOT available from TBA/Statbotics APIs**

Don't waste time calculating:
- OPR/DPR/CCWM (Statbotics has this)
- Win/Loss records (TBA has this)
- Ranking points (TBA has this)
- EPA ratings (Statbotics has this)

**DO calculate:**
- Game-specific actions (e.g., notes scored, amp usage, trap attempts)
- Consistency metrics (std deviation, boom/bust patterns)
- Phase breakdowns (auto vs teleop contributions)
- Human player effectiveness
- Defense ratings
- Reliability scores (performance + consistency + sample size)

#### Analytics Views

**1. Team Overview Dashboard**
Lovat-inspired team cards:
```
┌──────────────────────────────────────────┐
│ Team 1678 - Citrus Circuits          ⭐ │
│ ──────────────────────────────────────   │
│                                          │
│ 📊 Avg Contribution: 67.3 pts           │
│    Auto:   18.2  [████████░░] 8.3 EPA   │
│    Teleop: 42.1  [█████████░] 9.1 EPA   │
│    Endgame: 7.0  [██████░░░] 2.1 EPA    │
│                                          │
│ 📈 Consistency: ●●●●○ (4/5)              │
│    Std Dev: ±8.4 pts                     │
│                                          │
│ 🎯 Reliability Score: 92/100             │
│    Sample: 12 matches                    │
│                                          │
│ [VIEW DETAILS] [COMPARE] [ADD TO LIST]  │
└──────────────────────────────────────────┘
```

**2. Team Detail Page**
- **Performance Sparklines** (mini charts showing match-by-match trends)
- **Game Phase Breakdown** (stacked bar: auto/teleop/endgame contributions)
- **Consistency Analysis** (highlight boom/bust matches)
- **Reliability Radar** (multi-dimensional: scoring, defense, consistency, sample size)
- **Match History Table** (sortable, filterable)
- **Notes Section** (qualitative observations from scouts)

**3. Picklist Builder**
Dynamic, weighted picklists inspired by Lovat:
```
┌─────────────────────────────────────────┐
│ 🎯 Build Your Picklist                  │
│                                         │
│ Adjust weights to match your strategy: │
│                                         │
│ Auto Scoring    ████████░░ 80%         │
│ Teleop Scoring  ██████████ 100%        │
│ Endgame         ████░░░░░░ 40%         │
│ Consistency     ███████░░░ 70%         │
│ Defense         ██░░░░░░░░ 20%         │
│                                         │
│ [GENERATE PICKLIST]                     │
└─────────────────────────────────────────┘

Results:
1. Team 1678 (Score: 94.2)
2. Team 254  (Score: 91.8)
3. Team 1323 (Score: 89.5)
...
```

**4. Data Quality Dashboard**
- Coverage heatmap (which teams/matches are missing)
- Duplicate detection
- Outlier flags (e.g., team scored 200pts when avg is 50)
- Low-confidence warnings (only 1-2 observations)
- Scout performance tracking (optional, shows who has been most accurate)

---

### 4. Pre-Event Setup Workflow (Priority: HIGH)

#### Setup Wizard (First Launch)

**Step 1: Event Selection**
```
┌─────────────────────────────────────────┐
│ 🏆 Select Your Competition              │
│                                         │
│ [Search events...]                      │
│                                         │
│ 📍 Nearby Events:                       │
│ • San Diego Regional (Mar 20-23)       │
│ • Los Angeles Regional (Mar 27-30)     │
│                                         │
│ Or enter event code:                    │
│ [2025casd]                              │
│                                         │
│ [CONTINUE] ──────────────────────────── │
└─────────────────────────────────────────┘
```

**Step 2: Fetch Event Data**
```
┌─────────────────────────────────────────┐
│ 📥 Loading Event Data                   │
│                                         │
│ ✓ Event details downloaded              │
│ ✓ Team list (54 teams)                 │
│ ⏳ Match schedule (downloading...)      │
│ ⏳ Team photos & info...                │
│                                         │
│ This may take a minute with WiFi.      │
│ All data will be stored locally.       │
└─────────────────────────────────────────┘
```

**Step 3: Device Configuration**
```
┌─────────────────────────────────────────┐
│ 💻 Configure This Device                │
│                                         │
│ Device Name:                            │
│ [Scout Laptop 3]                        │
│                                         │
│ Device Role:                            │
│ ◉ Scout Device                          │
│   (Collects match data)                 │
│                                         │
│ ○ Analysis Device (Primary)             │
│   (Aggregates & analyzes data)          │
│                                         │
│ [CONTINUE] ──────────────────────────── │
└─────────────────────────────────────────┘
```

**Step 4: Form Builder**
```
┌─────────────────────────────────────────┐
│ 📝 Design Your Scouting Form            │
│                                         │
│ ○ Start from scratch (SurveyJS Creator)│
│ ◉ Import form from file (.json)        │
│ ○ Use default 2025 template             │
│                                         │
│ Required fields (auto-included):        │
│ • Team Number                           │
│ • Auto Score                            │
│ • Teleop Score                          │
│ • Endgame Score                         │
│                                         │
│ [OPEN FORM BUILDER] [IMPORT] ───────────│
└─────────────────────────────────────────┘
```

**Form Builder Features (SurveyJS Creator):**
- Visual drag-and-drop editor (keep existing workflow)
- All SurveyJS field types supported
- Conditional logic and validation rules
- Preview mode for testing
- JSON export/import for sharing between devices

**Step 5: Scout Assignment**
```
┌─────────────────────────────────────────┐
│ 👥 Assign Scouts                        │
│                                         │
│ Create scouts (no passwords needed):   │
│                                         │
│ Scout 1: [Alex]                         │
│ Scout 2: [Jordan]                       │
│ Scout 3: [Morgan]                       │
│ Scout 4: [Sam]                          │
│ Scout 5: [Taylor]                       │
│ Scout 6: [Casey]                        │
│                                         │
│ [+] Add Scout                           │
│                                         │
│ [FINISH SETUP] ─────────────────────────│
└─────────────────────────────────────────┘
```

**Step 6: Auto-Assignment Algorithm**
After setup, system automatically assigns scouts to all matches:
- Round-robin distribution for fairness
- Tries to minimize consecutive matches for same scout (rest periods)
- Balances red vs blue assignments
- Admin can manually adjust assignments later

**Step 7: Config Export**
```
┌─────────────────────────────────────────┐
│ ✓ Setup Complete!                       │
│                                         │
│ 🎉 Your event is ready to scout.        │
│                                         │
│ Next steps:                             │
│ 1. Export config to other devices      │
│ 2. Start scouting matches!              │
│                                         │
│ [EXPORT CONFIG] [START SCOUTING]        │
└─────────────────────────────────────────┘
```

Config export creates a `.osm` file (JSON) containing:
- Event data
- Form schema
- Scout assignments
- Device list

Other devices import this file to instantly sync configuration.

---

### 5. Form Builder (Priority: MEDIUM)

**Keep SurveyJS - It's Excellent!**

Your current SurveyJS implementation is a major strength. We'll keep it and enhance:

**Improvements to Existing SurveyJS:**
- **Embedded SurveyJS Creator** - Edit forms in-app, not separate window
- **Better form preview** - Side-by-side edit/preview mode
- **Template library** - Save/load form templates for different game seasons
- **Version control** - Track form schema changes over time
- **Validation UI** - Visual warnings when required fields missing
- **Theme integration** - Style SurveyJS to match Mantine UI aesthetic

**All SurveyJS Features Preserved:**
- All existing field types (text, number, dropdown, checkbox, radio, rating, etc.)
- Conditional logic and visibility rules
- Validators and custom expressions
- Panels and page breaks
- Matrix questions
- File uploads
- Custom CSS themes

**Why Keep SurveyJS:**
- You already know it works
- Scouts are familiar with the interface
- Existing form schemas can be imported directly
- Excellent documentation and community
- Saves months of custom form builder development

---

## UI/UX Design System

### Design Principles (Lovat-Inspired)

1. **Clarity over cleverness** - Every interaction should be obvious
2. **Speed over features** - Fast load times, instant feedback
3. **Offline-first** - Never assume network connectivity
4. **Data confidence** - Always show sample size and uncertainty
5. **Graceful degradation** - Missing data? Show what we have.

### Color Palette

**Light Mode (Default):**
- Background: #FFFFFF
- Surface: #F8F9FA
- Primary: #3B82F6 (Blue)
- Success: #10B981 (Green)
- Warning: #F59E0B (Amber)
- Error: #EF4444 (Red)
- Text: #1F2937
- Text Muted: #6B7280

**Dark Mode (Optional):**
- Background: #0F172A
- Surface: #1E293B
- Primary: #60A5FA
- (Inverse of light mode colors)

### Typography
- **Headings:** Inter or System UI font stack
- **Body:** Inter or System UI
- **Mono:** JetBrains Mono (for team numbers, match codes)

### Component Library (Mantine UI)

**Why Mantine over shadcn/ui:**
- **More distinctive design** - Not the "every AI project looks the same" aesthetic
- **Comprehensive out-of-the-box** - 100+ components vs. shadcn's à la carte approach
- **Better for offline apps** - Single dependency, not copy-paste files
- **Personality-rich** - Unique visual language, customizable with theme
- **Excellent DataTable** - Built-in sorting, filtering, pagination (perfect for match data)
- **Built-in dark mode** - Toggle without custom config

**Mantine Components Used:**
- Button, Badge, Card, Paper
- DataTable (powerful table with built-in features)
- Modal, Drawer, Menu
- TextInput, Select, NumberInput, Slider, Checkbox, Radio
- Tabs, Accordion, Stepper (for setup wizard)
- Notifications (toast system)
- Progress, Loader, Skeleton
- Timeline (for match history)
- RingProgress, ThemeIcon (for analytics)

**Custom Theme:**
Define unique color palette and typography to differentiate from generic Mantine sites.

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
**Goal:** Setup project, database, and basic UI

**Tasks:**
- [ ] Initialize React + Electron + TypeScript project with Vite
- [ ] Configure ESLint, Prettier, TypeScript strict mode
- [ ] Setup Mantine UI v7 + custom theme with unique color palette
- [ ] Setup better-sqlite3 + Drizzle ORM (schema definitions + migrations)
- [ ] Design Drizzle schema (events, devices, scouts, matches, assignments, form_schemas, scouting_events)
- [ ] Create initial database migration and seed data
- [ ] Build Electron main process (window management, IPC bridges for DB operations)
- [ ] Implement basic routing (React Router v6)
- [ ] Create Mantine-based layout components (AppShell, nav, header)
- [ ] Build setup wizard using Mantine Stepper component
- [ ] Integrate TBA API client (axios-based, with offline caching to SQLite)

**Deliverable:** App launches, setup wizard works, data fetches from TBA

---

### Phase 2: Scouting Interface (Week 2-3)
**Goal:** Scouts can collect match data

**Tasks:**
- [ ] Integrate SurveyJS Creator for form builder (keep existing system)
- [ ] Embed SurveyJS form renderer with Mantine theme overrides
- [ ] Create scout assignment system using Drizzle queries (pre-assign scouts to match positions)
- [ ] Build scouting dashboard (Mantine Cards for current/upcoming assignments)
- [ ] Implement form submission (save to SQLite via Drizzle with sync_hash generation)
- [ ] Add "No Show" / "Broken Robot" quick action buttons
- [ ] Build match countdown timer (Mantine RingProgress component)
- [ ] Integrate SurveyJS validation with Mantine notifications
- [ ] Implement event-sourcing insert (append-only with UUID + sync_hash)

**Deliverable:** Scouts can view assignments and submit match data

---

### Phase 3: Sync System (Week 3-4)
**Goal:** Data moves between devices effortlessly

**Tasks:**
- [ ] Design sync protocol (event-log merging with deterministic resolution)
- [ ] Build QR code generator using `qrcode.react` + `lz-string` compression + chunking
- [ ] Build QR code scanner using `html5-qrcode` library (webcam access via Electron)
- [ ] Implement sync packet format (compress event logs for QR transfer)
- [ ] Implement CSV export using Drizzle queries + `papaparse` (backward-compatible)
- [ ] Implement CSV import using `papaparse` (parse + validate + Drizzle insert with conflict handling)
- [ ] Build SQLite file export (copy .sqlite file to USB via Electron dialog)
- [ ] Create sync status UI using Mantine Timeline and Indicators
- [ ] Add sync log table with Drizzle (audit trail with timestamps)
- [ ] Optional: Hub-and-spoke network sync via Express endpoint + axios (when LAN available)

**Deliverable:** Data successfully moves from scout laptops to analysis device

---

### Phase 4: Analysis Dashboard (Week 4-5)
**Goal:** Strategy team makes data-driven decisions

**Tasks:**
- [ ] Build team overview grid using Drizzle aggregate queries (Mantine Grid + Card components, Lovat-inspired)
- [ ] Implement team detail page using Recharts for sparklines + radar charts
- [ ] Create picklist builder with Mantine Sliders (weighted rankings algorithm)
- [ ] Build data quality dashboard using Mantine DataTable + Indicators
- [ ] Implement filtering/sorting with Mantine DataTable built-in features
- [ ] Add team comparison view (Mantine Tabs for side-by-side Drizzle queries)
- [ ] Create match prediction (optional, simple weighted scoring model)
- [ ] Build analytics cache table in SQLite (precompute expensive Drizzle aggregations)
- [ ] Add export options using `jspdf` for PDFs, `papaparse` for CSV via Drizzle SELECT

**Deliverable:** Analysis device provides actionable insights for alliance selection

---

### Phase 5: Polish & Production (Week 5-8)
**Goal:** Ship-ready, tested, documented

**Tasks:**
- [ ] Write comprehensive user documentation
- [ ] Create quick-start guide (one-page cheat sheet)
- [ ] Add tooltips and help text throughout UI
- [ ] Implement error handling (friendly error messages)
- [ ] Build logging system (debug mode for troubleshooting)
- [ ] Add keyboard shortcuts (power user features)
- [ ] Optimize performance (lazy loading, virtualization for large lists)
- [ ] Test on actual 6 Windows laptops
- [ ] Create E2E tests for critical workflows
- [ ] Build update mechanism (auto-update via Electron)
- [ ] Create installer packages (.exe for Windows)
- [ ] Design app icon and branding
- [ ] Final bug bash and UX refinement

**Deliverable:** Production-ready app, tested and documented

---

## Testing Strategy

### Manual Testing Checklist
**Setup Workflow:**
- [ ] Fresh install on new device
- [ ] Event selection and TBA data fetch
- [ ] Form builder (create custom form)
- [ ] Config export and import on another device

**Scouting Workflow:**
- [ ] Scout sees correct assignment
- [ ] Form submission works offline
- [ ] Data persists after app restart
- [ ] "No show" handling works

**Sync Workflow:**
- [ ] QR code export and import
- [ ] CSV export and import
- [ ] USB file transfer
- [ ] Duplicate detection works correctly
- [ ] Data merges without loss

**Analysis Workflow:**
- [ ] Team cards display correct stats
- [ ] Charts render properly
- [ ] Picklist generation works
- [ ] Filtering and sorting work
- [ ] Export to CSV/PDF works

### Automated Testing
**Unit Tests (Vitest):**
- Database queries
- Analytics calculations
- Sync protocol logic
- Form validation

**E2E Tests (Playwright):**
- Setup wizard flow
- Form submission
- QR code sync (mocked)
- Team detail page rendering

---

## Migration Strategy

### Backward Compatibility

**Import Existing CSV Data:**
The new app must be able to import CSV files from the old Flask app:
1. Detect old CSV format (by headers) using `papaparse`
2. Map old columns to new Drizzle schema fields
3. Generate unique UUIDs and sync hashes for each row
4. Convert to scouting_events and bulk insert via Drizzle with `.onConflictDoNothing()`

**CSV Import Library:**
- Use `papaparse` (battle-tested CSV parser, 2.8M weekly downloads)
- Automatic type detection and header parsing
- Stream processing for large files
- Error handling and validation

**Export CSV for Legacy Systems:**
Users can export data in old CSV format if needed for other tools:
- Drizzle SELECT query → transform → papaparse stringify → Electron save dialog

### Transition Plan

**Option A: Hard Cutover (Recommended)**
- Train team on new app before competition (1 week prior)
- Start fresh with new event
- Import historical data from old CSVs if desired for reference

**Option B: Parallel Running**
- Run both apps simultaneously at first event
- Compare results for validation
- Fully switch after confidence established (risky, more work)

### Data Import Tool

Build a dedicated "Import from Old App" wizard:

```
┌─────────────────────────────────────────┐
│ 📥 Import Data from Old App              │
│                                         │
│ Drag CSV file here or click to browse  │
│                                         │
│ [   DROP ZONE   ]                       │
│                                         │
│ Or import entire data folder:           │
│ [BROWSE FOLDER]                         │
│                                         │
│ ✓ Will detect duplicates automatically  │
│ ✓ Validates all required fields         │
│ ✓ Shows preview before importing        │
└─────────────────────────────────────────┘
```

**Import Process:**
1. Parse CSV with papaparse
2. Validate headers match expected format
3. Transform rows into PouchDB documents
4. Show preview table (first 10 rows)
5. User confirms import
6. Bulk insert to PouchDB with conflict handling
7. Show import summary (success/warnings/errors)

### Transition Plan

**Option A: Hard Cutover (Recommended)**
- Train team on new app before competition
- Start fresh with new event
- Import historical data if needed

**Option B: Parallel Running**
- Run both apps simultaneously at first event
- Compare results for validation
- Fully switch after confidence established

---

## Risk Mitigation

### Technical Risks

**Risk:** Electron bundle size too large
- **Mitigation:** Use Electron Forge with proper tree-shaking, lazy load heavy libraries

**Risk:** SQLite performance with large datasets
- **Mitigation:** Add indexes, use analysis_cache table, batch inserts

**Risk:** QR code sync fails with large data volumes
- **Mitigation:** Compression (LZ-string), chunking, fallback to CSV/USB

**Risk:** TBA API rate limits or downtime
- **Mitigation:** Pre-fetch all data before event, cache aggressively, graceful degradation

**Risk:** Bugs discovered during competition
- **Mitigation:** Extensive pre-event testing, fallback to CSV export, remote support plan

### Operational Risks

**Risk:** Scouts resist new app (change aversion)
- **Mitigation:** Training session, clear assignment UI, simpler workflow than before

**Risk:** Device hardware failure during event
- **Mitigation:** Backup devices, data is multi-homed (each laptop has copy)

**Risk:** Complex sync confuses users
- **Mitigation:** Make QR sync brain-dead simple, provide visual feedback, detailed docs

---

## Success Metrics

### Technical Metrics
- App launches in <3 seconds
- Form submission saves in <500ms
- QR code sync completes in <30 seconds for 50 matches
- Zero data loss during sync operations
- App works 100% offline (no network required)

### User Metrics
- Scout setup time: <5 minutes per device
- Average scouting time per match: <3 minutes
- Scout confusion rate: <5% (measure via "wrong robot" flags)
- Data quality: >90% match coverage, <2% duplicates
- Analysis time savings: 50% faster than current app

### Competition Readiness Checklist
- [ ] Tested with 6 actual Windows laptops
- [ ] Successful end-to-end workflow with mock data
- [ ] Documentation printed and distributed
- [ ] Backup plans in place (CSV fallback)
- [ ] Emergency contact established (remote support)
- [ ] All scouts trained on new interface
- [ ] Analysis team trained on new dashboard
- [ ] Form schema finalized and tested

---

## Future Enhancements (Post-Competition)

### Phase 6 (Optional)
- Native mobile apps (React Native)
- Alliance coordinator (simulate 3v3 matchups)
- Auto path visualizer (draw on field diagram)
- Match predictor (ML model based on historical data)
- Real-time network sync (WebSocket-based when WiFi available)
- Multi-event support (track entire season)
- Historical trend analysis (team performance over multiple events)
- Pit scouting integration (robot specifications, photo gallery)
- Advanced video sync (link match videos to scouting data)

---

## Appendix A: Tech Stack Justification

### Why React?
- Massive ecosystem, easy to hire/find help
- Great TypeScript support
- Component model fits scouting form builder
- Works seamlessly with Electron

### Why Electron?
- True offline-first (no browser restrictions)
- Access to filesystem (database, USB export)
- Cross-platform (Windows, Mac, Linux)
- Proven at scale (VS Code, Slack, Figma use it)
- Can package as single .exe

### Why SQLite + Drizzle ORM?
- **Type-safe queries** - Drizzle provides excellent TypeScript ORM with autocomplete
- **True offline-first** - SQLite is a local file, no network dependency
- **Proven reliability** - SQLite is the most deployed database in the world
- **Easy backup/export** - Copy .sqlite file to USB, export to CSV with Drizzle queries
- **Electron-native** - Perfect fit for Node.js main process
- **Full control** - Design sync protocol exactly for FRC competition needs
- **Zero runtime** - Drizzle is compile-time only, tiny footprint
- **Competition-ready** - Most predictable, lowest hidden risk

### Why Custom Sync vs. Built-In Replication?
- **Tailored to FRC** - Hub-and-spoke LAN + QR + CSV matches your workflow
- **Simpler debugging** - No black-box replication magic to troubleshoot at events
- **Deterministic conflicts** - Event-sourcing pattern + append-only logs prevent most conflicts
- **Faster delivery** - Less learning curve, more control in 1-2 month timeline
- **Fallback-first** - QR and CSV are primary sync methods (network is bonus)

### Why Mantine UI over shadcn/ui?
- **Unique visual identity** - Avoid the "generic AI project" look
- **Comprehensive library** - 100+ components, less DIY work
- **Better offline story** - Single npm package, no copy-paste
- **Excellent DataTable** - Built-in sorting/filtering (perfect for scouting data)
- **Dark mode included** - No extra config needed
- **Customizable theming** - Can still create distinctive brand

### Why Not...

**Why not PWA-only?**
- Browser storage limits
- Filesystem access restrictions
- Worse offline support
- Can't easily export SQLite file

**Why not Flutter?**
- Less mature desktop support
- Smaller ecosystem for complex UI
- Harder to integrate with TBA APIs

**Why not Tauri?**
- Smaller community, fewer resources
- Electron more proven for production apps
- Not worth the risk for competition deadline

---

## Appendix B: API Integration

### The Blue Alliance (TBA) API v3

**Endpoints Used:**
```
GET /event/{event_key}/simple
GET /event/{event_key}/teams/simple
GET /event/{event_key}/matches/simple
GET /team/{team_key}/media/{year}
```

**Authentication:**
- Requires TBA API key (free, instant)
- Store in local config, not in code

**Rate Limits:**
- Unknown exact limits, but generous for pre-fetching
- Cache all responses locally

### Statbotics API

**Endpoints Used:**
```
GET /v3/team_events?event={event_key}
GET /v3/team_event/{team_key}/{event_key}
```

**Data Retrieved:**
- EPA (Expected Points Added)
- Win probability
- Component OPRs

**Integration:**
- Optional enhancement, not critical path
- Display alongside our calculated metrics

---

## Appendix C: Accessibility Considerations

**WCAG 2.1 AA Compliance:**
- Keyboard navigation (tab through forms)
- ARIA labels on all interactive elements
- Color contrast ratios (4.5:1 minimum)
- Screen reader support (semantic HTML)
- Focus indicators (visible focus states)
- Alt text for images/charts

**Usability for Competition Environment:**
- Large touch targets (fingers on touchscreens)
- High contrast mode (bright sunlight readability)
- Simplified navigation (scouts are in high-stress environment)
- Clear error messages (avoid jargon)
- Undo/redo support (easy mistake recovery)

---

## Questions for Final Decision

Before implementation, confirm:

1. **Primary device for analysis:** Will one specific laptop be designated as the "hub" for aggregating data?
   - Current assumption: Yes, one primary + 5 scouts

2. **Scout laptop specs:** Do all 6 Windows laptops have:
   - Webcams (for QR scanning)?
   - USB ports (for file transfer)?
   - WiFi capability (optional network sync)?

3. **Training timeline:** When can you schedule training for scouts/analysts?
   - Recommended: 1 week before competition

4. **Form customization:** Do you want to design the scouting form now, or during Phase 2?
   - Recommendation: Start with 2025 game template, customize later

5. **Branding:** Any team colors, logos, or naming preferences?
   - Current name: "Offline Scouting Manager" (keep or rename?)

6. **Data retention:** How many events' worth of data should the app store?
   - Recommendation: Current season only (2025)

---

## Next Steps

1. **Review this plan** - Provide feedback, ask questions, request changes
2. **Approve architecture** - Confirm tech stack and design decisions
3. **Setup development environment** - Install Node.js, pnpm, Electron tools
4. **Begin Phase 1** - Initialize project and build foundation
5. **Weekly check-ins** - Review progress, adjust timeline as needed

---

**Prepared by:** OpenCode AI Assistant  
**Date:** March 29, 2026  
**Version:** 1.0  
**Status:** Awaiting Review
