import { Router } from "express";
import { getBoardController, getBoardIssueSummaryController, getBoardStatsController, getBoardStatsDetailsController, getEpicsAllController, getEpicsController, getProjectController, loginController, logoutController } from "../controller/jiraController";

const jiraRouter = Router();

jiraRouter.post("/login", loginController);
jiraRouter.post("/logout", logoutController);
jiraRouter.get("/getprojects", getProjectController);
jiraRouter.get("/getboards/:projectKey", getBoardController);
jiraRouter.get("/getepics", getEpicsAllController);
jiraRouter.get("/getepics/:boardId", getEpicsController);
jiraRouter.get("/getboardstats", getBoardStatsController);
jiraRouter.get("/getboardstats/:boardId", getBoardStatsController);
jiraRouter.get("/getboardstatsdetails", getBoardStatsDetailsController);
jiraRouter.get("/getboardstatsdetails/:boardId", getBoardStatsDetailsController);
jiraRouter.get("/getboardissuessummary", getBoardIssueSummaryController);
jiraRouter.get("/getboardissuessummary/:boardId", getBoardIssueSummaryController);

export default jiraRouter;
