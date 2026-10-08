import { compileTourDocument, parseTourDocument } from 'react-tourlight/document'
import tourDocumentSource from './application-tour.tour.json?raw'

const tourDocument = parseTourDocument(tourDocumentSource)

export const APPLICATION_TOUR_ID = tourDocument.id

export function createApplicationTourSteps(isHub: boolean, developerModeEnabled: boolean, assignmentsBetaEnabled: boolean) {
  return compileTourDocument(tourDocument, {
    conditions: {
      hub: () => isHub,
      developer: () => developerModeEnabled,
      assignments: () => isHub && assignmentsBetaEnabled,
    },
  })
}
