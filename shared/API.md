# MeetFlow API contract

Base path `/api`. JSON in/out. Types in `shared/types.ts`. Errors: non-2xx with `ApiError`.

## Auth (single owner)
Owner password is the Worker secret `ADMIN_PASSWORD`. Session = HMAC-signed cookie `mf_session` (secret `SESSION_SECRET`), HttpOnly, Secure, SameSite=Lax, 30 days.
All `/api/*` routes except `/api/auth/*`, `/api/public/*` and `/api/google/callback` require the cookie (401 otherwise).

| Method | Path | Body | Response |
|---|---|---|---|
| POST | /api/auth/login | `{password}` | `{ok:true}` + cookie |
| POST | /api/auth/logout | – | `{ok:true}` |
| GET | /api/auth/me | – | `{authenticated:boolean}` |

## Owner
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | /api/dashboard | – | `DashboardData` |
| GET | /api/calendar/events | `?from=ISO&to=ISO` | `CalendarEvent[]` (Google busy + ICS + bookings, merged) |
| GET | /api/event-types | – | `EventTypeWithStats[]` |
| POST | /api/event-types | `EventTypeInput` | `EventType` (409 if slug taken) |
| GET | /api/event-types/:id | – | `EventType` |
| PUT | /api/event-types/:id | `EventTypeInput` | `EventType` |
| DELETE | /api/event-types/:id | – | `{ok:true}` |
| GET | /api/bookings | `?status=pending\|confirmed\|declined\|cancelled&scope=upcoming\|past\|all` | `Booking[]` |
| POST | /api/bookings/:id/approve | – | `Booking` (creates Google event) |
| POST | /api/bookings/:id/decline | – | `Booking` |
| POST | /api/bookings/:id/cancel | – | `Booking` (deletes Google event) |
| GET | /api/settings | – | `Settings` |
| PUT | /api/settings | `SettingsInput` | `Settings` |
| GET | /api/analytics | – | `AnalyticsData` |
| GET | /api/contacts | – | `Contact[]` |
| GET | /api/google/calendars | – | `{id,summary,primary}[]` |
| GET | /api/google/auth-url | – | `{url}` |
| GET | /api/google/callback | `?code&state` | 302 → `/settings?google=connected` |
| POST | /api/google/disconnect | – | `{ok:true}` |

## Public (guest booking)
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET | /api/public/event-types/:slug | – | `PublicEventType` (404 if missing or inactive) |
| GET | /api/public/event-types/:slug/slots | `?from=YYYY-MM-DD&to=YYYY-MM-DD` (≤ 42 days) | `{timezone, slots: Slot[]}` |
| POST | /api/public/event-types/:slug/book | `BookingRequest` | `Booking` (409 if slot no longer free) |

Slot rule: candidate starts every `slotIntervalMin` inside the weekday availability windows (owner tz), slot must fit fully in a window, `start >= now + minNoticeHours`, day `<= today + maxDaysAhead`, and `[start - bufferBefore, end + bufferAfter]` must not overlap any busy interval (Google freebusy over `googleCalendarIds`, ICS feeds, and pending/confirmed bookings).
