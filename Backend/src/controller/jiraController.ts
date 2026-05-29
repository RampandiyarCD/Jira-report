import { Request, Response } from "express";
import { getBoardService, getDashboardDataService, getEpicDetailsPageService, getEpicsFromBoardService, getProjectService, loginService } from "../service/jiraService";
import { getZephyrDetailsForIssueService, checkIssuesHaveTestsService } from "../service/zephyrService";
import logger from "../utils/logger";

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

    const cookieOpts = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      maxAge: 1000 * 60 * 60 * 8,
    };

    res.cookie("jira_auth", auth, cookieOpts);
    res.cookie("jira_base_url", cleanUrl, cookieOpts);

    res.status(200).json({
      success: true,
      user: {
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress,
      },
    });
  } catch (error: any) {
    const jiraError = error?.response?.data;
    const status = error?.response?.status;
    logger.error("Login Error:", { status, jiraError, message: error.message });
    res.status(401).json({
      success: false,
      message: "Invalid Jira credentials",
      debug: { status, jiraError: jiraError || error.message },
    });
  }
};

export const logoutController = async (req: Request, res: Response) => {
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
  };
  res.clearCookie("jira_auth", cookieOpts);
  res.clearCookie("jira_base_url", cookieOpts);
  res.status(200).json({ success: true, message: "Logout successful" });
};

export const getProjectController = async (req: Request, res: Response): Promise<void> => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  if (!jira_auth || !jira_base_url) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const projects = await getProjectService(jira_base_url, jira_auth);
    res.status(200).json({ success: true, projects });
  } catch (error: any) {
    const status = error?.response?.status ?? 500;
    const message = error?.response?.data?.errorMessages?.[0] ?? error?.response?.data?.message ?? error.message ?? "Failed to fetch projects";
    logger.error("Get Projects Error:", { status, message });
    res.status(status).json({ success: false, message });
  }
};

export const getBoardController = async (req: Request, res: Response): Promise<void> => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const projectKey = req.params.projectKey as string;

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const boards = await getBoardService(jira_base_url, jira_auth, projectKey);
    res.status(200).json({ success: true, boards });
  } catch (error: any) {
    const status = error?.response?.status ?? 500;
    const message = error?.response?.data?.errorMessages?.[0] ?? error?.response?.data?.message ?? error.message ?? "Failed to fetch boards";
    logger.error("Get Boards Error:", { status, message });
    res.status(status).json({ success: false, message });
  }
};

export const getEpicsController = async (req: Request, res: Response) => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const boardId = req.params.boardId as string;

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const epics = await getEpicsFromBoardService(jira_base_url, jira_auth, boardId);
    res.status(200).json({ success: true, epics });
  } catch (error: any) {
    const status = error?.response?.status ?? 500;
    const message = error?.response?.data?.errorMessages?.[0] ?? error?.response?.data?.message ?? error.message ?? "Failed to fetch epics";
    logger.error("Get Epics Error:", { status, message });
    res.status(status).json({ success: false, message });
  }
};

export const getEpicDetailsPageController = async (req: Request, res: Response) => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const epicKey = req.params.epicKey as string;

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const data = await getEpicDetailsPageService(jira_base_url, jira_auth, epicKey);
    res.status(200).json({ success: true, ...data });
  } catch (error: any) {
    logger.error("Get Epic Details Page Error:", error?.response?.data || error.message || error);
    res.status(500).json({ success: false, message: "Failed to fetch epic details" });
  }
};

// ─── Dashboard Controller ───────────────────────────────────────────────────

export const getDashboardController = async (req: Request, res: Response): Promise<void> => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const boardId = req.params.boardId as string;

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const data = await getDashboardDataService(jira_base_url, jira_auth, boardId);
    res.status(200).json({ success: true, ...data });
  } catch (error: any) {
    logger.error("Get Dashboard Error:", {
      status: error?.response?.status,
      data: error?.response?.data,
      code: error?.code,
      message: error?.message,
    });
    res.status(500).json({ success: false, message: error?.response?.data?.errorMessages?.[0] ?? "Failed to fetch dashboard data" });
  }
};

// ─── Zephyr Controllers ──────────────────────────────────────────────────────

export const saveZephyrConfigController = async (req: Request, res: Response) => {
  const { zephyrAccessKey, zephyrSecretKey, zephyrAccountId, zephyrBaseUrl, zephyrProjectKey } = req.body || {};

  const cleanAccessKey = zephyrAccessKey?.trim();
  const cleanSecretKey = zephyrSecretKey?.trim();
  const cleanAccountId = zephyrAccountId?.trim();
  const cleanBaseUrl = zephyrBaseUrl?.trim();
  const cleanProjectKey = zephyrProjectKey?.trim();

  if (!cleanAccessKey || !cleanSecretKey || !cleanAccountId || !cleanBaseUrl) {
    res.status(400).json({ success: false, message: "Access Key, Secret Key, Account ID, and Base URL are required" });
    return;
  }

  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 1000 * 60 * 60 * 8,
  };

  res.cookie("zephyr_base_url", cleanBaseUrl, cookieOpts);
  res.cookie("zephyr_access_key", cleanAccessKey, cookieOpts);
  res.cookie("zephyr_secret_key", cleanSecretKey, cookieOpts);
  res.cookie("zephyr_account_id", cleanAccountId, cookieOpts);
  if (cleanProjectKey) {
    res.cookie("zephyr_project_key", cleanProjectKey, cookieOpts);
  }

  res.status(200).json({ success: true, message: "Zephyr configuration saved" });
};

export const getZephyrTestsController = async (req: Request, res: Response) => {
  const { zephyr_access_key, zephyr_secret_key, zephyr_account_id, zephyr_base_url, zephyr_project_key, jira_auth, jira_base_url } = req.cookies || {};
  const issueKey = req.params.issueKey as string;
  const { projectKey } = req.query as { projectKey?: string };

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({ success: false, message: "Unauthorized. Please log in to Jira first." });
    return;
  }

  if (!zephyr_access_key || !zephyr_secret_key || !zephyr_account_id || !zephyr_base_url) {
    res.status(400).json({ success: false, message: "Zephyr Squad not configured. Go to Settings." });
    return;
  }

  const config = {
    accessKey: zephyr_access_key,
    secretKey: zephyr_secret_key,
    accountId: zephyr_account_id,
    baseUrl: zephyr_base_url,
    projectKey: projectKey || zephyr_project_key || "",
    jiraAuth: jira_auth,
    jiraBaseUrl: jira_base_url,
  };

  try {
    const { testCases, parentSummary } = await getZephyrDetailsForIssueService(config, issueKey);
    res.status(200).json({ success: true, testCases, parentSummary });
  } catch (error: any) {
    logger.error("Get Zephyr Tests Error:", error?.response?.data || error.message || error);
    res.status(500).json({ success: false, message: error?.message || "Failed to fetch Zephyr test data" });
  }
};

export const checkZephyrIssuesController = async (req: Request, res: Response) => {
  const { zephyr_access_key, zephyr_secret_key, zephyr_account_id, zephyr_base_url, zephyr_project_key, jira_auth, jira_base_url } = req.cookies || {};
  const { issueKeys, projectKey } = req.body || {};

  if (!jira_auth || !jira_base_url || !zephyr_access_key || !zephyr_secret_key || !zephyr_account_id || !zephyr_base_url || !Array.isArray(issueKeys) || issueKeys.length === 0) {
    res.status(200).json({ success: true, issuesWithTests: [] });
    return;
  }

  const config = {
    accessKey: zephyr_access_key,
    secretKey: zephyr_secret_key,
    accountId: zephyr_account_id,
    baseUrl: zephyr_base_url,
    projectKey: projectKey || zephyr_project_key || "",
    jiraAuth: jira_auth,
    jiraBaseUrl: jira_base_url,
  };

  try {
    const issuesWithTests = await checkIssuesHaveTestsService(config, issueKeys);
    res.status(200).json({ success: true, issuesWithTests });
  } catch (error: any) {
    logger.error("Check Zephyr Issues Error:", error?.response?.data || error.message || error);
    res.status(200).json({ success: true, issuesWithTests: [] });
  }
};
