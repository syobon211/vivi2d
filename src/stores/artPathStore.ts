import type { ArtPathControlPoint, ArtPathStyle, LayerId } from "@vivi2d/core/types";
import {
  addArtPath as addArtPathCommand,
  addControlPoint as addControlPointCommand,
  removeArtPath as removeArtPathCommand,
  removeControlPoint as removeControlPointCommand,
  setArtPathClosed as setArtPathClosedCommand,
  setArtPathStyle as setArtPathStyleCommand,
  updateControlPoint as updateControlPointCommand,
} from "@vivi2d/editor-core/art-path-command";
import { create } from "zustand";
import { withStandardMiddleware } from "./_middleware";
import { mutateProject } from "./projectMutator";

interface ArtPathActions {
  addArtPath: (name: string, x: number, y: number) => string;

  removeArtPath: (artPathId: LayerId) => void;

  addControlPoint: (
    artPathId: LayerId,
    point: ArtPathControlPoint,
    index?: number,
  ) => void;

  updateControlPoint: (
    artPathId: LayerId,
    index: number,
    point: Partial<ArtPathControlPoint>,
  ) => void;

  removeControlPoint: (artPathId: LayerId, index: number) => void;

  setStyle: (artPathId: LayerId, style: Partial<ArtPathStyle>) => void;

  setClosed: (artPathId: LayerId, closed: boolean) => void;
}

export const useArtPathStore = create<ArtPathActions>()(
  withStandardMiddleware<ArtPathActions>(
    () => ({
      addArtPath: (name, x, y) => {
        const id = crypto.randomUUID();
        mutateProject((project) => {
          addArtPathCommand(project, name, x, y, () => id);
        });
        return id;
      },

      removeArtPath: (artPathId) =>
        mutateProject((project) => {
          removeArtPathCommand(project, artPathId);
        }),

      addControlPoint: (artPathId, point, index) =>
        mutateProject((project) => {
          addControlPointCommand(project, artPathId, point, index);
        }),

      updateControlPoint: (artPathId, index, point) =>
        mutateProject((project) => {
          updateControlPointCommand(project, artPathId, index, point);
        }),

      removeControlPoint: (artPathId, index) =>
        mutateProject((project) => {
          removeControlPointCommand(project, artPathId, index);
        }),

      setStyle: (artPathId, style) =>
        mutateProject((project) => {
          setArtPathStyleCommand(project, artPathId, style);
        }),

      setClosed: (artPathId, closed) =>
        mutateProject((project) => {
          setArtPathClosedCommand(project, artPathId, closed);
        }),
    }),
    { name: "ArtPathStore", persistEnabled: false },
  ),
);
