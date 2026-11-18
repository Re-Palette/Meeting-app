import { useState } from 'react';
import type { Booking } from '../../shared/types';
import { BookingDrawer } from '../components/BookingDrawer';
import { PagesTable } from '../components/dashboard/PagesTable';
import { Requests } from '../components/dashboard/Requests';
import { StatCards } from '../components/dashboard/StatCards';
import { UpcomingMeetings } from '../components/dashboard/UpcomingMeetings';
import { WeekSchedule } from '../components/dashboard/WeekSchedule';
import { ErrorState } from '../components/EmptyState';
import { TopBar } from '../components/TopBar';
import { api } from '../lib/api';
import { useApp } from '../lib/appContext';
import { useAsync } from '../lib/useAsync';
import { givenName, greeting } from '../lib/time';

export default function Dashboard() {
  const { ownerName } = useApp();
  const { data, error, reload } = useAsync(() => api.dashboard(), [], 'dashboard');
  const [open, setOpen] = useState<Booking | null>(null);
  const [weekKey, setWeekKey] = useState(0);
  const name = givenName(data?.ownerName || ownerName || '');

  return (
    <>
      <TopBar title={`${greeting()}${name ? `、${name}さん` : ''}`} subtitle="今日も、素敵な一日を。" />
      {error ? (
        <div className="card">
          <ErrorState error={error} onRetry={reload} />
        </div>
      ) : (
        <div className="dash">
          <StatCards stats={data?.stats} />
          <div className="dash__row dash__row--mid">
            <UpcomingMeetings items={data?.upcoming} onOpen={setOpen} />
            <WeekSchedule refreshKey={weekKey} />
          </div>
          <div className="dash__row dash__row--bottom">
            <PagesTable items={data?.eventTypes} />
            <Requests items={data?.pending} onOpen={setOpen} />
          </div>
        </div>
      )}
      <BookingDrawer booking={open} onClose={() => setOpen(null)} onChanged={() => {
          reload();
          setWeekKey((k) => k + 1);
        }} />
    </>
  );
}
