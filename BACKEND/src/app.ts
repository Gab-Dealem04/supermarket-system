import express from "express";
import cors from "cors";
import routes from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

const app = express();

app.use(cors());
app.use(express.json()); // permite ler req.body em JSON

app.use("/api", routes);

app.use(errorHandler); // sempre por último

export default app;