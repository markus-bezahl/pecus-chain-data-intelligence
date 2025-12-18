import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { X, TrendingUp, Droplet, Coins } from "lucide-react";
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea
} from "recharts";
import { useLanguage } from "../contexts/LanguageContext";

export default function AnimalDetailModal({ isOpen, onClose, animal, settings }) {
  const [historyData, setHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const { t } = useLanguage();

  useEffect(() => {
    if (isOpen && animal?.animal_oid) {
      fetchAnimalHistory();
    }
  }, [isOpen, animal]);

  async function fetchAnimalHistory() {
    try {
      setLoadingHistory(true);
      const { data, error } = await supabase.rpc('get_animal_annual_history_v2', {
        p_animal_oid: animal.animal_oid
      });

      if (error) throw error;
      setHistoryData(data);
    } catch (err) {
      console.error("Error fetching animal history:", err);
    } finally {
      setLoadingHistory(false);
    }
  }

  const chartData = useMemo(() => {
    if (!historyData) return { points: [], gaps: [], lactations: [], exitDate: null };

    const { yields = [], diversions = [], lactations = [], exit_date } = historyData;

    // 1. Aggregate Yields by Day
    const dailyMap = new Map();
    
    // Fill from yields
    yields.forEach(s => {
      const day = s.BeginTime.split('T')[0]; 
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { date: day, total: 0, diverted: 0, net: 0, timestamp: new Date(day).getTime() });
      }
      dailyMap.get(day).total += (s.TotalYield || 0);
    });

    // 2. Map Diversions
    diversions.forEach(d => {
      const day = d.DivertDate.split('T')[0];
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { date: day, total: 0, diverted: 0, net: 0, timestamp: new Date(day).getTime() });
      }
      dailyMap.get(day).diverted += (d.DivertedMilk || 0);
    });

    // 3. Calculate Net and Sort
    const points = Array.from(dailyMap.values())
      .map(p => ({
        ...p,
        net: Math.max(0, p.total - p.diverted),
        displayDate: new Date(p.date).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' })
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    // 4. Calculate Gaps (Periodi > 36h based on raw BeginTime)
    // Use raw yields for precise gap detection if available
    const gaps = [];
    if (yields.length > 1) {
      for (let i = 1; i < yields.length; i++) {
        const prevTime = new Date(yields[i-1].BeginTime).getTime();
        const currTime = new Date(yields[i].BeginTime).getTime();
        const diffHours = (currTime - prevTime) / (1000 * 60 * 60);
        
        if (diffHours > 36) { // > 1.5 days
           const prevDay = yields[i-1].BeginTime.split('T')[0];
           const currDay = yields[i].BeginTime.split('T')[0];
           gaps.push({ x1: prevDay, x2: currDay, days: Math.floor(diffHours / 24) });
        }
      }
    }

    // 5. Lactations
    const lactLines = lactations.map(l => ({
       date: l.StartDate.split('T')[0],
       label: `${t('detail.lactation_abbr')} ${l.LactationNumber}`
    }));

    return { 
        points, 
        gaps, 
        lactLines, 
        exitDate: exit_date ? exit_date.split('T')[0] : null 
    };

  }, [historyData, t]);

  const calculatedStats = useMemo(() => {
    const {
      milkPrice = 0,
      costSS = 0,
      dryRation = 0,
      lactationRation = 0
    } = settings || {};

    let res = {
        revenue: 0, totalCost: 0, profit: 0, 
        totalYield: 0, divertedMilk: 0,
        lactationDays: 0, suspensionDays: 0,
        lactationCost: 0, dryCost: 0,
        milkPrice, lactationRation, costSS, dryRation
    };

    if (!settings) return res;

    if (historyData) {
        const { yields = [], diversions = [] } = historyData;

        const totalYield = yields.reduce((sum, y) => sum + (y.TotalYield || 0), 0);
        const divertedMilk = diversions.reduce((sum, d) => sum + (d.DivertedMilk || 0), 0);
        
        const uniqueDays = new Set(yields.map(y => y.BeginTime ? y.BeginTime.split('T')[0] : '')).size;
        const dryDays = Math.max(0, 365 - uniqueDays);

        const revenue = (totalYield - divertedMilk) * milkPrice;
        const dryCost = dryDays * dryRation * costSS;
        const lactationCost = uniqueDays * lactationRation * costSS;
        const totalCost = dryCost + lactationCost;

        res = {
            revenue, totalCost, profit: revenue - totalCost,
            totalYield, divertedMilk,
            lactationDays: uniqueDays, suspensionDays: dryDays,
            lactationCost, dryCost,
            milkPrice, lactationRation, costSS, dryRation
        };
    } else if (animal && animal.total_yield) {
         const totalYield = Number(animal.total_yield || 0);
         const divertedMilk = Number(animal.diverted_milk || 0);
         const suspensionDays = [1,2,3,4,5].reduce((acc, i) => acc + (Number(animal[`suspension_${i}`]) || 0), 0);
         const lactationDays = Math.max(0, 365 - suspensionDays);

         const revenue = (totalYield - divertedMilk) * milkPrice;
         const dryCost = suspensionDays * dryRation * costSS;
         const lactationCost = lactationDays * lactationRation * costSS;
         const totalCost = dryCost + lactationCost;

         res = {
            revenue, totalCost, profit: revenue - totalCost,
            totalYield, divertedMilk,
            lactationDays, suspensionDays,
            lactationCost, dryCost,
            milkPrice, lactationRation, costSS, dryRation
        };
    }

    return res;
  }, [historyData, animal, settings]);

  if (!isOpen || !animal) return null;

  const { revenue, totalCost, profit, totalYield, divertedMilk, lactationDays, suspensionDays, lactationCost, dryCost, milkPrice, lactationRation, costSS, dryRation } = calculatedStats;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-[95vw] max-h-[90vh] overflow-y-auto flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-[#3a352f] flex items-center gap-2">
              {t('detail.title')}
              <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-sm font-mono">{animal.animal_oid}</span>
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{t('detail.subtitle')}</span>
                {animal.birth_date && (
                    <>
                        <span>•</span>
                        <span>{t('detail.born_on')} {new Date(animal.birth_date).toLocaleDateString()}</span>
                    </>
                )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">

          {/* Annual Production Graph */}
          <div className="bg-white rounded-xl p-5 border border-gray-100">
            <h3 className="text-sm font-bold text-gray-700 mb-6 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#556b2f]" />
              {t('detail.graph_title')}
            </h3>
            
            <div className="h-[350px] w-full">
              {loadingHistory ? (
                 <div className="h-full flex items-center justify-center">
                   <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#556b2f]"></div>
                 </div>
              ) : chartData.points.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData.points} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(val) => {
                         const d = new Date(val);
                         return `${d.getDate()}/${d.getMonth()+1}`;
                      }}
                      tick={{ fontSize: 10, fill: '#9ca3af' }}
                      interval="preserveStartEnd"
                      minTickGap={30}
                    />
                    <YAxis 
                       tick={{ fontSize: 10, fill: '#9ca3af' }} 
                       axisLine={false}
                       tickLine={false}
                       unit=" kg"
                    />
                    <Tooltip 
                       contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                       labelFormatter={(val) => new Date(val).toLocaleDateString('it-IT')}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    
                    {/* Gaps Highlight */}
                    {chartData.gaps.map((gap, i) => (
                       <ReferenceArea 
                         key={i} 
                         x1={gap.x1} 
                         x2={gap.x2} 
                         fill="#fee2e2" 
                         fillOpacity={0.5} 
                         label={{ value: t('detail.stop_days', {days: gap.days}), position: 'insideTop', fill: '#ef4444', fontSize: 10 }} 
                       />
                    ))}

                    {/* Lactation Start Lines */}
                    {chartData.lactLines.map((l, i) => (
                       <ReferenceLine 
                          key={`lact-${i}`} 
                          x={l.date} 
                          stroke="#f59e0b" 
                          strokeDasharray="3 3" 
                          label={{ value: l.label, position: 'insideTopLeft', fill: '#f59e0b', fontSize: 10, angle: 0, offset: 10 }} 
                       />
                    ))}

                    {/* Exit Date Line */}
                    {chartData.exitDate && (
                       <ReferenceLine 
                          x={chartData.exitDate} 
                          stroke="#ef4444" 
                          strokeWidth={2}
                          label={{ value: t('detail.exit'), position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} 
                       />
                    )}

                    <Bar name={t('detail.diverted_milk')} dataKey="diverted" fill="#ef4444" barSize={4} stackId="a" />
                    <Line 
                       type="monotone" 
                       name={t('detail.net_production')} 
                       dataKey="net" 
                       stroke="#556b2f" 
                       strokeWidth={2} 
                       dot={false} 
                       activeDot={{ r: 4 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                  {t('detail.no_history')}
                </div>
              )}
            </div>
          </div>
          
          {/* Breakdown Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Production Stats */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Droplet className="w-4 h-4 text-[#556b2f]-500" />
                {t('detail.production_data')}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('detail.total_yield')}</span>
                  <span className="font-medium">{totalYield.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('detail.diverted_milk')}</span>
                  <span className="font-medium text-red-500">{divertedMilk.toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                  <span className="text-gray-700 font-medium">{t('detail.salable_milk')}</span>
                  <span className="font-bold">{(totalYield - divertedMilk).toFixed(1)} kg</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-1">
                  <span>{t('detail.milk_price_unit', {price: milkPrice})}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-[#556b2f] mt-2 pt-2 border-t border-dashed border-gray-200">
                   <span>{t('detail.total_revenue')}</span>
                   <span>€ {revenue.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Cost Stats */}
            <div className="bg-gray-50 rounded-xl p-5 border border-gray-100">
              <h3 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                <Coins className="w-4 h-4 text-[#556b2f]-500" />
                {t('detail.feed_cost_details')}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">{t('detail.lactation_days')} ({lactationDays}gg)</span>
                  <span className="font-medium">€ {lactationCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 pl-2">
                   <span>{t('detail.ration_cost', {amount: lactationRation, cost: costSS})}</span>
                </div>

                <div className="flex justify-between text-sm mt-2">
                  <span className="text-gray-500">{t('detail.dry_days')} ({suspensionDays}gg)</span>
                  <span className="font-medium">€ {dryCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 pl-2">
                   <span>{t('detail.ration_cost', {amount: dryRation, cost: costSS})}</span>
                </div>
                
                <div className="flex justify-between text-sm border-t border-gray-200 pt-2 mt-2">
                  <span className="text-gray-700 font-medium">{t('detail.total_cost')}</span>
                  <span className="font-bold">€ {totalCost.toFixed(2)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}