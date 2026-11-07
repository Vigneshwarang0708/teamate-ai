import { FormEvent, useState } from "react";
import { UserPlus, X } from "lucide-react";
import { Customer, createCustomer } from "../services/api";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onCustomerCreated: (newCustomer: Customer) => void;
};

export function CustomerModal({ isOpen, onClose, onCustomerCreated }: Props) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Customer name is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await createCustomer({
        name: name.trim(),
        phone: phone.trim() || null,
        business_name: businessName.trim() || null,
      });
      onCustomerCreated(res.data);
      setName("");
      setPhone("");
      setBusinessName("");
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not register customer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-2 text-[#927d70] hover:bg-[#f4e8d8]"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fff0e5] text-[#ed7d3a]">
            <UserPlus size={20} />
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold text-[#3d2a22]">New Customer</h2>
            <p className="text-xs text-[#927d70]">Add customer for credit ledger (Khatabook)</p>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</div>}

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[#927d70]">Customer / Shop Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Furniture Shop or Ramesh"
              className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-3 text-sm outline-none focus:border-[#ed7d3a]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#927d70]">Business / Shop Details (Optional)</label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="e.g. Wood Works, Stall No. 4"
              className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-3 text-sm outline-none focus:border-[#ed7d3a]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#927d70]">Phone Number (Optional)</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 9876543210"
              className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-3 text-sm outline-none focus:border-[#ed7d3a]"
            />
          </div>

          <div className="mt-6 flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="w-1/3 rounded-xl border border-[#eadfd2] py-3 text-sm font-semibold text-[#633d2c]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-2/3 rounded-xl bg-[#ed7d3a] py-3 text-sm font-bold text-white shadow-md shadow-[#ed7d3a]/20 hover:bg-[#d9692b] disabled:opacity-50"
            >
              {loading ? "Saving..." : "Save Customer"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

