import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppRuntimeHost } from "@/components/AppRuntimeHost";

const { usePlayback, useParameterBinding, usePhysics, useLipSync, useIK, useVMC } =
  vi.hoisted(() => ({
    usePlayback: vi.fn(),
    useParameterBinding: vi.fn(),
    usePhysics: vi.fn(),
    useLipSync: vi.fn(),
    useIK: vi.fn(),
    useVMC: vi.fn(),
  }));

vi.mock("@/hooks/usePlayback", () => ({ usePlayback }));
vi.mock("@/hooks/useParameterBinding", () => ({ useParameterBinding }));
vi.mock("@/hooks/usePhysics", () => ({ usePhysics }));
vi.mock("@/hooks/useLipSync", () => ({ useLipSync }));
vi.mock("@/hooks/useIK", () => ({ useIK }));
vi.mock("@/hooks/useVMC", () => ({ useVMC }));

describe("AppRuntimeHost", () => {
  it("mounts runtime hooks without rendering UI", () => {
    const { container } = render(<AppRuntimeHost />);

    expect(container).toBeEmptyDOMElement();
    expect(usePlayback).toHaveBeenCalledTimes(1);
    expect(useParameterBinding).toHaveBeenCalledTimes(1);
    expect(usePhysics).toHaveBeenCalledTimes(1);
    expect(useLipSync).toHaveBeenCalledTimes(1);
    expect(useIK).toHaveBeenCalledTimes(1);
    expect(useVMC).toHaveBeenCalledTimes(1);
  });
});
