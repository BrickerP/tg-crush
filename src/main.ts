import { serve } from "./server.ts";
import * as telegram from "./tg.ts";

await serve(telegram);
await telegram.start();
