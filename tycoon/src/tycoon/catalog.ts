// PAWtastic Daycare Tycoon — every constant and catalog (spec §4). Game coins only; never real prices.
import type { FloorStyle, FurnitureId, OutdoorId, ParcelId, Prices, RoomType } from "./types";

export const TILE = 2;
export const COLS = 36;
export const ROWS = 28;
export const ENTRANCE = { c: 18, r: 27 } as const;
export const START_COINS = 3000;
export const GUIDE_REWARD = 200;

export const WALL_PRICE = 20;
export const FLOOR_PRICE = 10;
export const DOOR_PRICE = 30;
export const ROOM_MIN = 2;
export const ROOM_MAX = 10;
export const MAX_ROOMS = 12;
export const MAX_DOORS = 4;
export const MAX_THINGS = 200;
export const SELL_RATE = 0.75;

export type Parcel = { id: ParcelId; name: string; c0: number; c1: number; r0: number; r1: number; level: number; price: number };
export const PARCELS: Parcel[] = [
  { id: "starter", name: "Starter lot", c0: 10, c1: 26, r0: 16, r1: 28, level: 1, price: 0 },
  { id: "west", name: "West lot", c0: 0, c1: 10, r0: 16, r1: 28, level: 3, price: 1500 },
  { id: "east", name: "East lot", c0: 26, c1: 36, r0: 16, r1: 28, level: 3, price: 1500 },
  { id: "north", name: "North lot", c0: 10, c1: 26, r0: 0, r1: 16, level: 6, price: 4000 },
  { id: "northwest", name: "Northwest lot", c0: 0, c1: 10, r0: 0, r1: 16, level: 10, price: 6000 },
  { id: "northeast", name: "Northeast lot", c0: 26, c1: 36, r0: 0, r1: 16, level: 12, price: 8000 },
];

export const ROOM_TYPE_NAMES: Record<RoomType, string> = {
  lobby: "Lobby",
  playroom: "Playroom",
  calm: "Calm-Down Room",
  bath: "Bath Room",
  boarding: "Boarding Room",
  staff: "Staff Room",
};
/** Room types limited to one per facility. */
export const ONE_PER_FACILITY: RoomType[] = ["lobby", "staff"];

export type FurnitureDef = {
  id: FurnitureId;
  name: string;
  w: number;
  d: number;
  allowed: RoomType[] | "any";
  unlock: number;
  price: number;
  spots?: number;
  waiting?: number;
  boarder?: number;
  tub?: "basic" | "deluxe";
  staffBoost?: number;
  fun?: number;
  appeal?: number;
  maxPerFacility?: number;
  required?: boolean;
};
export const FURNITURE: FurnitureDef[] = [
  { id: "front_counter", name: "Front Desk Counter", w: 2, d: 1, allowed: ["lobby"], unlock: 1, price: 300, maxPerFacility: 1, required: true },
  { id: "bench", name: "Waiting Bench", w: 2, d: 1, allowed: ["lobby"], unlock: 1, price: 120, waiting: 2 },
  { id: "dog_bed", name: "Dog Bed", w: 1, d: 1, allowed: ["playroom", "calm"], unlock: 1, price: 60, spots: 1 },
  { id: "play_mat", name: "Play Mat", w: 1, d: 1, allowed: ["playroom"], unlock: 1, price: 50, spots: 1 },
  { id: "water_bowl", name: "Water Bowl", w: 1, d: 1, allowed: "any", unlock: 1, price: 20, fun: 1 },
  { id: "rug", name: "Rug", w: 1, d: 1, allowed: "any", unlock: 1, price: 40, appeal: 1 },
  { id: "plant", name: "House Plant", w: 1, d: 1, allowed: "any", unlock: 1, price: 60, appeal: 1 },
  { id: "toy_bin", name: "Toy Bin", w: 1, d: 1, allowed: ["playroom"], unlock: 2, price: 80, fun: 2 },
  { id: "bath_tub", name: "Bath Tub", w: 2, d: 1, allowed: ["bath"], unlock: 2, price: 400, tub: "basic" },
  { id: "boarding_bed", name: "Boarding Bed", w: 1, d: 1, allowed: ["boarding"], unlock: 3, price: 150, boarder: 1 },
  { id: "couch", name: "Comfy Couch", w: 2, d: 1, allowed: ["lobby", "calm", "staff"], unlock: 3, price: 200, appeal: 2 },
  { id: "hurdles", name: "Mini Hurdles", w: 2, d: 1, allowed: ["playroom"], unlock: 4, price: 180, fun: 4 },
  { id: "deluxe_bed", name: "Deluxe Dog Bed", w: 1, d: 1, allowed: ["playroom"], unlock: 5, price: 150, spots: 1, fun: 2 },
  { id: "staff_couch", name: "Staff Couch", w: 2, d: 1, allowed: ["staff"], unlock: 5, price: 180, staffBoost: 0.5 },
  { id: "deluxe_tub", name: "Deluxe Bath Tub", w: 2, d: 1, allowed: ["bath"], unlock: 7, price: 900, tub: "deluxe" },
];

export type OutdoorTab = "play" | "comfort" | "scenery" | "paths";
export type OutdoorDef = {
  id: OutdoorId;
  name: string;
  tab: OutdoorTab;
  w: number;
  d: number;
  unlock: number;
  price: number;
  fun?: [number, number, number];
  appeal?: [number, number, number];
  levels: 1 | 3;
  freeUpkeep?: boolean;
  maxPerFacility?: number;
};
export const OUTDOOR: OutdoorDef[] = [
  { id: "play_yard", name: "Play Yard", tab: "play", w: 2, d: 2, unlock: 1, price: 200, fun: [4, 7, 10], levels: 3 },
  { id: "ball_pit", name: "Ball Pit", tab: "play", w: 2, d: 2, unlock: 2, price: 300, fun: [5, 8, 12], levels: 3 },
  { id: "splash_pool", name: "Splash Pool", tab: "play", w: 2, d: 2, unlock: 3, price: 450, fun: [6, 10, 14], levels: 3 },
  { id: "agility", name: "Agility Course", tab: "play", w: 3, d: 2, unlock: 5, price: 700, fun: [8, 13, 18], appeal: [2, 3, 4], levels: 3 },
  { id: "water", name: "Water Station", tab: "comfort", w: 1, d: 1, unlock: 1, price: 80, fun: [1, 2, 3], appeal: [1, 2, 3], levels: 3 },
  { id: "shade_tree", name: "Shade Tree", tab: "comfort", w: 1, d: 1, unlock: 2, price: 120, appeal: [2, 3, 4], levels: 3 },
  { id: "nap_cabana", name: "Nap Cabana", tab: "comfort", w: 2, d: 1, unlock: 4, price: 350, fun: [3, 5, 7], appeal: [2, 3, 4], levels: 3 },
  { id: "park_bench", name: "Bench", tab: "scenery", w: 1, d: 1, unlock: 1, price: 40, appeal: [1, 1, 1], levels: 1 },
  { id: "flowers", name: "Flower Bed", tab: "scenery", w: 1, d: 1, unlock: 1, price: 50, appeal: [1, 1, 1], levels: 1 },
  { id: "lights", name: "String Lights", tab: "scenery", w: 1, d: 1, unlock: 3, price: 90, appeal: [2, 2, 2], levels: 1 },
  { id: "fountain", name: "Fountain", tab: "scenery", w: 2, d: 2, unlock: 7, price: 800, appeal: [6, 6, 6], levels: 1 },
  { id: "fence", name: "Fence", tab: "scenery", w: 1, d: 1, unlock: 1, price: 15, levels: 1, freeUpkeep: true },
  { id: "path", name: "Path", tab: "paths", w: 1, d: 1, unlock: 1, price: 10, levels: 1, freeUpkeep: true },
  { id: "sign", name: "PAWtastic Academy Sign", tab: "scenery", w: 2, d: 1, unlock: 1, price: 0, appeal: [1, 1, 1], levels: 1, freeUpkeep: true, maxPerFacility: 1 },
];

export const furnitureDef = (id: string) => FURNITURE.find((f) => f.id === id) ?? null;
export const outdoorDef = (id: string) => OUTDOOR.find((o) => o.id === id) ?? null;
export const isFurniture = (id: string) => FURNITURE.some((f) => f.id === id);
export const thingSize = (id: string): { w: number; d: number } => {
  const d = furnitureDef(id) ?? outdoorDef(id);
  return d ? { w: d.w, d: d.d } : { w: 1, d: 1 };
};
export const thingName = (id: string) => (furnitureDef(id) ?? outdoorDef(id))?.name ?? id;

export const FLOORS: FloorStyle[] = ["wood", "tile", "rubber", "carpet"];
export const FLOOR_NAMES: Record<FloorStyle, string> = { wood: "Wood", tile: "Tile", rubber: "Soft rubber", carpet: "Carpet" };
export const WALL_COLORS = ["#F4EDE4", "#FFFFFF", "#DCEBFA", "#E3F2E1", "#FBE7C6", "#F7D9E3", "#E6E0F5", "#D9DEE5"];

/** Price of one upgrade step (to level 2: × 1.8, to level 3: × 3.2), rounded to the nearest 10. */
export function upgradePrice(base: number, toLevel: 2 | 3): number {
  return Math.round((base * (toLevel === 2 ? 1.8 : 3.2)) / 10) * 10;
}

/** Game-coin prices (spec §4.7). Never real PAWtastic prices. */
export const PRICE_DEFAULTS: Prices = { daycare: 40, boarding: 90, bath: 25, exitBath: 30 };
export const PRICE_RANGES: Record<keyof Prices, [number, number]> = { daycare: [20, 80], boarding: [50, 160], bath: [10, 50], exitBath: [10, 60] };
