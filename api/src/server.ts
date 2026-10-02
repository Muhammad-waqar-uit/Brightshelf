import { app } from "./app";
import { env } from "./lib/env";

app.listen(env.PORT);