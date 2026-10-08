import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { createMemoryStorage, SpotlightProvider, type SpotlightThemeInput } from 'react-tourlight'

const isElectronRuntime = typeof window !== 'undefined' && window.electronAPI
const tourStorage = createMemoryStorage()

const applicationTourTheme: SpotlightThemeInput = {
  overlay: { background: 'rgba(5, 8, 12, 0.76)' },
  tooltip: {
    background: '#1d242d',
    color: '#eef1f5',
    borderRadius: '10px',
    boxShadow: '0 20px 56px rgba(0, 0, 0, 0.48)',
    padding: '20px',
    maxWidth: 'min(390px, calc(100vw - 16px))',
  },
  title: { fontSize: '18px', fontWeight: '600', color: '#eef1f5', marginBottom: '8px' },
  content: { fontSize: '14px', color: '#b8c0cb', lineHeight: '1.55' },
  button: {
    background: '#ffb020',
    color: '#11161c',
    borderRadius: '6px',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: '600',
    border: '1px solid #ffb020',
    cursor: 'pointer',
    hoverBackground: '#eb9d0f',
  },
  buttonSecondary: {
    background: '#27313c',
    color: '#d9dee6',
    border: '1px solid #3a4653',
    hoverBackground: '#333f4d',
  },
  progress: { background: '#394451', fill: '#ffb020', height: '3px', borderRadius: '999px' },
  arrow: { fill: '#1d242d' },
  closeButton: { color: '#a7b0bd', hoverColor: '#ffffff' },
}

export function TourlightRouterBridge({ children }: { children: ReactNode }): ReactNode {
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <SpotlightProvider
      theme={applicationTourTheme}
      persist={tourStorage}
      resume={false}
      navigate={(route) => navigate(route)}
      isRouteActive={(route, currentPath) => {
        const path = isElectronRuntime && window.location.hash
          ? window.location.hash.slice(1)
          : location.pathname || currentPath
        return path.split('?')[0] === route
      }}
      waitForElementTimeout={8_000}
      labels={{ next: 'Next', previous: 'Back', skip: 'Skip tour', done: 'Finish' }}
    >
      {children}
    </SpotlightProvider>
  )
}
