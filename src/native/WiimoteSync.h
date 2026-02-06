#ifndef WIIMOTE_SYNC_H
#define WIIMOTE_SYNC_H

#include <Windows.h>

enum class WiimotePinMode {
    Host,
    Device
};

DWORD SyncOneWiimote(WiimotePinMode mode);
DWORD SyncOneWiimote();

#endif // WIIMOTE_SYNC_H
