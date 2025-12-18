import { useState, useEffect } from "react";
import { supabase } from "../supabaseClient";
import { Coins, TrendingDown, TrendingUp, AlertCircle, Calendar } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { useLanguage } from "../contexts/LanguageContext";

export default function EconomicManagement({ user, settings }) {
  const [stats, setStats] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { t } = useLanguage();

  // Date Range State
  const [rangeMode, setRangeMode] = useState('1y'); // '1y', 'ytd', 'custom'
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    if (user && settings) {
      fetchStats();
    }
  }, [user, settings, rangeMode, customStart, customEnd]);

  async function fetchStats() {
    try {
      setLoading(true);
      setError(null);
      
      // 1. Get Farm ID
      let farmId = null;
      
      const { data: profile } = await supabase
        .from("profiles")
        .select("farm_id")
        .eq("id", user.id)
        .single();
        
      if (profile?.farm_id) {
          farmId = profile.farm_id;
      } else {
          // Fallback: Try to get farm_id from animal_statistics
          const { data: animalStat } = await supabase.from("animal_statistics").select("farm_id").limit(1);
          if (animalStat?.[0]?.farm_id) {
             farmId = animalStat[0].farm_id;
          }
      }

      if (!farmId) {
          return;
      }

      // 2. Determine Date Range
      let startDate = null;
      let endDate = null;
      
      if (rangeMode === 'ytd') {
          const now = new Date();
          startDate = `${now.getFullYear()}-01-01T00:00:00`;
          endDate = now.toISOString();
      } else if (rangeMode === 'custom') {
          if (!customStart || !customEnd) {
             setLoading(false);
             return;
          }
          startDate = `${customStart}T00:00:00`;
          endDate = `${customEnd}T23:59:59`;
      }

      const { data, error } = await supabase.rpc("get_economic_trends", {
          p_farm_id: farmId,
          p_milk_price: settings.milkPrice || 0,
          p_cost_ss: settings.costSS || 0,
          p_ration_dry: settings.dryRation || 0,
          p_ration_lact: settings.lactationRation || 0,
          p_start_date: startDate,
          p_end_date: endDate
      });

      if (error) throw error;
      
      if (data) {
          // Process Chart Data
          const processedData = data.map(d => ({
              ...d,
              dateStr: new Date(d.day_date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }),
              revenue: d.daily_revenue,
              cost: d.daily_cost
          }));
          setChartData(processedData);

          // Calculate Totals
          const totalRev = data.reduce((sum, d) => sum + (d.daily_revenue || 0), 0);
          const totalCost = data.reduce((sum, d) => sum + (d.daily_cost || 0), 0);
          const totalYield = data.reduce((sum, d) => sum + (d.daily_yield || 0), 0);
          const totalDiverted = data.reduce((sum, d) => sum + (d.daily_diverted || 0), 0);
          const totalAnimals = data.length > 0 ? data[0].herd_size : 0;

          setStats({
              total_revenue: totalRev,
              total_cost: totalCost,
              total_animals_count: totalAnimals,
              total_yield_agg: totalYield,
              total_diverted_agg: totalDiverted,
              total_suspension_days_agg: 0
          });
      }
    } catch (err) {
      console.error("Error fetching economic stats:", err);
      setError(t('economic.error'));
    } finally {
      setLoading(false);
    }
  }

  // Format currency
  const formatCurrency = (val) => {
      return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val || 0);
  };

  if (!stats && !loading) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-6">
      
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-2">
             <Coins className="w-5 h-5 text-yellow-600" />
             <h3 className="text-lg font-semibold text-gray-800">{t('economic.title')}</h3>
        </div>
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <button 
               onClick={() => setRangeMode('1y')}
               className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${rangeMode === '1y' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
               {t('economic.range_1y')}
            </button>
            <button 
               onClick={() => setRangeMode('ytd')}
               className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${rangeMode === 'ytd' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
               {t('economic.range_ytd')}
            </button>
            <button 
               onClick={() => setRangeMode('custom')}
               className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${rangeMode === 'custom' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
            >
               {t('economic.range_custom')}
            </button>
        </div>
      </div>

      {/* Custom Date Inputs */}
      {rangeMode === 'custom' && (
          <div className="flex flex-wrap items-center gap-4 mb-6 bg-gray-50 p-3 rounded-lg border border-gray-100 animate-in slide-in-from-top-2 duration-200">
             <div className="flex items-center gap-2">
                 <Calendar className="w-4 h-4 text-gray-400" />
                 <span className="text-xs font-medium text-gray-500 uppercase">{t('economic.date_from')}</span>
                 <input 
                   type="date" 
                   value={customStart}
                   onChange={(e) => setCustomStart(e.target.value)}
                   className="border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                 />
             </div>
             <div className="flex items-center gap-2">
                 <span className="text-xs font-medium text-gray-500 uppercase">{t('economic.date_to')}</span>
                 <input 
                   type="date" 
                   value={customEnd}
                   onChange={(e) => setCustomEnd(e.target.value)}
                   className="border border-gray-200 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                 />
             </div>
          </div>
      )}

      {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mb-2"></div>
              <p className="text-sm">{t('economic.loading')}</p>
          </div>
      ) : error ? (
          <div className="p-4 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              {error}
          </div>
      ) : stats ? (
          <>
            {/* Chart Section */}
            <div className="mb-8 h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#16a34a" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#16a34a" stopOpacity={0}/>
                            </linearGradient>
                            <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.1}/>
                                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis 
                            dataKey="dateStr" 
                            tick={{fontSize: 10, fill: '#94a3b8'}} 
                            tickLine={false} 
                            axisLine={false} 
                            minTickGap={30}
                        />
                        <YAxis 
                            tickFormatter={(val) => `€${val/1000}k`} 
                            tick={{fontSize: 10, fill: '#94a3b8'}} 
                            tickLine={false} 
                            axisLine={false} 
                        />
                        <Tooltip 
                            formatter={(value) => formatCurrency(value)}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                        />
                        <Area type="monotone" dataKey="revenue" name={t('economic.revenue')} stroke="#16a34a" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                        <Area type="monotone" dataKey="cost" name={t('economic.cost')} stroke="#ef4444" fillOpacity={1} fill="url(#colorCost)" strokeWidth={2} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Revenue */}
              <div className="p-4 rounded-xl border border-green-100 bg-green-50/30 flex items-center justify-between">
                  <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">{t('economic.total_revenue')}</p>
                      <p className="text-2xl font-bold text-[#3a352f]">{formatCurrency(stats.total_revenue)}</p>
                      <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <p>{t('economic.total_yield')}: <span className="font-semibold">{Math.round(stats.total_yield_agg || 0).toLocaleString()} kg</span></p>
                          <p>{t('economic.diverted_milk')}: <span className="font-semibold">{Math.round(stats.total_diverted_agg || 0).toLocaleString()} kg</span></p>
                      </div>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
                      <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
              </div>

              {/* Costs */}
              <div className="p-4 rounded-xl border border-red-100 bg-red-50/30 flex items-center justify-between">
                  <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">{t('economic.total_cost')}</p>
                      <p className="text-2xl font-bold text-[#3a352f]">{formatCurrency(stats.total_cost)}</p>
                      <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <p>{t('economic.based_on_animals', {count: stats.total_animals_count})}</p>
                      </div>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center">
                      <TrendingDown className="w-6 h-6 text-red-600" />
                  </div>
              </div>

              {/* Margin */}
              <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-between">
                  <div>
                      <p className="text-sm font-medium text-gray-500 mb-1">{t('economic.margin')}</p>
                      <p className={`text-2xl font-bold ${stats.total_revenue - stats.total_cost >= 0 ? 'text-[#3a352f]' : 'text-red-600'}`}>
                          {formatCurrency(stats.total_revenue - stats.total_cost)}
                      </p>
                      <div className="mt-2 text-xs text-gray-500 space-y-1">
                          <p>{t('economic.diff_rev_cost')}</p>
                      </div>
                  </div>
                  <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center">
                      <Coins className="w-6 h-6 text-gray-600" />
                  </div>
              </div>
            </div>
          </>
      ) : null}
    </div>
  );
}
