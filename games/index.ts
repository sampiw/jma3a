import { registerGame, getGameDefinition, getAllGameDefinitions } from "./registry";
import { Pirates3DEngine } from "./pirates3d/engine";
import { Onitama3DEngine } from "./onitama3d/engine";
import { Dib3DEngine } from "./dib3d/engine";
import { GhammadaEngine } from "./ghammada/engine";
import { SandalaEngine } from "./sandala/engine";
import { DibEngine } from "./dib/engine";
import { IntrusEngine } from "./intrus/engine";
import { ChkonFinaEngine } from "./chkon-fina/engine";
import { MettelhaEngine } from "./mettelha/engine";
import { Mamnou3Engine } from "./mamnou3/engine";
import { MissionSirriyaEngine } from "./mission-sirriya/engine";

// Register all production games
registerGame(Pirates3DEngine);
registerGame(Onitama3DEngine);
registerGame(Dib3DEngine);
registerGame(GhammadaEngine);
registerGame(SandalaEngine);
registerGame(DibEngine);
registerGame(IntrusEngine);
registerGame(ChkonFinaEngine);
registerGame(MettelhaEngine);
registerGame(Mamnou3Engine);
registerGame(MissionSirriyaEngine);

export {
  getGameDefinition,
  getAllGameDefinitions,
  Pirates3DEngine,
  Onitama3DEngine,
  Dib3DEngine,
  GhammadaEngine,
  SandalaEngine,
  DibEngine,
  IntrusEngine,
  ChkonFinaEngine,
  MettelhaEngine,
  Mamnou3Engine,
  MissionSirriyaEngine,
};

