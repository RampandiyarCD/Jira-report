import { Request, Response } from "express";
import { loginService } from "../service/loginService";

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