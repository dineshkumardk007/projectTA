import type { Metadata } from 'next';
import { AnalyticsDashboard } from '@/components/merchant/analytics-dashboard';

export const metadata: Metadata = { title: 'Store Analytics' };

type Params = Promise<{ id: string }>;

export default async function AnalyticsPage({ params }: { params: Params }) {
  const { id } = await params;
  return <AnalyticsDashboard shopId={id} />;
}
