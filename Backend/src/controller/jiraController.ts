import { Request, Response } from "express";
import { getBoardIssueSummaryService, getBoardService, getBoardStatsDetailsService, getBoardStatsService, getEpicsFromBoardService, getEpicsFromJQLService, getProjectService, loginService } from "../service/jiraService";

export const loginController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { email, url, token } = req.body || {};

  if (!email || !token || !url) {
    res.status(400).json({
      success: false,
      message: "All fields are required",
    });
    return;
  }

  const cleanUrl = url.replace(/\/$/, "");

  try {
    const { user, auth } = await loginService(
      email,
      cleanUrl,
      token
    );

    res.cookie("jira_auth", auth, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 8,
    });

    res.cookie("jira_base_url", cleanUrl, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 1000 * 60 * 60 * 8,
    });

    res.status(200).json({
      success: true,
      user: {
        accountId: user.accountId,
        displayName: user.displayName,
        emailAddress: user.emailAddress,
      },
    });
  } catch (error: any) {
    console.log(error?.response?.data || error);

    res.status(401).json({
      success: false,
      message: "Invalid Jira credentials",
    });
  }
};

export const logoutController = async (req: Request, res: Response) => {
  try {
    res.clearCookie("jira_auth", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.clearCookie("jira_base_url", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  } catch (error: any) {
    console.log(error?.response?.data || error);

    res.status(500).json({
      success: false,
      message: "Failed to logout",
    });
  }
};

export const getProjectController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { jira_auth, jira_base_url } = req.cookies || {};

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  try {
    const projects = await getProjectService(jira_base_url, jira_auth);
    res.status(200).json({
      success: true,
      projects,
    });
  } catch (error: any) {
    console.log(error?.response?.data || error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch projects",
    });
  }
}

export const getBoardController = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const { projectKey } = req.params as { projectKey: string };

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  try {
    const boards = await getBoardService(jira_base_url, jira_auth, projectKey);
    res.status(200).json({
      success: true,
      boards,
    });
  } catch (error: any) {
    console.log(error?.response?.data || error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch boards",
    });
  }
}


export const getEpicsController = async (req: Request, res: Response) => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const { boardId } = req.params as { boardId: string };

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  try {
    const epics = await getEpicsFromBoardService(jira_base_url, jira_auth, boardId);
    res.status(200).json({
      success: true,
      epics,
    });
  } catch (error: any) {
    console.log(error?.response?.data || error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch epics",
    });
  }
}

export const getEpicsAllController = async (req: Request, res: Response) => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const projectKey = typeof req.query.projectKey === "string" ? req.query.projectKey : undefined;

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const epics = await getEpicsFromJQLService(jira_base_url, jira_auth, projectKey);
    res.status(200).json({ success: true, epics });
  } catch (error: any) {
    console.log(error?.response?.data || error);
    res.status(500).json({ success: false, message: "Failed to fetch epics" });
  }
}

export const getBoardIssueSummaryController = async (req: Request, res: Response) => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const { boardId } = req.params as { boardId?: string };
  const projectKey = typeof req.query.projectKey === "string" ? req.query.projectKey : undefined;

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  try {
    const issues = await getBoardIssueSummaryService(jira_base_url, jira_auth, { boardId, projectKey });
    res.status(200).json({ success: true, issues });
  } catch (error: any) {
    console.log(error?.response?.data || error);
    const jiraMessage =
      error?.response?.data?.errorMessages?.[0] ||
      error?.response?.data?.message ||
      error?.message;
    res.status(500).json({
      success: false,
      message: jiraMessage ? `Failed to fetch issue summary: ${jiraMessage}` : "Failed to fetch issue summary",
    });
  }
};

export const getBoardStatsController = async (req: Request, res: Response) => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const { boardId } = req.params as { boardId?: string };
  const projectKey = typeof req.query.projectKey === "string" ? req.query.projectKey : undefined;

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  try {
    const stats = await getBoardStatsService(jira_base_url, jira_auth, { boardId, projectKey });
    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.log(error?.response?.data || error);

    const jiraMessage =
      error?.response?.data?.errorMessages?.[0] ||
      error?.response?.data?.message ||
      error?.message;

    res.status(500).json({
      success: false,
      message: jiraMessage ? `Failed to fetch board stats: ${jiraMessage}` : "Failed to fetch board stats",
    });
  }
}

export const getBoardStatsDetailsController = async (req: Request, res: Response) => {
  const { jira_auth, jira_base_url } = req.cookies || {};
  const { boardId } = req.params as { boardId?: string };
  const projectKey = typeof req.query.projectKey === "string" ? req.query.projectKey : undefined;

  if (!jira_auth || !jira_base_url) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  try {
    const stats = await getBoardStatsDetailsService(jira_base_url, jira_auth, { boardId, projectKey });
    res.status(200).json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.log(error?.response?.data || error);

    const jiraMessage =
      error?.response?.data?.errorMessages?.[0] ||
      error?.response?.data?.message ||
      error?.message;

    res.status(500).json({
      success: false,
      message: jiraMessage ? `Failed to fetch detailed board stats: ${jiraMessage}` : "Failed to fetch detailed board stats",
    });
  }
}
