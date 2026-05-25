import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/Card'
import { Button } from '../components/Button'
import { Input } from '../components/Input'
import { Label } from '../components/Label'
import { Select } from '../components/Select'

export function SettingsPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">Configure your Jira connection and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Zephyr Scale Configuration</CardTitle>
          <CardDescription>
            Optional: Configure Zephyr Scale integration for test execution reports
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="zephyrProductType">Zephyr Product Type</Label>
            <Select id="zephyrProductType">
              <option value="">Select Zephyr product...</option>
              <option value="zephyr-scale">Zephyr Scale (v2 API - Bearer Token)</option>
              <option value="zephyr-squad">Zephyr Squad / Zephyr for Jira Cloud (v1 API - JWT)</option>
            </Select>
            <p className="text-xs text-gray-400">
              <strong>How to check:</strong> Go to Jira → Apps → Zephyr. If you see "Zephyr Scale" in the title, select v2. 
              If it says "Zephyr Squad" or "Zephyr for Jira", select v1.
            </p>
          </div>

          <Input
            name="Access Key"
            id="zephyrAccessKey"
            type="text"
            placeholder="Your Zephyr access key"
            containerClassName="space-y-1.5"
          />
          <p className="text-xs text-gray-400 -mt-2">
            Generate at Zephyr Scale &gt; API Access Tokens
          </p>

          <Input
            name="Secret Key"
            id="zephyrSecretKey"
            type="password"
            placeholder="Your Zephyr secret key"
            containerClassName="space-y-1.5"
          />

          <Input
            name="Account ID"
            id="zephyrAccountId"
            type="text"
            placeholder="Your Atlassian Account ID"
            containerClassName="space-y-1.5"
          />
          <p className="text-xs text-gray-400 -mt-2">
            Found in your Atlassian profile URL or Zephyr API settings
          </p>

          <Input
            name="Base URL"
            id="zephyrBaseUrl"
            type="text"
            placeholder="https://api.zephyrscale.smartbear.com/v2"
            containerClassName="space-y-1.5"
          />

          <Input
            name="Project Key (Optional)"
            id="zephyrProjectKey"
            type="text"
            placeholder="e.g., PROJ"
            containerClassName="space-y-1.5"
          />

          <Button variant="secondary">
            Save Zephyr Configuration
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