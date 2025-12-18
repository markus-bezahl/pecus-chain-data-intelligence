import { useState, useEffect } from "react";
import { X, User, MapPin, Phone, Building, Globe } from "lucide-react";
import { supabase } from "../supabaseClient";

export default function ProfileModal({ isOpen, onClose, onSave }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  
  const [formData, setFormData] = useState({
    first_name: "",
    last_name: "",
    company: "",
    phone: "",
    country: "Italia",
    region: "",
    province: "",
    timezone: "Europe/Rome"
  });

  // Load profile data when modal opens
  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  // Auto-calculate timezone when location fields change
  // Currently simplified for Italy as requested
  useEffect(() => {
    if (formData.country === "Italia") {
      setFormData(prev => ({ ...prev, timezone: "Europe/Rome" }));
    }
    // Future: Add logic for other countries
  }, [formData.country, formData.region, formData.province]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("first_name, last_name, company, phone, country, region, province, timezone")
        .eq("id", user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;

      if (profile) {
        setFormData({
          first_name: profile.first_name || "",
          last_name: profile.last_name || "",
          company: profile.company || "",
          phone: profile.phone || "",
          country: profile.country || "Italia",
          region: profile.region || "",
          province: profile.province || "",
          timezone: profile.timezone || "Europe/Rome"
        });
      }
    } catch (err) {
      console.error("Error loading profile:", err);
      setError("Impossibile caricare il profilo.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utente non autenticato");

      const { error: updateError } = await supabase
        .from("profiles")
        .update(formData)
        .eq("id", user.id);

      if (updateError) throw updateError;

      if (onSave) onSave(formData);
      onClose();
    } catch (err) {
      console.error("Error saving profile:", err);
      setError("Errore durante il salvataggio. Riprova.");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 text-[#3a352f]">
            <User className="w-5 h-5" />
            <h3 className="font-bold text-lg">Modifica Profilo</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg border border-red-100 mb-4">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8 text-gray-500">Caricamento...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Personal Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Informazioni Personali</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Nome</label>
                    <input
                      type="text"
                      value={formData.first_name}
                      onChange={(e) => setFormData({...formData, first_name: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                      placeholder="Mario"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Cognome</label>
                    <input
                      type="text"
                      value={formData.last_name}
                      onChange={(e) => setFormData({...formData, last_name: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                      placeholder="Rossi"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Building className="w-3 h-3 text-gray-400" /> Azienda
                  </label>
                  <input
                    type="text"
                    value={formData.company}
                    onChange={(e) => setFormData({...formData, company: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                    placeholder="Nome Azienda Agricola"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Phone className="w-3 h-3 text-gray-400" /> Cellulare
                  </label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                    placeholder="+39 333 1234567"
                  />
                </div>
              </div>

              {/* Location Info */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">Località</h4>
                
                <div className="space-y-1">
                  <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                    <Globe className="w-3 h-3 text-gray-400" /> Nazione
                  </label>
                  <select
                    value={formData.country}
                    onChange={(e) => setFormData({...formData, country: e.target.value})}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] bg-white"
                  >
                    <option value="Italia">Italia</option>
                    {/* Add more countries later */}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Regione</label>
                    <input
                      type="text"
                      value={formData.region}
                      onChange={(e) => setFormData({...formData, region: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                      placeholder="Lombardia"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-gray-700">Provincia</label>
                    <input
                      type="text"
                      value={formData.province}
                      onChange={(e) => setFormData({...formData, province: e.target.value})}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f]"
                      placeholder="MI"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-blue-700">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm font-medium">Fuso Orario</span>
                    </div>
                    <span className="text-sm font-bold text-blue-800">{formData.timezone}</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1 pl-1">Calcolato automaticamente in base alla posizione.</p>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            Annulla
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm font-bold text-white bg-[#556b2f] hover:bg-[#435725] rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? "Salvataggio..." : "Salva Profilo"}
          </button>
        </div>
      </div>
    </div>
  );
}
