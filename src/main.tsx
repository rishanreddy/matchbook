import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MantineProvider } from '@mantine/core'
import { Notifications } from '@mantine/notifications'
import { BrowserRouter } from 'react-router-dom'
import { appTheme } from './theme'
import './index.css'
import '@mantine/core/styles.css'
import '@mantine/notifications/styles.css'
import 'survey-core/survey-core.min.css'
import 'survey-creator-core/survey-creator-core.min.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { setupGlobalErrorHandlers } from './lib/utils/errorHandler'

setupGlobalErrorHandlers()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={appTheme} defaultColorScheme="dark">
      <Notifications aria-live="polite" />
      <BrowserRouter>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </BrowserRouter>
    </MantineProvider>
  </StrictMode>,
)
