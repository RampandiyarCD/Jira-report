import { Router } from "express";
import { getBoardController, getBoardStatsController, getEpicsAllController, getEpicsController, getProjectController, loginController, logoutController } from "../controller/jiraController";

const jiraRouter = Router();

jiraRouter.post("/login", loginController);
jiraRouter.post("/logout", logoutController);
jiraRouter.get("/getprojects", getProjectController);
jiraRouter.get("/getboards/:projectKey", getBoardController);
jiraRouter.get("/getepics", getEpicsAllController);
jiraRouter.get("/getepics/:boardId", getEpicsController);
jiraRouter.get("/getboardstats", getBoardStatsController);
jiraRouter.get("/getboardstats/:boardId", getBoardStatsController);

export default jiraRouter;
