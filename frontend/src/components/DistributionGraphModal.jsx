import React, { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { X, Info, AlertTriangle, TrendingUp } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

export default function DistributionGraphModal({ isOpen, onClose, user, avgProduction }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ start: null, end: null });
  const [province, setProvince] = useState(null);
  const [stats, setStats] = useState({ avg: null, p20: null, p80: null });
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen && user) {
      fetchDistributionData();
    }
  }, [isOpen, user]);

  const fetchDistributionData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Get User Profile for province and species
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("province, animal_species")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;
      if (!profile?.province) throw new Error(t('dist.error.province'));

      setProvince(profile.province);

      const userSpecies = profile.animal_species || 'C4'; // Default to cow

      // 2. Fetch Distribution Data & Metadata
      const distParams = { 
          p_province: profile.province,
          p_min_parity: 1, 
          p_max_parity: null, 
          p_species: userSpecies
      };

      const [distResult, metaResult] = await Promise.all([
          supabase.rpc('get_milk_distribution', distParams),
          supabase.rpc('get_milk_distribution_metadata', distParams).single()
      ]);

      if (distResult.error) throw distResult.error;
      
      // Handle Metadata
      if (metaResult.data) {
          setDateRange({
              start: metaResult.data.min_date,
              end: metaResult.data.max_date
          });
          setStats({
              avg: metaResult.data.avg_val,
              p20: metaResult.data.p10_val,
              p80: metaResult.data.p25_val
          });
      }

      if (!distResult.data || distResult.data.length === 0) {
          setData([]);
      } else {
          const sortedData = distResult.data.sort((a, b) => a.bin_floor - b.bin_floor);
          setData(sortedData);
      }

    } catch (err) {
      console.error("Error fetching distribution data:", err);
      setError(err.message || t('dist.error.loading'));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-[#3a352f] flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#556b2f]" />
              {t('dist.title')} ({province})
            </h2>
            <p className="text-sm text-gray-500">{t('dist.subtitle')}</p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-80">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#556b2f]"></div>
                <p className="mt-4 text-gray-500">{t('dist.loading')}</p>
             </div>
          ) : error ? (
             <div className="flex flex-col items-center justify-center h-80 text-red-500">
                <AlertTriangle className="w-12 h-12 mb-4" />
                <p>{error}</p>
             </div>
          ) : (
             <>
                <div className="border border-gray-200 rounded-2xl p-6 shadow-sm bg-white mb-6">
                    <div style={{ width: '100%', height: 400 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                                <defs>
                                    <linearGradient id="colorFrequencyModal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#556b2f" stopOpacity={0.6}/>
                                        <stop offset="95%" stopColor="#556b2f" stopOpacity={0.1}/>
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                <XAxis 
                                    dataKey="bin_floor" 
                                    type="number" 
                                    domain={['dataMin', 'dataMax']} 
                                    label={{ value: t('dist.axis.production'), position: 'bottom', offset: 0, fill: '#6b7280' }} 
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                    axisLine={{ stroke: '#e5e7eb' }}
                                    tickLine={false}
                                />
                                <YAxis 
                                    label={{ value: t('dist.axis.heads'), angle: -90, position: 'insideLeft', fill: '#6b7280' }}
                                    tick={{ fill: '#6b7280', fontSize: 12 }}
                                    axisLine={{ stroke: '#e5e7eb' }}
                                    tickLine={false}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    labelStyle={{ color: '#6b7280', marginBottom: '4px' }}
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="frequency" 
                                    stroke="#556b2f" 
                                    fillOpacity={1} 
                                    fill="url(#colorFrequencyModal)" 
                                />
                                {/* Stats Lines */}
                                {stats.avg && (
                                    <ReferenceLine 
                                        x={stats.avg} 
                                        stroke="#3b82f6" 
                                        strokeDasharray="4 4"
                                        label={{ value: `${t('dist.stats.mean')}: ${Number(stats.avg).toFixed(1)}`, fill: '#3b82f6', fontSize: 10, position: 'insideTop', fontWeight: 'bold', angle: -90, dy: 200, dx: -10 }} 
                                    />
                                )}
                                {stats.p20 && (
                                    <ReferenceLine 
                                        x={stats.p20} 
                                        stroke="#ef4444" 
                                        strokeDasharray="3 3"
                                        label={{ value: `${t('dist.stats.p20')} < ${Number(stats.p20).toFixed(1)}`, fill: '#ef4444', fontSize: 10, position: 'insideTop', fontWeight: 'bold', angle: -90, dy: 200, dx: -10 }} 
                                    />
                                )}
                                {stats.p80 && (
                                    <ReferenceLine 
                                        x={stats.p80} 
                                        stroke="#4A6007" 
                                        strokeDasharray="3 3"
                                        label={{ value: `${t('dist.stats.p80')} > ${Number(stats.p80).toFixed(1)}`, fill: '#4A6007', fontSize: 10, position: 'insideTop', fontWeight: 'bold', angle: -90, dy: 200, dx: -10 }} 
                                    />
                                )}
                                {avgProduction !== null && (
                                    <ReferenceLine 
                                        x={Number(avgProduction)} 
                                        stroke="#362A1F" 
                                        label={{ 
                                            value: `${Number(avgProduction).toFixed(1)} kg`, 
                                            position: 'top', 
                                            fill: '#362A1F',
                                            fontWeight: 'bold',
                                            fontSize: 14
                                        }} 
                                    />
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg border border-gray-100 flex items-start gap-3">
                    <Info className="w-5 h-5 text-[#556b2f] flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-gray-600">
                        <p className="mb-2">
                            {t('dist.description')}
                        </p>
                        <div className="flex flex-wrap gap-4 text-xs text-gray-500 mt-2">
                            {dateRange.start && dateRange.end && (
                                <span>
                                    <strong>{t('dist.data_label')}:</strong> {new Date(dateRange.start).toLocaleDateString()} - {new Date(dateRange.end).toLocaleDateString()}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
             </>
          )}
        </div>
      </div>
    </div>
  );
}
