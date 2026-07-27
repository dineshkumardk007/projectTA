'use client';

import * as React from 'react';
import { BarChart3, Clock, DollarSign, ShoppingBag, Trophy } from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { formatMinor } from '@/lib/domain/money';

export type AnalyticsData = {
  shop: { id: string; name: string };
  today: { salesMinor: number; ordersCount: number; waitMinutesSaved: number };
  week: { salesMinor: number; completedCount: number };
  month: { salesMinor: number; completedCount: number };
  hourlyPeak: { hour: string; count: number }[];
  topProducts: { name: string; quantity: number; revenueMinor: number }[];
};

export function AnalyticsDashboard({ shopId }: { shopId: string }) {
  const [data, setData] = React.useState<AnalyticsData | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    async function fetchAnalytics() {
      try {
        const response = await fetch(`/api/merchant/shops/${shopId}/analytics`);
        if (response.ok) {
          const json = await response.json();
          setData(json);
        }
      } catch {
        // Handle error gracefully
      } finally {
        setLoading(false);
      }
    }
    void fetchAnalytics();
  }, [shopId]);

  if (loading) {
    return (
      <div className="space-y-4 p-4 animate-pulse">
        <div className="h-24 bg-surface-muted rounded-xl"></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="h-28 bg-surface-muted rounded-xl"></div>
          <div className="h-28 bg-surface-muted rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxHourlyCount = Math.max(...data.hourlyPeak.map((h) => h.count), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-black">📊 Store Performance & Revenue Analytics</h1>
        <p className="text-xs text-muted">Real-time metrics for {data.shop.name}</p>
      </div>

      {/* Revenue & Sales Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-3.5 border-brand-500/20 bg-brand-500/5">
          <div className="flex items-center gap-2 text-brand-600 mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-bold uppercase">Today Sales</span>
          </div>
          <p className="text-lg font-black">{formatMinor(data.today.salesMinor)}</p>
          <span className="text-[11px] text-muted">{data.today.ordersCount} total orders</span>
        </Card>

        <Card className="p-3.5 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center gap-2 text-emerald-600 mb-1">
            <ShoppingBag className="h-4 w-4" />
            <span className="text-xs font-bold uppercase">This Week</span>
          </div>
          <p className="text-lg font-black">{formatMinor(data.week.salesMinor)}</p>
          <span className="text-[11px] text-muted">{data.week.completedCount} collected</span>
        </Card>

        <Card className="p-3.5 border-indigo-500/20 bg-indigo-500/5">
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <BarChart3 className="h-4 w-4" />
            <span className="text-xs font-bold uppercase">This Month</span>
          </div>
          <p className="text-lg font-black">{formatMinor(data.month.salesMinor)}</p>
          <span className="text-[11px] text-muted">{data.month.completedCount} collected</span>
        </Card>

        <Card className="p-3.5 border-amber-500/20 bg-amber-500/5">
          <div className="flex items-center gap-2 text-amber-600 mb-1">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-bold uppercase">Wait Saved</span>
          </div>
          <p className="text-lg font-black">{data.today.waitMinutesSaved} mins</p>
          <span className="text-[11px] text-muted">Customer queue time saved</span>
        </Card>
      </div>

      {/* Peak Rush Hours Chart */}
      <Card className="p-4">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-brand-600" />
          Peak Rush Order Volume (Hourly 6 AM - 10 PM)
        </h2>
        <div className="flex items-end gap-1.5 h-36 pt-4 border-b border-border">
          {data.hourlyPeak.map((h) => {
            const heightPercent = Math.round((h.count / maxHourlyCount) * 100);
            return (
              <div key={h.hour} className="flex-1 flex flex-col items-center gap-1 group">
                <span className="text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                  {h.count}
                </span>
                <div
                  className="w-full bg-brand-500/80 rounded-t-sm transition-all group-hover:bg-brand-600"
                  style={{ height: `${Math.max(heightPercent, 4)}%` }}
                ></div>
                <span className="text-[9px] text-muted rotate-45 sm:rotate-0 mt-1">{h.hour.split(':')[0]}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Bestselling Products */}
      <Card className="p-4">
        <h2 className="text-sm font-bold flex items-center gap-2 mb-3">
          <Trophy className="h-4 w-4 text-amber-500" />
          Top 5 Bestselling Products
        </h2>
        {data.topProducts.length === 0 ? (
          <p className="text-xs text-muted py-3">No sales data recorded yet today.</p>
        ) : (
          <div className="space-y-2 divide-y divide-border">
            {data.topProducts.map((p, idx) => (
              <div key={p.name} className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/10 text-xs font-black text-brand-600">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-bold">{p.name}</span>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold block">{p.quantity} sold</span>
                  <span className="text-[11px] text-muted">{formatMinor(p.revenueMinor)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
