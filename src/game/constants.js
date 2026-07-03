export const GAME_WIDTH = 1400;
export const GAME_HEIGHT = 800;
export const FIXED_TIMESTEP = 1 / 60;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_UPDATES_PER_FRAME = 8;

export const GAME_STATES = {
  BOOT: "boot",
  TITLE: "title",
  PLAYING: "playing",
  PAUSED: "paused",
  SETTINGS: "settings",
  GAME_OVER: "gameOver",
};

export const COLORS = {
  black: "#000000",
  void: "#14051D",
  panel: "#2A1236",
  panelDeep: "#07020A",
  cyan: "#9D00FF",
  cyanDim: "#8830BF",
  teal: "#B84DFF",
  tealDark: "#674080",
  amber: "#D6FF00",
  amberDim: "#98AA39",
  orange: "#FF8A00",
  orangeHot: "#FF4D00",
  orangeDim: "#9B3E17",
  red: "#FF5A1F",
  redDim: "#7E2A12",
  heart: "#FF2F55",
  white: "#F3E8FF",
  muted: "#98AA39",
  blue: "#5F3DFF",
  violet: "#674080",
  violetBright: "#8830BF",
  magentaHot: "#C600FF",
  lime: "#D6FF00",
  olive: "#98AA39",
};

export const FONT_FAMILY = '"Automatron", "Consolas", monospace';

export const PLAYFIELD = {
  left: 216,
  right: 1328,
  top: 92,
  bottom: 616,
};

export const BUBBLE_TYPES = [
  {
    id: "cyan",
    color: COLORS.cyan,
    dim: COLORS.cyanDim,
    points: 100,
    radius: [24, 42],
    life: [7.2, 9.4],
    speed: [6, 12],
    weight: 58,
  },
  {
    id: "amber",
    color: COLORS.orange,
    dim: COLORS.orangeDim,
    points: 160,
    radius: [22, 36],
    life: [5.8, 7.8],
    speed: [9, 15],
    weight: 28,
  },
  {
    id: "red",
    color: COLORS.orangeHot,
    dim: COLORS.redDim,
    points: 260,
    radius: [18, 30],
    life: [4.2, 6.4],
    speed: [12, 20],
    weight: 11,
  },
  {
    id: "core",
    color: COLORS.blue,
    dim: COLORS.tealDark,
    points: 420,
    radius: [32, 48],
    life: [4.8, 6.2],
    speed: [3, 8],
    weight: 3,
  },
];

export const GAME_RULES = {
  duration: 120,
  lives: 3,
  bubbleLimit: 18,
  bossBubblePenaltyLimit: 10,
  baseSpawnEvery: 0.92,
  minSpawnEvery: 0.32,
  comboWindow: 1,
  missPenalty: 1,
  dangerDrain: 1,
  shipSpeed: 10,
};
