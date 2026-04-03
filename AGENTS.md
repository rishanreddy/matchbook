# AGENTS.md - Coding Agent Guidelines

## Project Overview

**Matchbook** is an Electron desktop app for FRC (FIRST Robotics Competition) scouting.
It enables teams to collect match observations offline at events, assign scouts, sync data via
QR/CSV/network, and analyze team performance for alliance selection.

> **Note**: This codebase was rewritten from Python/Flask to Electron/React/TypeScript. Ignore patterns
> from commits before `d0f1f96`. The stack is: Electron, React 19, TypeScript, Mantine UI, RxDB, SurveyJS.

## Build & Run Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev              # Full Electron mode (HMR)

# Verification (run before commits)
pnpm typecheck        # Type checking
pnpm lint             # ESLint

# Production builds
pnpm build            # Build app bundles
pnpm build:win        # Windows package
pnpm build:mac        # macOS package
pnpm build:linux      # Linux package
```

**No tests configured yet.** Type checking and linting are the primary verification steps.

## Project Structure

```
src/
├── main/
│   ├── index.ts          # Electron main process entry
│   ├── database.ts       # Main process DB operations
│   └── syncServer.ts     # Main process sync server
├── preload/
│   ├── index.ts          # IPC bridge
│   └── index.d.ts        # Window electron API typings
└── renderer/
    ├── index.html        # Renderer HTML entry
    ├── public/           # Static assets
    └── src/
        ├── main.tsx      # Entry point with providers
        ├── App.tsx       # Shell with routing/navigation
        ├── routes/       # Page components (Home, Scout, Analysis, etc.)
        ├── components/   # Reusable UI components
        ├── stores/       # Zustand state management
        └── lib/          # API, DB, and utilities
```

## Code Style Guidelines

### TypeScript
- **Strict mode** - no implicit any, no unused locals/params
- Use `type` imports: `import type { Foo } from './foo'`
- Use `unknown` for error catches: `catch (error: unknown)`
- Explicit return types on exported functions

### Import Order
1. React types, then React hooks
2. External libraries (Mantine, icons)
3. Internal imports (stores, lib)
4. Relative imports
5. CSS last

```typescript
import type { ReactElement } from 'react'
import { useEffect, useState } from 'react'
import { Button, Stack } from '@mantine/core'
import { IconHome } from '@tabler/icons-react'
import { useDatabaseStore } from '../stores/useDatabase'
```

### Naming Conventions
| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `SplashScreen.tsx` |
| Hooks | `use` prefix | `useDatabase.ts` |
| Stores | `use` prefix | `useEventStore.ts` |
| Schemas | `.schema.ts` suffix | `events.schema.ts` |
| Types | `Type`/`Props` suffix | `EventDocType` |

### Component Pattern
```typescript
export function MyComponent({ title }: MyComponentProps): ReactElement {
  const [state, setState] = useState('')      // Hooks first
  const db = useDatabaseStore((s) => s.db)

  useEffect(() => { /* ... */ }, [])          // Effects second

  const handleClick = (): void => { /* ... */ }  // Handlers third

  return <Box>...</Box>                       // Render last
}
```

### Error Handling
```typescript
import { handleError, AppError } from '../lib/utils/errorHandler'

// Show user notification for recoverable errors
try {
  await riskyOperation()
} catch (error: unknown) {
  handleError(error, 'Context description')
}

// Throw domain-specific errors
throw new AppError('Message', 'ERROR_CODE', { context: data })
```

### Mantine UI
- Use Mantine components exclusively (no raw HTML for layout)
- Theme colors: `frc-blue`, `frc-orange`, `slate`, `success`, `warning`, `danger`
- Text colors via props: `c="slate.2"` (not inline styles)
- Layout: prefer `Stack`, `Group`, `SimpleGrid` over CSS flexbox

### RxDB Database
- Schemas in `src/renderer/src/lib/db/schemas/` with `*DocType` interfaces
- Access via `useDatabaseStore` hook
- Query with `.find()`, `.where()`, `.sort()`

### Zustand Stores
```typescript
export const useMyStore = create<MyState>((set) => ({
  data: [],
  isLoading: false,
  fetchData: async () => {
    set({ isLoading: true })
    try {
      const data = await fetchFromDb()
      set({ data, isLoading: false })
    } catch (error: unknown) {
      handleError(error, 'Fetching data')
      set({ isLoading: false })
    }
  },
}))
```

### CSS
- Global utilities in `index.css`
- Component styles in `*.module.css`
- CSS variables: `var(--surface-base)`, `var(--border-default)`
- Animation classes: `animate-fadeInUp`, `animate-fadeInScale`

### Async/Promises
- Use `async`/`await` over `.then()` chains
- Wrap fire-and-forget calls: `void initializeDb()`

### Electron IPC
- Defined in `src/preload/index.ts`, typed in `src/preload/index.d.ts`
- Always check: `if (window.electronAPI) { ... }`

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `@mantine/core` | UI components |
| `rxdb` | Offline-first database |
| `zustand` | State management |
| `recharts` | Charts |
| `survey-react-ui` | Dynamic forms |
| `axios` | TBA API client |

## Common Tasks

**Add a route:** Create in `src/renderer/src/routes/`, add to `App.tsx` Routes and `navItems`

**Add RxDB collection:** Create schema in `src/renderer/src/lib/db/schemas/`, export from `collections.ts`

**Add Zustand store:** Create `src/renderer/src/stores/useNewStore.ts` following existing patterns
