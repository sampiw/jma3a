import { registerGame, getGameDefinition, getAllGameDefinitions } from "./registry";
import { GhammadaEngine } from "./ghammada/engine";
import { DibEngine } from "./dib/engine";
import { IntrusEngine } from "./intrus/engine";
import { ChkonFinaEngine } from "./chkon-fina/engine";
import { MettelhaEngine } from "./mettelha/engine";
import { Mamnou3Engine } from "./mamnou3/engine";
import { MissionSirriyaEngine } from "./mission-sirriya/engine";

// Register all production games
registerGame(GhammadaEngine);
registerGame(DibEngine);
registerGame(IntrusEngine);
registerGame(ChkonFinaEngine);
registerGame(MettelhaEngine);
registerGame(Mamnou3Engine);
registerGame(MissionSirriyaEngine);

export {
  getGameDefinition,
  getAllGameDefinitions,
  GhammadaEngine,
  DibEngine,
  IntrusEngine,
  ChkonFinaEngine,
  MettelhaEngine,
  Mamnou3Engine,
  MissionSirriyaEngine,
};
