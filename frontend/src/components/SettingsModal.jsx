import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { supabase } from "../supabaseClient";
import { useLanguage } from "../contexts/LanguageContext";

export default function SettingsModal({ 
  isOpen, 
  onClose, 
  onSave, 
  initialAttention, 
  initialAlert, 
  initialSpecies,
  initialCostSS,
  initialMilkPrice,
  initialDryRation,
  initialLactationRation
}) {
  const [attention, setAttention] = useState(initialAttention || 1.4);
  const [alert, setAlert] = useState(initialAlert || 2.0);
  const [species, setSpecies] = useState(initialSpecies || "C4"); // Default C4 (Vacca)
  const { t } = useLanguage();
  
  // Economic Parameters
  const [costSS, setCostSS] = useState(initialCostSS || 0);
  const [milkPrice, setMilkPrice] = useState(initialMilkPrice || 0);
  const [dryRation, setDryRation] = useState(initialDryRation || 0);
  const [lactationRation, setLactationRation] = useState(initialLactationRation || 0);

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setAttention(initialAttention || 1.4);
      setAlert(initialAlert || 2.0);
      setSpecies(initialSpecies || "C4");
      setCostSS(initialCostSS || 0);
      setMilkPrice(initialMilkPrice || 0);
      setDryRation(initialDryRation || 0);
      setLactationRation(initialLactationRation || 0);
      setError("");
    }
  }, [isOpen, initialAttention, initialAlert, initialSpecies, initialCostSS, initialMilkPrice, initialDryRation, initialLactationRation]);

  const handleSave = async () => {
    // Validation
    const attVal = parseFloat(attention);
    const alertVal = parseFloat(alert);
    const costSSVal = parseFloat(costSS);
    const milkPriceVal = parseFloat(milkPrice);
    const dryRationVal = parseFloat(dryRation);
    const lactRationVal = parseFloat(lactationRation);

    if (isNaN(attVal) || isNaN(alertVal) || isNaN(costSSVal) || isNaN(milkPriceVal) || isNaN(dryRationVal) || isNaN(lactRationVal)) {
      setError(t('settings.error_numeric'));
      return;
    }

    if (attVal >= alertVal) {
      setError(t('settings.error_threshold'));
      return;
    }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utente non autenticato");

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          mdi_attention_threshold: attVal,
          mdi_alert_threshold: alertVal,
          animal_species: species,
          cost_ss_per_kg: costSSVal,
          milk_price: milkPriceVal,
          dry_ration_daily_kg: dryRationVal,
          lactation_ration_daily_kg: lactRationVal
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      onSave({
        attention: attVal, 
        alert: alertVal, 
        species, 
        costSS: costSSVal, 
        milkPrice: milkPriceVal, 
        dryRation: dryRationVal, 
        lactationRation: lactRationVal
      });
      onClose();
    } catch (err) {
      console.error("Errore salvataggio impostazioni:", err);
      setError(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <h3 className="font-bold text-lg text-[#3a352f]">{t('settings.title')}</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100">
              {error}
            </div>
          )}

          <div className="space-y-4">
            {/* Species Selector */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                {t('settings.species_label')}
              </label>
              <select
                value={species}
                onChange={(e) => setSpecies(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] text-gray-900 bg-white"
              >
                <option value="C4">{t('settings.species_cow')}</option>
                <option value="70">{t('settings.species_buffalo')}</option>
              </select>
              <p className="text-xs text-gray-500">{t('settings.species_help')}</p>
            </div>

            {/* Attention Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-400 rounded-sm"></div>
                {t('settings.attention_label')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={attention}
                  onChange={(e) => setAttention(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] text-gray-900"
                  placeholder="1.40"
                />
              </div>
              <p className="text-xs text-gray-500">{t('settings.attention_help')}</p>
            </div>

            {/* Alert Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
                {t('settings.alert_label')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  value={alert}
                  onChange={(e) => setAlert(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] text-gray-900"
                  placeholder="2.00"
                />
              </div>
              <p className="text-xs text-gray-500">{t('settings.alert_help')}</p>
            </div>
          </div>
          
          <div className="space-y-4 pt-4 border-t border-gray-100">
            <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider">{t('settings.economic_section')}</h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('settings.cost_ss')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={costSS}
                  onChange={(e) => setCostSS(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] text-gray-900"
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('settings.milk_price')}</label>
                <input
                  type="number"
                  step="0.01"
                  value={milkPrice}
                  onChange={(e) => setMilkPrice(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] text-gray-900"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('settings.dry_ration')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={dryRation}
                  onChange={(e) => setDryRation(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] text-gray-900"
                  placeholder="0.0"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">{t('settings.lactation_ration')}</label>
                <input
                  type="number"
                  step="0.1"
                  value={lactationRation}
                  onChange={(e) => setLactationRation(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] text-gray-900"
                  placeholder="0.0"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            {t('settings.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-bold text-white bg-[#556b2f] hover:bg-[#435725] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? t('settings.saving') : t('settings.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
