// src/remotionApp/index.ts
// ------------------------------------------------------------
// AutoVideo AI Studio — Remotion entry point
// This is the file referenced by the webhook's bundle() call.
// ------------------------------------------------------------

import { registerRoot } from "remotion";
import { RemotionRoot } from "./Root";

registerRoot(RemotionRoot);