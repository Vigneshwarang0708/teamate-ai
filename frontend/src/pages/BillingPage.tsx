import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Coffee,
  CreditCard,
  Minus,
  Plus,
  Receipt,
  Search,
  Trash2,
  UserPlus,
  Volume2,
} from "lucide-react";
import { CustomerModal } from "../components/CustomerModal";
import { ReceiptModal } from "../components/ReceiptModal";
import {
  confirmBilling,
  Customer,
  fetchCustomers,
  fetchProducts,
  Order,
  Product,
} from "../services/api";
import { playAudio } from "../services/speech";

type Props = {
  shopName: string;
  onSaved: () => void;
};

const formatMoney = (val: string | number) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function BillingPage({ shopName, onSaved }: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  const [customerId, setCustomerId] = useState<string>("");
  const [paymentType, setPaymentType] = useState<"cash" | "credit" | "split">("cash");
  const [cashAmount, setCashAmount] = useState("");
  const [creditAmount, setCreditAmount] = useState("");
  const [note, setNote] = useState("");
  const [spokenLang, setSpokenLang] = useState("ta");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState<Order | null>(null);

  useEffect(() => {
    Promise.all([fetchProducts(), fetchCustomers()])
      .then(([pRes, cRes]) => {
        setProducts(pRes.data);
        setCustomers(cRes.data);
      })
      .catch((err) => {
        console.error("Billing data load error:", err);
        setError("Could not load products or customers. Is backend running?");
      });
  }, []);

  // Categories list
  const categories = useMemo(() => {
    const set = new Set<string>(["All"]);
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  // Filtered products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (!p.available) return false;
      const matchCat = selectedCategory === "All" || p.category.toLowerCase() === selectedCategory.toLowerCase();
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [products, selectedCategory, search]);

  // Cart items & total
  const cartItems = useMemo(() => {
    return Object.entries(cart)
      .map(([idStr, qty]) => {
        const prod = products.find((p) => p.id === Number(idStr));
        if (!prod || qty <= 0) return null;
        const subtotal = Number(prod.price) * qty;
        return { product: prod, quantity: qty, subtotal };
      })
      .filter(Boolean) as { product: Product; quantity: number; subtotal: number }[];
  }, [cart, products]);

  const billTotal = useMemo(() => {
    return cartItems.reduce((acc, it) => acc + it.subtotal, 0);
  }, [cartItems]);

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) => {
      const next = { ...prev };
      const current = next[productId] || 0;
      const updated = current + delta;
      if (updated <= 0) {
        delete next[productId];
      } else {
        next[productId] = updated;
      }
      return next;
    });
  };

  const handleConfirmBill = async () => {
    if (cartItems.length === 0) return;
    setError("");

    if (paymentType === "credit" && !customerId) {
      setError("Please select a customer for credit billing.");
      return;
    }

    let numCash = 0;
    let numCredit = 0;

    if (paymentType === "cash") {
      numCash = billTotal;
      numCredit = 0;
    } else if (paymentType === "credit") {
      numCash = 0;
      numCredit = billTotal;
    } else {
      // Split payment
      numCash = Number(cashAmount || 0);
      numCredit = Number(creditAmount || 0);
      if (Math.abs(numCash + numCredit - billTotal) > 0.01) {
        setError(`Split payment sum (₹${numCash} cash + ₹${numCredit} credit = ₹${numCash + numCredit}) must equal total bill amount ₹${billTotal}.`);
        return;
      }
      if (numCredit > 0 && !customerId) {
        setError("Please select a customer for the credit portion of split billing.");
        return;
      }
    }

    setSaving(true);
    try {
      const idempotencyKey = crypto.randomUUID();
      const payload = {
        items: cartItems.map((it) => ({
          product_id: it.product.id,
          quantity: it.quantity,
        })),
        customer_id: customerId ? Number(customerId) : null,
        payment_type: paymentType,
        cash_amount: numCash,
        credit_amount: numCredit,
        idempotency_key: idempotencyKey,
        note: note.trim() || undefined,
        spoken_language: spokenLang,
      };

      const res = await confirmBilling(payload);
      const savedOrder = res.data.order;
      setConfirmedOrder(savedOrder);
      setSuccessMessage(res.data.message);

      // Play audio confirmation
      if (res.data.speech_text || res.data.speech_audio_base64) {
        playAudio(res.data.speech_audio_base64, res.data.speech_text, spokenLang);
      }

      // Reset cart
      setCart({});
      setCashAmount("");
      setCreditAmount("");
      setNote("");
      onSaved();
    } catch (err: any) {
      console.error("Save bill error:", err);
      setError(err.response?.data?.detail || "Could not confirm bill. Please check inputs and retry.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <div className="mb-6 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#3d2a22]">New Billing</h1>
          <p className="mt-1 text-sm text-[#927d70]">
            Select products, set payment mode, and instantly commit transactions to the database.
          </p>
        </div>

        {/* Confirmation Voice Language selector */}
        <div className="flex items-center gap-2 text-xs font-semibold text-[#633d2c]">
          <Volume2 size={16} className="text-[#ed7d3a]" />
          <span>Confirm in:</span>
          <select
            value={spokenLang}
            onChange={(e) => setSpokenLang(e.target.value)}
            className="rounded-xl border border-[#eadfd2] bg-[#fffdf9] px-3 py-1.5 text-xs font-bold text-[#3d2a22] outline-none"
          >
            <option value="ta">Tamil (தமிழ்)</option>
            <option value="tanglish">Tanglish</option>
            <option value="hi">Hindi (हिंदी)</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Left: Product Selection */}
        <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
          {/* Search & Category Pills */}
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-3 text-[#9b8678]" size={16} />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search menu items..."
                className="w-full rounded-2xl border border-[#eadfd2] bg-[#fffdf9] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                    selectedCategory.toLowerCase() === cat.toLowerCase()
                      ? "bg-[#633d2c] text-white shadow-sm"
                      : "border border-[#eadfd2] bg-[#fffdf9] text-[#927d70] hover:bg-[#fbf4eb]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Cards Grid */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {filteredProducts.map((prod) => {
              const inCartQty = cart[prod.id] || 0;
              return (
                <button
                  key={prod.id}
                  onClick={() => updateQuantity(prod.id, 1)}
                  className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition hover:shadow-md ${
                    inCartQty > 0
                      ? "border-[#ed7d3a] bg-[#fff9f4]"
                      : "border-[#eadfd2] bg-[#fffdf9] hover:border-[#ed7d3a]/60 hover:bg-[#fcf8f3]"
                  }`}
                >
                  {inCartQty > 0 && (
                    <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#ed7d3a] text-xs font-bold text-white shadow">
                      {inCartQty}
                    </span>
                  )}

                  <div>
                    <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4e8d8] text-[#633d2c] group-hover:scale-105 transition">
                      <Coffee size={18} />
                    </div>
                    <div className="font-semibold text-sm text-[#3d2a22] leading-tight line-clamp-1">{prod.name}</div>
                    <div className="mt-0.5 text-[10px] text-[#927d70]">{prod.category}</div>
                  </div>

                  <div className="mt-3 font-mono text-sm font-bold text-[#ed7d3a]">
                    {formatMoney(prod.price)}
                  </div>
                </button>
              );
            })}
          </div>

          {filteredProducts.length === 0 && (
            <div className="py-16 text-center text-sm text-[#927d70]">
              No available products match "{search}".
            </div>
          )}
        </section>

        {/* Right: Cart & Checkout Ledger */}
        <section className="flex flex-col rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#eadfd2] pb-4">
            <h2 className="font-serif text-xl font-bold text-[#3d2a22]">Current Order</h2>
            {cartItems.length > 0 && (
              <button
                onClick={() => setCart({})}
                className="text-xs font-semibold text-red-600 hover:underline"
              >
                Clear Cart
              </button>
            )}
          </div>

          {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}
          {successMessage && (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#e7f2e9] p-3 text-xs text-[#39734d]">
              <Check size={16} />
              {successMessage}
            </div>
          )}

          {/* Cart Item Rows */}
          <div className="my-4 flex-1 space-y-3 overflow-y-auto max-h-72 pr-1">
            {cartItems.length === 0 ? (
              <div className="py-12 text-center text-sm text-[#927d70]">
                Cart is empty. Tap any product on the left to add it.
              </div>
            ) : (
              cartItems.map(({ product, quantity, subtotal }) => (
                <div
                  key={product.id}
                  className="flex items-center justify-between rounded-xl bg-[#fbf8f3] p-3 text-xs"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-[#3d2a22]">{product.name}</div>
                    <div className="text-[10px] text-[#927d70]">
                      {formatMoney(product.price)} each
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateQuantity(product.id, -1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f4e8d8] text-[#633d2c] hover:bg-[#eadfd2]"
                    >
                      {quantity === 1 ? <Trash2 size={13} className="text-red-600" /> : <Minus size={13} />}
                    </button>
                    <span className="w-5 text-center font-mono font-bold text-sm text-[#3d2a22]">{quantity}</span>
                    <button
                      onClick={() => updateQuantity(product.id, 1)}
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#f4e8d8] text-[#633d2c] hover:bg-[#eadfd2]"
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div className="w-16 text-right font-mono font-bold text-sm text-[#3d2a22]">
                    {formatMoney(subtotal)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Summary & Checkout Controls */}
          <div className="border-t border-[#eadfd2] pt-4">
            <div className="flex items-center justify-between text-base font-bold text-[#3d2a22]">
              <span>Subtotal</span>
              <span className="font-mono text-xl text-[#ed7d3a]">{formatMoney(billTotal)}</span>
            </div>

            {/* Customer Selection */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#927d70]">Customer Account</label>
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(true)}
                  className="flex items-center gap-1 text-[11px] font-bold text-[#ed7d3a] hover:underline"
                >
                  <UserPlus size={13} />
                  + Add New
                </button>
              </div>

              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs text-[#3d2a22] outline-none focus:border-[#ed7d3a]"
              >
                <option value="">Walk-in Customer (Cash)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.business_name ? `(${c.business_name})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Payment Method Selector */}
            <div className="mt-4">
              <label className="text-xs font-semibold text-[#927d70]">Payment Method</label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {(["cash", "credit", "split"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setPaymentType(type)}
                    className={`rounded-xl border py-2 text-xs font-bold capitalize transition ${
                      paymentType === type
                        ? "border-[#ed7d3a] bg-[#fff0e5] text-[#ed7d3a] shadow-sm"
                        : "border-[#eadfd2] bg-[#fffdf9] text-[#927d70] hover:bg-[#fbf4eb]"
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Split Payment Inputs */}
            {paymentType === "split" && (
              <div className="mt-3 grid grid-cols-2 gap-2 animate-in fade-in duration-200">
                <div>
                  <label className="text-[10px] font-semibold text-[#927d70]">Cash Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 50"
                    value={cashAmount}
                    onChange={(e) => setCashAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2 text-xs outline-none focus:border-[#ed7d3a]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-[#927d70]">Credit Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    placeholder="e.g. 50"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2 text-xs outline-none focus:border-[#ed7d3a]"
                  />
                </div>
              </div>
            )}

            {/* Confirm Billing Button */}
            <button
              disabled={cartItems.length === 0 || saving}
              onClick={handleConfirmBill}
              className="mt-5 w-full rounded-2xl bg-[#633d2c] py-3.5 text-sm font-bold text-white shadow-lg shadow-[#633d2c]/20 hover:bg-[#4d2f22] disabled:cursor-not-allowed disabled:opacity-40 transition"
            >
              {saving ? "Confirming & Recording..." : `Confirm Billing (${formatMoney(billTotal)})`}
            </button>
          </div>
        </section>
      </div>

      {/* New Customer Modal */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        onClose={() => setIsCustomerModalOpen(false)}
        onCustomerCreated={(newCust) => {
          setCustomers((prev) => [...prev, newCust]);
          setCustomerId(String(newCust.id));
        }}
      />

      {/* Digital Receipt Modal */}
      <ReceiptModal
        order={confirmedOrder}
        shopName={shopName}
        onClose={() => setConfirmedOrder(null)}
      />
    </div>
  );
}

