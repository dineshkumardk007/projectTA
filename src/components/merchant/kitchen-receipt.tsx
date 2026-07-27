'use client';

import * as React from 'react';
import type { BoardOrder } from '@/components/merchant/order-board';
import { formatMinor } from '@/lib/domain/money';

export function KitchenReceiptModal({
  order,
  shopName,
  onClose,
}: {
  order: BoardOrder;
  shopName: string;
  onClose: () => void;
}) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 text-black shadow-2xl space-y-4">
        {/* Printable Ticket Area */}
        <div id="thermal-receipt" className="receipt-area font-mono text-xs space-y-2 border border-dashed border-gray-400 p-4 rounded">
          <div className="text-center border-b border-dashed border-gray-400 pb-2">
            <h2 className="text-base font-extrabold uppercase">{shopName}</h2>
            <p className="text-[10px]">Kitchen Order Ticket (KOT)</p>
            <p className="text-xl font-black mt-1">ORDER #{order.code}</p>
            <p className="text-[10px] text-gray-600">{new Date(order.placedAt).toLocaleString('en-IN')}</p>
          </div>

          <div className="border-b border-dashed border-gray-400 py-1.5 space-y-1">
            <p><span className="font-bold">Customer:</span> {order.customerName}</p>
            {order.customerPhone ? <p><span className="font-bold">Phone:</span> {order.customerPhone}</p> : null}
            <p><span className="font-bold">Payment:</span> {order.paymentMethod === 'CASH_ON_PICKUP' ? 'Cash at Counter' : 'Online'}</p>
          </div>

          <div className="py-1 space-y-1">
            <p className="font-bold text-center border-b border-gray-300 pb-1 mb-1">ORDER ITEMS</p>
            {order.isCustomList ? (
              <div className="bg-gray-100 p-2 rounded text-[11px]">
                <p className="font-bold text-gray-800">📝 Custom List:</p>
                <p className="whitespace-pre-wrap">{order.customListText || 'Custom item list'}</p>
              </div>
            ) : (
              order.items.map((item) => (
                <div key={item.id} className="flex justify-between text-xs font-semibold">
                  <span>{item.quantity} x {item.name}</span>
                </div>
              ))
            )}
          </div>

          {order.customerNote ? (
            <div className="border-t border-dashed border-gray-400 pt-1.5">
              <p className="font-bold">Note:</p>
              <p className="italic text-[11px]">{order.customerNote}</p>
            </div>
          ) : null}

          <div className="border-t border-dashed border-gray-400 pt-2 text-right">
            <p className="text-sm font-extrabold">TOTAL: {formatMinor(order.totalMinor)}</p>
          </div>
        </div>

        {/* Modal Controls */}
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 rounded-lg bg-black px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800"
          >
            🖨️ Print Thermal Receipt
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-bold text-gray-700 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
