# Offline Scouting Manager - Modernization Plan v2
## Production-Ready Rewrite for Competition

**Timeline:** 1-2 months  
**Branch:** `rewrite-modernization`  
**Inspiration:** Lovat.app's polished UX

---

## Executive Summary

Transform Flask app into modern offline-first scouting system:
- **React + Electron** desktop app + PWA for mobile
- **RxDB** for built-in sync + conflict resolution
- **Mantine UI** for distinctive, personality-rich design
- **SurveyJS** (keep existing - it's excellent!)
- **Pre-loaded match schedules** from TBA API with smart scout assignment
- **Multi-method sync:** Network replication + QR codes + CSV export

**Core Philosophy:** Keep what works (offline-first, SurveyJS, device-based), improve architecture and UX.

---

## Tech Stack

### Frontend
- **Framework:** React 18 + TypeScript + Vite
- **Desktop:** Electron (production-ready, proven)
- **UI Library:** Mantine UI v7 (unique design, 100+ components, built-in dark mode)
- **Forms:** SurveyJS (keeping existing system!)
- **Charts:** Recharts (sparklines, radar charts)
- **State:** Zustand (lightweight)
- **QR Codes:** qrcode.react + html5-qrcode

### Backend/Storage
- **Database:** RxDB with SQLite adapter for Electron
- **Why RxDB:**
  - Built-in replication (network, P2P, CouchDB protocol)
  - Automatic conflict resolution
  - Reactive (auto-updates UI)
  - Explicit Electron support
  - TypeScript-first
- **Sync:** RxDB replication + QR fallback + CSV export
- **APIs:** The Blue Alliance (TBA) v3, Statbotics (optional)

### Build & Deploy
- **Package Manager:** pnpm
- **Desktop Packager:** Electron Builder (.exe for Windows)
- **Testing:** Vitest (unit) + Playwright (E2E)

---

## Key Features

### 1. Smart Scout Assignment
**Problem:** Scouts confused about which robot to watch.

**Solution:**
- Pre-assign scouts to positions before event (Red 1, Blue 3, etc.)
- Each scout sees **Current Assignment Card**:
  - Match number, alliance position, team number/name
  - Robot photo from TBA
  - Countdown to match start
  - Big "START SCOUTING" button
- No manual team number entry
- Quick "No Show" / "Broken Robot" buttons for edge cases

### 2. Multi-Method Sync
**Primary:** RxDB network replication (when WiFi available)
- Hub laptop runs RxDB replication server
- Scout laptops auto-sync when connected
- Built-in conflict resolution

**Fallback 1:** QR Code transfer
- Export recent data as compressed QR codes
- Other device scans with webcam
- Automatic chunking for large datasets

**Fallback 2:** CSV export/import
- Backward-compatible with old app
- USB drive transfer
- Manual import with deduplication

**Fallback 3:** SQLite file copy
- Copy database file to USB
- Import on analysis laptop

### 3. Advanced Analytics
Focus on data NOT available from TBA/Statbotics:
- Game-specific actions (notes scored, amp usage, etc.)
- Consistency metrics (std deviation, boom/bust patterns)
- Phase breakdowns (auto vs teleop contributions)
- Reliability scores (performance + consistency + sample size)
- Data quality dashboard (coverage, outliers, confidence)

**Lovat-Inspired UI:**
- Team cards with sparklines
- Interactive picklist builder (weighted sliders)
- Team comparison view
- Match history with trends

### 4. Pre-Event Setup
**Setup Wizard (Mantine Stepper):**
1. Select competition (search TBA or enter code)
2. Fetch event data (teams, matches, photos) - stores offline
3. Configure device (name, role: scout vs analysis)
4. Design/import scouting form (SurveyJS Creator)
5. Create scouts (simple names, no passwords)
6. Auto-assign scouts to all matches (round-robin, balanced)
7. Export config for other laptops

**Config sync:** Export one `.osm` file, import on other 5 laptops.

---

## RxDB Data Model

### Collections (RxDB Schemas)

#### `events` Collection
```typescript
{
  id: string;              // "2025casd"
  name: string;
  season: number;
  startDate: string;
  endDate: string;
  syncedAt: string;
  createdAt: string;
}
```

#### `devices` Collection
```typescript
{
  id: string;              // Hardware-derived ID
  name: string;            // "Scout Laptop 3"
  isPrimary: boolean;
  lastSeenAt: string;
}
```

#### `scouts` Collection
```typescript
{
  id: string;
  name: string;
  deviceId: string;
  createdAt: string;
}
```

#### `matches` Collection
```typescript
{
  key: string;             // "2025casd_qm1" (primary key)
  eventId: string;
  matchNumber: number;
  compLevel: string;       // "qm", "sf", "f"
  predictedTime: string;
  redAlliance: string[];   // Team numbers
  blueAlliance: string[];
  createdAt: string;
}
```

#### `assignments` Collection
```typescript
{
  id: string;
  matchKey: string;
  position: string;        // "red_1", "blue_3"
  teamNumber: string;
  scoutId: string;
  deviceId: string;
  status: string;          // "pending", "scouting", "completed"
  createdAt: string;
}
```

#### `formSchemas` Collection
```typescript
{
  id: string;
  eventId: string;
  version: number;
  schema: object;          // SurveyJS JSON
  isActive: boolean;
  createdAt: string;
}
```

#### `scoutingData` Collection (Event-Sourced)
```typescript
{
  id: string;              // UUID
  matchKey: string;
  teamNumber: string;
  position: string;
  scoutId: string;
  deviceId: string;
  originDeviceId: string;  // Never changes
  timestamp: string;
  schemaVersion: number;
  autoScore: number;       // Required
  teleopScore: number;     // Required
  endgameScore: number;    // Required
  formData: object;        // All SurveyJS responses
  syncHash: string;        // For deduplication
  isNoShow: boolean;
  isBrokenRobot: boolean;
  createdAt: string;
}
```

### RxDB Sync Strategy

**Hub-and-Spoke Replication:**
```typescript
// Hub device starts replication server
const syncURL = 'http://192.168.1.100:3000/sync';

// Scout devices replicate to hub
await db.scoutingData.sync({
  remote: syncURL,
  options: {
    live: true,        // Continuous sync
    retry: true,       // Auto-retry
  },
  waitForLeadership: true,
});
```

**Conflict Resolution:**
- RxDB handles automatically using revision trees
- Custom resolver: latest timestamp wins for most fields
- Critical conflicts (duplicate observations) flagged in UI

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- ✅ Initialize React + Electron + TypeScript + Vite
- ✅ Setup Mantine UI + custom theme
- ✅ Setup RxDB with SQLite adapter
- ✅ Define RxDB schemas
- ✅ Build Electron main process + IPC
- ✅ Create layout + routing
- ✅ Setup wizard (event selection, TBA fetch)
- ✅ TBA API client integration

**Deliverable:** App launches, fetches event data, stores in RxDB

### Phase 2: Scouting Interface (Weeks 2-3)
- ✅ Embed SurveyJS Creator (form builder)
- ✅ Render SurveyJS forms with Mantine theme
- ✅ Scout assignment system (auto-generate from matches)
- ✅ Scouting dashboard (current assignment card)
- ✅ Form submission (insert to RxDB with sync_hash)
- ✅ Match countdown timer
- ✅ "No Show" / "Broken Robot" handling

**Deliverable:** Scouts can view assignments and submit data

### Phase 3: Sync System (Weeks 3-4)
- ✅ Setup RxDB replication (hub-and-spoke)
- ✅ QR code generator (compressed, chunked)
- ✅ QR code scanner (webcam via html5-qrcode)
- ✅ CSV export (papaparse + RxDB query)
- ✅ CSV import (parse + insert with conflict handling)
- ✅ SQLite file export/import (Electron dialog)
- ✅ Sync status UI (Mantine Timeline)
- ✅ Sync log collection

**Deliverable:** Data moves between devices reliably

### Phase 4: Analysis Dashboard (Weeks 4-5)
- ✅ Team overview grid (Mantine cards + RxDB queries)
- ✅ Team detail page (Recharts sparklines/radar)
- ✅ Picklist builder (weighted sliders)
- ✅ Data quality dashboard (Mantine DataTable)
- ✅ Filtering/sorting
- ✅ Team comparison view
- ✅ Analytics caching

**Deliverable:** Analysis dashboard provides actionable insights

### Phase 5: Polish & Testing (Weeks 5-8)
- ✅ User documentation
- ✅ Error handling + friendly messages
- ✅ Logging system
- ✅ Keyboard shortcuts
- ✅ Performance optimization
- ✅ Test on 6 Windows laptops
- ✅ E2E tests for critical workflows
- ✅ Electron auto-update mechanism
- ✅ Installer packages (.exe)
- ✅ App icon + branding

**Deliverable:** Production-ready, tested, documented

---

## Migration from Old App

**CSV Import Tool:**
- Drag-and-drop CSV from old Flask app
- Auto-detect format + validate
- Map columns to RxDB schema
- Generate sync_hash for deduplication
- Preview before import
- Bulk insert to RxDB

**Config Migration:**
- Import old `config.yaml` (event, form schema)
- Convert to RxDB documents
- Validate required fields

---

## Success Metrics

**Technical:**
- App launches in <3 seconds
- Form submission saves in <500ms
- QR sync completes in <30 seconds for 50 matches
- Zero data loss during sync
- 100% offline functionality

**User:**
- Scout setup: <5 minutes per device
- Scouting time: <3 minutes per match
- Scout confusion: <5% (via "wrong robot" flags)
- Data quality: >90% coverage, <2% duplicates
- Analysis time: 50% faster than current app

---

## Risk Mitigation

**Technical Risks:**
- ❌ RxDB learning curve → ✅ Excellent docs, active community
- ❌ Electron bundle size → ✅ Lazy loading, tree-shaking
- ❌ RxDB performance → ✅ Indexes, caching layer
- ❌ TBA API downtime → ✅ Pre-fetch everything before event

**Operational Risks:**
- ❌ Scouts resist change → ✅ Training session, simpler workflow
- ❌ Device failure → ✅ Backup devices, data is multi-homed
- ❌ Sync confusion → ✅ QR is brain-dead simple, visual feedback

**Fallback Plan:**
- Old Flask app on USB drive (emergency only)
- CSV export always works
- Detailed troubleshooting guide

---

## Questions Before Starting

1. **Training date:** When can you schedule scout training? (Recommend 1 week before competition)
2. **Laptop specs:** Do all 6 laptops have webcams for QR scanning?
3. **Network at event:** Do you usually have WiFi access, or pure offline?
4. **Form design:** Do you have 2025 game form schema ready, or need help designing?
5. **Branding:** Any team colors/logos to include in theme?
6. **Hub laptop:** Which of the 6 laptops will be the analysis/hub device?

---

## Next Steps

1. ✅ Review and approve this plan
2. ✅ Answer questions above
3. ✅ Setup development environment
4. ✅ Begin Phase 1 implementation
5. ✅ Weekly progress check-ins

---

**Document Version:** 2.0  
**Status:** Awaiting Approval  
**Changes from v1:** Switched to RxDB (built-in sync), condensed to essential info, fixed formatting
