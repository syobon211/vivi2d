import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { ViewerPropTransformPatch } from "../actions/action-runner";
import type { ViewerApiGrantSummary } from "../api/viewer-api-client-types";
import type { Locale } from "../i18n";
import {
  SUPPORTED_PROP_MIME_TYPES,
  type ViviProp,
} from "../props/prop-types";
import { smallBtnStyle } from "../styles";

interface OverlaysPanelProps {
  locale: Locale;
  props: readonly ViviProp[];
  apiGrants?: readonly ViewerApiGrantSummary[];
  busy?: boolean;
  error?: string | null;
  onAddFile: (file: File) => void | Promise<void>;
  onCreateApiAsset?: (file: File, grantId: string) => Promise<unknown>;
  onListApiAssets?: (grantId: string) => Promise<unknown>;
  onExtendApiAsset?: (grantId: string, assetId: string) => Promise<unknown>;
  onRevokeApiAsset?: (grantId: string, assetId: string) => Promise<unknown>;
  onDuplicateProp: (propId: string) => void | Promise<void>;
  onRemoveProp: (propId: string) => void | Promise<void>;
  onPatchTransform: (
    propId: string,
    patch: ViewerPropTransformPatch,
  ) => void | Promise<void>;
  onSetVisible: (propId: string, visible: boolean) => void | Promise<void>;
  onUpdateProp: (prop: ViviProp) => void | Promise<void>;
  onCycleGroup: (
    groupId: string,
    direction: "next" | "previous",
  ) => void | Promise<void>;
  onSpawnBurst: (propIds: string[]) => void | Promise<void>;
}

type OverlayCopy = {
  title: string;
  subtitle: string;
  add: string;
  empty: string;
  apiShareTitle: string;
  apiShareHelp: string;
  apiTarget: string;
  apiShare: string;
  apiNoGrant: string;
  apiPending: string;
  apiExtend: string;
  apiRevoke: string;
  apiCopyHint: string;
  expiresIn: string;
  seconds: string;
  show: string;
  hide: string;
  duplicate: string;
  remove: string;
  reset: string;
  burst: string;
  previous: string;
  next: string;
  group: string;
  anchor: string;
  screen: string;
  modelRoot: string;
  transform: string;
  x: string;
  y: string;
  scale: string;
  rotation: string;
  opacity: string;
  visible: string;
  hidden: string;
  noGroup: string;
  error: string;
};

const copy: Record<Locale, OverlayCopy> = {
  en: {
    title: "Overlays",
    subtitle: "Manage stream props separately from model data.",
    add: "Add image",
    empty: "No overlays yet. You can add PNG, JPEG, WebP, or GIF files.",
    apiShareTitle: "Share with API client",
    apiShareHelp:
      "Issue a short-lived, one-time handle for a user-selected static image. Local paths are never shared.",
    apiTarget: "Target client",
    apiShare: "Issue API asset handle",
    apiNoGrant: "No approved client has write:props access.",
    apiPending: "Pending handles",
    apiExtend: "Extend",
    apiRevoke: "Revoke",
    apiCopyHint: "Pass assetId plus MIME / bytes to the client.",
    expiresIn: "Expires in",
    seconds: "s",
    show: "Show",
    hide: "Hide",
    duplicate: "Duplicate",
    remove: "Remove",
    reset: "Reset transform",
    burst: "Show group",
    previous: "Previous",
    next: "Next",
    group: "Group",
    anchor: "Anchor",
    screen: "Screen",
    modelRoot: "Model center",
    transform: "Transform",
    x: "X position",
    y: "Y position",
    scale: "Scale",
    rotation: "Rotation",
    opacity: "Opacity",
    visible: "Visible",
    hidden: "Hidden",
    noGroup: "No group",
    error: "Error",
  },
  ja: {
    title: "オーバーレイ",
    subtitle: "配信用の小物や画像を、モデル本体とは分けて安全に管理します。",
    add: "画像を追加",
    empty: "まだオーバーレイはありません。PNG / JPEG / WebP / GIFを追加できます。",
    apiShareTitle: "APIクライアントへ共有",
    apiShareHelp:
      "ユーザーが選んだ静止画像だけを、短時間・一回限りのハンドルとして発行します。ローカルパスは共有されません。",
    apiTarget: "共有先",
    apiShare: "API用ハンドルを発行",
    apiNoGrant: "write:propsを許可したクライアントがありません。",
    apiPending: "発行済みハンドル",
    apiExtend: "延長",
    apiRevoke: "取り消し",
    apiCopyHint: "クライアントにはassetIdとMIME / bytesを渡してください。",
    expiresIn: "残り",
    seconds: "秒",
    show: "表示",
    hide: "非表示",
    duplicate: "複製",
    remove: "削除",
    reset: "位置をリセット",
    burst: "まとめて表示",
    previous: "前へ",
    next: "次へ",
    group: "グループ",
    anchor: "アンカー",
    screen: "画面",
    modelRoot: "モデル中心",
    transform: "位置と見た目",
    x: "X位置",
    y: "Y位置",
    scale: "大きさ",
    rotation: "回転",
    opacity: "透明度",
    visible: "表示中",
    hidden: "非表示",
    noGroup: "グループなし",
    error: "エラー",
  },
  "zh-Hans": {
    title: "叠加项目",
    subtitle: "将直播用道具和图片与模型数据分开管理。",
    add: "添加图片",
    empty: "还没有叠加项目。可以添加 PNG、JPEG、WebP 或 GIF 文件。",
    apiShareTitle: "共享给 API 客户端",
    apiShareHelp:
      "为用户选择的静态图片签发短期、一次性的句柄。不会共享本地路径。",
    apiTarget: "目标客户端",
    apiShare: "签发 API 资源句柄",
    apiNoGrant: "没有已获 write:props 权限的客户端。",
    apiPending: "待处理句柄",
    apiExtend: "延长",
    apiRevoke: "撤销",
    apiCopyHint: "请将 assetId 以及 MIME / bytes 传给客户端。",
    expiresIn: "剩余",
    seconds: "秒",
    show: "显示",
    hide: "隐藏",
    duplicate: "复制",
    remove: "删除",
    reset: "重置变换",
    burst: "显示分组",
    previous: "上一个",
    next: "下一个",
    group: "分组",
    anchor: "锚点",
    screen: "屏幕",
    modelRoot: "模型中心",
    transform: "变换",
    x: "X位置",
    y: "Y位置",
    scale: "缩放",
    rotation: "旋转",
    opacity: "不透明度",
    visible: "显示中",
    hidden: "已隐藏",
    noGroup: "无分组",
    error: "错误",
  },
  "ko-KR": {
    title: "오버레이",
    subtitle: "방송용 소품과 이미지를 모델 데이터와 분리해 관리합니다.",
    add: "이미지 추가",
    empty: "아직 오버레이가 없습니다. PNG, JPEG, WebP, GIF 파일을 추가할 수 있습니다.",
    apiShareTitle: "API 클라이언트와 공유",
    apiShareHelp:
      "사용자가 선택한 정적 이미지만 짧은 시간 동안 한 번 쓰는 핸들로 발급합니다. 로컬 경로는 공유하지 않습니다.",
    apiTarget: "대상 클라이언트",
    apiShare: "API 자산 핸들 발급",
    apiNoGrant: "write:props 권한을 승인한 클라이언트가 없습니다.",
    apiPending: "대기 중인 핸들",
    apiExtend: "연장",
    apiRevoke: "철회",
    apiCopyHint: "클라이언트에는 assetId와 MIME / bytes를 전달하세요.",
    expiresIn: "남은 시간",
    seconds: "초",
    show: "표시",
    hide: "숨기기",
    duplicate: "복제",
    remove: "삭제",
    reset: "변환 초기화",
    burst: "그룹 표시",
    previous: "이전",
    next: "다음",
    group: "그룹",
    anchor: "앵커",
    screen: "화면",
    modelRoot: "모델 중심",
    transform: "변환",
    x: "X 위치",
    y: "Y 위치",
    scale: "크기",
    rotation: "회전",
    opacity: "불투명도",
    visible: "표시 중",
    hidden: "숨김",
    noGroup: "그룹 없음",
    error: "오류",
  },
};

type AnchorKind = "screen" | "modelRoot";

interface ViewerApiPropAssetSummary {
  assetId: string;
  grantId: string;
  appName: string;
  label: string | null;
  mimeType: string;
  bytes: number;
  secondsRemaining: number;
  extended: boolean;
}

export function OverlaysPanel({
  locale,
  props,
  apiGrants = [],
  busy = false,
  error = null,
  onAddFile,
  onCreateApiAsset,
  onListApiAssets,
  onExtendApiAsset,
  onRevokeApiAsset,
  onDuplicateProp,
  onRemoveProp,
  onPatchTransform,
  onSetVisible,
  onUpdateProp,
  onCycleGroup,
  onSpawnBurst,
}: OverlaysPanelProps) {
  const c = copy[locale];
  const groupedProps = props.filter((prop) => prop.groupId);
  const writePropGrants = useMemo(
    () => apiGrants.filter((grant) => grant.scopes.includes("write:props")),
    [apiGrants],
  );
  const [selectedGrantId, setSelectedGrantId] = useState("");
  const [apiAssets, setApiAssets] = useState<ViewerApiPropAssetSummary[]>([]);
  const [apiAssetError, setApiAssetError] = useState<string | null>(null);
  const [apiAssetBusy, setApiAssetBusy] = useState(false);
  const apiAssetRefreshSeqRef = useRef(0);
  const firstWriteGrantId = writePropGrants[0]?.id ?? "";
  const canShareApiAsset =
    Boolean(onCreateApiAsset) &&
    writePropGrants.length > 0 &&
    selectedGrantId &&
    !apiAssetBusy;

  useEffect(() => {
    if (!selectedGrantId && firstWriteGrantId) {
      setSelectedGrantId(firstWriteGrantId);
    }
  }, [firstWriteGrantId, selectedGrantId]);

  useEffect(() => {
    let cancelled = false;
    const refreshSeq = ++apiAssetRefreshSeqRef.current;
    async function refresh() {
      if (!selectedGrantId || !onListApiAssets) {
        setApiAssets([]);
        return;
      }
      const listed = await onListApiAssets(selectedGrantId);
      if (!cancelled && refreshSeq === apiAssetRefreshSeqRef.current) {
        setApiAssets(parseAssetSummaries(listed));
      }
    }
    void refresh().catch((err) => {
      if (!cancelled) setApiAssetError(describeApiAssetError(err));
    });
    return () => {
      cancelled = true;
    };
  }, [onListApiAssets, selectedGrantId]);

  async function refreshApiAssets(grantId = selectedGrantId) {
    if (!grantId || !onListApiAssets) return;
    const refreshSeq = ++apiAssetRefreshSeqRef.current;
    try {
      const listed = await onListApiAssets(grantId);
      if (refreshSeq === apiAssetRefreshSeqRef.current) {
        setApiAssets(parseAssetSummaries(listed));
      }
    } catch (err) {
      if (refreshSeq === apiAssetRefreshSeqRef.current) {
        setApiAssetError(describeApiAssetError(err));
      }
    }
  }

  return (
    <section
      data-testid="overlays-panel"
      style={{
        display: "grid",
        gap: "12px",
        padding: "12px",
        borderBottom: "1px solid var(--border)",
        background: "var(--bg-surface)",
      }}
    >
      <header style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <div style={{ display: "grid", gap: "3px", minWidth: 0 }}>
          <strong style={{ fontSize: "var(--text-lg)" }}>{c.title}</strong>
          <span style={{ fontSize: "var(--text-sm)", opacity: 0.75 }}>
            {c.subtitle}
          </span>
        </div>
        <label style={{ ...smallBtnStyle(), marginLeft: "auto" }}>
          {c.add}
          <input
            aria-label={c.add}
            type="file"
            accept={SUPPORTED_PROP_MIME_TYPES.join(",")}
            disabled={busy}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";
              if (file) void onAddFile(file);
            }}
            style={{ display: "none" }}
          />
        </label>
      </header>

      <section style={apiShareStyle}>
        <div style={{ display: "grid", gap: "3px" }}>
          <strong>{c.apiShareTitle}</strong>
          <span style={{ fontSize: "var(--text-sm)", opacity: 0.75 }}>
            {c.apiShareHelp}
          </span>
        </div>
        {writePropGrants.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.7 }}>{c.apiNoGrant}</p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            <label style={fieldStyle}>
              <span>{c.apiTarget}</span>
              <select
                value={selectedGrantId}
                onChange={(event) => setSelectedGrantId(event.currentTarget.value)}
                style={inputStyle}
              >
                {writePropGrants.map((grant) => (
                  <option key={grant.id} value={grant.id}>
                    {grant.appName} ({grant.originBinding})
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                ...smallBtnStyle(Boolean(canShareApiAsset)),
                justifySelf: "start",
              }}
            >
              {c.apiShare}
              <input
                aria-label={c.apiShare}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy || !canShareApiAsset}
                onChange={async (event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (!file || !selectedGrantId || !onCreateApiAsset) return;
                  setApiAssetError(null);
                  setApiAssetBusy(true);
                  try {
                    const result = await onCreateApiAsset(file, selectedGrantId);
                    const parsed = parseAssetResult(result);
                    if ("message" in parsed) {
                      setApiAssetError(parsed.message);
                      return;
                    }
                    await refreshApiAssets(parsed.asset.grantId);
                  } finally {
                    setApiAssetBusy(false);
                  }
                }}
                style={{ display: "none" }}
              />
            </label>
          </div>
        )}

        {apiAssets.length > 0 && (
          <div style={{ display: "grid", gap: "6px" }}>
            <strong>{c.apiPending}</strong>
            {apiAssets.map((asset) => (
              <article
                key={asset.assetId}
                data-testid="viewer-api-prop-asset-row"
                style={assetRowStyle}
              >
                <code
                  data-testid="viewer-api-prop-asset-id"
                  style={{ overflowWrap: "anywhere" }}
                >
                  {asset.assetId}
                </code>
                <span style={{ fontSize: "var(--text-xs)", opacity: 0.7 }}>
                  {asset.mimeType} / {asset.bytes} bytes / {c.expiresIn}{" "}
                  {asset.secondsRemaining}
                  {c.seconds}
                </span>
                <span style={{ fontSize: "var(--text-xs)", opacity: 0.7 }}>
                  {c.apiCopyHint}
                </span>
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={
                      busy || apiAssetBusy || asset.extended || !onExtendApiAsset
                    }
                    onClick={async () => {
                      setApiAssetError(null);
                      setApiAssetBusy(true);
                      try {
                        const result = await onExtendApiAsset?.(
                          asset.grantId,
                          asset.assetId,
                        );
                        const parsed = parseAssetResult(result);
                        if ("message" in parsed) {
                          setApiAssetError(parsed.message);
                          return;
                        }
                        await refreshApiAssets(asset.grantId);
                      } finally {
                        setApiAssetBusy(false);
                      }
                    }}
                    style={smallBtnStyle()}
                  >
                    {c.apiExtend}
                  </button>
                  <button
                    type="button"
                    disabled={busy || apiAssetBusy || !onRevokeApiAsset}
                    onClick={async () => {
                      setApiAssetError(null);
                      setApiAssetBusy(true);
                      try {
                        await onRevokeApiAsset?.(asset.grantId, asset.assetId);
                        await refreshApiAssets(asset.grantId);
                      } finally {
                        setApiAssetBusy(false);
                      }
                    }}
                    style={smallBtnStyle()}
                  >
                    {c.apiRevoke}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {apiAssetError && (
          <p role="alert" style={{ margin: 0, color: "var(--danger-strong)" }}>
            {c.error}: {apiAssetError}
          </p>
        )}
      </section>

      {props.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.7 }}>{c.empty}</p>
      ) : (
        <div style={{ display: "grid", gap: "10px" }}>
          {props.map((prop) => (
            <PropEditor
              key={prop.id}
              copy={c}
              prop={prop}
              busy={busy}
              onDuplicateProp={onDuplicateProp}
              onRemoveProp={onRemoveProp}
              onPatchTransform={onPatchTransform}
              onSetVisible={onSetVisible}
              onUpdateProp={onUpdateProp}
              onCycleGroup={onCycleGroup}
            />
          ))}
        </div>
      )}

      {groupedProps.length > 0 && (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSpawnBurst(groupedProps.map((prop) => prop.id))}
            style={smallBtnStyle()}
          >
            {c.burst}
          </button>
        </div>
      )}

      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--danger-strong)" }}>
          {c.error}: {error}
        </p>
      )}
    </section>
  );
}

function PropEditor({
  copy: c,
  prop,
  busy,
  onDuplicateProp,
  onRemoveProp,
  onPatchTransform,
  onSetVisible,
  onUpdateProp,
  onCycleGroup,
}: {
  copy: (typeof copy)[Locale];
  prop: ViviProp;
  busy: boolean;
  onDuplicateProp: OverlaysPanelProps["onDuplicateProp"];
  onRemoveProp: OverlaysPanelProps["onRemoveProp"];
  onPatchTransform: OverlaysPanelProps["onPatchTransform"];
  onSetVisible: OverlaysPanelProps["onSetVisible"];
  onUpdateProp: OverlaysPanelProps["onUpdateProp"];
  onCycleGroup: OverlaysPanelProps["onCycleGroup"];
}) {
  const anchorKind = normalizeAnchorKind(prop.anchor?.target.kind);
  const groupLabel = prop.groupId || c.noGroup;

  return (
    <article style={cardStyle}>
      <header style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <div style={{ minWidth: 0 }}>
          <strong>{prop.name}</strong>
          <div style={{ fontSize: "var(--text-xs)", opacity: 0.7 }}>
            {prop.visible ? c.visible : c.hidden} / {groupLabel}
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSetVisible(prop.id, !prop.visible)}
          style={{ ...smallBtnStyle(prop.visible), marginLeft: "auto" }}
        >
          {prop.visible ? c.hide : c.show}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onDuplicateProp(prop.id)}
          style={smallBtnStyle()}
        >
          {c.duplicate}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onRemoveProp(prop.id)}
          style={smallBtnStyle()}
        >
          {c.remove}
        </button>
      </header>

      <div style={fieldGridStyle}>
        <label style={fieldStyle}>
          <span>{c.group}</span>
          <input
            aria-label={`${c.group} ${prop.name}`}
            value={prop.groupId ?? ""}
            maxLength={64}
            onChange={(event) => {
              const groupId = event.currentTarget.value.trim() || undefined;
              void onUpdateProp({ ...prop, groupId });
            }}
            style={inputStyle}
          />
        </label>
        <label style={fieldStyle}>
          <span>{c.anchor}</span>
          <select
            aria-label={`${c.anchor} ${prop.name}`}
            value={anchorKind}
            onChange={(event) => {
              void onUpdateProp({
                ...prop,
                anchor: makeAnchor(prop, event.currentTarget.value as AnchorKind),
              });
            }}
            style={inputStyle}
          >
            <option value="screen">{c.screen}</option>
            <option value="modelRoot">{c.modelRoot}</option>
          </select>
        </label>
      </div>

      <fieldset style={fieldsetStyle}>
        <legend style={{ padding: "0 4px", opacity: 0.75 }}>{c.transform}</legend>
        <div style={fieldGridStyle}>
          <NumberField
            label={`${c.x} ${prop.name}`}
            displayLabel={c.x}
            value={prop.transform.x}
            onChange={(value) => onPatchTransform(prop.id, { x: value })}
          />
          <NumberField
            label={`${c.y} ${prop.name}`}
            displayLabel={c.y}
            value={prop.transform.y}
            onChange={(value) => onPatchTransform(prop.id, { y: value })}
          />
          <NumberField
            label={`${c.scale} ${prop.name}`}
            displayLabel={c.scale}
            value={prop.transform.scaleX}
            step={0.05}
            min={0.01}
            onChange={(value) =>
              onPatchTransform(prop.id, { scaleX: value, scaleY: value })
            }
          />
          <NumberField
            label={`${c.rotation} ${prop.name}`}
            displayLabel={c.rotation}
            value={prop.transform.rotation}
            onChange={(value) => onPatchTransform(prop.id, { rotation: value })}
          />
          <NumberField
            label={`${c.opacity} ${prop.name}`}
            displayLabel={c.opacity}
            value={prop.opacity}
            step={0.05}
            min={0}
            max={1}
            onChange={(value) => onPatchTransform(prop.id, { opacity: value })}
          />
        </div>
      </fieldset>

      <footer style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void onPatchTransform(prop.id, {
              x: 0,
              y: 0,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              opacity: 1,
            })
          }
          style={smallBtnStyle()}
        >
          {c.reset}
        </button>
        {prop.groupId && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCycleGroup(prop.groupId!, "previous")}
              style={smallBtnStyle()}
            >
              {c.previous}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onCycleGroup(prop.groupId!, "next")}
              style={smallBtnStyle()}
            >
              {c.next}
            </button>
          </>
        )}
      </footer>
    </article>
  );
}

function NumberField({
  label,
  displayLabel,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  displayLabel: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void | Promise<void>;
}) {
  return (
    <label style={fieldStyle}>
      <span>{displayLabel}</span>
      <input
        aria-label={label}
        type="number"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        onChange={(event) => {
          const next = Number(event.currentTarget.value);
          if (Number.isFinite(next)) void onChange(next);
        }}
        style={inputStyle}
      />
    </label>
  );
}

function parseAssetSummaries(value: unknown): ViewerApiPropAssetSummary[] {
  return Array.isArray(value)
    ? value.map(parseAssetSummary).filter(isAssetSummary)
    : [];
}

function isAssetSummary(
  value: ViewerApiPropAssetSummary | null,
): value is ViewerApiPropAssetSummary {
  return value !== null;
}

function parseAssetSummary(value: unknown): ViewerApiPropAssetSummary | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.assetId !== "string" ||
    typeof value.grantId !== "string" ||
    typeof value.mimeType !== "string" ||
    typeof value.bytes !== "number"
  ) {
    return null;
  }
  return {
    assetId: value.assetId,
    grantId: value.grantId,
    appName: typeof value.appName === "string" ? value.appName : "Unknown client",
    label: typeof value.label === "string" ? value.label : null,
    mimeType: value.mimeType,
    bytes: value.bytes,
    secondsRemaining:
      typeof value.secondsRemaining === "number"
        ? Math.max(0, Math.floor(value.secondsRemaining))
        : 0,
    extended: value.extended === true,
  };
}

function parseAssetResult(
  value: unknown,
): { ok: true; asset: ViewerApiPropAssetSummary } | { ok: false; message: string } {
  if (!isRecord(value)) return { ok: false, message: "request failed" };
  if (value.ok === true) {
    const asset = parseAssetSummary(value.asset);
    return asset ? { ok: true, asset } : { ok: false, message: "invalid asset response" };
  }
  return { ok: false, message: describeApiAssetError(value.error) };
}

function describeApiAssetError(value: unknown): string {
  if (!isRecord(value)) {
    return value instanceof Error ? value.message : String(value ?? "request failed");
  }
  const code = typeof value.code === "string" ? value.code : "request_failed";
  const message = typeof value.message === "string" ? value.message : code;
  return `${message} (${code})`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeAnchorKind(kind: string | undefined): AnchorKind {
  return kind === "modelRoot" ? "modelRoot" : "screen";
}

function makeAnchor(prop: ViviProp, kind: AnchorKind): ViviProp["anchor"] {
  const previous = prop.anchor;
  return {
    target: { kind },
    offsetX: previous?.offsetX ?? 0,
    offsetY: previous?.offsetY ?? 0,
    rotationWeight: previous?.rotationWeight ?? 0,
    scaleWeight: previous?.scaleWeight ?? 0,
  };
}

const apiShareStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  padding: "10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--bg-hover) 88%, transparent), var(--bg-surface))",
};

const assetRowStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  padding: "8px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-surface)",
};

const cardStyle: CSSProperties = {
  display: "grid",
  gap: "10px",
  padding: "10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background:
    "linear-gradient(135deg, color-mix(in srgb, var(--bg-hover) 88%, transparent), var(--bg-surface))",
};

const fieldGridStyle: CSSProperties = {
  display: "grid",
  gap: "8px",
  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: "4px",
  fontSize: "var(--text-sm)",
};

const inputStyle: CSSProperties = {
  minWidth: 0,
  padding: "5px 7px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-sm)",
  background: "var(--bg-hover)",
  color: "var(--text-primary)",
};

const fieldsetStyle: CSSProperties = {
  margin: 0,
  padding: "8px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
};
