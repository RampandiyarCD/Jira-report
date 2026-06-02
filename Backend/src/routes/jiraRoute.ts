import { Router } from "express";
import {
  getBoardController,
  getDashboardController,
  getEpicDetailsPageController,
  getEpicsController,
  getProjectController,
  loginController,
  logoutController,
  saveZephyrConfigController,
  getZephyrTestsController,
  checkZephyrIssuesController,
} from "../controller/jiraController";

const jiraRouter = Router();

jiraRouter.post("/login", loginController);
jiraRouter.post("/logout", logoutController);
jiraRouter.get("/getprojects", getProjectController);
jiraRouter.get("/getboards/:projectKey", getBoardController);
jiraRouter.get("/getepics/:boardId", getEpicsController);
jiraRouter.get("/getepicdetailspage/:epicKey", getEpicDetailsPageController);
jiraRouter.get("/dashboard/:boardId", getDashboardController);

// Zephyr routes
jiraRouter.post("/savezephyrconfig", saveZephyrConfigController);
jiraRouter.get("/getzephyrtests/:issueKey", getZephyrTestsController);
jiraRouter.post("/checkzephyrissues", checkZephyrIssuesController);

export default jiraRouter;
