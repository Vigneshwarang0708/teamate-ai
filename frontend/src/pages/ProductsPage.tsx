import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Check,
  Coffee,
  DollarSign,
  Package,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import {
  createProduct,
  deleteProduct,
  fetchProducts,
  Product,
  updateProduct,
} from "../services/api";

const formatMoney = (val: string | number) =>
  `₹${Number(val || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [editing, setEditing] = useState<Product | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    setLoading(true);
    fetchProducts()
      .then((r) => setProducts(r.data))
      .catch(() => setError("Could not load products menu from database."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>(["All"]);
    products.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [products]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    const data = new FormData(e.currentTarget);
    const name = String(data.get("name") || "").trim();
    const price = Number(data.get("price"));
    const category = String(data.get("category") || "General").trim();
    const available = data.get("available") === "on";

    if (!name || isNaN(price) || price <= 0) {
      setError("Please provide a valid product name and positive price.");
      return;
    }

    try {
      if (editing) {
        await updateProduct(editing.id, { name, price, category, available });
        setSuccess(`Product '${name}' updated successfully.`);
      } else {
        await createProduct({ name, price, category, available });
        setSuccess(`New item '${name}' added to menu.`);
      }
      setEditing(null);
      setIsFormOpen(false);
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not save product.");
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to remove '${name}'?`)) return;
    setError("");
    setSuccess("");
    try {
      await deleteProduct(id);
      setSuccess(`Product '${name}' deleted.`);
      load();
    } catch (err: any) {
      setError(err.response?.data?.detail || "Could not delete product.");
    }
  };

  const filtered = products.filter((p) => {
    const matchCat = categoryFilter === "All" || p.category.toLowerCase() === categoryFilter.toLowerCase();
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  // Summary statistics
  const totalItems = products.length;
  const activeItems = products.filter((p) => p.available).length;
  const categoryCount = new Set(products.map((p) => p.category)).size;
  const avgPrice = totalItems > 0
    ? products.reduce((acc, p) => acc + Number(p.price), 0) / totalItems
    : 0;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-10">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-serif text-3xl font-bold tracking-tight text-[#3d2a22]">Product Menu</h1>
          <p className="mt-1 text-sm text-[#927d70]">
            Manage items and prices retrieved by manual and voice billing engines.
          </p>
        </div>

        <button
          onClick={() => {
            setEditing(null);
            setIsFormOpen(true);
          }}
          className="flex items-center gap-2 rounded-2xl bg-[#ed7d3a] px-4 py-3 text-xs font-bold text-white shadow-md shadow-[#ed7d3a]/20 hover:bg-[#d9692b]"
        >
          <Plus size={16} />
          Add Product
        </button>
      </div>

      {/* Product Statistics Ribbon */}
      <section className="mb-6 grid gap-3 grid-cols-2 sm:grid-cols-4">
        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#927d70]">
            <Package size={15} className="text-[#ed7d3a]" /> Total Items
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-[#3d2a22]">{totalItems}</div>
        </div>

        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#927d70]">
            <Check size={15} className="text-[#39734d]" /> Active on Menu
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-[#39734d]">{activeItems}</div>
        </div>

        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#927d70]">
            <Tag size={15} className="text-[#633d2c]" /> Categories
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-[#3d2a22]">{categoryCount}</div>
        </div>

        <div className="rounded-2xl border border-[#eadfd2] bg-[#fffdf9] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#927d70]">
            <DollarSign size={15} className="text-[#ed7d3a]" /> Avg Menu Price
          </div>
          <div className="mt-2 font-mono text-xl font-bold text-[#3d2a22]">{formatMoney(avgPrice)}</div>
        </div>
      </section>

      {error && <div className="mb-4 rounded-2xl bg-red-50 p-4 text-xs text-red-700">{error}</div>}
      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-[#e7f2e9] p-4 text-xs text-[#39734d]">
          <Check size={16} />
          {success}
        </div>
      )}

      {/* Add / Edit Form Drawer */}
      {(isFormOpen || editing) && (
        <div className="mb-6 rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-md animate-in fade-in duration-200">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg font-bold text-[#3d2a22]">
              {editing ? `Edit '${editing.name}'` : "Add New Menu Item"}
            </h2>
            <button
              onClick={() => {
                setEditing(null);
                setIsFormOpen(false);
              }}
              className="rounded-full p-1.5 text-[#927d70] hover:bg-[#f4e8d8]"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Product Name *</label>
              <input
                name="name"
                required
                defaultValue={editing?.name || ""}
                placeholder="e.g. Masala Tea"
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Price (₹) *</label>
              <input
                name="price"
                required
                type="number"
                min="0.5"
                step="0.5"
                defaultValue={editing ? Number(editing.price) : ""}
                placeholder="e.g. 15"
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#927d70]">Category</label>
              <input
                name="category"
                required
                defaultValue={editing?.category || "Tea"}
                placeholder="e.g. Tea, Snacks, Juice"
                className="mt-1 w-full rounded-xl border border-[#eadfd2] bg-[#fffdf9] p-2.5 text-xs outline-none focus:border-[#ed7d3a]"
              />
            </div>

            <div className="flex items-center gap-2 pt-6">
              <input
                id="available_check"
                name="available"
                type="checkbox"
                defaultChecked={editing?.available ?? true}
                className="h-4 w-4 rounded accent-[#ed7d3a]"
              />
              <label htmlFor="available_check" className="text-xs font-semibold text-[#3d2a22]">
                Available for billing
              </label>
            </div>

            <div className="sm:col-span-4 flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setIsFormOpen(false);
                }}
                className="rounded-xl border border-[#eadfd2] px-4 py-2 text-xs font-semibold text-[#633d2c]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#ed7d3a] px-6 py-2 text-xs font-bold text-white hover:bg-[#d9692b]"
              >
                {editing ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Search & Category Filter */}
      <section className="rounded-3xl border border-[#eadfd2] bg-[#fffdf9] p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-3 text-[#9b8678]" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product by name..."
              className="w-full rounded-2xl border border-[#eadfd2] bg-[#fffdf9] py-2.5 pl-10 pr-3 text-xs outline-none focus:border-[#ed7d3a]"
            />
          </div>

          <div className="flex flex-wrap gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-xl px-3 py-1.5 text-xs font-bold transition ${
                  categoryFilter.toLowerCase() === cat.toLowerCase()
                    ? "bg-[#633d2c] text-white"
                    : "border border-[#eadfd2] bg-[#fffdf9] text-[#927d70] hover:bg-[#fbf4eb]"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Cards Grid */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((prod) => (
            <div
              key={prod.id}
              className={`flex items-center justify-between rounded-2xl border p-4 transition ${
                prod.available
                  ? "border-[#eadfd2] bg-[#fffdf9] hover:border-[#ed7d3a]/60 hover:shadow-sm"
                  : "border-gray-200 bg-gray-50/70 opacity-60"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f4e8d8] text-[#633d2c]">
                  <Coffee size={20} />
                </div>
                <div>
                  <div className="font-bold text-sm text-[#3d2a22]">{prod.name}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#927d70]">
                    <span>{prod.category}</span>
                    <span>•</span>
                    <span
                      className={`font-semibold ${
                        prod.available ? "text-[#39734d]" : "text-gray-500"
                      }`}
                    >
                      {prod.available ? "Active" : "Unavailable"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="font-mono text-base font-bold text-[#ed7d3a]">
                  {formatMoney(prod.price)}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setEditing(prod)}
                    className="rounded-lg p-2 text-[#633d2c] hover:bg-[#f4e8d8]"
                    title="Edit Item"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(prod.id, prod.name)}
                    className="rounded-lg p-2 text-red-600 hover:bg-red-50"
                    title="Delete Item"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-16 text-center text-xs text-[#927d70]">
            No products found matching "{search}".
          </div>
        )}
      </section>
    </div>
  );
}

