import dgram from 'node:dgram'
import type { Socket } from 'node:dgram'
import { networkInterfaces } from 'node:os'
import { isPrivateLanHost } from '../shared/syncProtocol'

/**
 * Lets a scout laptop find the lead scout's laptop on the same Wi-Fi without typing an
 * address. The hub shouts "Matchbook hub, here, port N" onto the local network every
 * couple of seconds while it is receiving; scouts listen and keep a list.
 *
 * The announcement carries no secret. Reaching the hub still needs its code.
 */

export const DISCOVERY_PORT = 41736
const BEACON_INTERVAL_MS = 2_000
const HUB_TTL_MS = 7_000
const MAX_NAME_LENGTH = 60

export type HubIdentity = {
  id: string
  name: string
}

export type DiscoveredHub = HubIdentity & {
  url: string
  lastSeenAt: number
}

type Beacon = HubIdentity & { port: number }

export function encodeBeacon(beacon: Beacon): Buffer {
  return Buffer.from(JSON.stringify({ app: 'matchbook', v: 1, ...beacon }), 'utf8')
}

export function parseBeacon(message: Buffer): Beacon | null {
  if (message.length === 0 || message.length > 512) {
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(message.toString('utf8'))
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return null
  }

  const beacon = parsed as Record<string, unknown>
  if (
    beacon.app !== 'matchbook' ||
    beacon.v !== 1 ||
    typeof beacon.id !== 'string' ||
    beacon.id.length === 0 ||
    beacon.id.length > 128 ||
    typeof beacon.name !== 'string' ||
    typeof beacon.port !== 'number' ||
    !Number.isInteger(beacon.port) ||
    beacon.port < 1 ||
    beacon.port > 65535
  ) {
    return null
  }

  return { id: beacon.id, name: beacon.name.slice(0, MAX_NAME_LENGTH), port: beacon.port }
}

function ipv4ToInt(address: string): number {
  return address.split('.').reduce((total, octet) => total * 256 + Number(octet), 0)
}

function intToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => Math.floor(value / 2 ** shift) % 256).join('.')
}

/** The address that reaches every device on one network: host bits all set. */
export function broadcastAddressFor(address: string, netmask: string): string {
  const mask = ipv4ToInt(netmask)
  return intToIpv4(((ipv4ToInt(address) & mask) | ~mask) >>> 0)
}

function localBroadcastAddresses(): string[] {
  const addresses = new Set<string>(['255.255.255.255'])
  Object.values(networkInterfaces()).forEach((entries) => {
    entries?.forEach((entry) => {
      if (entry.family === 'IPv4' && !entry.internal && !entry.address.startsWith('169.254.')) {
        addresses.add(broadcastAddressFor(entry.address, entry.netmask))
      }
    })
  })
  return Array.from(addresses)
}

function createSocket(): Socket {
  return dgram.createSocket({ type: 'udp4', reuseAddr: true })
}

type DiscoveryOptions = {
  port?: number
}

type BeaconOptions = DiscoveryOptions & {
  /** Where to send announcements. Defaults to every broadcast address on this machine. */
  targets?: () => string[]
}

/** Announces this laptop as a hub until stopped. */
export class HubBeacon {
  private socket: Socket | null = null
  private timer: NodeJS.Timeout | null = null
  private readonly discoveryPort: number
  private readonly targets: () => string[]

  constructor(options: BeaconOptions = {}) {
    this.discoveryPort = options.port ?? DISCOVERY_PORT
    this.targets = options.targets ?? localBroadcastAddresses
  }

  start(identity: HubIdentity, port: number): void {
    this.stop()

    const socket = createSocket()
    this.socket = socket
    socket.on('error', () => {
      // Discovery is a convenience. A blocked or busy port must never disturb receiving.
    })

    socket.bind(0, () => {
      try {
        socket.setBroadcast(true)
      } catch {
        return
      }

      const send = (): void => {
        const message = encodeBeacon({ ...identity, port })
        for (const address of this.targets()) {
          socket.send(message, this.discoveryPort, address, () => undefined)
        }
      }

      send()
      this.timer = setInterval(send, BEACON_INTERVAL_MS)
    })
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }

    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // already closed
      }
      this.socket = null
    }
  }
}

/** Collects hub announcements heard on the network. */
export class HubListener {
  private socket: Socket | null = null
  private readonly hubs = new Map<string, DiscoveredHub>()
  private readonly discoveryPort: number

  constructor(options: DiscoveryOptions = {}) {
    this.discoveryPort = options.port ?? DISCOVERY_PORT
  }

  start(): void {
    if (this.socket) {
      return
    }

    const socket = createSocket()
    this.socket = socket
    socket.on('error', () => {
      // If the port is taken, discovery just finds nothing; typing an address still works.
    })
    socket.on('message', (message, remote) => {
      const beacon = parseBeacon(message)
      if (!beacon || !isPrivateLanHost(remote.address)) {
        return
      }

      this.hubs.set(beacon.id, {
        id: beacon.id,
        name: beacon.name,
        url: `http://${remote.address}:${beacon.port}`,
        lastSeenAt: Date.now(),
      })
    })

    try {
      socket.bind({ port: this.discoveryPort, exclusive: false })
    } catch {
      this.socket = null
    }
  }

  stop(): void {
    if (this.socket) {
      try {
        this.socket.close()
      } catch {
        // already closed
      }
      this.socket = null
    }
    this.hubs.clear()
  }

  list(): DiscoveredHub[] {
    const cutoff = Date.now() - HUB_TTL_MS
    return Array.from(this.hubs.values())
      .filter((hub) => hub.lastSeenAt >= cutoff)
      .sort((a, b) => a.name.localeCompare(b.name))
  }
}
