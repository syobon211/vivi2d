export function windowsPath(drive: string, ...parts: string[]): string {
  return [drive, ...parts].join("\\");
}

export function posixPath(...parts: string[]): string {
  return `/${parts.join("/")}`;
}

export function fileUrlFromPosix(...parts: string[]): string {
  return `file://${posixPath(...parts)}`;
}

export function fileUrlFromWindows(drive: string, ...parts: string[]): string {
  return `file:///${[drive, ...parts].join("/")}`;
}

export const TEST_AUDIO_PATH = windowsPath("C:", "audio", "voice.wav");
export const TEST_AUDIO_BROKEN_PATH = windowsPath("C:", "audio", "broken.wav");
export const TEST_AUDIO_DUPLICATE_PATH = windowsPath("C:", "audio", "duplicate.wav");
export const TEST_AUDIO_ALT_PATH = windowsPath("D:", "alt", "voice.wav");
export const TEST_SPEECH_ALT_PATH = windowsPath("D:", "alt", "speech.wav");

export const TEST_AUDIO_FILE_URL = fileUrlFromWindows("C:", "audio", "voice.wav");
export const TEST_TMP_INDEX_FILE_URL = fileUrlFromPosix("tmp", "index.html");

export const TEST_FORBIDDEN_POSIX_PATH = posixPath("etc", "passwd");
export const TEST_FORBIDDEN_FILE_URL = fileUrlFromPosix("etc", "passwd");
export const TEST_FORBIDDEN_PROMPT_ID = ["..", "..", "etc", "passwd"].join("/");
export const TEST_FORBIDDEN_RELATIVE_PATH = ["..", "etc", "passwd"].join("/");
export const TEST_FORBIDDEN_RELATIVE_DEEP_PATH = ["..", "..", "etc", "passwd"].join("/");

export const TEST_WINDOWS_SYSTEM_PATH = ["C:", "Windows", "system32"].join("/");
export const TEST_TMP_DIR = windowsPath("C:", "tmp");
export const TEST_TMP_PARTS_DIR = windowsPath(TEST_TMP_DIR, "parts");
export const TEST_ASSETS_DIR = windowsPath("C:", "assets");
export const TEST_PROJECTS_DIR = windowsPath("C:", "projects");
export const TEST_WINDOWS_TEST_DIR = windowsPath("C:", "test");

export const TEST_TMP_OK_PNG_PATH = windowsPath(TEST_TMP_DIR, "ok.png");
export const TEST_TMP_HUGE_VIVI_PATH = windowsPath(TEST_TMP_DIR, "huge.vivi");
export const TEST_TMP_HUGE_PSD_PATH = windowsPath(TEST_TMP_DIR, "huge.psd");
export const TEST_TMP_HUGE_PNG_PATH = windowsPath(TEST_TMP_DIR, "huge.png");
export const TEST_TMP_HUGE_WAV_PATH = windowsPath(TEST_TMP_DIR, "huge.wav");
export const TEST_TMP_AUDIO_PATH = windowsPath(TEST_TMP_DIR, "voice.wav");
export const TEST_TMP_HERO_PNG_PATH = windowsPath(TEST_TMP_DIR, "hero.png");
export const TEST_TMP_PARTS_ARM_PNG_PATH = windowsPath(TEST_TMP_PARTS_DIR, "arm.png");
export const TEST_TMP_PARTS_A_PNG_PATH = windowsPath(TEST_TMP_PARTS_DIR, "a.png");
export const TEST_TMP_PARTS_B_PNG_PATH = windowsPath(TEST_TMP_PARTS_DIR, "b.png");

export const TEST_ASSET_FACE_PNG_PATH = windowsPath(TEST_ASSETS_DIR, "face.png");
export const TEST_ASSET_FRONT_PNG_PATH = windowsPath(TEST_ASSETS_DIR, "front.png");
export const TEST_ASSET_BACK_PNG_PATH = windowsPath(TEST_ASSETS_DIR, "back.png");
export const TEST_ASSET_BODY_PNG_PATH = windowsPath(TEST_ASSETS_DIR, "body.png");
export const TEST_ASSET_HAIR_PNG_PATH = windowsPath(TEST_ASSETS_DIR, "hair.png");
export const TEST_ASSET_TRIMMED_PNG_PATH = windowsPath(TEST_ASSETS_DIR, "trimmed.png");

export const TEST_EXISTING_VIVI_PATH = windowsPath("C:", "existing.vivi");
export const TEST_ROLLBACK_VIVI_PATH = windowsPath("C:", "rollback.vivi");
export const TEST_BASE_VIVI_PATH = windowsPath("C:", "base.vivi");
export const TEST_MANUAL_PNG_VIVI_PATH = windowsPath(
  TEST_PROJECTS_DIR,
  "manual-png.vivi",
);
export const TEST_MODEL_VIVI_PATH = windowsPath(TEST_WINDOWS_TEST_DIR, "model.vivi");
export const TEST_SAVED_VIVI_PATH = windowsPath(TEST_WINDOWS_TEST_DIR, "saved.vivi");
export const TEST_EXISTING_TEST_VIVI_PATH = windowsPath(
  TEST_WINDOWS_TEST_DIR,
  "existing.vivi",
);
export const TEST_NEW_TEST_VIVI_PATH = windowsPath(TEST_WINDOWS_TEST_DIR, "new.vivi");
export const TEST_LOADED_VIVI_PATH = windowsPath(TEST_WINDOWS_TEST_DIR, "loaded.vivi");
export const TEST_GENERIC_TEST_VIVI_PATH = windowsPath(
  TEST_WINDOWS_TEST_DIR,
  "test.vivi",
);
export const TEST_BAD_VIVI_PATH = windowsPath(TEST_WINDOWS_TEST_DIR, "bad.vivi");
export const TEST_EXPERIENCE_VIVI_PATH = windowsPath(
  TEST_WINDOWS_TEST_DIR,
  "experience.vivi",
);
export const TEST_RESUME_VIVI_PATH = windowsPath(TEST_WINDOWS_TEST_DIR, "resume.vivi");
export const TEST_GENERIC_TEST_VIVB_PATH = windowsPath(
  TEST_WINDOWS_TEST_DIR,
  "test.vivb",
);
export const TEST_SAVED_VIVB_PATH = windowsPath("C:", "saved.vivb");
export const TEST_EXISTING_VIVB_PATH = windowsPath("C:", "existing.vivb");
export const TEST_OUT_VIVID_PATH = windowsPath("C:", "out.vivid");
export const TEST_GENERIC_TEST_VIVID_PATH = windowsPath(
  TEST_WINDOWS_TEST_DIR,
  "test.vivid",
);
