import { Request, Response } from "express";
import { getBoardService, getDashboardDataService, getEpicDetailsPageService, getEpicsFromBoardService, getProjectService, getSprintAnalysisService, loginService } from "../service/jiraService";
import { getZephyrDetailsForIssueService, checkIssuesHaveTestsService } from "../service/zephyrService";
import logger from "../utils/logger";

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  maxAge: 1000 * 60 * 60 * 8,
};

const requireCreds = (req: Request) => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  return jira_auth && jira_base_url ? { jira_auth, jira_base_url } : null;
};

const buildZephyrConfig = (cookies: any, projectKey?: string) => ({
  accessKey: cookies.zephyr_access_key,
  secretKey: cookies.zephyr_secret_key,
  accountId: cookies.zephyr_account_id,
  baseUrl: cookies.zephyr_base_url,
  projectKey: projectKey || cookies.zephyr_project_key || "",
  jiraAuth: cookies.jira_auth,
  jiraBaseUrl: cookies.jira_base_url,
});

const catchErr = (res: Response, label: string, fallback: string) => (e: any) => {
  const status = e?.response?.status ?? 500;
  const message = e?.response?.data?.errorMessages?.[0] ?? e?.response?.data?.message ?? e.message ?? fallback;
  logger.error(`${label}:`, { status, message });
  res.status(status).json({ success: false, message });
};

export const loginController = async (req: Request, res: Response): Promise<void> => {
  const { email, url, token } = req.body || {};

  if (!email || !token || !url) {
    res.status(400).json({ success: false, message: "All fields are required" });
    return;
  }

  let cleanUrl = url.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = `https://${cleanUrl}`;
  }
  logger.info(`Login attempt: email=${email}, url=${cleanUrl}`);

  try {
    const { user, auth } = await loginService(email, cleanUrl, token);
    res.cookie("jira_auth", auth, COOKIE_OPTS);
    res.cookie("jira_base_url", cleanUrl, COOKIE_OPTS);
    res.status(200).json({
      success: true,
      user: { accountId: user.accountId, displayName: user.displayName, emailAddress: user.emailAddress },
    });
  } catch (error: any) {
    const jiraError = error?.response?.data;
    const status = error?.response?.status;
    logger.error("Login Error:", { status, jiraError, message: error.message });
    res.status(401).json({ success: false, message: "Invalid Jira credentials" });
  }
};

export const logoutController = async (req: Request, res: Response) => {
  const opts = { ...COOKIE_OPTS, path: "/" };
  res.clearCookie("jira_auth", opts);
  res.clearCookie("jira_base_url", opts);
  res.status(200).json({ success: true, message: "Logout successful" });
};

export const getProjectController = async (req: Request, res: Response): Promise<void> => {
  const creds = requireCreds(req);
  if (!creds) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  try {
    const projects = await getProjectService(creds.jira_base_url, creds.jira_auth);
    res.status(200).json({ success: true, projects });
  } catch (e: any) { catchErr(res, "Get Projects", "Failed to fetch projects")(e); }
};

export const getBoardController = async (req: Request, res: Response): Promise<void> => {
  const creds = requireCreds(req);
  if (!creds) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  const projectKey = req.params.projectKey as string;
  try {
    const boards = await getBoardService(creds.jira_base_url, creds.jira_auth, projectKey);
    res.status(200).json({ success: true, boards });
  } catch (e: any) { catchErr(res, "Get Boards", "Failed to fetch boards")(e); }
};

export const getEpicsController = async (req: Request, res: Response) => {
  const creds = requireCreds(req);
  if (!creds) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  const boardId = req.params.boardId as string;
  const { from, to } = req.query as { from?: string; to?: string };
  try {
    const epics = await getEpicsFromBoardService(creds.jira_base_url, creds.jira_auth, boardId, from, to);
    res.status(200).json({ success: true, epics });
  } catch (e: any) { catchErr(res, "Get Epics", "Failed to fetch epics")(e); }
};

export const getEpicDetailsPageController = async (req: Request, res: Response) => {
  const creds = requireCreds(req);
  if (!creds) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  const epicKey = req.params.epicKey as string;
  try {
    const data = await getEpicDetailsPageService(creds.jira_base_url, creds.jira_auth, epicKey);
    res.status(200).json({ success: true, ...data });
  } catch (error: any) {
    logger.error("Get Epic Details Page Error:", error?.response?.data || error.message || error);
    res.status(500).json({ success: false, message: "Failed to fetch epic details" });
  }
};

// ─── Dashboard Controller ───────────────────────────────────────────────────

export const getDashboardController = async (req: Request, res: Response): Promise<void> => {
  const creds = requireCreds(req);
  if (!creds) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  const boardId = req.params.boardId as string;
  const { from, to } = req.query as { from?: string; to?: string };
  try {
    const data = await getDashboardDataService(creds.jira_base_url, creds.jira_auth, boardId, from, to);
    res.status(200).json({ success: true, ...data });
  } catch (e: any) { catchErr(res, "Get Dashboard", "Failed to fetch dashboard data")(e); }
};

// ─── Zephyr Controllers ──────────────────────────────────────────────────────

export const saveZephyrConfigController = async (req: Request, res: Response) => {
  const { zephyrAccessKey, zephyrSecretKey, zephyrAccountId, zephyrBaseUrl, zephyrProjectKey } = req.body || {};
  const [cleanAccessKey, cleanSecretKey, cleanAccountId, cleanBaseUrl, cleanProjectKey] = [
    zephyrAccessKey?.trim(), zephyrSecretKey?.trim(), zephyrAccountId?.trim(), zephyrBaseUrl?.trim(), zephyrProjectKey?.trim(),
  ];
  if (!cleanAccessKey || !cleanSecretKey || !cleanAccountId || !cleanBaseUrl) {
    res.status(400).json({ success: false, message: "Access Key, Secret Key, Account ID, and Base URL are required" });
    return;
  }
  res.cookie("zephyr_base_url", cleanBaseUrl, COOKIE_OPTS);
  res.cookie("zephyr_access_key", cleanAccessKey, COOKIE_OPTS);
  res.cookie("zephyr_secret_key", cleanSecretKey, COOKIE_OPTS);
  res.cookie("zephyr_account_id", cleanAccountId, COOKIE_OPTS);
  if (cleanProjectKey) res.cookie("zephyr_project_key", cleanProjectKey, COOKIE_OPTS);
  res.status(200).json({ success: true, message: "Zephyr configuration saved" });
};

export const getZephyrTestsController = async (req: Request, res: Response) => {
  const creds = requireCreds(req);
  if (!creds) { res.status(401).json({ success: false, message: "Unauthorized. Please log in to Jira first." }); return; }
  const { zephyr_access_key, zephyr_secret_key, zephyr_account_id, zephyr_base_url } = req.cookies || {};
  if (!zephyr_access_key || !zephyr_secret_key || !zephyr_account_id || !zephyr_base_url) {
    res.status(400).json({ success: false, message: "Zephyr Squad not configured. Go to Settings." });
    return;
  }
  const issueKey = req.params.issueKey as string;
  const { projectKey } = req.query as { projectKey?: string };
  const config = buildZephyrConfig(req.cookies, projectKey);
  try {
    const { testCases, parentSummary } = await getZephyrDetailsForIssueService(config, issueKey);
    res.status(200).json({ success: true, testCases, parentSummary });
  } catch (error: any) {
    logger.error("Get Zephyr Tests Error:", error?.response?.data || error.message || error);
    res.status(500).json({ success: false, message: error?.message || "Failed to fetch Zephyr test data" });
  }
};

export const checkZephyrIssuesController = async (req: Request, res: Response) => {
  const { zephyr_access_key, zephyr_secret_key, zephyr_account_id, zephyr_base_url } = req.cookies || {};
  const { issueKeys, projectKey } = req.body || {};
  if (!req.cookies?.jira_auth || !req.cookies?.jira_base_url || !zephyr_access_key || !zephyr_secret_key || !zephyr_account_id || !zephyr_base_url || !Array.isArray(issueKeys) || issueKeys.length === 0) {
    res.status(200).json({ success: true, issuesWithTests: [] });
    return;
  }
  const config = buildZephyrConfig(req.cookies, projectKey);
  try {
    const issuesWithTests = await checkIssuesHaveTestsService(config, issueKeys);
    res.status(200).json({ success: true, issuesWithTests });
  } catch (error: any) {
    logger.error("Check Zephyr Issues Error:", error?.response?.data || error.message || error);
    res.status(200).json({ success: true, issuesWithTests: [] });
  }
};

// ─── Sprint Analysis Controller ──────────────────────────────────────────────

export const getSprintAnalysisController = async (req: Request, res: Response): Promise<void> => {
  const creds = requireCreds(req);
  if (!creds) { res.status(401).json({ success: false, message: "Unauthorized" }); return; }
  const boardId = req.params.boardId as string;
  try {
    const data = await getSprintAnalysisService(creds.jira_base_url, creds.jira_auth, boardId);
    res.status(200).json({ success: true, ...data });
  } catch (e: any) { catchErr(res, "Get Sprint Analysis", "Failed to fetch sprint analysis data")(e); }
};
