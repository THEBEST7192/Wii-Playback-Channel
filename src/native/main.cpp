#include <Windows.h>
#include <cstring>
#include "WiimoteSync.h"

#if defined(WIIMOTE_SYNC_DLL)
extern "C" __declspec(dllexport) void CALLBACK SyncWiimote(HWND, HINSTANCE, LPSTR, int) {
    const DWORD result = SyncOneWiimote(WiimotePinMode::Host);
    ExitProcess(result == ERROR_SUCCESS ? 0 : result);
}
#else
int main(int argc, char** argv) {
    WiimotePinMode mode = WiimotePinMode::Host;
    if (argc > 1) {
        if (strcmp(argv[1], "guest") == 0) mode = WiimotePinMode::Device;
        else if (strcmp(argv[1], "bond") == 0) mode = WiimotePinMode::Host;
    }
    const DWORD result = SyncOneWiimote(mode);
    return result == ERROR_SUCCESS ? 0 : static_cast<int>(result);
}
#endif
