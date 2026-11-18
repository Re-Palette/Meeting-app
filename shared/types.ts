// Shared contract between the Worker API (worker/) and the React SPA (src/).
// All timestamps are ISO-8601 strings in UTC ("2026-11-18T05:00:00.000Z").
// All "HH:MM" times and YYYY-MM-DD dates are in the owner's timezone (Settings.timezone).

export type LocationType = 'google_meet' | 'zoom' | 'in_person' | 'phone' | 'custom';

export interface TimeRange {
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

/** Keys "0".."6" = Sunday..Saturday. Missing / empty array = unavailable that day. */
export type WeeklyAvailability = Record<string, TimeRange[]>;

export interface Question {
  id: string;
  label: string;
  required: boolean;
}

/** 日程調整ページ */
export interface EventType {
  id: string;
  slug: string; // public URL: /s/:slug
  title: string;
  description: string;
  durationMin: number;
  location: LocationType;
  locationDetail: string; // Zoom URL, address, phone, etc. Empty for google_meet (auto-generated)
  color: 'teal' | 'blue' | 'purple' | 'orange' | 'pink';
  active: boolean; // 公開中
  requireApproval: boolean; // true → booking becomes 'pending' and shows in 対応が必要なリクエスト
  bufferBeforeMin: number;
  bufferAfterMin: number;
  minNoticeHours: number; // earliest bookable = now + this
  maxDaysAhead: number; // latest bookable day = today + this
  slotIntervalMin: number; // step between candidate start times (e.g. 30)
  availability: WeeklyAvailability;
  questions: Question[];
  createdAt: string;
}

export interface EventTypeWithStats extends EventType {
  bookingCount: number; // non-declined, non-cancelled bookings ever
  trend: number[]; // bookings per week, last 8 weeks oldest→newest (for sparkline)
}

export type EventTypeInput = Omit<EventType, 'id' | 'createdAt'>;

export type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled';

export interface Booking {
  id: string;
  eventTypeId: string;
  eventTitle: string;
  durationMin: number;
  location: LocationType;
  locationDetail: string;
  start: string;
  end: string;
  guestName: string;
  guestEmail: string;
  guestCompany: string;
  notes: string;
  answers: Record<string, string>; // questionId → answer
  status: BookingStatus;
  meetUrl: string; // Google Meet link once the calendar event exists, else ''
  googleEventId: string; // '' if not synced to Google
  syncError: string; // '' or a Japanese message when the Google Calendar sync failed (create/delete)
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string; // busy blocks from freebusy have title '予定あり'
  start: string;
  end: string;
  source: 'google' | 'ics' | 'booking';
  status?: BookingStatus; // only for source 'booking'
}

export interface Settings {
  ownerName: string; // shown in greeting & public page
  timezone: string; // IANA, default 'Asia/Tokyo'
  googleConnected: boolean; // read-only from client
  googleEmail: string; // read-only from client
  googleCalendarIds: string[]; // calendars checked for busy time, default ['primary']
  googleTargetCalendarId: string; // calendar that new bookings are written to, default 'primary'
  icsUrls: string[]; // extra private iCal feeds (iCloud, Outlook...) treated as busy
  busyRules: BusyRule[]; // extra blocked time around specific calendar events (e.g. 90 min after school)
}

/**
 * Extra blocked time around matching calendar events. An event matches when BOTH conditions hold:
 * - calendarId is '' (any checked Google calendar or ICS feed) or equals the event's Google calendar id
 *   (ICS feeds use the id `ics:<feed url>`)
 * - keyword is '' or the event title contains it (case-insensitive)
 * At least one of calendarId / keyword must be non-empty.
 * Matching events block [start - beforeMin, end + afterMin] for booking.
 */
export interface BusyRule {
  id: string;
  label: string; // owner's note, e.g. 学校のあと
  calendarId: string;
  keyword: string;
  beforeMin: number; // 0..720
  afterMin: number; // 0..720
  enabled: boolean;
}

export type SettingsInput = Omit<Settings, 'googleConnected' | 'googleEmail'>;

export interface StatCard {
  value: number;
  delta: number; // vs previous period. For counts: percentage change (12 = +12%). For freeHours: absolute hours.
  series: number[]; // 12 points for the sparkline
}

export interface DashboardData {
  ownerName: string;
  stats: {
    monthBookings: StatCard; // 今月の予定 (confirmed+pending starting this month)
    confirmed: StatCard; // 日程調整完了 (confirmed this month)
    pending: StatCard; // 返答待ち (pending count now)
    freeHoursThisWeek: StatCard; // 今週の空き時間 (hours, 1 decimal)
  };
  upcoming: Booking[]; // next 5 confirmed+pending starting from now
  pending: Booking[]; // all pending, oldest createdAt first
  eventTypes: EventTypeWithStats[];
}

export interface AnalyticsData {
  weekly: { weekStart: string; confirmed: number; pending: number; declined: number; cancelled: number }[]; // last 12 weeks
  byEventType: { eventTypeId: string; title: string; count: number }[];
  byWeekday: number[]; // 7 entries Sun..Sat, confirmed bookings
  byHour: number[]; // 24 entries, confirmed bookings by start hour (owner tz)
  totals: { bookings: number; confirmed: number; approvalRate: number; avgLeadDays: number };
}

export interface Contact {
  email: string;
  name: string;
  company: string;
  bookingCount: number;
  lastBookingAt: string;
}

export interface Slot {
  start: string;
  end: string;
}

export interface PublicEventType {
  slug: string;
  title: string;
  description: string;
  durationMin: number;
  location: LocationType;
  color: EventType['color'];
  requireApproval: boolean;
  questions: Question[];
  ownerName: string;
  timezone: string;
  maxDaysAhead: number;
}

export interface BookingRequest {
  start: string; // must equal one of the slots returned by the slots endpoint
  guestName: string;
  guestEmail: string;
  guestCompany?: string;
  notes?: string;
  answers?: Record<string, string>;
}

export interface ApiError {
  error: string; // human readable Japanese message
}

// ---- multi-user (owner + invited members) ----

export type UserRole = 'owner' | 'member';

/** The signed-in user. Every owner-side endpoint is scoped to this user's own data. */
export interface CurrentUser {
  id: string;
  email: string; // Google account email ('' for the owner before Google is connected)
  name: string; // = that user's Settings.ownerName
  picture: string; // Google profile photo URL ('' if none); refreshed on every Google sign-in/connect
  role: UserRole;
}

export interface AuthMe {
  authenticated: boolean;
  user: CurrentUser | null;
}

/** Owner-only: people allowed to sign in with Google. */
export interface Member {
  email: string;
  name: string; // '' until they first sign in
  picture: string; // Google profile photo URL or ''
  role: UserRole;
  status: 'invited' | 'active'; // active = has signed in at least once
  invitedAt: string;
  lastLoginAt: string; // '' if never
}
