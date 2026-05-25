import { Router } from "express";
import { getBoardController, getEpicsController, getProjectController, loginController, logoutController } from "../controller/jiraController";

const jiraRouter = Router();

jiraRouter.post("/login", loginController);
jiraRouter.post("/logout", logoutController);
jiraRouter.get("/getprojects", getProjectController);
jiraRouter.get("/getboards/:projectKey", getBoardController);
jiraRouter.get("/getepics/:boardId", getEpicsController);

export default jiraRouter;
