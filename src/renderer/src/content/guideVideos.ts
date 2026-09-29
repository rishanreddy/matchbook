import firstMatch from '../assets/guide/videos/first-match.webm'
import firstMatchPoster from '../assets/guide/videos/first-match.webp'
import sending from '../assets/guide/videos/sending-your-scouting.webm'
import sendingPoster from '../assets/guide/videos/sending-your-scouting.webp'

export type GuideVideo = {
  id: string
  title: string
  summary: string
  length: string
  src: string
  poster: string
}

/**
 * Short screen recordings with on-screen captions and no sound, so they work in a loud
 * pit. They are bundled with the app rather than streamed, because venues have no internet.
 */
export const GUIDE_VIDEOS: readonly GuideVideo[] = [
  {
    id: 'first-match',
    title: 'Your first match',
    summary: 'Setting up this laptop, then scouting a match from start to finish.',
    length: '1 min 50 s',
    src: firstMatch,
    poster: firstMatchPoster,
  },
  {
    id: 'sending',
    title: 'Sending your scouting',
    summary: 'Getting your entries to the lead scout with Wi-Fi, QR codes, or a file.',
    length: '1 min 30 s',
    src: sending,
    poster: sendingPoster,
  },
]
