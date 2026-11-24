"use client";
import { createContext, useContext } from "react";
export type ProjectInfo = { id: string; code: string; name: string; status: "ACTIVE" | "INACTIVE"; clientId: string; client: { id: string; name: string } } & Record<string, unknown>;
export const ProjectCtx = createContext<{ project: ProjectInfo; reload: () => void } | null>(null);
export const useProject = () => useContext(ProjectCtx)!;
