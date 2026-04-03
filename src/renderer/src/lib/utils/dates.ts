export function formatDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(date)
}

export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate)
  const end = new Date(endDate)

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startDate} - ${endDate}`
  }

  const sameYear = start.getFullYear() === end.getFullYear()
  const sameMonth = sameYear && start.getMonth() === end.getMonth()

  if (sameMonth) {
    const month = new Intl.DateTimeFormat('en-US', { month: 'short' }).format(start)
    const startDay = start.getDate()
    const endDay = end.getDate()
    const year = start.getFullYear()
    return `${month} ${startDay}-${endDay}, ${year}`
  }

  if (sameYear) {
    const startPart = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(start)
    const endPart = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(end)
    return `${startPart} - ${endPart}, ${start.getFullYear()}`
  }

  const startFull = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(start)
  const endFull = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(end)

  return `${startFull} - ${endFull}`
}
