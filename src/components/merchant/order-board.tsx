'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Footprints, MessageCircle, Phone, Printer, StickyNote, Timer, Volume2, VolumeX } from 'lucide-react';
import type { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import { Badge, Card } from '@/components/ui/primitives';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { EmptyState, OrderCardSkeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { formatMinor } from '@/lib/domain/money';
import { formatClockTime } from '@/lib/domain/prep-time';
import { cn } from '@/lib/cn';
import { playOrderChime } from '@/lib/utils/sound';
import { generateWhatsAppLink } from '@/lib/services/whatsapp';
import { KitchenReceiptModal } from '@/components/merchant/kitchen-receipt';
import { buildKitchenTicket } from '@/lib/domain/escpos';
import {
  connectBluetoothPrinter,
  connectSerialPrinter,
  connectedPrinter,
  disconnectPrinter,
  getAutoPrint,
  getPaperWidth,
  printBytes,
  printerSupport,
  setAutoPrint,
  setPaperWidth,
  type ConnectedPrinter,
} from '@/lib/utils/thermal-printer';

/**
 * The merchant order board.
 *
 * Designed around one number: taps per order. Accept → Start → Ready → Confirm
 * is four taps total, each a full-width 56px button on the card itself, with no
 * navigation and no confirmation dialogs in the happy path. Secondary actions
 * (reject, delay) are deliberately smaller so they are not hit by accident
 * during a rush.
 */

export type BoardOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  placedAt: string;
  estimatedReadyAt: string;
  totalMinor: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  promisedPrepMinutes: number;
  customerEtaMinutes: number | null;
  customerArrivedAt: string | null;
  customerName: string;
  customerPhone: string | null;
  customerNote: string | null;
  amountPaidMinor: number;
  amountDueOnlineMinor: number;
  /** UPI reference the customer submitted, awaiting the shop's confirmation. */
  pendingUpiReference: string | null;
  isCustomList?: boolean;
  customListText?: string | null;
  slipImageUrl?: string | null;
  items: { id: string; name: string; quantity: number; options: { optionName: string }[] }[];
};

export type BoardStats = {
  ordersToday: number;
  orderedValueToday: number;
  completedToday: number;
  salesToday: number;
};

type Tab = 'NEW' | 'PREPARING' | 'READY' | 'COMPLETED';

const TABS: { key: Tab; label: string; statuses: OrderStatus[] }[] = [
  { key: 'NEW', label: 'New', statuses: ['PLACED'] },
  { key: 'PREPARING', label: 'Preparing', statuses: ['ACCEPTED', 'PREPARING'] },
  { key: 'READY', label: 'Ready', statuses: ['READY'] },
  { key: 'COMPLETED', label: 'Completed', statuses: ['PICKED_UP', 'REJECTED', 'CANCELLED', 'EXPIRED'] },
];

export function OrderBoard({ shopId, shopName }: { shopId: string; shopName: string }) {
  const [orders, setOrders] = React.useState<BoardOrder[] | null>(null);
  const [stats, setStats] = React.useState<BoardStats | null>(null);
  const [tab, setTab] = React.useState<Tab>('NEW');
  const [busyOrderId, setBusyOrderId] = React.useState<string | null>(null);
  const [rejecting, setRejecting] = React.useState<BoardOrder | null>(null);
  const [delaying, setDelaying] = React.useState<BoardOrder | null>(null);
  const [printingOrder, setPrintingOrder] = React.useState<BoardOrder | null>(null);
  const [printer, setPrinter] = React.useState<ConnectedPrinter | null>(null);
  const [autoPrint, setAutoPrintState] = React.useState(false);
  const [soundEnabled, setSoundEnabled] = React.useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('takeaway_merchant_sound') !== 'false';
  });
  const { toast } = useToast();
  const router = useRouter();

  const previousNewCount = React.useRef<number | null>(null);
  const soundEnabledRef = React.useRef<boolean>(soundEnabled);

  // Restored on mount rather than in a `useState` initialiser: `localStorage`
  // does not exist during the server render.
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAutoPrintState(getAutoPrint());
    setPrinter(connectedPrinter());
  }, []);

  /**
   * Prints one order's kitchen slip.
   *
   * Returns whether it printed. Callers use that to decide between staying quiet
   * and opening the on-screen preview — a failed print during a rush must not
   * leave the kitchen with nothing.
   */
  const printTicket = React.useCallback(
    async (order: BoardOrder, { silent = false }: { silent?: boolean } = {}) => {
      if (!connectedPrinter()) {
        if (!silent) toast('No printer connected. Use "Connect printer" first.', 'error');
        return false;
      }

      try {
        await printBytes(
          buildKitchenTicket({
            shopName,
            orderCode: order.code,
            placedAt: new Date(order.placedAt),
            customerName: order.customerName,
            customerPhone: order.customerPhone,
            paymentLabel:
              order.paymentMethod === 'CASH_ON_PICKUP' ? 'Cash at counter' : 'Paid / paying online',
            totalLabel: formatMinor(order.totalMinor),
            items: order.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              note: item.options.map((option) => option.optionName).join(', ') || undefined,
            })),
            customListText: order.customListText,
            customerNote: order.customerNote,
            columns: getPaperWidth(),
          }),
        );
        if (!silent) toast(`Kitchen slip printed for ${order.code}`);
        return true;
      } catch (error) {
        toast(error instanceof Error ? error.message : 'The slip could not be printed.', 'error');
        // A dead handle stays dead until it is paired again; clearing it stops
        // every later order failing the same way in silence.
        setPrinter(connectedPrinter());
        return false;
      }
    },
    [shopName, toast],
  );

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEnabledRef.current = next;
    localStorage.setItem('takeaway_merchant_sound', String(next));
    if (next) {
      playOrderChime();
      toast('Sound alerts enabled', 'info');
    } else {
      toast('Sound alerts muted', 'info');
    }
  };

  const load = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/merchant/shops/${shopId}/board`, { cache: 'no-store' });
      if (!response.ok) return;
      const data = (await response.json()) as { orders: BoardOrder[]; stats: BoardStats };
      setOrders(data.orders);
      setStats(data.stats);

      // Announce genuinely new orders, but not on the first load.
      const newCount = data.orders.filter((o) => o.status === 'PLACED').length;
      if (previousNewCount.current != null && newCount > previousNewCount.current) {
        toast(`${newCount - previousNewCount.current} new order(s) received`, 'info');
        if (soundEnabledRef.current) {
          playOrderChime();
        }
      }
      previousNewCount.current = newCount;
    } catch {
      // Transient network failure — the next poll will recover.
    }
  }, [shopId, toast]);

  React.useEffect(() => {
    // Subscribing to an external system (the order API) and polling it — the
    // documented use for an effect. `load` is async, so its setState calls
    // happen in a later microtask, not synchronously in the effect body; the
    // lint rule cannot see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    let timer: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (!timer) {
        timer = setInterval(() => {
          if (document.visibilityState === 'visible') {
            void load();
          }
        }, 6000);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [load]);

  async function transition(order: BoardOrder, to: OrderStatus, note?: string, finalTotalMinor?: number) {
    setBusyOrderId(order.id);
    try {
      const response = await fetch(`/api/merchant/orders/${order.id}/transition`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to, note, finalTotalMinor }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast(data.error ?? 'That change could not be applied.', 'error');
        void load();
        return;
      }

      const messages: Partial<Record<OrderStatus, string>> = {
        ACCEPTED: `Order ${order.code} accepted`,
        PREPARING: `Preparing order ${order.code}`,
        READY: `Order ${order.code} marked ready — the customer has been notified`,
        PICKED_UP: `Order ${order.code} collected`,
        REJECTED: `Order ${order.code} rejected`,
      };
      toast(messages[to] ?? 'Order updated');

      // Accepting is the moment the kitchen needs the slip — before the food is
      // started, not after. Silent because the merchant just tapped Accept and
      // does not need a second confirmation for something that worked.
      if (to === 'ACCEPTED' && getAutoPrint()) {
        void printTicket(order, { silent: true });
      }

      // READY is the one status a customer is actively waiting on, so this is
      // where the WhatsApp message is worth the tap. It opens a pre-filled chat
      // rather than sending by itself: WhatsApp will not let a web app send on
      // someone's behalf, and pretending otherwise would mean promising the
      // merchant a message that never left.
      if (to === 'READY' && order.customerPhone) {
        window.open(
          generateWhatsAppLink({
            phone: order.customerPhone,
            customerName: order.customerName,
            orderCode: order.code,
            shopName,
            status: 'READY',
            totalMinor: order.totalMinor,
            trackingUrl: `${window.location.origin}/orders/${order.id}`,
          }),
          '_blank',
          'noopener,noreferrer',
        );
      }

      await load();
      router.refresh();
    } catch {
      toast('We could not reach the server.', 'error');
    } finally {
      setBusyOrderId(null);
    }
  }

  /**
   * Records the shop's own check of a UPI payment. Nothing else can establish
   * this — the money moved directly between two banks.
   */
  async function confirmPayment(order: BoardOrder, received: boolean) {
    setBusyOrderId(order.id);
    try {
      const response = await fetch(`/api/merchant/orders/${order.id}/confirm-payment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ received }),
      });
      const data = (await response.json()) as { error?: string; balanceMinor?: number };

      if (!response.ok) {
        toast(data.error ?? 'We could not record that.', 'error');
        return;
      }

      toast(
        received
          ? data.balanceMinor && data.balanceMinor > 0
            ? `Payment confirmed · collect ${formatMinor(data.balanceMinor)} at pickup`
            : `Payment confirmed for ${order.code}`
          : `Marked as not received — the customer has been told`,
      );

      await load();
      router.refresh();
    } catch {
      toast('We could not reach the server.', 'error');
    } finally {
      setBusyOrderId(null);
    }
  }

  async function delay(order: BoardOrder, extraMinutes: number) {
    setBusyOrderId(order.id);
    try {
      const response = await fetch(`/api/merchant/orders/${order.id}/delay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ extraMinutes }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        toast(data.error ?? 'We could not update the time.', 'error');
        return;
      }
      toast(`Customer told about a ${extraMinutes} min delay`);
      setDelaying(null);
      await load();
    } finally {
      setBusyOrderId(null);
    }
  }

  if (orders === null) {
    return (
      <div className="space-y-3">
        <OrderCardSkeleton />
        <OrderCardSkeleton />
      </div>
    );
  }

  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, orders.filter((o) => t.statuses.includes(o.status)).length]),
  ) as Record<Tab, number>;

  const visible = orders.filter((o) => TABS.find((t) => t.key === tab)!.statuses.includes(o.status));

  return (
    <div className="space-y-4">
      {stats ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Orders today" value={String(stats.ordersToday)} />
          <StatTile label="In the kitchen" value={String(counts.NEW + counts.PREPARING)} />
          <StatTile label="Waiting for pickup" value={String(counts.READY)} tone={counts.READY > 0 ? 'success' : undefined} />
          <StatTile label="Sales today" value={formatMinor(stats.salesToday)} />
        </dl>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Order stages" className="scroll-rail -mx-4 px-4 flex-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'flex items-center gap-2 rounded-[var(--radius-pill)] border px-4 py-2.5 text-sm font-bold transition-colors',
                tab === t.key
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-border bg-surface text-muted hover:text-foreground',
              )}
            >
              {t.label}
              <span
                className={cn(
                  'rounded-full px-1.5 text-xs',
                  tab === t.key ? 'bg-white/25' : 'bg-surface-muted',
                  t.key === 'NEW' && counts.NEW > 0 && tab !== 'NEW' && 'bg-brand-500 text-white',
                )}
              >
                {counts[t.key]}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={toggleSound}
          title={soundEnabled ? 'Mute kitchen order chime' : 'Enable kitchen order chime'}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-[var(--radius-pill)] border px-3 py-2.5 text-xs font-semibold transition-colors',
            soundEnabled
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'border-border bg-surface text-muted hover:text-foreground',
          )}
        >
          {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          <span className="hidden sm:inline">{soundEnabled ? 'Sound On' : 'Muted'}</span>
        </button>
      </div>

      <PrinterBar
        printer={printer}
        autoPrint={autoPrint}
        onConnected={(connected) => setPrinter(connected)}
        onAutoPrintChange={(enabled) => {
          setAutoPrint(enabled);
          setAutoPrintState(enabled);
        }}
      />

      {visible.length === 0 ? (
        <EmptyState
          title={
            tab === 'NEW'
              ? 'No new orders right now'
              : tab === 'PREPARING'
                ? 'Nothing being prepared'
                : tab === 'READY'
                  ? 'Nothing waiting for pickup'
                  : 'No completed orders yet today'
          }
          description={tab === 'NEW' ? 'New pre-orders appear here the moment a customer places one.' : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              shopName={shopName}
              busy={busyOrderId === order.id}
              onTransition={(to) => transition(order, to)}
              onReject={() => setRejecting(order)}
              onDelay={() => setDelaying(order)}
              onPrint={() => setPrintingOrder(order)}
              onConfirmPayment={(received) => confirmPayment(order, received)}
            />
          ))}
        </div>
      )}

      {rejecting ? (
        <RejectSheet
          order={rejecting}
          busy={busyOrderId === rejecting.id}
          onClose={() => setRejecting(null)}
          onConfirm={async (reason) => {
            await transition(rejecting, 'REJECTED', reason);
            setRejecting(null);
          }}
        />
      ) : null}

      {delaying ? (
        <DelaySheet
          order={delaying}
          busy={busyOrderId === delaying.id}
          onClose={() => setDelaying(null)}
          onConfirm={(minutes) => delay(delaying, minutes)}
        />
      ) : null}

      {printingOrder ? (
        <KitchenReceiptModal
          order={printingOrder}
          shopName={shopName}
          hasThermalPrinter={printer != null}
          onThermalPrint={() => printTicket(printingOrder)}
          onClose={() => setPrintingOrder(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * Thermal printer controls.
 *
 * Pairing has to happen inside a click — both Web Serial and Web Bluetooth
 * refuse otherwise — so this is a button rather than something that reconnects
 * on load. The bar hides itself entirely on browsers that support neither,
 * because a permanently broken button on the busiest screen in the app is worse
 * than no button.
 */
function PrinterBar({
  printer,
  autoPrint,
  onConnected,
  onAutoPrintChange,
}: {
  printer: ConnectedPrinter | null;
  autoPrint: boolean;
  onConnected: (printer: ConnectedPrinter | null) => void;
  onAutoPrintChange: (enabled: boolean) => void;
}) {
  const { toast } = useToast();
  const [support, setSupport] = React.useState({ serial: false, bluetooth: false });
  const [connecting, setConnecting] = React.useState(false);
  const [columns, setColumns] = React.useState<32 | 48>(32);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupport(printerSupport());
    setColumns(getPaperWidth());
  }, []);

  if (!support.serial && !support.bluetooth) return null;

  async function connect(kind: 'serial' | 'bluetooth') {
    setConnecting(true);
    try {
      const connected = kind === 'serial' ? await connectSerialPrinter() : await connectBluetoothPrinter();
      onConnected(connected);
      toast(`${connected.label} connected`);
    } catch (error) {
      // A cancelled chooser is the most common outcome and is not a failure.
      const message = error instanceof Error ? error.message : 'Could not connect to that printer.';
      if (!/cancel|no device|not selected/i.test(message)) toast(message, 'error');
    } finally {
      setConnecting(false);
    }
  }

  return (
    <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
      <span className="flex items-center gap-2 text-sm font-semibold">
        <Printer aria-hidden className="size-4 text-muted" />
        {printer ? printer.label : 'No thermal printer'}
      </span>

      {printer ? (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoPrint}
              onChange={(event) => onAutoPrintChange(event.target.checked)}
              className="size-4 accent-[var(--color-brand-500)]"
            />
            Print a slip when I accept an order
          </label>

          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-muted">Paper</span>
            <select
              value={String(columns)}
              onChange={(event) => {
                const next = Number(event.target.value) === 48 ? 48 : 32;
                setColumns(next);
                setPaperWidth(next);
              }}
              className="h-8 rounded-[var(--radius-field)] border border-border bg-surface px-2 text-sm"
            >
              <option value="32">58 mm</option>
              <option value="48">80 mm</option>
            </select>
          </label>

          <Button
            size="sm"
            variant="ghost"
            className="ml-auto text-muted"
            onClick={async () => {
              await disconnectPrinter();
              onConnected(null);
            }}
          >
            Disconnect
          </Button>
        </>
      ) : (
        <div className="ml-auto flex flex-wrap gap-2">
          {support.serial ? (
            <Button size="sm" variant="outline" loading={connecting} onClick={() => connect('serial')}>
              Connect USB printer
            </Button>
          ) : null}
          {support.bluetooth ? (
            <Button size="sm" variant="outline" loading={connecting} onClick={() => connect('bluetooth')}>
              Connect Bluetooth printer
            </Button>
          ) : null}
        </div>
      )}
    </Card>
  );
}

function StatTile({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <Card className={cn('p-3', tone === 'success' && 'bg-success-50 dark:bg-success-500/10')}>
      <dt className="text-xs font-medium text-muted">{label}</dt>
      <dd className="mt-0.5 text-xl font-extrabold tabular-nums">{value}</dd>
    </Card>
  );
}

/** What the counter needs to know about money at a glance. */
function PaymentBadge({ order }: { order: BoardOrder }) {
  if (order.paymentStatus === 'PAID') return <Badge tone="success">Paid</Badge>;
  if (order.paymentStatus === 'AWAITING_VERIFICATION') return <Badge tone="warning">Check payment</Badge>;
  if (order.paymentStatus === 'PARTIALLY_PAID') {
    const balance = Math.max(0, order.totalMinor - order.amountPaidMinor);
    return <Badge tone="info">Collect {formatMinor(balance)}</Badge>;
  }
  if (order.paymentMethod === 'CASH_ON_PICKUP') return <Badge tone="neutral">Cash at counter</Badge>;
  return <Badge tone="warning">Awaiting payment</Badge>;
}

/**
 * UPI confirmation.
 *
 * A UPI deep link gives no callback, so the platform genuinely cannot tell
 * whether money arrived — only the shop can, by looking at their own app. This
 * is that check, made explicit rather than guessed at.
 */
function UpiConfirmation({
  order,
  busy,
  onConfirm,
}: {
  order: BoardOrder;
  busy: boolean;
  onConfirm: (received: boolean) => void;
}) {
  if (order.paymentStatus !== 'AWAITING_VERIFICATION') return null;

  const outstanding = Math.max(0, order.amountDueOnlineMinor - order.amountPaidMinor);

  return (
    <div className="mt-3 rounded-[var(--radius-field)] bg-warning-50 p-3 dark:bg-warning-500/10">
      <p className="text-sm font-bold text-warning-700 dark:text-warning-100">
        Customer says they paid {formatMinor(outstanding)}
      </p>
      {order.pendingUpiReference ? (
        <p className="mt-0.5 font-mono text-sm tracking-wide text-warning-700 dark:text-warning-100">
          Ref {order.pendingUpiReference}
        </p>
      ) : null}
      <p className="mt-1 text-xs text-warning-700/90 dark:text-warning-100/90">
        Check your UPI app before accepting. We cannot see your bank account.
      </p>

      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="success" className="flex-1" loading={busy} onClick={() => onConfirm(true)}>
          Payment received
        </Button>
        <Button size="sm" variant="outline" className="flex-1" loading={busy} onClick={() => onConfirm(false)}>
          Not received
        </Button>
      </div>
    </div>
  );
}

const NEXT_ACTION: Partial<Record<OrderStatus, { to: OrderStatus; label: string; variant: 'primary' | 'success' }>> = {
  PLACED: { to: 'ACCEPTED', label: 'Accept order', variant: 'primary' },
  ACCEPTED: { to: 'PREPARING', label: 'Start preparing', variant: 'primary' },
  PREPARING: { to: 'READY', label: 'Mark ready', variant: 'success' },
  READY: { to: 'PICKED_UP', label: 'Confirm pickup', variant: 'success' },
};

function OrderCard({
  order,
  shopName,
  busy,
  onTransition,
  onReject,
  onDelay,
  onPrint,
  onConfirmPayment,
}: {
  order: BoardOrder;
  shopName: string;
  busy: boolean;
  onTransition: (to: OrderStatus) => void;
  onReject: () => void;
  onDelay: () => void;
  onPrint: () => void;
  onConfirmPayment: (received: boolean) => void;
}) {
  const action = NEXT_ACTION[order.status];
  const closed = ['PICKED_UP', 'REJECTED', 'CANCELLED', 'EXPIRED'].includes(order.status);

  // Read on the client only: `window` does not exist during the server render,
  // and an absolute URL is what makes the WhatsApp link tappable on a phone.
  const [origin, setOrigin] = React.useState('');
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  // "Placed N minutes ago" is intentionally read from the wall clock at render
  // time: the board re-renders on every 6-second poll, so the figure stays live
  // without a second timer. The instability the purity rule warns about is the
  // desired behaviour here, and nothing downstream depends on it being stable.
  // eslint-disable-next-line react-hooks/purity
  const waitingMinutes = Math.max(0, Math.round((Date.now() - new Date(order.placedAt).getTime()) / 60_000));

  return (
    <Card as="article" className={cn('p-4', order.status === 'READY' && 'border-success-500/40')}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold leading-none">{order.code}</h3>
          <p className="mt-1.5 text-xs text-muted">
            {order.customerName} · placed {waitingMinutes} min ago
          </p>
        </div>
        <div className="text-right">
          <p className="font-extrabold">{formatMinor(order.totalMinor)}</p>
          <PaymentBadge order={order} />
        </div>
      </div>

      {order.isCustomList ? (
        <div className="mt-3 rounded-lg border border-brand-500/30 bg-brand-500/10 p-3">
          <Badge tone="brand" className="mb-2">📝 Custom Grocery List Order</Badge>
          {order.customListText ? (
            <p className="whitespace-pre-wrap text-sm font-medium text-foreground">{order.customListText}</p>
          ) : null}
          {order.slipImageUrl ? (
            <a
              href={order.slipImageUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-flex items-center text-xs font-semibold text-brand-600 underline"
            >
              📷 View Uploaded Grocery Slip Photo
            </a>
          ) : null}
        </div>
      ) : (
        <ul className="mt-3 space-y-1.5">
          {order.items.map((item) => (
            <li key={item.id} className="flex gap-2.5 text-[15px]">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-muted text-xs font-bold">
                {item.quantity}
              </span>
              <span className="min-w-0">
                <span className="font-semibold">{item.name}</span>
                {item.options.length > 0 ? (
                  <span className="block text-xs text-muted">{item.options.map((o) => o.optionName).join(', ')}</span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}

      {order.customerNote ? (
        <p className="mt-3 flex gap-2 rounded-[var(--radius-field)] bg-warning-50 px-3 py-2 text-sm dark:bg-warning-500/10">
          <StickyNote aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-600" />
          <span>{order.customerNote}</span>
        </p>
      ) : null}

      <UpiConfirmation order={order} busy={busy} onConfirm={onConfirmPayment} />

      {/* On a part payment the counter must remember to take the rest. */}
      {order.paymentStatus === 'PARTIALLY_PAID' && !closed ? (
        <p className="mt-3 rounded-[var(--radius-field)] bg-info-50 px-3 py-2 text-sm font-bold text-info-700 dark:bg-info-500/10 dark:text-info-100">
          Deposit {formatMinor(order.amountPaidMinor)} received · collect{' '}
          {formatMinor(Math.max(0, order.totalMinor - order.amountPaidMinor))} at pickup
        </p>
      ) : null}

      {!closed ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <Clock aria-hidden className="size-3.5" />
            Ready by {formatClockTime(new Date(order.estimatedReadyAt))}
          </span>
          <span className="flex items-center gap-1.5">
            <Timer aria-hidden className="size-3.5" />
            {order.promisedPrepMinutes} min promised
          </span>
          {order.customerArrivedAt ? (
            <span className="flex items-center gap-1.5 font-bold text-success-700 dark:text-success-300">
              <Footprints aria-hidden className="size-3.5" />
              Customer is here
            </span>
          ) : order.customerEtaMinutes != null ? (
            <span className="flex items-center gap-1.5 font-semibold text-foreground">
              <Footprints aria-hidden className="size-3.5" />
              Customer ~{order.customerEtaMinutes} min away
            </span>
          ) : null}
          {order.customerPhone ? (
            <>
              <a href={`tel:${order.customerPhone}`} className="flex items-center gap-1.5 font-semibold text-brand-600">
                <Phone aria-hidden className="size-3.5" />
                Call
              </a>
              {['ACCEPTED', 'PREPARING', 'READY'].includes(order.status) ? (
                <a
                  href={generateWhatsAppLink({
                    phone: order.customerPhone,
                    customerName: order.customerName,
                    orderCode: order.code,
                    shopName,
                    status: order.status as 'ACCEPTED' | 'PREPARING' | 'READY',
                    totalMinor: order.totalMinor,
                    // Only worth sending once the order is actually collectable.
                    trackingUrl: order.status === 'READY' ? `${origin}/orders/${order.id}` : undefined,
                  })}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400"
                >
                  <MessageCircle aria-hidden className="size-3.5" />
                  WhatsApp Alert
                </a>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            onClick={onPrint}
            className="flex items-center gap-1.5 font-bold text-muted hover:text-foreground ml-auto"
          >
            <Printer aria-hidden className="size-3.5" />
            Print Ticket
          </button>
        </div>
      ) : null}

      {action ? (
        <div className="mt-4 space-y-2">
          <Button
            size="action"
            variant={action.variant}
            loading={busy}
            onClick={() => onTransition(action.to)}
          >
            {action.label}
          </Button>

          <div className="flex gap-2">
            {order.status === 'PLACED' ? (
              <Button variant="ghost" size="sm" className="flex-1 text-danger-600" onClick={onReject}>
                Reject
              </Button>
            ) : null}
            {['ACCEPTED', 'PREPARING'].includes(order.status) ? (
              <Button variant="ghost" size="sm" className="flex-1" onClick={onDelay}>
                Running late
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm font-semibold text-muted">
          {order.status === 'PICKED_UP' ? 'Collected' : order.status.toLowerCase()}
        </p>
      )}
    </Card>
  );
}

const REJECT_REASONS = [
  'We have run out of these items',
  'We are closing shortly',
  'Too busy to take more orders',
  'The kitchen is closed right now',
];

function RejectSheet({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: BoardOrder;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState(REJECT_REASONS[0]);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Reject order ${order.code}?`}
      description="The customer is told immediately and any payment is refunded."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Keep order
          </Button>
          <Button variant="danger" className="flex-1" loading={busy} onClick={() => onConfirm(reason)}>
            Reject order
          </Button>
        </div>
      }
    >
      <fieldset className="space-y-2">
        <legend className="mb-2 font-bold">Why?</legend>
        {REJECT_REASONS.map((option) => (
          <label
            key={option}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-[var(--radius-field)] border p-3 text-sm',
              reason === option ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/30' : 'border-border',
            )}
          >
            <input
              type="radio"
              name="reason"
              checked={reason === option}
              onChange={() => setReason(option)}
              className="size-4 accent-brand-500"
            />
            {option}
          </label>
        ))}
      </fieldset>
    </BottomSheet>
  );
}

function DelaySheet({
  order,
  busy,
  onClose,
  onConfirm,
}: {
  order: BoardOrder;
  busy: boolean;
  onClose: () => void;
  onConfirm: (minutes: number) => void;
}) {
  const [minutes, setMinutes] = React.useState(10);

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={`Order ${order.code} is running late`}
      description="Being honest about a delay keeps customers — a silent overrun does not."
      footer={
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" loading={busy} onClick={() => onConfirm(minutes)}>
            Tell the customer
          </Button>
        </div>
      }
    >
      <p className="mb-3 text-sm text-muted">How much longer will it take?</p>
      <div className="grid grid-cols-4 gap-2">
        {[5, 10, 15, 20].map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMinutes(option)}
            aria-pressed={minutes === option}
            className={cn(
              'rounded-[var(--radius-field)] border py-3 text-sm font-bold transition-colors',
              minutes === option ? 'border-brand-500 bg-brand-500 text-white' : 'border-border bg-surface',
            )}
          >
            +{option} min
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
