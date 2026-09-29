import { afterEach, describe, expect, it } from 'vitest'
import { HubBeacon, HubListener, broadcastAddressFor, encodeBeacon, parseBeacon } from './discovery'

describe('broadcastAddressFor', () => {
  it.each([
    ['192.168.1.20', '255.255.255.0', '192.168.1.255'],
    ['10.0.5.77', '255.0.0.0', '10.255.255.255'],
    ['172.20.14.9', '255.255.240.0', '172.20.15.255'],
    ['192.168.43.1', '255.255.255.128', '192.168.43.127'],
  ])('%s with mask %s reaches %s', (address, mask, expected) => {
    expect(broadcastAddressFor(address, mask)).toBe(expected)
  })
})

describe('beacon format', () => {
  it('round-trips a hub announcement', () => {
    const beacon = { id: 'device_abc', name: 'Lead Laptop', port: 41735 }

    expect(parseBeacon(encodeBeacon(beacon))).toEqual(beacon)
  })

  it('shortens an absurdly long name rather than trusting it', () => {
    const parsed = parseBeacon(encodeBeacon({ id: 'x', name: 'N'.repeat(200), port: 41735 }))

    expect(parsed?.name).toHaveLength(60)
  })

  it.each([
    ['not json', Buffer.from('hello')],
    ['empty', Buffer.alloc(0)],
    ['an array', Buffer.from('[]')],
    ['another app', Buffer.from(JSON.stringify({ app: 'other', v: 1, id: 'a', name: 'b', port: 1 }))],
    ['a future version', Buffer.from(JSON.stringify({ app: 'matchbook', v: 2, id: 'a', name: 'b', port: 1 }))],
    ['a bad port', Buffer.from(JSON.stringify({ app: 'matchbook', v: 1, id: 'a', name: 'b', port: 70000 }))],
    ['a fractional port', Buffer.from(JSON.stringify({ app: 'matchbook', v: 1, id: 'a', name: 'b', port: 80.5 }))],
    ['a missing id', Buffer.from(JSON.stringify({ app: 'matchbook', v: 1, id: '', name: 'b', port: 1 }))],
    ['an oversized packet', Buffer.alloc(600, 'a')],
  ])('ignores %s', (_label, message) => {
    expect(parseBeacon(message)).toBeNull()
  })
})

// A high, unlikely port and loopback targets, so the test cannot collide with a running
// copy of the app or depend on how this machine's network is set up.
const TEST_PORT = 47_361

async function until(check: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for the condition')
    }
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

describe('discovery over UDP', () => {
  const beacon = new HubBeacon({ port: TEST_PORT, targets: () => ['127.0.0.1'] })
  const listener = new HubListener({ port: TEST_PORT })

  afterEach(() => {
    beacon.stop()
    listener.stop()
  })

  it('lets a listener find a hub that is announcing', async () => {
    listener.start()
    beacon.start({ id: 'device_hub', name: 'Lead Laptop' }, 41735)

    await until(() => listener.list().length > 0)

    expect(listener.list()).toEqual([
      expect.objectContaining({ id: 'device_hub', name: 'Lead Laptop', url: 'http://127.0.0.1:41735' }),
    ])
  })

  it('stops listing a hub once it has gone quiet', async () => {
    listener.start()
    beacon.start({ id: 'device_hub', name: 'Lead Laptop' }, 41735)
    await until(() => listener.list().length > 0)

    beacon.stop()
    const realNow = Date.now
    Date.now = () => realNow() + 60_000
    try {
      expect(listener.list()).toEqual([])
    } finally {
      Date.now = realNow
    }
  })

  it('finds nothing when nobody is announcing', async () => {
    listener.start()
    await new Promise((resolve) => setTimeout(resolve, 150))

    expect(listener.list()).toEqual([])
  })
})
