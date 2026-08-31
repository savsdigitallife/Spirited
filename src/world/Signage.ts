/**
 * What the signs say.
 *
 * Every shopfront on this street carries real Japanese, set horizontally,
 * centred, and fitted to the board it is painted on. The words are ordinary
 * trade words — ラーメン, 珈琲, 居酒屋, コインランドリー — and the shop names are
 * inventions of this street's: 麺屋 かなで, ミドリマート, さくら箱. Nothing here
 * is a real chain, a real logo or a real premises.
 *
 * Text is drawn into a canvas at load time, so it costs one texture per
 * distinct sign and nothing per frame. If the machine has no Japanese font
 * at all, `japaneseAvailable` says so and the caller falls back to the
 * abstract strokes that were here before, rather than drawing a row of
 * empty boxes.
 */

import { Color3 } from "@babylonjs/core/Maths/math.color";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import type { Scene } from "@babylonjs/core/scene";

/**
 * Japanese faces in rough order of preference, ending in whatever the
 * platform will give us. Hiragino on macOS, Yu Gothic on Windows, Noto or
 * IPA on Linux.
 */
const JAPANESE =
  '"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic",YuGothic,' +
  '"Noto Sans JP","Noto Sans CJK JP",Meiryo,"MS PGothic",' +
  '"IPAPGothic","IPAGothic",sans-serif';

export type SignStyle =
  /** Lit tube on a dark plate: shopfront bands, blade signs, banners. */
  | "neon"
  /** Ink on board: menu boards, standees, notices. */
  | "plate"
  /**
   * A tenant panel: dark type on a pale light box with a colour stripe down
   * one edge. These are what actually covers a Japanese commercial
   * frontage — one for every business upstairs, each with its floor on it.
   */
  | "tenant";

export interface SignRequest {
  /** One string per line. Lines are laid out horizontally, top to bottom. */
  lines: readonly string[];
  colour: Color3;
  /** Width ÷ height of the face this texture lands on. */
  aspect: number;
  style: SignStyle;
  /**
   * Colour-block the panel instead of leaving it cream: a yellow box with
   * black type, the way a ramen house lights its fascia.
   */
  invert?: boolean;
}

let available: boolean | null = null;

/**
 * Whether this browser can actually draw Japanese.
 *
 * Rendering one kana and one character from the private use area — which no
 * font defines — and comparing the two bitmaps: if they match, both came
 * back as the missing-glyph box and there is no Japanese font here.
 */
export function japaneseAvailable(): boolean {
  if (available !== null) return available;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 48;
    canvas.height = 48;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return (available = false);
    const render = (text: string): string => {
      ctx.clearRect(0, 0, 48, 48);
      ctx.fillStyle = "#ffffff";
      ctx.font = `36px ${JAPANESE}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, 24, 24);
      return ctx.getImageData(0, 0, 48, 48).data.join(",");
    };
    const kana = render("ラ");
    const missing = render("");
    const blank = render(" ");
    available = kana !== missing && kana !== blank;
  } catch {
    available = false;
  }
  return available ?? false;
}

/** The largest font size at which every line still fits, with room to spare. */
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  lines: readonly string[],
  width: number,
  height: number,
): number {
  const maxWidth = width * 0.86;
  const maxHeight = (height * 0.8) / lines.length;
  let size = Math.min(maxHeight, height);
  for (let i = 0; i < 40 && size > 4; i += 1) {
    ctx.font = `700 ${size}px ${JAPANESE}`;
    const widest = Math.max(...lines.map((line) => ctx.measureText(line).width));
    if (widest <= maxWidth) break;
    size *= Math.max(0.72, maxWidth / widest);
  }
  return Math.max(6, size);
}

/**
 * Draws a sign.
 *
 * The canvas is shaped to the face it will land on, so the letters are not
 * stretched by the mesh; the text is fitted to the width and centred on both
 * axes. Neon is drawn as a wide colour bloom under a hot core, which is what
 * a tube looks like from across a street; a plate is flat ink with a rule
 * under it.
 */
export function signTexture(scene: Scene, name: string, request: SignRequest): DynamicTexture {
  const aspect = Math.max(0.12, Math.min(14, request.aspect));
  const long = 512;
  // The space the sign is laid out in: always the face's own proportions.
  const width = aspect >= 1 ? long : Math.round(long * aspect);
  const height = aspect >= 1 ? Math.round(long / aspect) : long;
  const texture = new DynamicTexture(
    `sign.${name}`,
    { width, height },
    scene,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  const ctx = texture.getContext() as unknown as CanvasRenderingContext2D;
  const hex = request.colour.toHexString();
  let inverted = false;

  // Drawn upside down, so that it is the right way up.
  //
  // A plane's V runs the opposite way to a canvas's rows, so lettering laid
  // out here lands on its head on the sign. Everything symmetrical hid it —
  // the abstract strokes that were here before, the window grids — and it
  // took an "A" on a test board to see it at all.
  ctx.save();
  ctx.translate(0, height);
  ctx.scale(1, -1);

  if (request.style === "plate") {
    ctx.fillStyle = "#141210";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = hex;
    ctx.lineWidth = Math.max(2, height * 0.02);
    ctx.strokeRect(height * 0.05, height * 0.05, width - height * 0.1, height - height * 0.1);
  } else if (request.style === "tenant") {
    // Roughly a third of them are colour-blocked instead of cream, which is
    // what a real stack looks like: a wall of white panels with a red or a
    // gold one every few floors. Decided from the name so a business keeps
    // the same panel wherever it appears.
    let hash = 0;
    for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) % 9973;
    inverted = request.invert ?? hash % 3 === 0;
    ctx.fillStyle = inverted ? hex : "#eae7e0";
    ctx.fillRect(0, 0, width, height);
    // The stripe down the leading edge, which is how a stack of these reads
    // as a stack rather than as one white slab.
    ctx.fillStyle = inverted ? "#1b1b1d" : hex;
    ctx.fillRect(0, 0, Math.max(4, width * 0.045), height);
    ctx.fillStyle = "#1b1b1d";
    ctx.fillRect(0, height - Math.max(3, height * 0.035), width, Math.max(3, height * 0.035));
  } else {
    ctx.fillStyle = "#07090c";
    ctx.fillRect(0, 0, width, height);
  }

  const lines = request.lines.length > 0 ? request.lines : [""];
  const size = fitFontSize(ctx, lines, width, height);
  ctx.font = `700 ${size}px ${JAPANESE}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lineHeight = size * 1.12;
  const top = height / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    const y = top + index * lineHeight;
    if (request.style === "neon") {
      // Three passes: the bloom around the tube, then the tube, then the
      // hot core. A single flat fill reads as a printed sticker.
      ctx.shadowColor = hex;
      ctx.fillStyle = hex;
      ctx.shadowBlur = size * 0.5;
      ctx.fillText(line, width / 2, y);
      ctx.shadowBlur = size * 0.22;
      ctx.fillText(line, width / 2, y);
      ctx.shadowBlur = 0;
      ctx.fillStyle = "#fffdf8";
      ctx.lineWidth = Math.max(1, size * 0.04);
      ctx.strokeStyle = hex;
      ctx.fillText(line, width / 2, y);
      ctx.strokeText(line, width / 2, y);
    } else if (request.style === "tenant") {
      ctx.shadowBlur = 0;
      // Dark type on a bright panel, pale type on a dark one.
      const bright = request.colour.r * 0.3 + request.colour.g * 0.6 + request.colour.b * 0.1;
      ctx.fillStyle = inverted && bright < 0.55 ? "#f7f5ef" : "#17181a";
      ctx.fillText(line, width / 2 + width * 0.02, y);
    } else {
      ctx.shadowBlur = 0;
      ctx.fillStyle = hex;
      ctx.fillText(line, width / 2, y);
    }
  });
  ctx.shadowBlur = 0;
  ctx.restore();

  texture.update(false);
  texture.wrapU = Texture.CLAMP_ADDRESSMODE;
  texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  return texture;
}

/**
 * The street's copy.
 *
 * `band` goes over the shopfront, `blade` on the projecting sign at right
 * angles to it, `note` on whatever the trade puts out on the pavement. Shop
 * names are invented; trade words are the ordinary ones.
 */
export interface SignCopy {
  band: readonly string[];
  blade: readonly string[];
  note?: readonly string[];
}

export const SIGN_COPY: Record<string, SignCopy> = {
  ramen: { band: ["麺屋 かなで"], blade: ["ラー", "メン"], note: ["本日の", "おすすめ"] },
  konbini: { band: ["ミドリマート"], blade: ["24時間"], note: ["年中無休"] },
  cafe: { band: ["珈琲 ひなた"], blade: ["珈琲"], note: ["本日の", "珈琲"] },
  maidcafe: { band: ["メイド喫茶 さくら箱"], blade: ["さくら", "箱"], note: ["ただいま", "営業中"] },
  izakaya: { band: ["居酒屋 とまり木"], blade: ["生ビ", "ール"], note: ["本日の", "おすすめ"] },
  laundry: { band: ["コインランドリー"], blade: ["洗濯"] },
  bookshop: { band: ["古書 みなも"], blade: ["古書"] },
  salon: { band: ["美容室 あおい"], blade: ["美容"] },
  shutter: { band: ["準備中"], blade: ["準備中"] },
  lobby: { band: ["羽澄ビル"], blade: ["羽澄"] },
};

/** Hung off the frontages: whatever else is trading upstairs. */
export const BANNER_COPY: readonly (readonly string[])[] = [
  ["カラオケ"],
  ["営業中"],
  ["二階 スナック"],
  ["両替"],
  ["駐車場"],
  ["テナント募集"],
  ["深夜営業"],
  ["生ビール"],
];

/** The way underground. An invented station on an invented line. */
export const STATION_COPY: readonly string[] = ["地下鉄 羽澄町駅"];

/**
 * The businesses upstairs.
 *
 * Every one of these is invented, and every one carries the floor it is on,
 * because that is the whole purpose of the panel: a passer-by reads the
 * stack to find out what is in the building.
 */
export const TENANT_COPY: readonly (readonly string[])[] = [
  ["カラオケ 3F"],
  ["居酒屋 4F"],
  ["スナック 5F"],
  ["整体 6F"],
  ["歯科 2F"],
  ["ネイル 3F"],
  ["占い 4F"],
  ["雀荘 B1F"],
  ["バー 5F"],
  ["中華 2F"],
  ["古着 3F"],
  ["ゲーム 4F"],
  ["美容 2F"],
  ["写真 6F"],
  ["酒場 B1F"],
  ["パスタ 2F"],
];
