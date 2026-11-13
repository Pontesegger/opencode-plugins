export type Category = "prompt" | "rules" | "tools" | "skills" | "mcp";
export interface Entry { title: string; text: string; tokens: number }
export interface Section { id: Category; label: string; tokens: number; entries: Entry[] }
export interface Snapshot {
  sessionID: string;
  revision: string;
  capturedAt: number;
  model: string;
  warnings: string[];
  sections: Section[];
}
export type Summary = Omit<Snapshot, "sections"> & {
  sections: Array<Omit<Section, "entries"> & { count: number }>;
};
export interface Inspection {
  sessionID: string;
  section: Section;
  revision: string;
  capturedAt: number;
  model: string;
  warnings: string[];
}
