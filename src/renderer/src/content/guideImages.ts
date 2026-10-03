import analysis from '../assets/guide/analysis.webp'
import assignments from '../assets/guide/assignments.webp'
import entries from '../assets/guide/entries.webp'
import events from '../assets/guide/events.webp'
import fileTab from '../assets/guide/file-tab.webp'
import formBuilder from '../assets/guide/form-builder.webp'
import homeHub from '../assets/guide/home-hub.webp'
import homeScout from '../assets/guide/home-scout.webp'
import myMatches from '../assets/guide/my-matches.webp'
import qrReceive from '../assets/guide/qr-receive.webp'
import qrSend from '../assets/guide/qr-send.webp'
import scoutComplete from '../assets/guide/scout-complete.webp'
import scoutForm from '../assets/guide/scout-form.webp'
import scoutSetup from '../assets/guide/scout-setup.webp'
import wifiHub from '../assets/guide/wifi-hub.webp'
import wifiScout from '../assets/guide/wifi-scout.webp'

/** Screenshots used by the how-to guide, bundled so they work with no internet. */
export const GUIDE_IMAGES = {
  analysis,
  assignments,
  entries,
  events,
  fileTab,
  formBuilder,
  homeHub,
  homeScout,
  myMatches,
  qrReceive,
  qrSend,
  scoutComplete,
  scoutForm,
  scoutSetup,
  wifiHub,
  wifiScout,
} as const

export type GuideImageKey = keyof typeof GUIDE_IMAGES
