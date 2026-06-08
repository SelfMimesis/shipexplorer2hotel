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
  black: "#111314",
  void: "#181b1c",
  panel: "#15191a",
  panelDeep: "#0d1011",
  cyan: "#44e0c0",
  cyanDim: "#1f7d72",
  teal: "#1f7d72",
  tealDark: "#14524c",
  amber: "#ff7a16",
  amberDim: "#7f3c10",
  red: "#e75a4f",
  redDim: "#71302d",
  white: "#d7e3df",
  muted: "#7f9695",
  blue: "#3c8dff",
  violet: "#7354ff",
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
    color: COLORS.amber,
    dim: COLORS.amberDim,
    points: 160,
    radius: [22, 36],
    life: [5.8, 7.8],
    speed: [9, 15],
    weight: 28,
  },
  {
    id: "red",
    color: COLORS.red,
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
  duration: 60,
  lives: 4,
  bubbleLimit: 18,
  baseSpawnEvery: 0.92,
  minSpawnEvery: 0.32,
  comboWindow: 1,
  missPenalty: 1,
  dangerDrain: 1,
  shipSpeed: 10,
};
