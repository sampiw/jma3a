import { registerGame, getGameDefinition, getAllGameDefinitions } from "./registry";
import { Carbon3DEngine } from "./carbon3d/engine";
import { Dib3DEngine } from "./dib3d/engine";
import { GhammadaEngine } from "./ghammada/engine";
import { DibEngine } from "./dib/engine";
import { IntrusEngine } from "./intrus/engine";
import { ChkonFinaEngine } from "./chkon-fina/engine";
import { MettelhaEngine } from "./mettelha/engine";
import { Mamnou3Engine } from "./mamnou3/engine";
import { MissionSirriyaEngine } from "./mission-sirriya/engine";

// Register all production games
registerGame(Carbon3DEngine);
registerGame(Dib3DEngine);
registerGame(GhammadaEngine);
registerGame(DibEngine);
registerGame(IntrusEngine);
registerGame(ChkonFinaEngine);
registerGame(Mamnou3Engine);
registerGame(MettelhaEngine);
registerGame(MissionSirriyaEngine);

export {
  getGameDefinition,
  getAllGameDefinitions,
  Carbon3DEngine,
  Dib3DEngine,
  GhammadaEngine,
  DibEngine,
  IntrusEngine,
  ChkonFinaEngine,
  MettelhaEngine,
  Mamnou3Engine,
  MissionSirriyaEngine,
};

