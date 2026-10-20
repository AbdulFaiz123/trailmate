// Allowed values for the string "enum" columns in prisma/schema.prisma.

export const LEG_MODES = ["TRAIN", "FLIGHT", "BUS", "TAXI", "WALK", "FERRY", "OTHER"] as const;
export type LegMode = (typeof LEG_MODES)[number];

export const LEG_STATUSES = ["SCHEDULED", "DELAYED", "CANCELLED", "DEPARTED", "ARRIVED"] as const;
export type LegStatus = (typeof LEG_STATUSES)[number];

export const STAY_KINDS = ["HOTEL", "AIRBNB", "FAMILY", "OTHER"] as const;
export type StayKind = (typeof STAY_KINDS)[number];

export const TASK_LISTS = ["BUY", "PACK", "DO"] as const;
export type TaskList = (typeof TASK_LISTS)[number];

export const TASK_CATEGORIES = [
  "GIFTS", "ELECTRONICS", "CLOTHES", "DOCUMENTS", "TOILETRIES", "MEDICINE", "FOOD", "OTHER",
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_STATUSES = ["TO_BUY", "BOUGHT", "PACKED", "TODO", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export type ItemKind = "LEG" | "STAY" | "TASK";

export const DOCUMENT_KINDS = ["TICKET", "BOOKING", "VISA", "PASSPORT", "INSURANCE", "OTHER"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
