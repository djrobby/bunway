export type DateFormat = 'month-day-year' | 'day-month-year' | 'year-month-day' | 'long'
export type TimeFormat = '12-hour' | '24-hour'

const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'

export const dateTimePreferences = $state({
  timezone: detectedTimezone,
  dateFormat: 'month-day-year' as DateFormat,
  timeFormat: '12-hour' as TimeFormat,
})

const supportedTimezones = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : [detectedTimezone]
export const timezones = [...new Set(['UTC', detectedTimezone, ...supportedTimezones])]

export function loadDateTimePreferences() {
  const timezone = localStorage.getItem('datetime-timezone')
  const dateFormat = localStorage.getItem('datetime-date-format') as DateFormat | null
  const timeFormat = localStorage.getItem('datetime-time-format') as TimeFormat | null
  if (timezone && timezones.includes(timezone)) dateTimePreferences.timezone = timezone
  if (dateFormat && ['month-day-year', 'day-month-year', 'year-month-day', 'long'].includes(dateFormat)) dateTimePreferences.dateFormat = dateFormat
  if (timeFormat === '12-hour' || timeFormat === '24-hour') dateTimePreferences.timeFormat = timeFormat
}

export function saveDateTimePreferences(next: typeof dateTimePreferences) {
  Object.assign(dateTimePreferences, next)
  localStorage.setItem('datetime-timezone', next.timezone)
  localStorage.setItem('datetime-date-format', next.dateFormat)
  localStorage.setItem('datetime-time-format', next.timeFormat)
}

export function resetDateTimePreferences() {
  saveDateTimePreferences({ timezone: detectedTimezone, dateFormat: 'month-day-year', timeFormat: '12-hour' })
}

export function formatDisplayDate(value: string | Date | null | undefined, includeTime = true) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  const dateOptions: Intl.DateTimeFormatOptions = dateTimePreferences.dateFormat === 'long'
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : dateTimePreferences.dateFormat === 'year-month-day'
      ? { year: 'numeric', month: '2-digit', day: '2-digit' }
      : dateTimePreferences.dateFormat === 'day-month-year'
        ? { year: 'numeric', month: '2-digit', day: '2-digit' }
        : { year: 'numeric', month: '2-digit', day: '2-digit' }
  const locale = dateTimePreferences.dateFormat === 'year-month-day' ? 'sv-SE'
    : dateTimePreferences.dateFormat === 'day-month-year' ? 'en-GB'
    : 'en-US'
  return new Intl.DateTimeFormat(locale, {
    ...dateOptions,
    ...(includeTime ? { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: dateTimePreferences.timeFormat === '12-hour' } : {}),
    timeZone: dateTimePreferences.timezone,
  }).format(date)
}
