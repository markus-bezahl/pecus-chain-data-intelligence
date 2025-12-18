import { useState, useEffect, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { Search, ChevronLeft, ChevronRight, Droplet, Clock, ArrowUpDown, BarChart2 } from "lucide-react";
import DistributionGraphModal from "./DistributionGraphModal";
import AnimalDetailModal from "./AnimalDetailModal";
import { useLanguage } from "../contexts/LanguageContext";

export default function AnimalStatisticsList({ user, settings }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(5);
  const [sortConfig, setSortConfig] = useState({ key: 'iofc', direction: 'desc' });
  const { t } = useLanguage();
  
  // Dashboard Metrics
  const [activeAnimals, setActiveAnimals] = useState(0);
  const [totalAnimalsInStats, setTotalAnimalsInStats] = useState(0);
  const [avgProduction, setAvgProduction] = useState(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedAnimal, setSelectedAnimal] = useState(null);

  useEffect(() => {
    fetchDashboardMetrics();
  }, []);

  useEffect(() => {
    fetchData();
  }, []); // Fetch once on mount

  async function fetchDashboardMetrics() {
      try {
          // 1. Total Animals in animal_statistics (Animals milked in last year)
          // We can use the RPC for this now
          const { data: metrics, error: rpcError } = await supabase.rpc('get_animal_stats_dashboard_metrics');
          if (!rpcError && metrics) {
              setActiveAnimals(metrics.active_milking);
              setTotalAnimalsInStats(metrics.total_in_stats);
          } else {
             // Fallback if RPC fails or not updated yet
             console.warn("RPC fetch failed, falling back to manual count");
             const { count: statsCount } = await supabase.from("animal_statistics").select("*", { count: 'exact', head: true });
             setTotalAnimalsInStats(statsCount || 0);
          }

          // 2. Average Production (1 Year)
          const { data: avgProd, error: avgError } = await supabase.rpc('get_animal_stats_daily_avg');
          if (!avgError) setAvgProduction(avgProd);

      } catch (err) {
          console.error("Error fetching dashboard metrics", err);
      }
  }

  async function fetchData() {
    try {
      setLoading(true);
      
      // 1. Get Farm ID
      const { data: profile } = await supabase
        .from("profiles")
        .select("farm_id")
        .eq("id", user.id)
        .single();

      if (!profile?.farm_id) return;

      const { data: result, error } = await supabase.rpc("get_active_animals_stats", {
          p_farm_id: profile.farm_id
      });

      if (error) throw error;

      setData(result || []);

    } catch (err) {
      console.error("Error fetching active animals stats:", err);
    } finally {
      setLoading(false);
    }
  }

  // Client-side filtering, sorting and pagination
  const filteredAndSortedData = useMemo(() => {
    let processedData = [...data];

    // 1. Search
    if (searchTerm) {
      processedData = processedData.filter(row => 
        row.animal_oid && row.animal_oid.toString().includes(searchTerm)
      );
    }

    // Calculate Financials for Sorting if needed
    // (We calculate them on the fly during sort/render)
    const getFinancials = (row) => {
         const revenue = ((row.annual_total_yield || 0) - (row.annual_diverted_milk || 0)) * (settings.milkPrice || 0);
         const feedCost = (
             ((row.annual_dry_days || 0) * (settings.dryRation || 0) * (settings.costSS || 0)) + 
             ((row.annual_milking_days || 0) * (settings.lactationRation || 0) * (settings.costSS || 0))
         );
         return { revenue, feedCost, iofc: revenue - feedCost };
    };

    // 2. Sort
    processedData.sort((a, b) => {
      let valA = a[sortConfig.key];
      let valB = b[sortConfig.key];
      
      if (['iofc', 'revenue', 'cost'].includes(sortConfig.key)) {
          const finA = getFinancials(a);
          const finB = getFinancials(b);
          if (sortConfig.key === 'iofc') { valA = finA.iofc; valB = finB.iofc; }
          else if (sortConfig.key === 'revenue') { valA = finA.revenue; valB = finB.revenue; }
          else if (sortConfig.key === 'cost') { valA = finA.feedCost; valB = finB.feedCost; }
      }

      if (valA < valB) {
        return sortConfig.direction === 'asc' ? -1 : 1;
      }
      if (valA > valB) {
        return sortConfig.direction === 'asc' ? 1 : -1;
      }
      return 0;
    });

    return processedData;
  }, [data, searchTerm, sortConfig, settings]);

  // 3. Pagination
  const paginatedData = useMemo(() => {
    const startIndex = page * pageSize;
    return filteredAndSortedData.slice(startIndex, startIndex + pageSize);
  }, [filteredAndSortedData, page, pageSize]);

  const totalCount = filteredAndSortedData.length;

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const SortButton = ({ label, sortKey }) => (
    <button 
      onClick={() => handleSort(sortKey)}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
        sortConfig.key === sortKey
          ? 'bg-[#556b2f] text-white border-[#556b2f]' 
          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
      }`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col mt-6">
      {/* Header & Controls */}
      <div className="p-6 border-b border-gray-100 flex flex-col gap-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
            <h3 className="text-lg font-bold text-[#3a352f] flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#556b2f]" />
                {t('stats.active_animals')}
            </h3>
            <p className="text-sm text-gray-500">{t('stats.annual_analysis')}</p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 items-center">
                {/* Search */}
                <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input 
                    type="text" 
                    placeholder={t('dashboard.search_placeholder')} 
                    value={searchTerm}
                    onChange={(e) => {
                        setSearchTerm(e.target.value);
                        setPage(0);
                    }}
                    className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] bg-gray-50 text-sm"
                />
                </div>
            </div>
        </div>

        {/* Dashboard Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            
            {/* Average Production Widget - Clickable to open Modal */}
            <div 
                onClick={() => setIsModalOpen(true)}
                className="bg-gray-50 border border-gray-200 p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:shadow-md transition-all group relative"
            >
                <div className="absolute top-3 right-3 opacity-50 group-hover:opacity-100 transition-opacity">
                    <BarChart2 className="w-5 h-5 text-gray-400 group-hover:text-[#556b2f]" />
                </div>
                <span className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">{t('stats.avg_production_label')}</span>
                <span className="text-3xl font-bold text-[#3a352f]">{avgProduction ? Number(avgProduction).toFixed(1) : '-'} kg</span>
                <span className="text-[10px] text-[#556b2f] mt-1 group-hover:underline">{t('stats.view_distribution')}</span>
            </div>

            <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl flex flex-col items-center justify-center">
                <span className="text-xs text-gray-700 uppercase tracking-wider font-semibold mb-1">{t('stats.active_count_label')}</span>
                <span className="text-3xl font-bold text-[#556b2f]-800">{totalCount}</span>
            </div>
        </div>
      </div>

      {/* Distribution Graph Modal */}
      <DistributionGraphModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        user={user}
        avgProduction={avgProduction}
      />

      {/* Animal Detail Modal */}
      <AnimalDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        animal={selectedAnimal}
        settings={settings}
      />

      {/* Pagination */}
      <div className="px-6 py-3 bg-gray-50/50 border-b border-gray-100 flex gap-2 overflow-x-auto">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider py-1.5">{t('stats.sort_by')}</span>
        <SortButton label={t('stats.sort.iofc')} sortKey="iofc" />
        <SortButton label={t('stats.sort.dim')} sortKey="dim" />
        <SortButton label={t('stats.sort.lactation')} sortKey="lactation_number" />
        <SortButton label={t('stats.sort.production')} sortKey="avg_daily_yield" />
      </div>

      {/* List Content */}
      <div className="p-6 bg-gray-50/30 flex-1 min-h-[400px]">
        {loading ? (
           <div className="flex items-center justify-center h-64">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#556b2f]"></div>
           </div>
        ) : paginatedData.length === 0 ? (
           <div className="flex flex-col items-center justify-center h-64 text-gray-400">
               <p>{t('stats.no_data')}</p>
           </div>
        ) : (
           <div className="grid grid-cols-1 gap-4">
              {paginatedData.map((cow) => (
                 <div 
                    key={cow.animal_oid} 
                    onClick={() => {
                        setSelectedAnimal(cow);
                        setIsDetailModalOpen(true);
                    }}
                    className="bg-white p-5 rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row items-center gap-6 cursor-pointer group"
                 >
                    
                    {/* Top Section: ID, Lactation, DIM */}
                    <div className="flex flex-col md:flex-row items-center gap-8 w-full md:w-auto border-b md:border-b-0 md:border-r border-gray-100 pb-4 md:pb-0 md:pr-6">
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{t('dashboard.card.id')}</span>
                            <span className="text-2xl font-bold text-[#1B4B66]">{cow.animal_oid}</span>
                        </div>
                        <div className="w-px h-8 bg-gray-100 hidden md:block"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{t('dashboard.card.lactation')}</span>
                            <span className="text-xl font-bold text-gray-700">{cow.lactation_number}</span>
                        </div>
                        <div className="w-px h-8 bg-gray-100 hidden md:block"></div>
                        <div className="flex flex-col items-center">
                            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{t('dashboard.card.dim')}</span>
                            <span className="text-xl font-bold text-gray-700">{cow.dim}</span>
                        </div>
                    </div>

                    {/* Body Section: Financials */}
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full">
                         {/* Valore Produzione */}
                         <div className="flex flex-col items-center p-3 bg-gray-50 rounded-lg">
                             <span className="text-[10px] text-gray-400 uppercase font-semibold mb-1">{t('stats.production_value')}</span>
                             <span className="text-lg font-bold text-[#3a352f]">
                                 {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
                                     ((cow.annual_total_yield || 0) - (cow.annual_diverted_milk || 0)) * (settings.milkPrice || 0)
                                 )}
                             </span>
                         </div>
                         
                         {/* Costo Alimentazione */}
                         <div className="flex flex-col items-center p-3 bg-gray-50 rounded-lg">
                             <span className="text-[10px] text-gray-400 uppercase font-semibold mb-1">{t('stats.feed_cost')}</span>
                             <span className="text-lg font-bold text-[#3a352f]">
                                 {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
                                     ((cow.annual_dry_days || 0) * (settings.dryRation || 0) * (settings.costSS || 0)) + 
                                     ((cow.annual_milking_days || 0) * (settings.lactationRation || 0) * (settings.costSS || 0))
                                 )}
                             </span>
                         </div>

                         {/* IOFC */}
                         <div className="flex flex-col items-center p-3 bg-[#fdfbf7] border border-[#f3e6d5] rounded-lg">
                             <span className="text-[10px] text-[#8c7355] uppercase font-bold mb-1">IOFC</span>
                             <span className="text-lg font-bold text-[#3a352f]">
                                 {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(
                                     (((cow.annual_total_yield || 0) - (cow.annual_diverted_milk || 0)) * (settings.milkPrice || 0)) - 
                                     (((cow.annual_dry_days || 0) * (settings.dryRation || 0) * (settings.costSS || 0)) + 
                                      ((cow.annual_milking_days || 0) * (settings.lactationRation || 0) * (settings.costSS || 0)))
                                 )}
                             </span>
                         </div>
                    </div>

                 </div>
              ))}
           </div>
        )}
      </div>

      {/* Pagination */}
      <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-white rounded-b-xl">
        <div className="text-sm text-gray-500">
            {t('stats.total_heads')}: <span className="font-medium text-[#3a352f]">{totalCount}</span>
        </div>
        
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500 hidden sm:inline">{t('stats.rows_label')}</span>
                <select 
                    value={pageSize}
                    onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setPage(0);
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
                    {page + 1}
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
  );
}