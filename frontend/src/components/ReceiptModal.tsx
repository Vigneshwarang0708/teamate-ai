import { useState } from "react";
import { Check, Copy, Download, Printer, X } from "lucide-react";
import { Order } from "../services/api";

type Props = {
  order: Order | null;
  shopName?: string;
  onClose: () => void;
};

export function ReceiptModal({ order, shopName = "Chai Corner", onClose }: Props) {
  const [copied, setCopied] = useState(false);

  if (!order) return null;

  const totalNum = Number(order.total);
  const formattedDate = new Date(order.created_at || Date.now()).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const receiptText = `
=================================
       ${shopName.toUpperCase()}
  TeaMate AI Digital Receipt
=================================
Order No: ${order.order_number || `#TM-${order.id}`}
Date:     ${formattedDate}
Customer: ${order.customer_name || "Walk-in Customer"}
Payment:  ${order.payment_type.toUpperCase()} (${order.payment_status || "completed"})
---------------------------------
ITEMS:
${order.items.map((it) => `${it.product_name.padEnd(16)} x${it.quantity}  ₹${Number(it.subtotal || Number(it.unit_price) * it.quantity).toFixed(0)}`).join("\n")}
---------------------------------
TOTAL AMOUNT:     ₹${totalNum.toFixed(2)}
${order.payment_type === "split" ? `Cash: ₹${Number(order.cash_amount).toFixed(2)} | Credit: ₹${Number(order.credit_amount).toFixed(2)}` : ""}
=================================
    Thank You! Visit Again!
=================================
`.trim();

  const handleCopy = () => {
    navigator.clipboard.writeText(receiptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const blob = new Blob([receiptText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `receipt_${order.order_number || order.id}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-2xl">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-[#927d70] hover:bg-[#f4e8d8] hover:text-[#33251f]"
          title="Close receipt"
        >
          <X size={20} />
        </button>

        {/* Receipt Header */}
        <div className="text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[#e7f2e9] text-[#39734d]">
            <Check size={26} />
          </div>
          <h2 className="mt-3 font-serif text-2xl font-bold text-[#3d2a22]">Bill Receipt</h2>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#ed7d3a]">{shopName}</p>
        </div>

        {/* Thermal Receipt Paper Effect */}
        <div className="mt-5 rounded-2xl border border-dashed border-[#eadfd2] bg-[#fbf8f3] p-5 text-sm">
          <div className="flex justify-between border-b border-[#eadfd2] pb-3 text-xs text-[#927d70]">
            <div>
              <div>Receipt: <b className="text-[#33251f]">{order.order_number || `TM-${order.id}`}</b></div>
              <div>{formattedDate}</div>
            </div>
            <div className="text-right">
              <div>Customer: <b className="text-[#33251f]">{order.customer_name || "Walk-in"}</b></div>
              <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                order.payment_type === "credit" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
              }`}>
                {order.payment_type}
              </span>
            </div>
          </div>

          {/* Items List */}
          <div className="my-4 space-y-2">
            {order.items.map((item, idx) => (
              <div key={idx} className="flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-[#33251f]">{item.product_name}</span>
                  <span className="ml-1 text-[#927d70]">× {item.quantity}</span>
                </div>
                <div className="font-mono font-medium text-[#33251f]">
                  ₹{Number(item.subtotal || Number(item.unit_price) * item.quantity).toFixed(0)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="border-t border-[#eadfd2] pt-3">
            <div className="flex items-center justify-between text-base font-bold text-[#3d2a22]">
              <span>Total Amount</span>
              <span className="font-mono text-lg text-[#ed7d3a]">₹{totalNum.toLocaleString("en-IN")}</span>
            </div>
            {order.payment_type === "split" && (
              <div className="mt-2 flex justify-between text-xs text-[#927d70]">
                <span>Cash: ₹{Number(order.cash_amount).toFixed(0)}</span>
                <span>Credit: ₹{Number(order.credit_amount).toFixed(0)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 grid grid-cols-3 gap-2">
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#eadfd2] bg-[#fffdf9] py-2.5 text-xs font-semibold text-[#633d2c] hover:bg-[#f4e8d8]"
          >
            {copied ? <Check size={14} className="text-[#39734d]" /> : <Copy size={14} />}
            {copied ? "Copied" : "Copy"}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-[#eadfd2] bg-[#fffdf9] py-2.5 text-xs font-semibold text-[#633d2c] hover:bg-[#f4e8d8]"
          >
            <Download size={14} /> Download
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[#633d2c] py-2.5 text-xs font-semibold text-white hover:bg-[#4d2f22]"
          >
            <Printer size={14} /> Print
          </button>
        </div>
      </div>
    </div>
  );
}

