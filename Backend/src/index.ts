import express, { Express } from "express";
import cors from "cors";
import dotenv from "dotenv";
import jiraRouter from "./routes/jiraRoute";
import cookieParser from "cookie-parser";
import logger from "./utils/logger";

const app: Express = express();

dotenv.config();

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:5174"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}))
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const PORT = process.env.PORT;

app.use("/jira", jiraRouter);

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
