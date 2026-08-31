/**
 * The ramen shops.
 *
 * Three of them on this street, and no two alike — which is the point. A
 * Tokyo ramen shop is not a chain unit: it is one owner's premises, fitted
 * out to their taste and their trade. One is a standing counter by the
 * station with a ticket machine and photographs of every dish in the window;
 * one is a loud tonkotsu place with its counter open to the pavement and
 * stools on the street; one is a quiet timber shopfront with a single
 * lantern and no menu outside at all.
 *
 * Every house here is invented — the names, the marks, the fit-out. What is
 * copied is the grammar: noren, ticket machine, photo menu, counter, pots.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { NeonColour } from "./CityMaterials";

/** How the frontage is put together. */
export type RamenFront =
  /** Timber posts, lattice, one lantern, nothing shouted. */
  | "timber"
  /** A big lit signboard over the opening, photographs down one side. */
  | "signboard"
  /** The counter itself open to the street, under a lit fascia. */
  | "openCounter";

/** How the room behind it is laid out. */
export type RamenPlan =
  /** One counter across the room with stools. */
  | "counter"
  /** Standing height, no stools, and quick. */
  | "standing"
  /** A counter round three sides, with the kitchen in the middle. */
  | "horseshoe";

export interface RamenHouse {
  id: string;
  /** Over the shopfront. */
  band: readonly string[];
  /** On the projecting sign. */
  blade: readonly string[];
  /** On the board out on the pavement. */
  note: readonly string[];
  front: RamenFront;
  /** Timber, awning or fascia colour. */
  trim: Color3;
  /** The lit fascia's colour, where there is one. */
  fascia: Color3;
  sign: NeonColour;
  noren: Color3;
  norenPanels: number;
  lanterns: number;
  /** A ticket machine outside, beside the door. */
  ticketMachine: boolean;
  /** A column of dish photographs with prices. */
  photoMenu: boolean;
  /** Stools out on the pavement, at a counter open to the street. */
  streetStools: number;
  interior: {
    plan: RamenPlan;
    /** Counter top and stools. */
    counterTop: Color3;
    stool: Color3;
    wall: Color3;
    floor: Color3;
    lamp: Color3;
    lampIntensity: number;
    /** How much is on the walls and shelves. */
    decor: "spartan" | "homely" | "loud";
    patrons: number;
    /** A second pair of hands behind the counter. */
    assistant: boolean;
  };
}

export const RAMEN_HOUSES: Record<string, RamenHouse> = {
  /**
   * 麺屋 かなで — the quiet one. Timber front, one lantern, no menu outside,
   * eight stools and a cook who does not look up.
   */
  kanade: {
    id: "kanade",
    band: ["麺屋 かなで"],
    blade: ["ラー", "メン"],
    note: ["本日の", "おすすめ"],
    front: "timber",
    trim: new Color3(0.19, 0.12, 0.08),
    fascia: new Color3(0.24, 0.15, 0.1),
    sign: "gold",
    noren: new Color3(0.4, 0.08, 0.07),
    norenPanels: 5,
    lanterns: 2,
    ticketMachine: false,
    photoMenu: false,
    streetStools: 0,
    interior: {
      plan: "counter",
      counterTop: new Color3(0.36, 0.23, 0.13),
      stool: new Color3(0.42, 0.12, 0.1),
      wall: new Color3(0.29, 0.2, 0.14),
      floor: new Color3(0.16, 0.13, 0.11),
      lamp: new Color3(1, 0.8, 0.52),
      lampIntensity: 14,
      decor: "homely",
      patrons: 2,
      assistant: false,
    },
  },

  /**
   * 立喰 みなと — a standing shop by the station. A ticket machine at the
   * door, every dish photographed on the wall beside it, a white signboard
   * you can read from the crossing, and nowhere to sit down.
   */
  minato: {
    id: "minato",
    band: ["立喰 みなと"],
    blade: ["そば"],
    note: ["券売機", "あります"],
    front: "signboard",
    trim: new Color3(0.72, 0.7, 0.66),
    fascia: new Color3(0.93, 0.92, 0.88),
    sign: "ice",
    noren: new Color3(0.94, 0.93, 0.9),
    norenPanels: 6,
    lanterns: 0,
    ticketMachine: true,
    photoMenu: true,
    streetStools: 0,
    interior: {
      plan: "standing",
      counterTop: new Color3(0.62, 0.6, 0.56),
      stool: new Color3(0.5, 0.5, 0.52),
      wall: new Color3(0.68, 0.67, 0.64),
      floor: new Color3(0.32, 0.32, 0.31),
      lamp: new Color3(0.94, 0.97, 1),
      lampIntensity: 20,
      decor: "spartan",
      patrons: 3,
      assistant: false,
    },
  },

  /**
   * 豚骨 いろは — the loud one. A yellow fascia lit from inside, the counter
   * open to the pavement with stools on the street, red lanterns, and a
   * kitchen you can watch from outside.
   */
  iroha: {
    id: "iroha",
    band: ["豚骨 いろは"],
    blade: ["豚骨"],
    note: ["替玉", "無料"],
    front: "openCounter",
    trim: new Color3(0.2, 0.16, 0.12),
    fascia: new Color3(0.95, 0.72, 0.16),
    sign: "gold",
    noren: new Color3(0.72, 0.12, 0.1),
    norenPanels: 4,
    lanterns: 3,
    ticketMachine: false,
    photoMenu: true,
    streetStools: 4,
    interior: {
      plan: "horseshoe",
      counterTop: new Color3(0.5, 0.33, 0.16),
      stool: new Color3(0.7, 0.5, 0.12),
      wall: new Color3(0.36, 0.26, 0.16),
      floor: new Color3(0.2, 0.16, 0.12),
      lamp: new Color3(1, 0.86, 0.6),
      lampIntensity: 18,
      decor: "loud",
      patrons: 4,
      assistant: true,
    },
  },
};

/** The house a plot is fitted out as, or the quiet one if it names none. */
export function ramenHouse(id: string | undefined): RamenHouse {
  return RAMEN_HOUSES[id ?? "kanade"] ?? RAMEN_HOUSES.kanade!;
}
