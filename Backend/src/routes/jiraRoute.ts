import { Router } from "express";
import { loginController } from "../controller/loginController";

const jiraRouter = Router();

jiraRouter.post("/login", loginController);

export default jiraRouter;

