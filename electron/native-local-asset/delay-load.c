/* Apache-2.0. Only the fixed Electron executable supplies delayed Node-API. */
#include <windows.h>
#include <delayimp.h>
#include <string.h>

static FARPROC WINAPI local_asset_delay_hook(unsigned event, PDelayLoadInfo info) {
  if (event == dliNotePreLoadLibrary && _stricmp(info->szDll, "node.exe") == 0)
    return (FARPROC)GetModuleHandleW(NULL);
  return NULL;
}
const PfnDliHook __pfnDliNotifyHook2 = local_asset_delay_hook;
