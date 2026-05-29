import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { saveZephyrConfig } from '../api/jira'
import { CheckCircle2, AlertCircle } from 'lucide-react'
import { useFilter } from '../context/FilterContext'

export function SettingsPage() {
  const { selectedProject } = useFilter();

  // Zephyr states
  // Credentials are NOT read from localStorage for security — they are stored server-side after saving.
  // Users must re-enter keys only when they want to update the configuration.
  const [zephyrAccessKey, setZephyrAccessKey] = useState("")
  const [zephyrSecretKey, setZephyrSecretKey] = useState("")
  
  const [zephyrAccountId, setZephyrAccountId] = useState(() => {
    return localStorage.getItem("zephyr_account_id") || localStorage.getItem("user_account_id") || "";
  })
  
  const [zephyrBaseUrl, setZephyrBaseUrl] = useState(() => {
    return localStorage.getItem("zephyr_base_url") || "https://prod-api.zephyr4jiracloud.com/connect";
  })
  
  const [zephyrProjectKey, setZephyrProjectKey] = useState(() => {
    return localStorage.getItem("zephyr_project_key") || selectedProject || localStorage.getItem("selected_project_key") || "";
  })
  const [zephyrSaving, setZephyrSaving] = useState(false)
  const [zephyrStatus, setZephyrStatus] = useState<{ type: "success" | "error"; message: string } | null>(null)

  // Scrub any credentials that may have been stored by an older version of the app
  useEffect(() => {
    localStorage.removeItem("zephyr_access_key");
    localStorage.removeItem("zephyr_secret_key");
  }, []);

  // Auto-populate Account ID if it becomes available in localStorage
  useEffect(() => {
    if (!zephyrAccountId) {
      const loggedInAccountId = localStorage.getItem("user_account_id");
      if (loggedInAccountId) {
        setZephyrAccountId(loggedInAccountId);
      }
    }
  }, [zephyrAccountId]);

  // Auto-populate Project Key from global filter if not explicitly set yet
  useEffect(() => {
    if (selectedProject) {
      setZephyrProjectKey(selectedProject);
    }
  }, [selectedProject]);

  const handleSaveZephyr = async () => {
    if (!zephyrAccessKey || !zephyrSecretKey || !zephyrAccountId || !zephyrBaseUrl) {
      setZephyrStatus({ type: "error", message: "Access Key, Secret Key, Account ID, and Base URL are required" })
      return
    }

    setZephyrSaving(true)
    setZephyrStatus(null)
    try {
      await saveZephyrConfig({
        zephyrAccessKey,
        zephyrSecretKey,
        zephyrAccountId,
        zephyrBaseUrl,
        zephyrProjectKey,
      })

      // Only persist non-secret preferences locally; credentials are stored server-side.
      localStorage.setItem("zephyr_product_type", "zephyr-squad")
      localStorage.setItem("zephyr_account_id", zephyrAccountId)
      localStorage.setItem("zephyr_base_url", zephyrBaseUrl)
      localStorage.setItem("zephyr_project_key", zephyrProjectKey)

      setZephyrStatus({ type: "success", message: "Zephyr configuration saved successfully!" })
    } catch (err: any) {
      setZephyrStatus({ type: "error", message: err?.response?.data?.message || "Failed to save Zephyr configuration" })
    } finally {
      setZephyrSaving(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure your Jira connection and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zephyr Configuration</CardTitle>
          <CardDescription>
            Optional: Configure Zephyr Squad / Zephyr for Jira Cloud integration for test execution reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-4">
            <Input
              name="Access Key"
              id="zephyrAccessKey"
              type="text"
              placeholder="Your Zephyr Squad Access Key"
              containerClassName="space-y-1.5"
              value={zephyrAccessKey}
              onChange={(e) => setZephyrAccessKey(e.target.value)}
            />
            <Input
              name="Secret Key"
              id="zephyrSecretKey"
              type="password"
              placeholder="Your Zephyr Squad Secret Key"
              containerClassName="space-y-1.5"
              value={zephyrSecretKey}
              onChange={(e) => setZephyrSecretKey(e.target.value)}
            />
            <Input
              name="Account ID"
              id="zephyrAccountId"
              type="text"
              placeholder="Your Atlassian Account ID"
              containerClassName="space-y-1.5"
              value={zephyrAccountId}
              onChange={(e) => setZephyrAccountId(e.target.value)}
            />
            <p className="text-xs text-gray-400 -mt-2">
              Found in your Atlassian profile URL or Zephyr API settings
            </p>
            <Input
              name="Base URL"
              id="zephyrBaseUrl"
              type="text"
              placeholder="https://prod-api.zephyr4jiracloud.com/connect"
              containerClassName="space-y-1.5"
              value={zephyrBaseUrl}
              onChange={(e) => setZephyrBaseUrl(e.target.value)}
            />
            <Input
              name="Project Key (Optional)"
              id="zephyrProjectKey"
              type="text"
              placeholder="e.g., PROJ"
              containerClassName="space-y-1.5"
              value={zephyrProjectKey}
              onChange={(e) => setZephyrProjectKey(e.target.value)}
            />
          </div>

          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
            <strong>Security note:</strong> Access Key and Secret Key are sent directly to the server and never stored in the browser. Re-enter them only when updating your configuration.
          </p>

          {zephyrStatus && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg ${
              zephyrStatus.type === "success" 
                ? "bg-green-50 text-green-700 border border-green-200" 
                : "bg-red-50 text-red-700 border border-red-200"
            }`}>
              {zephyrStatus.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              {zephyrStatus.message}
            </div>
          )}

          <Button 
            variant="secondary" 
            onClick={handleSaveZephyr}
            disabled={zephyrSaving}
          >
            {zephyrSaving ? "Saving..." : "Save Zephyr Configuration"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Configuration</CardTitle>
          <CardDescription>
            Optional: Add your OpenAI API key to enable AI-powered insights
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            name="OpenAI API Key"
            id="openaiKey"
            type="password"
            placeholder="sk-..."
            containerClassName="space-y-1.5"
          />
          <Button variant="secondary">
            Save API Key
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">CORS Configuration</CardTitle>
          <CardDescription>How Jira API calls are routed</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600">
            In development, requests to <code className="bg-gray-100 px-1 rounded">/jira-api/*</code> are
            proxied to your Jira instance via the Vite dev server. Update{' '}
            <code className="bg-gray-100 px-1 rounded">VITE_JIRA_BASE_URL</code> in your{' '}
            <code className="bg-gray-100 px-1 rounded">.env.local</code> file to match your Jira base URL.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}