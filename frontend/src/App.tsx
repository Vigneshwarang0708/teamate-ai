import { useState } from "react";
import {
  Activity,
  BarChart3,
  Coffee,
  CreditCard,
  LayoutDashboard,
  Menu,
  Mic,
  Package,
  Settings,
  ShoppingBag,
  Sparkles,
  X,
} from "lucide-react";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { BillingPage } from "./pages/BillingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { LedgerPage } from "./pages/LedgerPage";
import { ProductsPage } from "./pages/ProductsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { VoiceAssistantPage } from "./pages/VoiceAssistantPage";

type Page =
  | "Dashboard"
  | "New Billing"
  | "Credit Ledger"
  | "Products"
  | "Analytics"
  | "Voice Assistant"
  | "Settings";

const navigationItems: { label: Page; icon: any; badge?: string }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "New Billing", icon: ShoppingBag, badge: "NEW" },
  { label: "Credit Ledger", icon: CreditCard },
  { label: "Products", icon: Package },
  { label: "Analytics", icon: BarChart3 },
  { label: "Voice Assistant", icon: Mic, badge: "AI" },
  { label: "Settings", icon: Settings },
];

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>("Dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [shopName, setShopName] = useState(() => localStorage.getItem("teammate_shop") || "Chai Corner");
  const ownerName = localStorage.getItem("teammate_owner") || "Arun Kumar";

  const handleNavigate = (page: string) => {
    setCurrentPage(page as Page);
    setSidebarOpen(false);
  };

  const handleRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  const todayDate = new Date().toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-screen bg-[#f7f2e9] text-[#33251f]">
      {/* Mobile Backdrop */}
      {sidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-20 bg-black/40 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 z-30 w-64 border-r border-[#eadfd2] bg-[#fffdf9] p-6 transition-transform duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Brand Header */}
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#633d2c] text-[#ffd18b] shadow-md shadow-[#633d2c]/20">
              <Coffee size={24} />
            </span>
            <div>
              <div className="font-serif text-2xl font-bold tracking-tight text-[#3d2a22]">
                TeaMate<span className="text-[#ed7d3a]">.</span>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-[.22em] text-[#a17d68]">
                AI Assistant
              </div>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-xl p-1.5 text-[#927d70] hover:bg-[#f4e8d8] lg:hidden"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1.5">
          {navigationItems.map(({ label, icon: Icon, badge }) => {
            const active = currentPage === label;
            return (
              <button
                key={label}
                onClick={() => handleNavigate(label)}
                className={`flex w-full items-center gap-3.5 rounded-2xl px-4 py-3 text-left text-sm font-semibold transition ${
                  active
                    ? "bg-[#633d2c] text-white shadow-md shadow-[#633d2c]/20"
                    : "text-[#8f7a6e] hover:bg-[#fbf4eb] hover:text-[#3d2a22]"
                }`}
              >
                <Icon size={18} className={active ? "text-[#ffd18b]" : "text-[#8f7a6e]"} />
                <span className="flex-1">{label}</span>
                {badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      badge === "AI"
                        ? "bg-[#ffd18b] text-[#633d2c]"
                        : "bg-[#ed7d3a] text-white"
                    }`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Voice Assistant Shortcut Card at Bottom */}
        <div
          onClick={() => handleNavigate("Voice Assistant")}
          className="absolute bottom-6 left-6 right-6 cursor-pointer rounded-2xl bg-[#633d2c] p-4 text-white shadow-lg shadow-[#633d2c]/30 hover:bg-[#523223] transition group"
        >
          <div className="mb-1.5 flex items-center justify-between text-[#ffd18b]">
            <div className="flex items-center gap-2">
              <Sparkles size={16} />
              <span className="text-xs font-bold">Multilingual AI</span>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-[#4e8b61] animate-ping" />
          </div>
          <p className="text-xs leading-relaxed text-[#e9d8c8]">
            Tamil • Tanglish • English • Hindi voice billing ready.
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="lg:ml-64">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[#eadfd2] bg-[#fffdf9]/90 px-5 py-4 backdrop-blur md:px-10">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-xl p-2 text-[#633d2c] hover:bg-[#f4e8d8] lg:hidden"
            title="Open menu"
          >
            <Menu size={22} />
          </button>

          <div className="hidden text-xs font-medium text-[#927d70] md:flex items-center gap-2">
            <span>{todayDate}</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 text-[#39734d] font-semibold">
              <Activity size={14} /> AI Billing Active
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#ffd18b] font-bold text-[#633d2c] shadow-xs">
              {ownerName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "AK"}
            </div>
            <div className="hidden text-right text-xs md:block">
              <div className="font-bold text-[#3d2a22]">{ownerName}</div>
              <div className="text-[11px] text-[#9b8678]">{shopName}</div>
            </div>
          </div>
        </header>

        {/* Page Render */}
        <main className="pb-16">
          {currentPage === "Dashboard" && (
            <DashboardPage
              refreshTrigger={refreshTrigger}
              shopName={shopName}
              onNavigate={handleNavigate}
            />
          )}

          {currentPage === "New Billing" && (
            <BillingPage
              shopName={shopName}
              onSaved={handleRefresh}
            />
          )}

          {currentPage === "Credit Ledger" && <LedgerPage />}

          {currentPage === "Products" && <ProductsPage />}

          {currentPage === "Analytics" && (
            <AnalyticsPage refreshTrigger={refreshTrigger} />
          )}

          {currentPage === "Voice Assistant" && (
            <VoiceAssistantPage
              shopName={shopName}
              onSaved={handleRefresh}
            />
          )}

          {currentPage === "Settings" && (
            <SettingsPage
              shopName={shopName}
              onUpdateShopName={setShopName}
            />
          )}
        </main>
      </div>
    </div>
  );
}
