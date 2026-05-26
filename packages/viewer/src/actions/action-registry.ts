import { type ViviAction, parseViviAction } from "./action-types";

export class ViviActionRegistry {
  private actions = new Map<string, ViviAction>();

  register(actionInput: unknown): ViviAction {
    const action = parseViviAction(actionInput);
    this.actions.set(action.id, action);
    return action;
  }

  unregister(id: string): boolean {
    return this.actions.delete(id);
  }

  get(id: string): ViviAction | null {
    return this.actions.get(id) ?? null;
  }

  list(): ViviAction[] {
    return [...this.actions.values()];
  }

  setEnabled(id: string, enabled: boolean): ViviAction | null {
    const action = this.actions.get(id);
    if (!action) return null;
    const updated = { ...action, enabled };
    this.actions.set(id, updated);
    return updated;
  }

  replaceAll(actions: unknown[]): ViviAction[] {
    const parsed = actions.map(parseViviAction);
    this.actions.clear();
    for (const action of parsed) {
      this.actions.set(action.id, action);
    }
    return parsed;
  }
}
