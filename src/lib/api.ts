import { clearAsyncCache } from './useAsync';
import type {
  AnalyticsData,
  AuthMe,
  Member,
  Booking,
  BookingRequest,
  BookingStatus,
  CalendarEvent,
  Contact,
  DashboardData,
  EventType,
  EventTypeInput,
  EventTypeWithStats,
  PublicEventType,
  Settings,
  SettingsInput,
  Slot,
} from '../../shared/types';

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const UNAUTHORIZED_EVENT = 'mf:unauthorized';

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = `エラーが発生しました (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data && data.error) message = data.error;
    } catch {
      /* ignore */
    }
    if (res.status === 401 && !path.startsWith('/auth') && !path.startsWith('/public')) {
      clearAsyncCache();
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new HttpError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

const get = <T>(p: string) => request<T>('GET', p);
const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
const put = <T>(p: string, b: unknown) => request<T>('PUT', p, b);
const del = <T>(p: string) => request<T>('DELETE', p);

const enc = encodeURIComponent;

export type GoogleCalendar = { id: string; summary: string; primary: boolean };

export const api = {
  login: (password: string) => post<{ ok: true }>('/auth/login', { password }),
  logout: () => {
    clearAsyncCache();
    return post<{ ok: true }>('/auth/logout');
  },
  me: () => get<AuthMe>('/auth/me'),

  members: () => get<Member[]>('/members'),
  inviteMember: (email: string) => post<Member>('/members', { email }),
  removeMember: (email: string) => del<{ ok: true }>(`/members/${enc(email)}`),

  dashboard: () => get<DashboardData>('/dashboard'),
  calendarEvents: (from: string, to: string) =>
    get<CalendarEvent[]>(`/calendar/events?from=${enc(from)}&to=${enc(to)}`),

  eventTypes: () => get<EventTypeWithStats[]>('/event-types'),
  eventType: (id: string) => get<EventType>(`/event-types/${enc(id)}`),
  createEventType: (input: EventTypeInput) => post<EventType>('/event-types', input),
  updateEventType: (id: string, input: EventTypeInput) => put<EventType>(`/event-types/${enc(id)}`, input),
  deleteEventType: (id: string) => del<{ ok: true }>(`/event-types/${enc(id)}`),

  bookings: (params: { status?: BookingStatus; scope?: 'upcoming' | 'past' | 'all' }) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.scope) q.set('scope', params.scope);
    const qs = q.toString();
    return get<Booking[]>(`/bookings${qs ? `?${qs}` : ''}`);
  },
  approveBooking: (id: string) => post<Booking>(`/bookings/${enc(id)}/approve`),
  declineBooking: (id: string) => post<Booking>(`/bookings/${enc(id)}/decline`),
  cancelBooking: (id: string) => post<Booking>(`/bookings/${enc(id)}/cancel`),

  settings: () => get<Settings>('/settings'),
  saveSettings: (input: SettingsInput) => put<Settings>('/settings', input),

  analytics: () => get<AnalyticsData>('/analytics'),
  contacts: () => get<Contact[]>('/contacts'),

  googleCalendars: () => get<GoogleCalendar[]>('/google/calendars'),
  googleAuthUrl: () => get<{ url: string }>('/google/auth-url'),
  googleDisconnect: () => post<{ ok: true }>('/google/disconnect'),

  publicEventType: (slug: string) => get<PublicEventType>(`/public/event-types/${enc(slug)}`),
  publicSlots: (slug: string, from: string, to: string) =>
    get<{ timezone: string; slots: Slot[] }>(`/public/event-types/${enc(slug)}/slots?from=${from}&to=${to}`),
  book: (slug: string, req: BookingRequest) => post<Booking>(`/public/event-types/${enc(slug)}/book`, req),
};
