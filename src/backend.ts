import type { SpindleAPI } from "lumiverse-spindle-types";

declare const spindle: SpindleAPI;

import { createBackendApp } from "./backend/orchestration/app.js";

createBackendApp(spindle);
