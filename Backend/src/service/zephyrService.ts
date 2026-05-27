import axios from "axios";
import crypto from "crypto";
import logger from "../utils/logger";

interface ZephyrConfig {
  accessKey?: string;
  secretKey?: string;
  accountId?: string;
  baseUrl?: string;
  jiraAuth?: string;
  jiraBaseUrl?: string;
  projectKey?: string;
}

// Helper: Clean slash from URL end
const cleanUrl = (url?: string): string => (url ? url.replace(/\/$/, "") : "");

// Helper: Encode canonical parameters for JWT QSH
const encodeCanonical = (str: string): string =>
  encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29")
    .replace(/\*/g, "%2A");

// Helper: Build canonical query string
const buildCanonicalQueryString = (params: Record<string, string | number | undefined>): string => {
  const parts: string[] = [];
  const keys = Object.keys(params).sort();
  for (const key of keys) {
    const val = params[key];
    if (val !== undefined) {
      parts.push(`${encodeCanonical(key)}=${encodeCanonical(val.toString())}`);
    }
  }
  return parts.join("&");
};

// Helper: Generate JWT for Zephyr Squad APIs
const generateSquadJwt = (
  accessKey: string,
  secretKey: string,
  accountId: string,
  method: string,
  relativePath: string,
  canonicalQueryString: string = ""
) => {
  const canonicalString = `${method.toUpperCase()}&${relativePath}&${canonicalQueryString}`;
  const qsh = crypto.createHash("sha256").update(canonicalString).digest("hex");

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: accessKey,
    sub: accountId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 360,
    qsh,
  };

  const base64UrlEncode = (obj: any) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const tokenInput = `${base64UrlEncode(header)}.${base64UrlEncode(payload)}`;
  const signature = crypto
    .createHmac("sha256", secretKey)
    .update(tokenInput)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${tokenInput}.${signature}`;
};

// Helper: Make request to Zephyr Squad APIs
const squadRequest = async (
  url: string,
  accessKey: string,
  jwt: string,
  method: "GET" | "POST" = "GET",
  postData: any = null
) => {
  const headers = {
    zapiAccessKey: accessKey,
    Authorization: `JWT ${jwt}`,
    "Content-Type": "application/json",
  };
  if (method === "POST") {
    const res = await axios.post(url, postData, { headers });
    return res.data;
  } else {
    const res = await axios.get(url, { headers });
    return res.data;
  }
};

// Cache for user display names
const userCache: Record<string, string> = {};

// Helper: Load project assignable users into cache
const loadProjectUsers = async (config: ZephyrConfig, projectKey: string) => {
  const jiraUrl = cleanUrl(config.jiraBaseUrl);
  if (!jiraUrl || !config.jiraAuth || !projectKey) return;
  try {
    const { data } = await axios.get(`${jiraUrl}/rest/api/3/user/assignable/search`, {
      params: { project: projectKey, maxResults: 100 },
      headers: {
        Authorization: `Basic ${config.jiraAuth}`,
        Accept: "application/json",
      },
    });
    if (Array.isArray(data)) {
      for (const u of data) {
        if (u.accountId && u.displayName) {
          userCache[u.accountId] = u.displayName;
        }
      }
    }
  } catch (err) {
    // Ignore error, fallback to individual lookup
  }
};

// Helper: Fetch a user's display name from Jira API
const getDisplayName = async (config: ZephyrConfig, accountId: string): Promise<string> => {
  if (!accountId) return "Unknown";
  if (userCache[accountId]) return userCache[accountId];

  const jiraUrl = cleanUrl(config.jiraBaseUrl);
  if (!jiraUrl || !config.jiraAuth) return accountId;

  try {
    const { data } = await axios.get(`${jiraUrl}/rest/api/3/user`, {
      params: { accountId },
      headers: {
        Authorization: `Basic ${config.jiraAuth}`,
        Accept: "application/json",
      },
    });
    const displayName = data.displayName || accountId;
    userCache[accountId] = displayName;
    return displayName;
  } catch (err) {
    userCache[accountId] = accountId; // cache ID on failure
    return accountId;
  }
};

// Helper: Get test cases linked to a Jira issue
const getTestCasesForIssue = async (config: ZephyrConfig, issueKey: string) => {
  const jiraUrl = cleanUrl(config.jiraBaseUrl);
  if (!jiraUrl || !config.jiraAuth) {
    throw new Error("Jira credentials missing");
  }

  const { data } = await axios.get(`${jiraUrl}/rest/api/3/issue/${issueKey}`, {
    params: { fields: "issuelinks,summary" },
    headers: {
      Authorization: `Basic ${config.jiraAuth}`,
      Accept: "application/json",
    },
  });

  const parentSummary = data.fields?.summary || "";
  const links = data.fields?.issuelinks || [];
  const testCases: any[] = [];

  for (const link of links) {
    const linkedIssue = link.inwardIssue && link.inwardIssue.key.toUpperCase() !== issueKey.toUpperCase()
      ? link.inwardIssue
      : (link.outwardIssue && link.outwardIssue.key.toUpperCase() !== issueKey.toUpperCase() ? link.outwardIssue : null);

    if (linkedIssue) {
      const typeName = (linkedIssue.fields?.issuetype?.name || "").toLowerCase();
      if (["test", "test case", "testcase", "test-case"].includes(typeName)) {
        testCases.push({
          id: linkedIssue.id,
          key: linkedIssue.key,
          name: linkedIssue.fields.summary || linkedIssue.key,
          status: linkedIssue.fields.status?.name ?? "Draft",
          priority: linkedIssue.fields.priority?.name ?? "Normal",
          folder: "",
          labels: [],
          createdOn: null,
          updatedOn: null,
        });
      }
    }
  }

  return { testCases, parentSummary };
};

// Service 1: Batch check which issues have linked test cases
export const checkIssuesHaveTestsService = async (config: ZephyrConfig, issueKeys: string[]) => {
  const jiraUrl = cleanUrl(config.jiraBaseUrl);
  if (!jiraUrl || !config.jiraAuth || issueKeys.length === 0) return [];

  const jql = `key in (${issueKeys.map((k) => `"${k}"`).join(",")})`;
  const { data } = await axios.get(`${jiraUrl}/rest/api/3/search/jql`, {
    params: { jql, fields: "issuelinks", maxResults: 100 },
    headers: {
      Authorization: `Basic ${config.jiraAuth}`,
      Accept: "application/json",
    },
  });

  const issuesWithTests = new Set<string>();
  for (const issue of data.issues || []) {
    const links = issue.fields?.issuelinks || [];
    const hasTest = links.some((link: any) => {
      const linkedIssue = link.inwardIssue && link.inwardIssue.key.toUpperCase() !== issue.key.toUpperCase()
        ? link.inwardIssue
        : (link.outwardIssue && link.outwardIssue.key.toUpperCase() !== issue.key.toUpperCase() ? link.outwardIssue : null);
      if (!linkedIssue) return false;
      const typeName = (linkedIssue.fields?.issuetype?.name || "").toLowerCase();
      return ["test", "test case", "testcase", "test-case"].includes(typeName);
    });

    if (hasTest) {
      const originalKey = issueKeys.find((k) => k.toUpperCase() === issue.key.toUpperCase());
      if (originalKey) {
        issuesWithTests.add(originalKey);
      }
    }
  }

  return [...issuesWithTests];
};

// Service 2: Get full Zephyr details (linked test cases + executions) for an issue
export const getZephyrDetailsForIssueService = async (config: ZephyrConfig, issueKey: string) => {
  const accessKey = config.accessKey?.trim() || "";
  const secretKey = config.secretKey?.trim() || "";
  const accountId = config.accountId?.trim() || "";
  const zephyrUrl = cleanUrl(config.baseUrl);

  const { testCases, parentSummary } = await getTestCasesForIssue(config, issueKey);
  if (testCases.length === 0) {
    return { testCases: [], parentSummary };
  }

  if (!accessKey || !secretKey || !accountId || !zephyrUrl) {
    throw new Error("Zephyr Squad credentials missing");
  }

  try {
    const projectKey = config.projectKey || issueKey.split("-")[0];
    await loadProjectUsers(config, projectKey);

    const keys = testCases.map((tc) => tc.key);
    const relativePath = "/public/rest/api/1.0/zql/search";
    const zqlQuery = `issue in (${keys.map((k) => `"${k}"`).join(",")})`;
    
    const jwt = generateSquadJwt(accessKey, secretKey, accountId, "POST", relativePath, "");
    const requestUrl = `${zephyrUrl}${relativePath}`;
    
    const data = await squadRequest(requestUrl, accessKey, jwt, "POST", { zqlQuery });
    const executionsArray = data?.searchObjectList || [];

    const uniqueUserIds = new Set<string>();
    for (const item of executionsArray) {
      const exec = item.execution;
      if (exec?.executedByAccountId) {
        uniqueUserIds.add(exec.executedByAccountId);
      }
    }
    
    try {
      await Promise.all([...uniqueUserIds].map((uid) => getDisplayName(config, uid)));
    } catch (e) {
      logger.error("Failed to pre-resolve executor display names:", e);
    }

    // Group executions by test case key and ID
    const execsByCaseKey: Record<string, any[]> = {};
    const execsByCaseId: Record<string, any[]> = {};

    for (const item of executionsArray) {
      const exec = item.execution;
      if (!exec) continue;

      const tcKey = (item.issueKey || exec.issueKey || "").toUpperCase();
      const tcId = (exec.issueId || "").toString();

      const mappedExec = {
        id: exec.id,
        key: exec.id?.toString() ?? "Exec",
        testCaseKey: item.issueKey || exec.issueKey,
        status: exec.status?.name ?? exec.executionStatus?.name ?? "Not Executed",
        executedById: exec.executedByAccountId || null,
        executedByName: exec.executedByAccountId 
          ? (userCache[exec.executedByAccountId] || exec.executedBy || "Unknown") 
          : (item.executedByDisplayName || exec.executedByDisplayName || exec.executedBy || "Unknown"),
        executionDate: exec.executedOn || exec.executionDate || null,
        environment: null,
        cycleName: exec.cycleName || "Ad Hoc",
        comment: exec.comment ?? "",
      };

      if (tcKey) {
        if (!execsByCaseKey[tcKey]) execsByCaseKey[tcKey] = [];
        execsByCaseKey[tcKey].push(mappedExec);
      }
      if (tcId) {
        if (!execsByCaseId[tcId]) execsByCaseId[tcId] = [];
        execsByCaseId[tcId].push(mappedExec);
      }
    }

    // Map executions back to test cases
    const results = testCases.map((tc) => {
      const tcExecutions = execsByCaseKey[tc.key.toUpperCase()] || execsByCaseId[tc.id?.toString() || ""] || [];
      const lastExecution = tcExecutions[0] || null;

      return {
        ...tc,
        executions: tcExecutions,
        lastExecutionStatus: lastExecution?.status ?? "Not Executed",
        lastExecutionDate: lastExecution?.executionDate ?? null,
        totalExecutions: tcExecutions.length,
        passCount: tcExecutions.filter((e) => ["pass", "passed"].includes(e.status.toLowerCase())).length,
        failCount: tcExecutions.filter((e) => ["fail", "failed"].includes(e.status.toLowerCase())).length,
      };
    });

    return { testCases: results, parentSummary };
  } catch (err) {
    logger.error("Zephyr Details Service Error:", err);
    return {
      testCases: testCases.map((tc) => ({
        ...tc,
        executions: [],
        lastExecutionStatus: "Not Executed",
        lastExecutionDate: null,
        totalExecutions: 0,
        passCount: 0,
        failCount: 0,
      })),
      parentSummary,
    };
  }
};
