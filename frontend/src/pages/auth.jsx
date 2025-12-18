import { useState } from "react";
import { supabase } from "../supabaseClient";
import { Globe } from "lucide-react";
import { useLanguage } from "../contexts/LanguageContext";

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { lang, setLang, t } = useLanguage();
  const [errorMsg, setErrorMsg] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg("");

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setErrorMsg(error.message);
      setLoading(false);
    } else {
      // App.jsx will handle redirect on auth state change
    }
  };

  const toggleLang = () => {
    setLang(lang === "IT" ? "EN" : "IT");
  };

  return (
    <div className="min-h-screen bg-[#fdfbf7] flex flex-col items-center justify-center relative p-4">
      {/* Language Switcher */}
      <button 
        onClick={toggleLang}
        className="absolute top-6 right-6 flex items-center gap-2 px-3 py-1.5 rounded-lg text-[#3a352f] hover:bg-[#F3E6D5] transition-colors"
      >
        <Globe className="w-5 h-5" />
        <span className="font-medium">{lang}</span>
      </button>

      {/* Logo Section */}
      <div className="mb-8 flex flex-col items-center gap-2">
        <img src="/logo_qr.svg" alt="Pecus Chain Logo" className="h-30 w-auto" />
        <img src="/name.svg" alt="PECUS CHAIN" className="h-13 w-auto" />
      </div>

      {/* Login Card */}
      <div className="bg-white p-8 rounded-xl shadow-sm w-full max-w-md border border-gray-100">

        {errorMsg && (
          <div className="bg-red-50 text-red-600 p-3 rounded-md mb-4 text-sm">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t('auth.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="farmer@example.com"
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] focus:border-transparent bg-[#fdfbf7]"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">{t('auth.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#556b2f] focus:border-transparent bg-[#fdfbf7]"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#ffcc80] hover:bg-[#ffb74d] text-[#3a352f] text-xl font-bold py-4 rounded-full shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
          >
            {loading ? t('auth.loading') : t('auth.loginButton')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-600">
          {t('auth.noAccount')}{" "}
          <a
            href="https://pecuschain.com/"
            className="text-[#556b2f] font-bold hover:underline"
          >
            {t('auth.register')}
          </a>
        </div>
      </div>
    </div>
  );
}
