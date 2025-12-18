import { useState, useEffect } from "react";
import { X, TrendingUp } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useLanguage } from "../contexts/LanguageContext";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine
} from "recharts";

export default function DistributionModal({ isOpen, onClose, animalOid, lactationNumber, currentYield, sessionDate, sessionEndDate }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState([]);
  const [previousDayYield, setPreviousDayYield] = useState(null);
  const [error, setError] = useState(null);
  const [province, setProvince] = useState(null);
  const [distDateRange, setDistDateRange] = useState({ start: null, end: null });
  const [stats, setStats] = useState({ avg: null, p20: null, p80: null });
  const { t } = useLanguage();

  // Calculate Duration
  const calculateDuration = (start, end) => {
      if (!start || !end) return "-";
      const startTime = new Date(start);
      const endTime = new Date(end);
      const diffMs = endTime - startTime;
      const diffMins = Math.floor(diffMs / 60000);
      const diffSecs = Math.floor((diffMs % 60000) / 1000);
      return `${diffMins}m ${diffSecs}s`;
  };
  
  const duration = calculateDuration(sessionDate, sessionEndDate);

  useEffect(() => {
    if (isOpen && animalOid) {
      fetchDistributionData();
    }
  }, [isOpen, animalOid, lactationNumber]);

  const fetchDistributionData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Get User Profile for Province and Species
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t('dist.error.user_auth'));

      const { data: profile } = await supabase
        .from("profiles")
        .select("province, animal_species")
        .eq("id", user.id)
        .single();

      if (!profile || !profile.province) {
        throw new Error(t('dist.error.province_config'));
      }
      setProvince(profile.province);
      const userSpecies = profile.animal_species || "C4"; // Default C4

      // 2. Fetch Previous Day Yield for the Animal
      // sessionDate is the date of the clicked session. We want the previous day relative to that.
      // If sessionDate is ISO string "2025-08-28T...", we parse it.
      const dateObj = new Date(sessionDate);
      dateObj.setDate(dateObj.getDate() - 1); // Subtract 1 day
      
      const prevStart = dateObj.toISOString().split('T')[0] + 'T00:00:00';
      const prevEnd = dateObj.toISOString().split('T')[0] + 'T23:59:59';

      const { data: yieldData, error: yieldError } = await supabase
        .from("mdi_predictor_mastertable")
        .select("TotalYield")
        .eq("animal_oid", animalOid)
        .gte("BeginTime", prevStart)
        .lte("BeginTime", prevEnd);

      if (yieldError) throw yieldError;

      // Calculate sum of TotalYield for the previous day
      const totalPrevYield = yieldData.reduce((sum, row) => sum + (row.TotalYield || 0), 0);
      setPreviousDayYield(totalPrevYield);

      // 3. Fetch Distribution Data via RPC
      // Logic: If LactationNumber > 1 -> n_parti > 1 (min_parity=2)
      //        If LactationNumber = 1 -> n_parti = 1 (min_parity=1, max_parity=1)
      const minParity = lactationNumber > 1 ? 2 : 1;
      const maxParity = lactationNumber > 1 ? null : 1;

      const distParams = { 
          p_province: profile.province,
          p_min_parity: minParity,
          p_max_parity: maxParity,
          p_species: userSpecies
      };

      const [distResult, metaResult] = await Promise.all([
          supabase.rpc('get_milk_distribution', distParams),
          supabase.rpc('get_milk_distribution_metadata', distParams).single()
      ]);

      if (distResult.error) throw distResult.error;

      // Handle Metadata
      if (metaResult.data) {
          setDistDateRange({
              start: metaResult.data.min_date,
              end: metaResult.data.max_date
          });
          setStats({
              avg: metaResult.data.avg_val,
              p20: metaResult.data.p10_val,
              p80: metaResult.data.p25_val
          });
      }

      // Transform data for Recharts
      // RPC returns { bin_floor: 10, frequency: 50 }
      // We want to sort and maybe fill gaps if necessary, but AreaChart handles gaps if XAxis is numeric type? 
      // Better to have continuous data.
      
      const distData = distResult.data;
      if (!distData || distData.length === 0) {
          setData([]); // No data found
      } else {
          // Sort just in case
          const sortedData = distData.sort((a, b) => a.bin_floor - b.bin_floor);
          setData(sortedData);
      }

    } catch (err) {
      console.error("Error fetching distribution data:", err);
      setError(err.message || t('dist.error.loading_data'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
          <div>
            <h2 className="text-xl font-bold text-[#3a352f] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#556b2f]" />
              {t('dist.modal.title')} ({province})
            </h2>
            <p className="text-sm text-gray-500">
              {t('dist.modal.subtitle')} ({lactationNumber > 1 ? t('dist.modal.multiparous') : t('dist.modal.primiparous')})
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto bg-[#fdfbf7] flex-1">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#556b2f]"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-center">
              {error}
            </div>
          ) : data.length === 0 ? (
            <div className="text-center text-gray-500 py-10">
              {t('dist.modal.no_data')}
            </div>
          ) : (
            <div className="space-y-6">
               <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm w-full" style={{ height: 400, minHeight: 400 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={data}
                      margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                    >
                      <defs>
                        <linearGradient id="colorFrequency" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#556b2f" stopOpacity={0.8}/>
                          <stop offset="95%" stopColor="#556b2f" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                      <XAxis 
                        dataKey="bin_floor" 
                        type="number" 
                        domain={['dataMin', 'dataMax']} 
                        tickCount={10}
                        label={{ value: t('dist.chart.production'), position: 'insideBottomRight', offset: -5 }}
                        tick={{ fontSize: 12, fill: '#666' }}
                      />
                      <YAxis 
                        tick={{ fontSize: 12, fill: '#666' }}
                        label={{ value: t('dist.chart.heads'), angle: -90, position: 'insideLeft' }}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value) => [value, t('dist.chart.heads_unit')]}
                        labelFormatter={(label) => `${label}-${label+1} kg`}
                      />
                      <Area 
                        type="monotone" 
                        dataKey="frequency" 
                        stroke="#556b2f" 
                        fillOpacity={1} 
                        fill="url(#colorFrequency)" 
                      />
                      {/* Stats Lines */}
                      {stats.avg && (
                        <ReferenceLine 
                            x={stats.avg} 
                            stroke="#3b82f6" 
                            strokeDasharray="4 4"
                            label={{ value: `${t('dist.stats.mean')}:  ${Number(stats.avg).toFixed(1)}`, fill: '#3b82f6', fontSize: 10, position: 'insideTop', fontWeight:'bold', angle: -90, dy: 200, dx: -10 }} 
                        />
                      )}
                      {stats.p20 && (
                        <ReferenceLine 
                            x={stats.p20} 
                            stroke="#ef4444" 
                            strokeDasharray="3 3"
                            label={{ value: `${t('dist.stats.p20')}  <  ${Number(stats.p20).toFixed(1)}`, fill: '#ef4444', fontSize: 10, position: 'insideTop', fontWeight: 'bold', angle: -90, dy: 200, dx: -10 }} 
                        />
                      )}
                      {stats.p80 && (
                        <ReferenceLine 
                            x={stats.p80} 
                            stroke="#4A6007" 
                            strokeDasharray="3 3"
                            label={{ value: `${t('dist.stats.p80')}  >  ${Number(stats.p80).toFixed(1)}`, fill: '#4A6007', fontSize: 10, position: 'insideTop', fontWeight: 'bold', angle: -90, dy: 200, dx: -10 }} 
                        />
                      )}

                      {/* Current Animal Line */}
                      {previousDayYield !== null && (
                        <ReferenceLine 
                            x={previousDayYield} 
                            stroke="#362A1F" 
                            label={{ 
                                value: `${previousDayYield.toFixed(1)} kg`, 
                                position: 'top', 
                                fill: '#362A1F',
                                fontWeight: 'bold'
                            }} 
                        />
                      )}
                    </AreaChart>
                  </ResponsiveContainer>
               </div>

               <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col items-center justify-center">
                     <span className="text-gray-500 text-sm">{t('dist.stats.yesterday_yield')}</span>
                     <span className="text-2xl font-bold text-[#3a352f]">{previousDayYield?.toFixed(1) ?? "-"} kg</span>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col items-center justify-center">
                     <span className="text-gray-500 text-sm">{t('dist.stats.province')}</span>
                     <span className="text-xl font-bold text-[#3a352f]">{province}</span>
                     {distDateRange.start && distDateRange.end && (
                        <span className="text-xs text-gray-400 mt-1">
                            {new Date(distDateRange.start).toLocaleDateString()} - {new Date(distDateRange.end).toLocaleDateString()}
                        </span>
                     )}
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 flex flex-col items-center justify-center">
                     <span className="text-gray-500 text-sm">{t('dist.stats.milking_details')}</span>
                     <span className="text-lg font-bold text-[#3a352f]">
                        {sessionDate ? new Date(sessionDate).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                     </span>
                     <span className="text-xs text-gray-500 mt-1">{t('dist.stats.duration')} {duration}</span>
                  </div>
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
