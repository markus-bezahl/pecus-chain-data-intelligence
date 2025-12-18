import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import { Search, LogOut, Milk, User, Globe, Settings, ChevronLeft, ChevronRight, Droplet, Zap, AlertTriangle, TrendingUp } from "lucide-react";
import SettingsModal from "../components/SettingsModal";
import AlertsModal from "../components/AlertsModal";
import ProfileModal from "../components/ProfileModal";
import DistributionModal from "../components/DistributionModal";
import HerdManagement from "../components/HerdManagement";
import { useLanguage } from "../contexts/LanguageContext";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('milking-control');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [user, setUser] = useState(null);
  const { lang, setLang, t } = useLanguage();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  // State for Distribution Modal
  const [selectedDistributionRow, setSelectedDistributionRow] = useState(null);

  const [settings, setSettings] = useState({ 
    attention: 1.4, 
    alert: 2.0,
    costSS: 0,
    milkPrice: 0,
    dryRation: 0,
    lactationRation: 0
  });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  
  const [sortConfig, setSortConfig] = useState({ key: 'BeginTime', direction: 'desc' });
  const [filterType, setFilterType] = useState('all'); // 'all', 'attention', 'alert'
  const [selectedAlertRow, setSelectedAlertRow] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);

  useEffect(() => {
    async function getUserAndSettings() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      
      if (user) {
        // Fetch user settings
        const { data: profile } = await supabase
          .from("profiles")
          .select("mdi_attention_threshold, mdi_alert_threshold, cost_ss_per_kg, milk_price, dry_ration_daily_kg, lactation_ration_daily_kg")
          .eq("id", user.id)
          .single();
          
        if (profile) {
          setSettings({
            attention: profile.mdi_attention_threshold ?? 1.4,
            alert: profile.mdi_alert_threshold ?? 2.0,
            costSS: profile.cost_ss_per_kg ?? 0,
            milkPrice: profile.milk_price ?? 0,
            dryRation: profile.dry_ration_daily_kg ?? 0,
            lactationRation: profile.lactation_ration_daily_kg ?? 0
          });
        }
      }
    }
    getUserAndSettings();
    // Initial fetch triggered by page/pageSize dependency
  }, []);

  // Fetch data whenever page, pageSize, search, sort or filter changes
  useEffect(() => {
    fetchData();
  }, [page, pageSize, sortConfig, filterType]); 

  async function fetchData() {
    try {
      setLoading(true);
      
      // Calculate date range: today-1 to today
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      
      // Format dates as ISO strings (start of yesterday to end of today)
      const startDate = yesterday.toISOString().split('T')[0] + 'T00:00:00';
      const endDate = today.toISOString().split('T')[0] + 'T23:59:59';
      
      // Fallback date: 2019-11-08
      const fallbackDate = '2019-11-08T00:00:00';

      // Determine sorting
      const orderColumn = sortConfig.key;
      const orderAscending = sortConfig.direction;

      // Prepare RPC parameters
      let params = {
          p_start_date: startDate,
          p_end_date: endDate,
          p_min_mdi: filterType === 'attention' ? settings.attention : (filterType === 'alert' ? settings.alert : null),
          p_page: page,
          p_page_size: pageSize,
          p_sort_col: orderColumn,
          p_sort_dir: orderAscending
      };

      // Call RPC
      let { data: rpcResult, error } = await supabase.rpc('get_latest_milkings_per_animal', params);
      
      let result = rpcResult?.data || [];
      let count = rpcResult?.count || 0;

      // If Main query has data on page 0, we are NOT using fallback
      if (page === 0 && result && result.length > 0) {
          setUsingFallback(false);
      }

      // If no data found (or already in fallback mode), try fallback strategy
      if (!error && (!result || result.length === 0) && (page === 0 || usingFallback)) {
        if (page === 0) setUsingFallback(true);
        console.log("No data in last 24h, trying fallback > 2019-11-08");
        
        // Update params for fallback (From 2019-11-08 to Now)
        params.p_start_date = fallbackDate;
        params.p_end_date = new Date().toISOString(); // Current time

        ({ data: rpcResult, error } = await supabase.rpc('get_latest_milkings_per_animal', params));
        
        result = rpcResult?.data || [];
        count = rpcResult?.count || 0;
      }

      if (error) {
        console.error("Error fetching data:", error);
      } else {
        setData(result || []);
        setTotalCount(count || 0);
      }
    } catch (err) {
      console.error("Unexpected error:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const filteredData = data.filter((row) =>
    row.animal_oid.toString().includes(searchTerm)
  );

  return (
    <div className="min-h-screen bg-[#fdfbf7] flex flex-col">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo_qr.svg" alt="Logo" className="h-10 w-auto" />
          <span className="text-xl font-bold text-[#3a352f] hidden md:inline">Pecus Chain</span>
        </div>
        
        <div className="flex items-center gap-6">
           <button 
              onClick={() => setLang(lang === "IT" ? "EN" : "IT")} 
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#3a352f] hover:bg-[#F3E6D5] transition-colors"
           >
              <Globe className="w-5 h-5" />
              <span className="font-medium">{lang}</span>
           </button>
           
           <div className="relative">
              <button 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="p-2 rounded-full hover:bg-[#F3E6D5] transition-colors text-[#3a352f]"
              >
                <User className="w-5 h-5" />
              </button>

              {isMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-50 mb-1">
                    {user?.email}
                  </div>
                  <button 
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsProfileOpen(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-[#3a352f] hover:bg-gray-50 flex items-center gap-2"
                  >
                    <User className="w-4 h-4" />
                    {t('dashboard.profile')}
                  </button>
                  <button 
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsSettingsOpen(true);
                    }}
                    className="w-full text-left px-4 py-2.5 text-[#3a352f] hover:bg-gray-50 flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4" />
                    {t('dashboard.settings')}
                  </button>
                  <div className="my-1 border-t border-gray-50"></div>
                  <button 
                    onClick={handleLogout} 
                    className="w-full text-left px-4 py-2.5 text-red-600 hover:bg-red-50 flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('dashboard.logout')}
                  </button>
                </div>
              )}
           </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col pt-6 px-4">
            <button 
                onClick={() => setActiveTab('milking-control')}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg font-medium shadow-sm mb-2 transition-colors ${
                    activeTab === 'milking-control' 
                    ? 'bg-[#556b2f] text-white' 
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
            >
                <Milk className="w-5 h-5" />
                {t('dashboard.milking_control')}
            </button>
            
            <button 
                onClick={() => setActiveTab('herd-management')}
                className={`flex items-center gap-3 w-full px-4 py-3 rounded-lg font-medium shadow-sm mb-2 transition-colors ${
                    activeTab === 'herd-management' 
                    ? 'bg-[#556b2f] text-white' 
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
            >
                <TrendingUp className="w-5 h-5" />
                {t('dashboard.herd_management')}
            </button>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {activeTab === 'herd-management' ? (
             <HerdManagement user={user} settings={settings} />
          ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[500px] flex flex-col">
             {/* Page Title & Controls */}
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 border-b border-gray-100">
                <div className="flex items-center gap-6">
                   <h2 className="text-xl font-bold text-[#3a352f]">{t('dashboard.milking_control')}</h2>
                   <div className="flex gap-3">
                      <button 
                        onClick={() => { setFilterType(filterType === 'attention' ? 'all' : 'attention'); setPage(0); }}
                        className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors flex items-center gap-2 ${
                          filterType === 'attention' 
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200 ring-2 ring-yellow-100' 
                            : 'bg-white text-yellow-600 border-yellow-100 hover:bg-yellow-50'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                        {t('dashboard.attention_mdi')} ({settings.attention})
                      </button>
                      <button 
                        onClick={() => { setFilterType(filterType === 'alert' ? 'all' : 'alert'); setPage(0); }}
                        className={`px-3 py-1 text-xs font-bold rounded-full border transition-colors flex items-center gap-2 ${
                          filterType === 'alert' 
                            ? 'bg-red-50 text-red-700 border-red-200 ring-2 ring-red-100' 
                            : 'bg-white text-red-600 border-red-100 hover:bg-red-50'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        {t('dashboard.alert_mdi')} ({settings.alert})
                      </button>
                   </div>
                </div>
                
                <div className="relative w-full md:w-72">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder={t('dashboard.search_placeholder')} 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] bg-gray-50 text-sm"
                  />
                </div>
             </div>

             {/* Sorting Controls */}
             <div className="px-6 py-4 flex gap-2 overflow-x-auto bg-white">
               {[
                 { label: t('dashboard.table.start'), key: 'BeginTime' },
                 { label: t('dashboard.table.end'), key: 'EndTime' },
                 { label: t('dashboard.table.yield'), key: 'yield' }
               ].map((item) => (
                 <button
                   key={item.key}
                   onClick={() => setSortConfig(prev => ({
                     key: item.key,
                     direction: prev.key === item.key && prev.direction === 'desc' ? 'asc' : 'desc'
                   }))}
                   className={`px-4 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap flex items-center gap-1 ${
                     sortConfig.key === item.key 
                       ? 'bg-[#556b2f] text-white border-[#556b2f]' 
                       : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                   }`}
                 >
                   {item.label} 
                   {sortConfig.key === item.key && (
                     <span className="text-[10px]">{sortConfig.direction === 'desc' ? '↓' : '↑'}</span>
                   )}
                 </button>
               ))}
             </div>

             {/* Card Content - List of "Schede" */}
             <div className="p-6 bg-gray-50/30 flex-1">
                {loading ? (
                    <div className="flex items-center justify-center h-64 text-gray-500">{t('auth.loading')}</div>
                ) : filteredData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <p>{t('dashboard.no_more_data')}</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        {filteredData.map((row) => (
                            <div 
                              key={row.id} 
                              onClick={() => setSelectedDistributionRow(row)}
                              className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow flex flex-col md:flex-row md:items-center gap-6 cursor-pointer"
                            >
                                {/* Left Section: ID, Lactation, DIM */}
                                <div className="flex items-center gap-6 border border-gray-100 rounded-xl p-4 bg-white min-w-[300px]">
                                    <div className="flex flex-col items-center border-r border-gray-100 pr-6">
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">{t('dashboard.card.id')}</p>
                                        <p className="text-2xl font-bold text-[#1B4B66]">{row.animal_oid}</p>
                                    </div>
                                    <div className="flex flex-col items-center border-r border-gray-100 pr-6">
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">{t('dashboard.card.lactation')}</p>
                                        <p className="text-xl font-bold text-[#3a352f]">{row.LactationNumber}</p>
                                    </div>
                                    <div className="flex flex-col items-center">
                                        <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">{t('dashboard.card.dim')}</p>
                                        <p className="text-xl font-bold text-[#3a352f]">{Math.round(row.DIM)}</p>
                                    </div>
                                </div>

                                {/* Middle Section: Milk, Conductivity, Blood */}
                                <div className="flex flex-1 items-center justify-around gap-4">
                                    <div className="flex flex-col items-center">
                                        <div className="w-10 h-10 rounded-full border border-[#556b2f]/20 flex items-center justify-center mb-2">
                                            <Milk className="w-5 h-5 text-[#556b2f]" />
                                        </div>
                                        <p className="text-xs text-gray-400">{t('dashboard.card.milk')}</p>
                                        <p className="font-bold text-[#3a352f]">{row.TotalYield?.toFixed(1) ?? "-"}</p>
                                    </div>
                                    
                                    <div className="flex flex-col items-center">
                                        <div className="w-10 h-10 rounded-full border border-[#556b2f]/20 flex items-center justify-center mb-2">
                                            <Zap className="w-5 h-5 text-[#556b2f]" />
                                        </div>
                                        <p className="text-xs text-gray-400">{t('dashboard.card.conductivity')}</p>
                                        <p className="font-bold text-[#3a352f]">{row.AvgConductivity?.toFixed(1) ?? "-"}</p>
                                    </div>

                                    <div className="flex flex-col items-center">
                                        <div className="w-10 h-10 rounded-full border border-[#556b2f]/20 flex items-center justify-center mb-2">
                                            <Droplet className="w-5 h-5 text-[#556b2f]" />
                                        </div>
                                        <p className="text-xs text-gray-400">{t('dashboard.card.blood')}</p>
                                        <p className="font-bold text-[#3a352f]">{row.MaxBlood?.toFixed(1) ?? "-"}</p>
                                    </div>

                                    <div className="flex flex-col items-center">
                                        <button 
                                            onClick={(e) => {
                                              e.stopPropagation(); // Prevent opening DistributionModal
                                              setSelectedAlertRow(row);
                                            }}
                                            className={`w-10 h-10 rounded-full border flex items-center justify-center mb-2 transition-colors ${
                                                (row.Kickoff > 0 || row.Incomplete > 0)
                                                    ? 'bg-yellow-50 border-yellow-200 text-yellow-600 hover:bg-yellow-100'
                                                    : 'border-gray-100 text-gray-300'
                                            }`}
                                            disabled={!(row.Kickoff > 0 || row.Incomplete > 0)}
                                        >
                                            <AlertTriangle className="w-5 h-5" />
                                        </button>
                                        <p className="text-xs text-gray-400">{t('dashboard.card.alerts')}</p>
                                        <p className={`font-bold ${(row.Kickoff > 0 || row.Incomplete > 0) ? 'text-yellow-600' : 'text-gray-300'}`}>
                                            {row.Kickoff + row.Incomplete}
                                        </p>
                                    </div>
                                </div>
                                
                                {/* Right Section: Prob Mastite & MDI */}
                                <div className="flex flex-row items-center gap-4 min-w-[300px]">
                                    {/* Prob Mastite Box */}
                                    <div className={`flex flex-col items-center justify-center rounded-lg px-4 py-3 min-w-[120px] ${
                                        (row.prob_mastitis * 100) >= 75 
                                            ? 'bg-red-50 text-red-800 border border-red-100' 
                                            : (row.prob_mastitis * 100) >= 50 
                                                ? 'bg-yellow-50 text-yellow-800 border border-yellow-100' 
                                                : 'bg-green-50 text-green-800 border border-green-100'
                                    }`}>
                                        <span className="text-xs font-bold uppercase tracking-wide opacity-80 mb-1">{t('dashboard.card.prob_mastitis')}</span>
                                        <span className="text-xl font-extrabold">
                                            {row.prob_mastitis ? Math.round(row.prob_mastitis * 100) : 0}%
                                        </span>
                                    </div>
                                    
                                    {/*<div className="flex flex-col gap-2 flex-1">
                                        <div className="border border-gray-100 rounded-lg px-4 py-2 bg-white text-center">
                                            <span className="text-sm font-bold text-[#3a352f] opacity-70">MDI: {row.Mdi?.toFixed(2) ?? "-"}</span>
                                        </div>
                                        <div className={`px-4 py-2 rounded-lg text-center ${
                                            row.mdi_2d >= settings.alert 
                                                ? 'bg-red-50 text-red-700 border border-red-100' 
                                                : row.mdi_2d >= settings.attention 
                                                    ? 'bg-yellow-50 text-yellow-700 border border-yellow-100' 
                                                    : 'bg-green-50 text-green-700 border border-green-100'
                                        }`}>
                                            <span className="text-sm font-bold">MDI 2d: {row.mdi_2d?.toFixed(2)}</span>
                                        </div>
                                    </div>*/}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
             </div>

             {/* Pagination Footer */}
             <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-white">
                <div className="text-sm text-gray-500">
                    {t('dashboard.pagination.total_records')}: <span className="font-medium text-[#3a352f]">{totalCount}</span>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-500">{t('dashboard.pagination.rows_per_page')}:</span>
                        <select 
                            value={pageSize}
                            onChange={(e) => {
                                setPageSize(Number(e.target.value));
                                setPage(0); // Reset to first page
                            }}
                            className="border border-gray-200 rounded-lg text-sm px-2 py-1 focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                        >
                            <option value={5}>5</option>
                            <option value={10}>10</option>
                            <option value={20}>20</option>
                            <option value={50}>50</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => setPage(Math.max(0, page - 1))}
                            disabled={page === 0}
                            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <span className="text-sm font-medium text-gray-700">
                            {t('dashboard.pagination.page')} {page + 1}
                        </span>
                        <button 
                            onClick={() => setPage(page + 1)}
                            disabled={(page + 1) * pageSize >= totalCount}
                            className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ChevronRight className="w-5 h-5 text-gray-600" />
                        </button>
                    </div>
                </div>
             </div>
          </div>
          )}
        </main>
      </div>

      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)}
        onSave={(data) => setSettings(prev => ({ ...prev, ...data }))}
        initialAttention={settings.attention}
        initialAlert={settings.alert}
        initialCostSS={settings.costSS}
        initialMilkPrice={settings.milkPrice}
        initialDryRation={settings.dryRation}
        initialLactationRation={settings.lactationRation}
      />

      <AlertsModal 
        isOpen={!!selectedAlertRow} 
        onClose={() => setSelectedAlertRow(null)} 
        incomplete={selectedAlertRow?.Incomplete ?? 0}
        kickoff={selectedAlertRow?.Kickoff ?? 0}
      />

      <ProfileModal 
        isOpen={isProfileOpen} 
        onClose={() => setIsProfileOpen(false)}
        onSave={(data) => console.log("Profile saved:", data)}
      />

      <DistributionModal 
        isOpen={!!selectedDistributionRow}
        onClose={() => setSelectedDistributionRow(null)}
        animalOid={selectedDistributionRow?.animal_oid}
        lactationNumber={selectedDistributionRow?.LactationNumber}
        currentYield={selectedDistributionRow?.TotalYield}
        sessionDate={selectedDistributionRow?.BeginTime}
        sessionEndDate={selectedDistributionRow?.EndTime}
      />
    </div>
  );
}