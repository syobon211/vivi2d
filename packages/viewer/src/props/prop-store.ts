import {
  MAX_ACTIVE_PROPS,
  MAX_PROP_BURST,
  type ViviProp,
  type ViviPropTransform,
  parseViviProp,
} from "./prop-types";

export class ViviPropStore {
  private props = new Map<string, ViviProp>();
  private objectUrlRefs = new Map<string, number>();

  list(): ViviProp[] {
    return [...this.props.values()].sort((a, b) => a.drawOrder - b.drawOrder);
  }

  get(id: string): ViviProp | null {
    return this.props.get(id) ?? null;
  }

  add(input: unknown): ViviProp {
    const prop = parseViviProp(input);
    if (this.props.has(prop.id)) {
      throw new Error("Prop already exists");
    }
    if (this.props.size >= MAX_ACTIVE_PROPS) {
      throw new Error("Prop limit reached");
    }
    this.props.set(prop.id, prop);
    this.retainObjectUrl(prop);
    return prop;
  }

  update(input: unknown): ViviProp {
    const prop = parseViviProp(input);
    const existing = this.props.get(prop.id);
    if (!existing) {
      throw new Error("Prop not found");
    }
    const keepsSameObjectUrl =
      existing?.source.kind === "objectUrl" &&
      prop.source.kind === "objectUrl" &&
      existing.source.url === prop.source.url;
    if (!keepsSameObjectUrl) {
      this.releaseObjectUrl(existing);
    }
    this.props.set(prop.id, prop);
    if (!keepsSameObjectUrl) {
      this.retainObjectUrl(prop);
    }
    return prop;
  }

  remove(id: string): boolean {
    const prop = this.props.get(id);
    if (!prop) return false;
    this.releaseObjectUrl(prop);
    return this.props.delete(id);
  }

  clear(): void {
    for (const prop of this.props.values()) {
      this.releaseObjectUrl(prop);
    }
    this.props.clear();
  }

  setVisible(id: string, visible: boolean): ViviProp | null {
    const prop = this.props.get(id);
    if (!prop) return null;
    const updated = { ...prop, visible };
    this.props.set(id, updated);
    return updated;
  }

  patchTransform(id: string, patch: Partial<ViviPropTransform> & { opacity?: number }): ViviProp | null {
    const prop = this.props.get(id);
    if (!prop) return null;
    const { opacity, ...transformPatch } = patch;
    const updated = parseViviProp({
      ...prop,
      opacity: opacity ?? prop.opacity,
      transform: {
        ...prop.transform,
        ...transformPatch,
      },
    });
    this.props.set(id, updated);
    return updated;
  }

  cycleGroup(groupId: string, direction: "next" | "previous" = "next"): ViviProp[] {
    const group = this.list().filter((prop) => prop.groupId === groupId);
    if (group.length === 0) return [];
    const visibleIndex = group.findIndex((prop) => prop.visible);
    const nextIndex =
      visibleIndex < 0
        ? direction === "next"
          ? 0
          : group.length - 1
        : direction === "next"
          ? (visibleIndex + 1) % group.length
          : (visibleIndex - 1 + group.length) % group.length;
    for (const [index, prop] of group.entries()) {
      this.props.set(prop.id, { ...prop, visible: index === nextIndex });
    }
    return this.list();
  }

  spawnBurst(propIds: string[]): ViviProp[] {
    if (propIds.length > MAX_PROP_BURST) {
      throw new Error("Prop burst limit exceeded");
    }
    for (const id of propIds) {
      const prop = this.props.get(id);
      if (prop) this.props.set(id, { ...prop, visible: true, temporary: true });
    }
    return this.list();
  }

  private retainObjectUrl(prop: ViviProp): void {
    if (prop.source.kind !== "objectUrl") return;
    const count = this.objectUrlRefs.get(prop.source.url) ?? 0;
    this.objectUrlRefs.set(prop.source.url, count + 1);
  }

  private releaseObjectUrl(prop: ViviProp): void {
    if (prop.source.kind !== "objectUrl") return;
    const count = this.objectUrlRefs.get(prop.source.url) ?? 0;
    if (count > 1) {
      this.objectUrlRefs.set(prop.source.url, count - 1);
      return;
    }
    this.objectUrlRefs.delete(prop.source.url);
    URL.revokeObjectURL(prop.source.url);
  }
}
