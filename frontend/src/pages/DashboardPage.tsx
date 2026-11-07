import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CircleDollarSign,
  Coffee,
  CreditCard,
  Mic,
  Package,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { ReceiptModal } from "../components/ReceiptModal";
import {
  Analytics,
  fetchAnalytics,
  fetchBillingHistory,
  fetchProducts,
  Order,
  Product,
} from "../services/api";

type Props = {
  refreshTrigger: number;
  shopName: string;
  onNavigate: (page: string) => void;
};

const formatMoney = (val: string | number) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function DashboardPage({ refreshTrigger, shopName, onNavigate }: Props) {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedReceiptOrder, setSelectedReceiptOrder] = useState<Order | null>(null);

  useEffect(() => {
    setLoading(true);
    setError("");
    Promise.all([fetchAnalytics("today"), fetchBillingHistory(), fetchProducts()])
      .then(([aRes, oRes, pRes]) => {
        setAnalytics(aRes.data);
        setOrders(oRes.data);
        setProducts(pRes.data);
      })
      .catch((err) => {
        console.error("Dashboard fetch error:", err);
        setError("Could not load dashboard information. Please make sure the backend is running.");
      })
      .finally(() => setLoading(false));
  }, [refreshTrigger]);

  const todayDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      {/* Top Banner / Welcome */}
      <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#ed7d3a]">{todayDate}</span>
          <h1 className="mt-1 font-serif text-3xl font-bold tracking-tight text-[#3d2a22] md:text-4xl">
            Welcome back, {shopName}
          </h1>
          <p className="mt-1 text-sm text-[#927d70]">
            Here is your live shop summary and financial pulse calculated from today's orders.
          </p>
        </div>

        {/* Quick Action Shortcuts */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => onNavigate("Voice Assistant")}
            className="flex items-center gap-2 rounded-2xl border border-[#eadfd2] bg-[#fffdf9] px-4 py-3 text-sm font-bold text-[#633d2c] shadow-sm hover:border-[#ed7d3a] hover:bg-[#fff9f4]"
          >
            <Mic size={18} className="text-[#ed7d3a]" />
            Voice Assistant
          </button>
          <button
            onClick={() => onNavigate("New Billing")}
            className="flex items-center gap-2 rounded-2xl bg-[#ed7d3a] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#ed7d3a]/20 hover:bg-[#d9692b]"
          >
            <ShoppingBag size={18} />
            Start New Bill
            <ArrowUpRight size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !analytics ? (
        <div className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-12 text-center text-[#927d70]">
          <Coffee className="mx-auto mb-3 animate-spin text-[#ed7d3a]" size={28} />
          Loading shop data from database...
        </div>
      ) : (
        <>
          {/* Main Key Performance Indicator Cards */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm transition hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#fff0e5] text-[#ed7d3a]">
                <TrendingUp size={20} />
              </div>
              <div className="font-mono text-2xl font-bold text-[#3d2a22]">
                {formatMoney(analytics?.total_sales ?? 0)}
              </div>
              <div className="mt-1 text-xs font-medium text-[#927d70]">Today's Total Sales</div>
            </div>

            <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm transition hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#e7f2e9] text-[#39734d]">
                <CircleDollarSign size={20} />
              </div>
              <div className="font-mono text-2xl font-bold text-[#3d2a22]">
                {formatMoney(analytics?.cash_collected ?? 0)}
              </div>
              <div className="mt-1 text-xs font-medium text-[#927d70]">Cash Collected</div>
            </div>

            <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm transition hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#fdf3e7] text-[#d97706]">
                <CreditCard size={20} />
              </div>
              <div className="font-mono text-2xl font-bold text-[#3d2a22]">
                {formatMoney(analytics?.credit_sales ?? 0)}
              </div>
              <div className="mt-1 text-xs font-medium text-[#927d70]">Today's Credit Sales</div>
            </div>

            <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm transition hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#fef2f2] text-[#dc2626]">
                <Users size={20} />
              </div>
              <div className="font-mono text-2xl font-bold text-[#dc2626]">
                {formatMoney(analytics?.outstanding_credit ?? 0)}
              </div>
              <div className="mt-1 text-xs font-medium text-[#927d70]">Outstanding Debts</div>
            </div>

            <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm transition hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4e8d8] text-[#633d2c]">
                <ShoppingBag size={20} />
              </div>
              <div className="font-mono text-2xl font-bold text-[#3d2a22]">
                {analytics?.total_orders ?? 0}
              </div>
              <div className="mt-1 text-xs font-medium text-[#927d70]">Total Orders</div>
            </div>

            <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm transition hover:shadow-md">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4e8d8] text-[#633d2c]">
                <Receipt size={20} />
              </div>
              <div className="font-mono text-2xl font-bold text-[#3d2a22]">
                {formatMoney(analytics?.average_order_value ?? 0)}
              </div>
              <div className="mt-1 text-xs font-medium text-[#927d70]">Avg Order Value</div>
            </div>
          </section>

          {/* Middle Row: Recent Transactions & Best Sellers */}
          <div className="mt-7 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            {/* Recent Transactions */}
            <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#3d2a22]">Recent Transactions</h2>
                  <p className="mt-0.5 text-xs text-[#927d70]">Click any transaction to view or print digital receipt</p>
                </div>
                <button
                  onClick={() => onNavigate("New Billing")}
                  className="text-xs font-bold text-[#ed7d3a] hover:underline"
                >
                  View All &rarr;
                </button>
              </div>

              {orders.length === 0 ? (
                <div className="py-12 text-center text-sm text-[#927d70]">
                  No orders recorded yet today. Start your first bill!
                </div>
              ) : (
                <div className="divide-y divide-[#f2e8dd]">
                  {orders.slice(0, 6).map((order) => (
                    <div
                      key={order.id}
                      onClick={() => setSelectedReceiptOrder(order)}
                      className="group flex cursor-pointer items-center justify-between py-3.5 transition hover:bg-[#fff7ef] -mx-2 px-2 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4e8d8] text-[#633d2c] group-hover:bg-[#ed7d3a] group-hover:text-white transition">
                          <Receipt size={16} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-[#3d2a22]">
                              {order.customer_name || "Walk-in Customer"}
                            </span>
                            <span className="text-[10px] text-[#927d70]">{order.order_number || `#TM-${order.id}`}</span>
                          </div>
                          <div className="text-xs text-[#9b8678]">
                            {order.items.map((i) => `${i.quantity} ${i.product_name}`).join(", ") || "General Item"}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="font-mono text-sm font-bold text-[#3d2a22]">{formatMoney(order.total)}</div>
                        <span
                          className={`inline-block rounded-md px-2 py-0.5 text-[9px] font-bold uppercase ${
                            order.payment_type === "credit"
                              ? "bg-amber-100 text-amber-800"
                              : order.payment_type === "split"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {order.payment_type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Best Sellers */}
            <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="font-serif text-xl font-bold text-[#3d2a22]">Best-Selling Products</h2>
                  <p className="mt-0.5 text-xs text-[#927d70]">Top items ranked by sales volume</p>
                </div>
                <Package size={18} className="text-[#927d70]" />
              </div>

              <div className="space-y-4">
                {(analytics?.top_products && analytics.top_products.length > 0
                  ? analytics.top_products
                  : products.slice(0, 5).map((p) => ({ name: p.name, quantity: 0 }))
                ).map((item, idx) => {
                  const maxQty = Math.max(
                    1,
                    ...(analytics?.top_products?.map((p) => p.quantity) || [1])
                  );
                  const pct = Math.max(10, Math.min(100, Math.round((item.quantity / maxQty) * 100)));
                  return (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold text-[#3d2a22]">
                        <span className="flex items-center gap-2">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#f4e8d8] text-[10px] text-[#633d2c]">
                            {idx + 1}
                          </span>
                          {item.name}
                        </span>
                        <span className="font-mono text-[#ed7d3a]">{item.quantity} sold</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-[#f2e8dd]">
                        <div
                          className="h-full rounded-full bg-[#ed7d3a] transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Credit Debts Overview Quick Box */}
              <div className="mt-6 rounded-2xl border border-[#eadfd2] bg-[#fbf8f3] p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-[#927d70]">Credit Overview</div>
                    <div className="mt-0.5 font-mono text-lg font-bold text-[#dc2626]">
                      {formatMoney(analytics?.outstanding_credit ?? 0)}
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate("Credit Ledger")}
                    className="rounded-xl bg-[#633d2c] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#4d2f22]"
                  >
                    Open Khatabook
                  </button>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {/* Digital Receipt Modal */}
      <ReceiptModal
        order={selectedReceiptOrder}
        shopName={shopName}
        onClose={() => setSelectedReceiptOrder(null)}
      />
    </div>
  );
}

