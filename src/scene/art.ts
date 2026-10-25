// Original pixel artwork, drawn from rectangles. No external sprites or image APIs.
export const W = 512,
  H = 368;
export const palettes = {
  maple: {
    floor: ["#bd936b", "#b58a62", "#c29a72", "#ad815c"],
    wall: "#dfd3ad",
    trim: "#52756a",
    rug: "#a1aaa0",
  },
  dusk: {
    floor: ["#9a785f", "#94715a", "#a18066", "#8a6a55"],
    wall: "#b8bdc2",
    trim: "#536779",
    rug: "#7f96a5",
  },
};
export type Theme = keyof typeof palettes;
export type Outfit = "mint" | "peach" | "blue" | "gold";
export const outfitColors: Record<Outfit, string> = {
  mint: "#92c6a7",
  peach: "#dc997e",
  blue: "#91b8dc",
  gold: "#dfbc6c",
};
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function painter(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d")!;
  return {
    ctx,
    r: (x: number, y: number, w: number, h: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, w, h);
    },
  };
}
export function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size = 1,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  const r = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = c;
    ctx.fillRect(x, y, w, h);
  };
  r(-7, 0, 14, 3, "#d4aa83");
  r(-6, 3, 12, 11, "#a66e50");
  r(-4, 11, 8, 4, "#805742");
  r(-1, -17, 2, 19, "#425c42");
  for (const [dx, dy] of [
    [-8, -18],
    [1, -25],
    [-10, -9],
    [1, -13],
    [-4, -28],
  ]) {
    r(dx, dy, 7, 9, "#496f49");
    r(dx + 1, dy, 4, 5, "#74945b");
    r(dx + 2, dy - 2, 3, 3, "#89a56c");
  }
  ctx.restore();
}
export function officeArt(theme: Theme) {
  const c = canvas(W, H),
    { ctx, r } = painter(c),
    p = palettes[theme];
  r(25, 63, 472, 286, "#0c141b");
  r(17, 57, 478, 282, "#604b3e");
  r(20, 80, 472, 256, p.floor[0]);
  ctx.save();
  ctx.beginPath();
  ctx.rect(20, 80, 472, 256);
  ctx.clip();
  for (let y = 80; y < 336; y += 16) {
    r(20, y, 472, 1, "#997452");
    for (let x = 20 - ((y / 16) % 2) * 48; x < 492; x += 96) {
      const n = Math.abs((x * 31 + y * 17) % 4);
      r(
        Math.max(20, x + 1),
        y + 1,
        Math.min(95, 491 - Math.max(20, x + 1)),
        14,
        p.floor[n],
      );
      r(x + 94, y, 1, 16, "#9e7856");
      r(x + 12, y + 9, 27, 1, "#ab815b");
      r(x + 53, y + 4, 22, 1, "#c7a27c");
      if ((x + y) % 3 === 0) {
        r(x + 41, y + 11, 6, 1, "#946c4a");
        r(x + 43, y + 10, 2, 3, "#a27751");
      }
    }
  }
  ctx.restore();
  // Shallow cutaway walls, timber cap and baseboards.
  r(17, 39, 478, 44, p.wall);
  r(17, 39, 478, 5, p.trim);
  r(17, 79, 478, 5, "#806849");
  r(20, 84, 472, 4, "#a28661");
  r(17, 43, 5, 294, p.wall);
  r(17, 43, 3, 294, p.trim);
  r(489, 43, 6, 294, p.wall);
  r(493, 43, 3, 294, p.trim);
  for (const x of [54, 211, 368]) {
    r(x - 3, 46, 62, 36, "#b39b75");
    r(x, 47, 56, 32, "#698c98");
    r(x + 2, 49, 52, 27, "#a9c9c4");
    r(x + 3, 50, 16, 23, "#cbded0");
    r(x + 34, 50, 17, 24, "#bcd6ce");
    r(x + 25, 47, 3, 32, "#efe4bf");
    r(x, 62, 56, 2, "#efe4bf");
    r(x - 3, 78, 62, 4, "#f0dfb5");
    r(x + 4, 51, 3, 5, "#f6edcb");
    r(x + 45, 68, 5, 3, "#c7d8c4");
  }
  // Library, individual books and framed prints.
  r(128, 48, 56, 39, "#795941");
  r(131, 50, 50, 33, "#4c4739");
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 9; i++) {
      const h = 10 + ((i * 7) % 5);
      r(
        133 + i * 5,
        65 + row * 16 - h,
        4,
        h,
        ["#b46f58", "#b3ac78", "#7c9e9a", "#d7bb7e"][i % 4],
      );
      r(134 + i * 5, 63 + row * 16 - h, 1, 2, "#e2d4a7");
    }
    r(130, 65 + row * 16, 52, 3, "#ab8258");
  }
  r(282, 48, 45, 29, "#8c6b4f");
  r(285, 51, 39, 23, "#e7d4a8");
  r(288, 67, 8, 4, "#a2b27a");
  r(297, 60, 9, 11, "#718a65");
  r(306, 56, 13, 15, "#c29b71");
  r(313, 53, 4, 4, "#d7af6a");
  // Warm rug under the four desks.
  r(96, 112, 260, 205, "#987858");
  r(99, 115, 254, 199, p.rug);
  for (let x = 101; x < 350; x += 6) {
    r(x, 115, 2, 2, "#b8bba9");
    r(x, 312, 2, 2, "#b8bba9");
  }
  r(102, 118, 248, 191, "#8b9b8b");
  r(105, 121, 242, 185, p.rug);
  // Lounge.
  r(34, 173, 52, 99, "#967757");
  r(32, 170, 50, 98, "#a1b198");
  r(35, 173, 44, 89, "#6f907f");
  r(33, 174, 8, 88, "#9bb09a");
  r(76, 174, 8, 88, "#4f766b");
  for (const y of [178, 207, 236]) {
    r(43, y, 29, 25, "#86a18c");
    r(44, y + 2, 25, 2, "#a7b79c");
    r(71, y + 3, 2, 20, "#73907d");
  }
  r(44, 183, 13, 14, "#e3c591");
  r(46, 184, 9, 10, "#ebd1a4");
  r(59, 239, 12, 12, "#b77960");
  r(50, 275, 21, 28, "#805d44");
  r(47, 274, 27, 24, "#c49b6c");
  r(49, 276, 23, 19, "#d1ac79");
  r(51, 282, 11, 9, "#759492");
  r(54, 279, 6, 3, "#c6d0b6");
  r(63, 286, 5, 5, "#f0dbac");
  // Coffee counter with sink and espresso machine.
  r(418, 88, 61, 38, "#705744");
  r(416, 85, 65, 8, "#dfd2aa");
  r(419, 94, 59, 29, "#b28a62");
  for (const x of [420, 440, 460]) {
    r(x, 96, 17, 23, "#c39b70");
    r(x + 11, 99, 3, 2, "#745d47");
  }
  r(448, 74, 23, 13, "#8c9994");
  r(450, 76, 18, 8, "#536a67");
  r(456, 69, 3, 8, "#c4c7af");
  r(458, 69, 6, 2, "#c4c7af");
  r(421, 62, 22, 23, "#404d4e");
  r(423, 64, 18, 6, "#6d7d75");
  r(426, 72, 12, 8, "#263c3e");
  r(428, 78, 5, 5, "#e9d5a4");
  r(423, 83, 18, 2, "#a9aaa0");
  // Breakout nook.
  r(402, 192, 77, 104, "#ad815e");
  r(405, 195, 71, 98, "#bfa17c");
  for (let y = 199; y < 291; y += 4) r(409, y, 63, 1, "#c9af8b");
  for (const [x, y] of [
    [411, 210],
    [462, 210],
    [411, 259],
    [462, 259],
  ]) {
    r(x - 5, y, 16, 18, "#5a736b");
    r(x - 4, y - 3, 14, 16, "#82948a");
    r(x - 1, y - 1, 8, 10, "#97a294");
  }
  r(421, 216, 40, 58, "#8b6547");
  r(417, 210, 48, 58, "#d6b07a");
  r(420, 212, 42, 51, "#e5bf87");
  r(437, 231, 13, 17, "#b07459");
  r(439, 233, 10, 13, "#e2d2aa");
  r(426, 221, 6, 6, "#f4e5bf");
  r(453, 252, 6, 6, "#f4e5bf");
  r(428, 223, 2, 2, "#8d6849");
  // Entry mat and a little wall clock.
  r(222, 320, 69, 17, "#686b60");
  r(225, 323, 63, 11, "#878c78");
  r(232, 326, 48, 1, "#a9ad93");
  r(232, 330, 48, 1, "#a9ad93");
  r(335, 51, 15, 15, "#7d7155");
  r(337, 53, 11, 11, "#e7d9ae");
  r(342, 55, 1, 5, "#5b6253");
  r(342, 59, 4, 1, "#5b6253");
  drawPlant(ctx, 37, 108, 1.3);
  drawPlant(ctx, 385, 104, 1.1);
  drawPlant(ctx, 464, 167, 1.4);
  drawPlant(ctx, 41, 318, 1.0);
  drawPlant(ctx, 385, 310, 1.2);
  // Physical plaque, not an overlay.
  r(220, 42, 40, 6, p.trim);
  ctx.fillStyle = "#f3e8cb";
  ctx.font = "bold 4px monospace";
  ctx.fillText("MAPLE STUDIO", 223, 47);
  r(17, 336, 205, 6, p.trim);
  r(291, 336, 204, 6, p.trim);
  r(17, 342, 205, 4, "#324c47");
  r(291, 342, 204, 4, "#324c47");
  return c;
}
export function deskArt(variant: number) {
  const c = canvas(78, 69),
    { ctx, r } = painter(c);
  r(4, 9, 71, 36, "#624f3d");
  r(6, 40, 5, 10, "#71583f");
  r(65, 40, 5, 10, "#71583f");
  r(2, 7, 72, 33, "#a3764e");
  r(2, 4, 72, 32, "#d4ad78");
  r(4, 5, 68, 3, "#e6c28b");
  r(4, 34, 68, 3, "#bc905f");
  r(7, 13, 63, 1, "#c59b69");
  // Monitor, stand, screen reflected by state animation in scene.
  r(22, 0, 32, 23, "#263d42");
  r(24, 2, 28, 17, "#5c8589");
  r(26, 4, 24, 13, "#243e4b");
  r(28, 6, 12, 1, "#8bbca1");
  r(28, 9, 18, 1, "#6d9c9a");
  r(28, 12, 9, 1, "#c2bc8a");
  r(39, 12, 7, 1, "#7094a2");
  r(36, 23, 4, 4, "#536764");
  r(30, 26, 16, 2, "#4a5e5b");
  r(23, 29, 26, 5, "#dfd9b9");
  for (let x = 25; x < 47; x += 3) r(x, 30, 1, 2, "#a4aa98");
  r(53, 29, 5, 5, "#ebe2bc");
  r(65, 19, 5, 6, "#f0dfb2");
  r(66, 20, 3, 3, "#7b5c42");
  r(7, 22, 11, 10, variant % 2 ? "#b67c65" : "#7e9c9b");
  r(8, 23, 8, 2, "#e2d2ad");
  drawPlant(ctx, 10, 17, 0.45);
  // Stool.
  r(26, 49, 24, 15, "#4b6662");
  r(28, 47, 20, 13, "#7e9b8c");
  r(30, 48, 16, 3, "#9ab29b");
  r(28, 60, 3, 7, "#526963");
  r(45, 60, 3, 7, "#526963");
  return c;
}
export function characterArt(
  outfit: Outfit,
  frame: number,
  behavior: string,
  index: number,
) {
  const c = canvas(24, 34),
    { r } = painter(c),
    shirt = outfitColors[outfit];
  const walk = behavior === "walk",
    work = behavior === "work",
    celebrate = behavior === "celebrate";
  const bob = walk ? frame % 2 : celebrate ? (frame % 2) * 2 : 0;
  const y = -bob,
    skin = ["#e2b88e", "#bd8e6c", "#e6bf9a", "#b2805e"][index % 4];
  r(4, 31, 16, 2, "#655b4a"); // grounded shadow
  const leg = walk ? (frame % 4 < 2 ? 2 : -2) : 0;
  r(7, 25 + y, 4, 6 + leg, "#374851");
  r(14, 25 + y, 4, 6 - leg, "#374851");
  r(6, 30 + y + leg, 5, 2, "#263b40");
  r(14, 30 + y - leg, 5, 2, "#263b40");
  r(6, 16 + y, 13, 11, shirt);
  r(5, 19 + y, 2, 7, shirt);
  r(18, 19 + y, 2, 7, shirt);
  r(8, 24 + y, 9, 3, shirt);
  r(12, 17 + y, 2, 8, "#b7c8b6");
  const handY = celebrate ? 10 : work ? 20 + (frame % 2) : 24;
  r(3, handY + y, 4, 4, skin);
  r(19, handY + y, 3, 4, skin);
  if (celebrate) {
    r(4, 13 + y, 3, 7, shirt);
    r(19, 13 + y, 3, 7, shirt);
  }
  // Head with ears, nose, hair and individual accessories.
  r(6, 5 + y, 13, 11, skin);
  r(5, 9 + y, 2, 4, skin);
  r(18, 9 + y, 2, 4, skin);
  r(8, 14 + y, 9, 3, skin);
  r(9, 8 + y, 2, 2, "#334048");
  r(16, 8 + y, 2, 2, "#334048");
  r(14, 12 + y, 3, 1, "#a7775d");
  const hair = ["#314c4f", "#725440", "#695c47", "#353c42"][index % 4];
  r(6, 3 + y, 13, 4, hair);
  r(5, 5 + y, 3, 5, hair);
  r(7, 2 + y, 10, 2, hair);
  r(18, 5 + y, 2, 4, hair);
  if (index % 4 === 0) {
    r(4, 5 + y, 17, 3, shirt);
    r(7, 2 + y, 11, 4, shirt);
    r(16, 4 + y, 6, 2, "#bedbc2");
  }
  if (index % 4 === 1) {
    r(18, 8 + y, 3, 8, hair);
    r(5, 8 + y, 3, 8, hair);
  }
  if (index % 4 === 2) {
    r(7, 8 + y, 6, 4, "#34484e");
    r(15, 8 + y, 5, 4, "#34484e");
    r(9, 9 + y, 3, 1, "#b9d2ca");
    r(13, 9 + y, 2, 1, "#34484e");
  }
  if (index % 4 === 3) {
    r(4, 8 + y, 2, 7, "#d7b567");
    r(20, 8 + y, 2, 7, "#d7b567");
    r(5, 5 + y, 16, 2, "#d7b567");
  }
  if (behavior === "coffee") {
    r(18, 21 + y, 5, 5, "#eddfbd");
    r(20, 19 + y, 1, 2, "#c2c9b0");
  }
  if (behavior === "read") {
    r(9, 22 + y, 12, 7, "#d4bd8c");
    r(15, 22 + y, 1, 7, "#9d865e");
    r(10, 24 + y, 4, 1, "#a39170");
    r(17, 24 + y, 3, 1, "#a39170");
  }
  return c;
}
