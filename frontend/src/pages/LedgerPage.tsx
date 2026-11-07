import { FormEvent, useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CreditCard,
  Pencil,
  Receipt,
  Search,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  createCustomer,
  Customer,
  fetchCustomerLedger,
  fetchCustomers,
  Ledger,
  recordPayment,
  updateCustomer,
} from "../services/api";

const formatMoney = (val: string | number) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function LedgerPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedLedger, setSelectedLedger] = useState<Ledger | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "credit_sale" | "repayment">("all");

  const [repayAmount, setRepayAmount] = useState("");
  const [repayNote, setRepayNote] = useState("");
  const [repaying, setRepaying] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadCustomers = async () => {
    try {
      const res = await fetchCustomers();
      setCustomers(res.data);
      if (selectedLedger) {
        // Refresh selected customer ledger
        const lRes = await fetchCustomerLedger(selectedLedger.id);
        setSelectedLedger(lRes.data);
      }
    } catch (err) {
      console.error("Load customers error:", err);
      setError("Could not load customer ledger data.");
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const handleSelectCustomer = async (cust: Customer) => {
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      const res = await fetchCustomerLedger(cust.id);
      setSelectedLedger(res.data);
      setRepayAmount("");
    } catch (err) {
      setError("Could not load customer's ledger transactions.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomer = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const phone = String(form.get("phone") || "").trim() || null;
    const business_name = String(form.get("business_name") || "").trim() || null;

    if (!name) {
      setError("Customer name is required.");
      return;
    }

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, { name, phone, business_name });
        setSuccess(`Customer '${name}' updated.`);
      } else {
        await createCustomer({ name, phone, business_name });
        setSuccess(`New customer '${name}' added to Khatabook.`);
      }
      setEditingCustomer(null);
      setIsAddOpen(false);
      loadCustomers();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not save customer.");
    }
  };

  const handleRepayment = async () => {
    if (!selectedLedger) return;
    const amt = Number(repayAmount);
    if (!amt || amt <= 0) {
      setError("Please enter a valid repayment amount.");
      return;
    }
    const outstanding = Number(selectedLedger.outstanding);
    if (amt > outstanding) {
      setError(`Repayment cannot exceed the current outstanding balance of ${formatMoney(outstanding)}.`);
      return;
    }

    setError("");
    setRepaying(true);
    try {
      await recordPayment({
        customer_id: selectedLedger.id,
        amount: amt,
        payment_type: "repayment",
        note: repayNote.trim() || undefined,
      });
      setSuccess(`Recorded repayment of ${formatMoney(amt)} for ${selectedLedger.name}.`);
      setRepayAmount("");
      setRepayNote("");
      // Reload updated ledger and customer balance
      const updated = await fetchCustomerLedger(selectedLedger.id);
      setSelectedLedger(updated.data);
      loadCustomers();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not record repayment.");
    } finally {
      setRepaying(false);
    }
  };

  const handleFullRepaymentFill = () => {
    if (selectedLedger) {
      setRepayAmount(String(Number(selectedLedger.outstanding)));
    }
  };

  // Filtered customers
  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.business_name && c.business_name.toLowerCase().includes(search.toLowerCase())) ||
      (c.phone && c.phone.includes(search))
  );

  // Filtered ledger entries
  const displayedEntries = (selectedLedger?.entries || []).filter((e) => {
    if (filterType === "all") return true;
    return e.kind === filterType;
  });

  const totalOutstandingAll = customers.reduce(
    (sum, c) => sum + Number(c.outstanding || 0),
    0
  );

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#3d2a22]">
            Credit Ledger (Khatabook)
          </h1>
          <p className="mt-1 text-sm text-[#927d70]">
            Track every credit purchase, debt history, and cash repayments with 100% audit integrity.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] px-4 py-2 text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#927d70]">Total Shop Credit</div>
            <div className="font-mono text-lg font-bold text-[#dc2626]">{formatMoney(totalOutstandingAll)}</div>
          </div>
          <button
            onClick={() => {
              setEditingCustomer(null);
              setIsAddOpen(true);
            }}
            className="flex items-center gap-2 rounded-2xl bg-[#ed7d3a] px-4 py-3 text-xs font-bold text-white shadow-md shadow-[#ed7d3a]/20 hover:bg-[#d9692b]"
          >
            <UserPlus size={16} />
            Add Customer
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-2xl bg-red-50 p-4 text-xs text-red-700">{error}</div>}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#e7f2e9] p-4 text-xs text-[#39734d]">
          <Check size={16} />
          {success}
        </div>
      )}

      {/* Customer Form Modal / Drawer */}
      {(isAddOpen || editingCustomer) && (
        <div className="mb-6 rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-md animate-in fade-in duration-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-[#3d2a22]">
              {editingCustomer ? "Edit Customer Details" : "Register New Khatabook Customer"}
            </h2>
            <button
              onClick={() => {
                setEditingCustomer(null);
                setIsAddOpen(false);
              }}
              className="rounded-full p-1.5 text-[#927d70] hover:bg-[#f4e8d8]"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSaveCustomer} className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Customer / Shop Name *</label>
              <input
                name="name"
                required
                defaultValue={editingCustomer?.name || ""}
                placeholder="e.g. Furniture Shop"
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Business Name (Optional)</label>
              <input
                name="business_name"
                defaultValue={editingCustomer?.business_name || ""}
                placeholder="e.g. Vasantham Wood Works"
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Phone Number (Optional)</label>
              <input
                name="phone"
                defaultValue={editingCustomer?.phone || ""}
                placeholder="e.g. 9876543210"
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div className="sm:col-span-3 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditingCustomer(null);
                  setIsAddOpen(false);
                }}
                className="rounded-xl border border-[#eadfd2] px-4 py-2 text-xs font-semibold text-[#633d2c]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#ed7d3a] px-6 py-2 text-xs font-bold text-white hover:bg-[#d9692b]"
              >
                {editingCustomer ? "Save Changes" : "Create Account"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        {/* Left: Customer List */}
        <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-5 shadow-sm">
          <div className="mb-4 relative">
            <Search className="absolute left-3.5 top-3 text-[#9b8678]" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer, shop, or phone..."
              className="w-full rounded-2xl border border-[#eadfd2] bg-[#fffdf9] py-2.5 pl-10 pr-3 text-xs outline-none focus:border-[#ed7d3a]"
            />
          </div>

          <div className="space-y-2 max-h-[580px] overflow-y-auto pr-1">
            {filteredCustomers.map((cust) => {
              const isSelected = selectedLedger?.id === cust.id;
              const outstanding = Number(cust.outstanding || 0);
              return (
                <div
                  key={cust.id}
                  className={`group flex items-center justify-between rounded-2xl border p-3.5 transition cursor-pointer ${
                    isSelected
                      ? "border-[#ed7d3a] bg-[#fff5ec]"
                      : "border-[#eadfd2] bg-[#fffdf9] hover:bg-[#fbf4eb]"
                  }`}
                  onClick={() => handleSelectCustomer(cust)}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#3d2a22]">{cust.name}</span>
                      {cust.business_name && (
                        <span className="text-[10px] text-[#927d70]">({cust.business_name})</span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] text-[#9b8678]">
                      {cust.phone || "No phone registered"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="font-mono text-xs font-bold text-[#dc2626]">
                        {formatMoney(outstanding)}
                      </div>
                      <div className="text-[9px] uppercase tracking-wider text-[#927d70]">due</div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCustomer(cust);
                      }}
                      className="rounded-lg p-1.5 text-[#927d70] hover:bg-[#f4e8d8] hover:text-[#633d2c]"
                      title="Edit Customer"
                    >
                      <Pencil size={13} />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredCustomers.length === 0 && (
              <div className="py-12 text-center text-xs text-[#927d70]">
                No customers found matching "{search}".
              </div>
            )}
          </div>
        </section>

        {/* Right: Selected Customer Ledger Feed */}
        <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
          {!selectedLedger ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f4e8d8] text-[#633d2c]">
                <CreditCard size={28} />
              </div>
              <h3 className="mt-4 font-serif text-lg font-bold text-[#3d2a22]">Select a Customer</h3>
              <p className="mt-1 text-xs text-[#927d70] max-w-sm">
                Choose any customer from the list on the left to view their detailed Khatabook balance, record repayments, or inspect past transactions.
              </p>
            </div>
          ) : (
            <div>
              {/* Customer Balance Banner */}
              <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[#eadfd2] bg-[#fbf8f3] p-5 sm:flex-row sm:items-center">
                <div>
                  <h2 className="font-serif text-2xl font-bold text-[#3d2a22]">{selectedLedger.name}</h2>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#927d70]">
                    {selectedLedger.business_name && <span>{selectedLedger.business_name} •</span>}
                    <span>{selectedLedger.phone || "No phone"}</span>
                  </div>
                </div>

                <div className="rounded-xl bg-[#fffdf9] p-3 text-right border border-[#eadfd2]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#927d70]">Current Outstanding</div>
                  <div className="font-mono text-2xl font-bold text-[#dc2626]">
                    {formatMoney(selectedLedger.outstanding)}
                  </div>
                </div>
              </div>

              {/* Repayment Box */}
              <div className="mt-5 rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-[#3d2a22]">Record Cash Repayment</span>
                  {Number(selectedLedger.outstanding) > 0 && (
                    <button
                      onClick={handleFullRepaymentFill}
                      className="text-[11px] font-bold text-[#ed7d3a] hover:underline"
                    >
                      Quick Fill Full Balance ({formatMoney(selectedLedger.outstanding)})
                    </button>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Enter amount (₹)"
                    value={repayAmount}
                    onChange={(e) => setRepayAmount(e.target.value)}
                    className="flex-1 rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
                  />
                  <input
                    type="text"
                    placeholder="Note / remark (optional)"
                    value={repayNote}
                    onChange={(e) => setRepayNote(e.target.value)}
                    className="flex-1 rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
                  />
                  <button
                    disabled={!repayAmount || Number(repayAmount) <= 0 || repaying}
                    onClick={handleRepayment}
                    className="rounded-xl bg-[#633d2c] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#4d2f22] disabled:opacity-40 transition"
                  >
                    {repaying ? "Saving..." : "Record Repayment"}
                  </button>
                </div>
              </div>

              {/* Transaction History Feed */}
              <div className="mt-6">
                <div className="flex items-center justify-between border-b border-[#eadfd2] pb-3">
                  <h3 className="font-serif text-base font-bold text-[#3d2a22]">Transaction Ledger</h3>
                  <div className="flex gap-1">
                    {(["all", "credit_sale", "repayment"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setFilterType(t)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold capitalize transition ${
                          filterType === t
                            ? "bg-[#633d2c] text-white"
                            : "bg-[#f4e8d8] text-[#633d2c] hover:bg-[#eadfd2]"
                        }`}
                      >
                        {t === "credit_sale" ? "Credits" : t}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4 space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {displayedEntries.length === 0 ? (
                    <div className="py-12 text-center text-xs text-[#927d70]">
                      No transactions recorded under this filter.
                    </div>
                  ) : (
                    displayedEntries.map((entry) => {
                      const isRepayment = entry.kind === "repayment";
                      const dateStr = new Date(entry.created_at).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      });
                      return (
                        <div
                          key={`${entry.kind}-${entry.id}`}
                          className="flex items-center justify-between rounded-xl bg-[#fbf8f3] p-3 text-xs"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                                isRepayment
                                  ? "bg-[#e7f2e9] text-[#39734d]"
                                  : "bg-[#fef2f2] text-[#dc2626]"
                              }`}
                            >
                              {isRepayment ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#3d2a22]">
                                  {isRepayment ? "Cash Repayment" : "Credit Purchase"}
                                </span>
                                {entry.reference_id && (
                                  <span className="text-[10px] text-[#927d70]">
                                    {entry.reference_id}
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-[#927d70]">{dateStr}</div>
                              {entry.note && (
                                <div className="mt-0.5 text-[10px] text-[#633d2c] italic">"{entry.note}"</div>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <div
                              className={`font-mono text-sm font-bold ${
                                isRepayment ? "text-[#39734d]" : "text-[#dc2626]"
                              }`}
                            >
                              {isRepayment ? "-" : "+"}
                              {formatMoney(entry.amount)}
                            </div>
                            <span
                              className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                                isRepayment
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-red-100 text-red-800"
                              }`}
                            >
                              {isRepayment ? "Repaid" : "Debt"}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

