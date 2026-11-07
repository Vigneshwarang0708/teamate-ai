import { useEffect, useState } from "react";
import {
  BarChart3,
  CircleDollarSign,
  CreditCard,
  PieChart,
  Receipt,
  TrendingUp,
  Users,
} from "lucide-react";
import { Analytics, fetchAnalytics } from "../services/api";

type Props = {
  refreshTrigger: number;
};

const formatMoney = (val: string | number) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function AnalyticsPage({ refreshTrigger }: Props) {
  const [period, setPeriod] = useState<"today" | "weekly" | "monthly">("weekly");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchAnalytics(period)
      .then((res) => setAnalytics(res.data))
      .catch((err) => {
        console.error("Analytics fetch error:", err);
        setError("Could not load analytics records.");
      })
      .finally(() => setLoading(false));
  }, [period, refreshTrigger]);

  const totalSalesNum = Number(analytics?.total_sales || 0);
  const cashNum = Number(analytics?.cash_collected || 0);
  const creditNum = Number(analytics?.credit_sales || 0);
  const totalCombined = cashNum + creditNum;

  const cashPct = totalCombined > 0 ? Math.round((cashNum / totalCombined) * 100) : 100;
  const creditPct = totalCombined > 0 ? 100 - cashPct : 0;

  // Find max sales point for chart scaling
  const maxDaySales = Math.max(
    1,
    ...(analytics?.sales_trend?.map((p) => Number(p.sales)) || [1])
  );

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#3d2a22]">
            Sales & Credit Analytics
          </h1>
          <p className="mt-1 text-sm text-[#927d70]">
            Financial performance, debtor analysis, and volume trends computed from real database logs.
          </p>
        </div>

        {/* Date Filter Tabs */}
        <div className="flex gap-1.5 rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-1.5 shadow-sm">
          {(
            [
              { id: "today", label: "Today" },
              { id: "weekly", label: "Last 7 Days" },
              { id: "monthly", label: "Last 30 Days" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setPeriod(tab.id)}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
                period === tab.id
                  ? "bg-[#633d2c] text-white shadow-sm"
                  : "text-[#927d70] hover:bg-[#fbf4eb]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="mb-6 rounded-2xl bg-red-50 p-4 text-xs text-red-700">{error}</div>}

      {/* High-Level Overview Metric Cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#fff0e5] text-[#ed7d3a]">
            <TrendingUp size={18} />
          </div>
          <div className="font-mono text-2xl font-bold text-[#3d2a22]">
            {formatMoney(analytics?.total_sales ?? 0)}
          </div>
          <div className="mt-1 text-xs text-[#927d70]">Total Revenue</div>
        </div>

        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#e7f2e9] text-[#39734d]">
            <CircleDollarSign size={18} />
          </div>
          <div className="font-mono text-2xl font-bold text-[#3d2a22]">
            {formatMoney(analytics?.cash_collected ?? 0)}
          </div>
          <div className="mt-1 text-xs text-[#927d70]">Cash Collected</div>
        </div>

        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#fdf3e7] text-[#d97706]">
            <CreditCard size={18} />
          </div>
          <div className="font-mono text-2xl font-bold text-[#3d2a22]">
            {formatMoney(analytics?.credit_sales ?? 0)}
          </div>
          <div className="mt-1 text-xs text-[#927d70]">Credit Sales</div>
        </div>

        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4e8d8] text-[#633d2c]">
            <Receipt size={18} />
          </div>
          <div className="font-mono text-2xl font-bold text-[#3d2a22]">
            {analytics?.total_orders ?? 0}
          </div>
          <div className="mt-1 text-xs text-[#927d70]">Total Transactions</div>
        </div>

        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm">
          <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4e8d8] text-[#633d2c]">
            <BarChart3 size={18} />
          </div>
          <div className="font-mono text-2xl font-bold text-[#3d2a22]">
            {formatMoney(analytics?.average_order_value ?? 0)}
          </div>
          <div className="mt-1 text-xs text-[#927d70]">Avg Ticket Size</div>
        </div>
      </section>

      {/* Middle Section: Visual Bar Chart & Cash vs Credit Proportion */}
      <div className="mt-7 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* Daily Sales Trend Chart */}
        <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#3d2a22]">Daily Sales Trend</h2>
              <p className="mt-0.5 text-xs text-[#927d70]">Revenue and volume per calendar day</p>
            </div>
            <span className="rounded-lg bg-[#f4e8d8] px-2.5 py-1 text-[11px] font-bold text-[#633d2c]">
              {period === "today" ? "24 Hours" : period === "weekly" ? "7 Days" : "30 Days"}
            </span>
          </div>

          {/* Interactive CSS / SVG Bar Chart */}
          <div className="h-56 flex items-end gap-2 pt-6 pb-2 border-b border-[#eadfd2]">
            {(analytics?.sales_trend || []).map((pt, i) => {
              const val = Number(pt.sales);
              const heightPct = Math.max(8, Math.round((val / maxDaySales) * 100));
              return (
                <div key={i} className="flex-1 flex flex-col items-center h-full justify-end group">
                  <div className="opacity-0 group-hover:opacity-100 transition text-[10px] font-mono font-bold text-[#ed7d3a] mb-1">
                    ₹{val}
                  </div>
                  <div
                    className="w-full max-w-[32px] rounded-t-lg bg-[#ed7d3a] group-hover:bg-[#d9692b] transition-all"
                    style={{ height: `${heightPct}%` }}
                    title={`${pt.date}: ₹${val} (${pt.orders_count} orders)`}
                  />
                  <span className="mt-2 text-[10px] text-[#927d70] truncate max-w-full font-medium">
                    {pt.date}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center justify-between text-xs text-[#927d70]">
            <span>Low: ₹0</span>
            <span>Peak Day: {formatMoney(maxDaySales)}</span>
          </div>
        </section>

        {/* Cash vs Credit Ratio */}
        <section className="flex flex-col justify-between rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-bold text-[#3d2a22]">Cash vs. Credit</h2>
                <p className="mt-0.5 text-xs text-[#927d70]">Payment split proportion</p>
              </div>
              <PieChart size={18} className="text-[#927d70]" />
            </div>

            {/* Split Visual Progress Bar */}
            <div className="my-6">
              <div className="flex justify-between text-xs font-bold text-[#3d2a22] mb-2">
                <span className="flex items-center gap-1.5 text-[#39734d]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#39734d]" /> Cash ({cashPct}%)
                </span>
                <span className="flex items-center gap-1.5 text-[#d97706]">
                  Credit ({creditPct}%) <span className="h-2.5 w-2.5 rounded-full bg-[#d97706]" />
                </span>
              </div>
              <div className="h-4 w-full overflow-hidden rounded-full bg-[#f2e8dd] flex">
                <div className="bg-[#39734d] transition-all duration-500" style={{ width: `${cashPct}%` }} />
                <div className="bg-[#d97706] transition-all duration-500" style={{ width: `${creditPct}%` }} />
              </div>
            </div>

            {/* Breakdown Figures */}
            <div className="space-y-3 divide-y divide-[#f2e8dd]">
              <div className="flex justify-between pt-2 text-xs">
                <span className="text-[#927d70]">Cash In Hand:</span>
                <b className="font-mono text-[#39734d]">{formatMoney(cashNum)}</b>
              </div>
              <div className="flex justify-between pt-2 text-xs">
                <span className="text-[#927d70]">Credit Extended:</span>
                <b className="font-mono text-[#d97706]">{formatMoney(creditNum)}</b>
              </div>
              <div className="flex justify-between pt-2 text-xs">
                <span className="text-[#927d70]">Outstanding All-Time Debt:</span>
                <b className="font-mono text-[#dc2626]">{formatMoney(analytics?.outstanding_credit ?? 0)}</b>
              </div>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-[#fff0e5] p-3 text-center text-xs font-semibold text-[#ed7d3a]">
            {creditPct > 35
              ? "Notice: Credit ratio is high (>35%). Consider following up on pending repayments."
              : "Healthy cash flow ratio: Most sales collected in cash."}
          </div>
        </section>
      </div>

      {/* Bottom Section: Customer Credit Ranking Table */}
      <section className="mt-7 rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-xl font-bold text-[#3d2a22]">Customer Credit Ledger Exposure</h2>
            <p className="mt-0.5 text-xs text-[#927d70]">
              Active debts owed by registered customers calculated from unpaid transactions
            </p>
          </div>
          <Users size={18} className="text-[#927d70]" />
        </div>

        {(!analytics?.customer_credit_breakdown || analytics.customer_credit_breakdown.length === 0) ? (
          <div className="py-8 text-center text-xs text-[#927d70]">
            No outstanding customer debt recorded. All accounts are settled!
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#eadfd2] text-[#927d70] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="py-2.5 font-bold">Customer / Stall</th>
                  <th className="py-2.5 font-bold">Business Name</th>
                  <th className="py-2.5 font-bold text-right">Outstanding Balance</th>
                  <th className="py-2.5 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2e8dd]">
                {analytics.customer_credit_breakdown.map((debtor) => (
                  <tr key={debtor.customer_id} className="hover:bg-[#fbf4eb]">
                    <td className="py-3 font-semibold text-[#3d2a22]">{debtor.customer_name}</td>
                    <td className="py-3 text-[#927d70]">{debtor.business_name || "-"}</td>
                    <td className="py-3 text-right font-mono font-bold text-[#dc2626]">
                      {formatMoney(debtor.outstanding)}
                    </td>
                    <td className="py-3 text-right">
                      <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
                        Payment Pending
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

