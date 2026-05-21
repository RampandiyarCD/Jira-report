import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { Input } from "../components/Input";
import { Button } from "../components/Button";
import { handleLogin } from "../api/jira";

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(""), 3000);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!email) {
      showToast("Please enter your Atlassian account email address.");
      return;
    }
    if (!url) {
      showToast("Please enter your Organisation URL.");
      return;
    }
    if (!token) {
      showToast("Please enter your Atlassian API token.");
      return;
    }

    setIsLoading(true);
    try {
      const response = await handleLogin(email, url, token);
      if (response.status === 200 && response.data?.success) {
        navigate("/dashboard");
      } else {
        showToast("Login failed. Please check your credentials.");
      }
    } catch (error: any) {
      console.error(error);
      showToast(
        error?.response?.data?.message || "Login failed. Please check your credentials."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-700 flex flex-col justify-center py-12 sm:px-6 lg:px-8 relative overflow-hidden">
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2">
          <div className="bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <span className="font-semibold w-5 h-5 rounded-full border-2 border-white flex items-center justify-center text-xs">!</span>
            {toastMessage}
          </div>
        </div>
      )}
      {/* Premium ambient light backgrounds */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(37,99,235,0.08),transparent_45%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.04),transparent_40%)] pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        {/* Brand Header */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/25 animate-pulse">
            <LayoutDashboard size={24} className="text-white" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight mt-3">
            Jira Intelligence
          </h2>
          <p className="text-slate-400 text-sm mt-1.5 text-center">
            Sign in using your Jira credentials
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl shadow-2xl overflow-hidden mx-4 sm:mx-0">
          <form onSubmit={handleSubmit} className="p-8 space-y-5">
            {/* Email Field */}
            <Input
              name="Atlassian Email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isLoading}
              containerClassName="flex flex-col gap-1.5"
              labelClassName="text-xs font-semibold text-slate-400 uppercase tracking-wider"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50"
            />

            {/* Organisation URL Field */}
            <Input
              name="Organisation URL"
              type="text"
              placeholder="your-domain.atlassian.net"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={isLoading}
              containerClassName="flex flex-col gap-1.5"
              labelClassName="text-xs font-semibold text-slate-400 uppercase tracking-wider"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50"
            />

            {/* API Token Field */}
            <div className="flex flex-col gap-1.5 relative">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="jira-api-token"
                  className="text-xs font-semibold text-slate-400 uppercase tracking-wider"
                >
                  Jira API Token
                </label>
                <a
                  href="https://id.atlassian.com/manage-profile/security/api-tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-500 hover:text-blue-400 hover:underline transition-colors"
                >
                  Get Token?
                </a>
              </div>
              <div className="relative">
                <input
                  id="jira-api-token"
                  type={showToken ? "text" : "password"}
                  placeholder="Paste your Atlassian API token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-3.5 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowToken(!showToken)}
                  disabled={isLoading}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors focus:outline-none cursor-pointer disabled:opacity-50"
                >
                  {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <Button
                name={
                  isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    <>
                      <KeyRound size={16} />
                      Connect Jira Account
                    </>
                  )
                }
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition-all duration-200 shadow-md shadow-blue-600/15 hover:shadow-lg hover:shadow-blue-600/25 active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
              />
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};