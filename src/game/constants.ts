/** Logical world size. Everything in the simulation uses these units; the camera scales to the screen. */
export const WORLD_W = 1600;
export const WORLD_H = 900;
/** Lowest possible terrain surface (thin indestructible bedrock line). */
export const BEDROCK_Y = WORLD_H - 10;
/** Highest possible terrain surface. */
export const TERRAIN_MIN_Y = 90;

export const SIM_DT = 1 / 120;
export const GRAVITY = 800;
/** Projectile launch speed at 100 % power. */
export const MAX_SPEED = 1400;
export const MIN_POWER = 5;
export const MAX_POWER = 100;
export const MIN_ANGLE = 0;
export const MAX_ANGLE = 180;

/** Aim adjustment speeds (hold to accelerate – same feel as the original game). */
export const ANGLE_SPEED_START = 16; // deg/s
export const ANGLE_SPEED_MAX = 100;
export const POWER_SPEED_START = 10; // %/s
export const POWER_SPEED_MAX = 60;
export const ADJUST_ACCEL_TIME = 0.9;

export const TANK_W = 50;
export const TANK_H = 20;
export const TANK_HIT_R = 21;
export const BARREL_LEN = 30;
export const DRIVE_SPEED = 60; // units/s
export const MAX_CLIMB_SLOPE = 1.25; // dy/dx a tank can climb
export const FALL_SAFE = 36; // units of free fall without damage
export const FALL_DMG_PER_UNIT = 0.3;
export const FALL_DMG_MAX = 35;

export const WIND_WEAK = 55; // max horizontal accel for "weak" wind
export const WIND_STRONG = 140;
/** Wind value shown to players is accel / WIND_UNIT (rounded). */
export const WIND_UNIT = 14;

export const PROJECTILE_R = 4.5;
export const TRAIL_LEN = 26;

export const MAX_TANKS = 8;
