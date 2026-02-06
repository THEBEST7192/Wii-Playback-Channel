#include <Windows.h>
#include "WiimoteSync.h"
#include <BluetoothAPIs.h>
#include <hidclass.h>
#include <bthsdpdef.h>
#include <iostream>
#include <string>
#include <vector>

#pragma comment(lib, "Bthprops.lib")

static bool IsWiimoteName(const std::wstring& name) {
    return name.find(L"RVL-CNT") != std::wstring::npos || name.find(L"RVL-WBC") != std::wstring::npos;
}

static bool AuthenticateWiimote(HANDLE hRadio, const BLUETOOTH_RADIO_INFO& radioInfo, BLUETOOTH_DEVICE_INFO* btdi, WiimotePinMode mode) {
    const BLUETOOTH_ADDRESS& addr = (mode == WiimotePinMode::Host) ? radioInfo.address : btdi->Address;
    WCHAR passKey[6];
    for (int i = 0; i < 6; i++) {
        passKey[i] = static_cast<WCHAR>(addr.rgBytes[i]);
    }
    const DWORD authResult = BluetoothAuthenticateDevice(NULL, hRadio, btdi, passKey, 6);
    std::cout << "BluetoothAuthenticateDevice result: " << authResult << std::endl;
    if (authResult != ERROR_SUCCESS) {
        return false;
    }
    DWORD pcServices = 0;
    const DWORD servicesResult = BluetoothEnumerateInstalledServices(hRadio, btdi, &pcServices, NULL);
    std::cout << "BluetoothEnumerateInstalledServices result: " << servicesResult << std::endl;
    return true;
}

/**
 * SyncOneWiimote - Finds and pairs a single Nintendo Wiimote in sync mode.
 * 
 * Returns: ERROR_SUCCESS on success, or a Windows error code on failure.
 */
DWORD SyncOneWiimote(WiimotePinMode mode) {
    HBLUETOOTH_RADIO_FIND hFindRadio = NULL;
    HANDLE hRadio = NULL;
    BLUETOOTH_FIND_RADIO_PARAMS radioParams = { sizeof(BLUETOOTH_FIND_RADIO_PARAMS) };
    BLUETOOTH_RADIO_INFO radioInfo = { sizeof(BLUETOOTH_RADIO_INFO) };
    DWORD result = ERROR_SUCCESS;
    std::cout << "Sync mode: " << (mode == WiimotePinMode::Device ? "guest" : "bond") << std::endl;

    // Step A: Get the Host Radio and MAC Address
    hFindRadio = BluetoothFindFirstRadio(&radioParams, &hRadio);
    if (hFindRadio == NULL) {
        std::cerr << "No Bluetooth radio found." << std::endl;
        return GetLastError();
    }
    BluetoothFindRadioClose(hFindRadio);

    result = BluetoothGetRadioInfo(hRadio, &radioInfo);
    if (result != ERROR_SUCCESS) {
        std::cerr << "Failed to get radio info. Error: " << result << std::endl;
        CloseHandle(hRadio);
        return result;
    }

    // The PIN is the 6-byte Bluetooth MAC address of the Host PC's Bluetooth Radio.
    // The MAC address must be passed as a raw byte array in reverse order.
    // radioInfo.address.rgBytes already contains the MAC address in reverse order
    // (least significant byte first), which is what the Wiimote expects.
    unsigned char hostKey[6];
    memcpy(hostKey, radioInfo.address.rgBytes, 6);

    std::cout << "Host Radio found. Address: ";
    for (int i = 5; i >= 0; i--) {
        printf("%02X%s", radioInfo.address.rgBytes[i], (i == 0 ? "" : ":"));
    }
    std::cout << std::endl;

    BLUETOOTH_DEVICE_SEARCH_PARAMS searchParams = { sizeof(BLUETOOTH_DEVICE_SEARCH_PARAMS) };
    searchParams.fReturnAuthenticated = TRUE;
    searchParams.fReturnUnknown = TRUE;
    searchParams.fReturnRemembered = TRUE;
    searchParams.fReturnConnected = TRUE;
    searchParams.fIssueInquiry = FALSE;
    searchParams.cTimeoutMultiplier = 0;
    searchParams.hRadio = hRadio;

    BLUETOOTH_DEVICE_INFO deviceInfo = { sizeof(BLUETOOTH_DEVICE_INFO) };
    HBLUETOOTH_DEVICE_FIND hFindDevice = BluetoothFindFirstDevice(&searchParams, &deviceInfo);
    if (hFindDevice != NULL) {
        do {
            std::wstring name(deviceInfo.szName);
            if (name.find(L"RVL-CNT") != std::wstring::npos || name.find(L"RVL-WBC") != std::wstring::npos) {
                if (deviceInfo.fRemembered && !deviceInfo.fConnected) {
                    std::cout << "Removing remembered Wiimote (not connected)..." << std::endl;
                    const DWORD removeResult = BluetoothRemoveDevice(&deviceInfo.Address);
                    std::cout << "Remove result: " << removeResult << std::endl;
                }
            }
        } while (BluetoothFindNextDevice(hFindDevice, &deviceInfo));
        BluetoothFindDeviceClose(hFindDevice);
    }

    bool found = false;
    int seen = 0;
    for (int pass = 0; pass < 3 && !found; pass++) {
        std::cout << "Discovery pass: " << (pass + 1) << std::endl;
        searchParams.fIssueInquiry = TRUE;
        searchParams.cTimeoutMultiplier = 3;
        BLUETOOTH_DEVICE_INFO passInfo = { sizeof(BLUETOOTH_DEVICE_INFO) };
        hFindDevice = BluetoothFindFirstDevice(&searchParams, &passInfo);
        if (hFindDevice == NULL) {
            std::cerr << "No Bluetooth devices found. Error: " << GetLastError() << std::endl;
            continue;
        }
        do {
            seen++;
            std::wstring name(passInfo.szName);
            if (IsWiimoteName(name)) {
                std::wcout << L"Found Wiimote: " << passInfo.szName << std::endl;
                std::cout << "Device address: ";
                for (int i = 5; i >= 0; i--) {
                    printf("%02X%s", passInfo.Address.rgBytes[i], (i == 0 ? "" : ":"));
                }
                std::cout << std::endl;
                std::cout << "Flags - remembered: " << passInfo.fRemembered
                          << " authenticated: " << passInfo.fAuthenticated
                          << " connected: " << passInfo.fConnected << std::endl;
                if (passInfo.fConnected) {
                    std::cout << "Wiimote already connected. Skipping." << std::endl;
                    continue;
                }
                if (!passInfo.fAuthenticated || (passInfo.fAuthenticated && !passInfo.fConnected)) {
                    std::cout << "Authenticating..." << std::endl;
                    if (!AuthenticateWiimote(hRadio, radioInfo, &passInfo, mode)) {
                        result = ERROR_GEN_FAILURE;
                    }
                }
                std::cout << "Enabling HID service..." << std::endl;
                const DWORD serviceResult = BluetoothSetServiceState(hRadio, &passInfo, &HumanInterfaceDeviceServiceClass_UUID, BLUETOOTH_SERVICE_ENABLE);
                std::cout << "BluetoothSetServiceState result: " << serviceResult << std::endl;
                if (serviceResult == ERROR_INVALID_PARAMETER) {
                    std::cout << "HID enable failed with invalid parameter. Removing device to retry." << std::endl;
                    const DWORD removeResult = BluetoothRemoveDevice(&passInfo.Address);
                    std::cout << "Remove result: " << removeResult << std::endl;
                }
                BLUETOOTH_DEVICE_INFO refreshed = { sizeof(BLUETOOTH_DEVICE_INFO) };
                refreshed.Address = passInfo.Address;
                const DWORD refreshResult = BluetoothGetDeviceInfo(hRadio, &refreshed);
                std::cout << "BluetoothGetDeviceInfo result: " << refreshResult << std::endl;
                if (refreshResult == ERROR_SUCCESS) {
                    std::cout << "Flags after service - remembered: " << refreshed.fRemembered
                              << " authenticated: " << refreshed.fAuthenticated
                              << " connected: " << refreshed.fConnected << std::endl;
                }
                if (serviceResult == ERROR_SUCCESS) {
                    found = true;
                    break;
                }
            }
            else {
                std::wcout << L"Ignored device: " << name << std::endl;
            }
        } while (BluetoothFindNextDevice(hFindDevice, &passInfo));
        BluetoothFindDeviceClose(hFindDevice);
        if (!found) Sleep(500);
    }
    std::cout << "Discovery complete. Devices seen: " << seen << std::endl;

    BluetoothFindDeviceClose(hFindDevice);
    CloseHandle(hRadio);

    return found ? ERROR_SUCCESS : (result == ERROR_SUCCESS ? ERROR_NOT_FOUND : result);
}

DWORD SyncOneWiimote() {
    return SyncOneWiimote(WiimotePinMode::Host);
}
