import { X, AlertTriangle, AlertCircle } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

export default function AlertsModal({ isOpen, onClose, incomplete, kickoff }) {
  const { t } = useLanguage();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2 text-yellow-600">
            <AlertTriangle className="w-5 h-5" />
            <h3 className="font-bold text-lg text-[#3a352f]">{t('alerts.title')}</h3>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-100">
                <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-700">{t('alerts.incomplete')}</span>
                </div>
                <span className="text-xl font-bold text-red-700">{incomplete}</span>
            </div>

            <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-100">
                <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-700">{t('alerts.kickoff')}</span>
                </div>
                <span className="text-xl font-bold text-orange-700">{kickoff}</span>
            </div>
        </div>
      </div>
    </div>
  );
}

function Activity({ className }) {
    return (
        <svg 
            xmlns="http://www.w3.org/2000/svg" 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={className}
        >
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
        </svg>
    )
}
