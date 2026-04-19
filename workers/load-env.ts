/**
 * Side-effect module imported FIRST by the worker so env is loaded before
 * any other module (including @/lib/env) reads process.env.
 */
import dotenv from "dotenv";
import path from "node:path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
