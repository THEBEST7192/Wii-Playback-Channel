cmake_minimum_required(VERSION 3.10)
project(WiimoteSync)

set(CMAKE_CXX_STANDARD 17)

add_library(WiimoteSync SHARED src/native/main.cpp src/native/WiimoteSync.cpp)
target_compile_definitions(WiimoteSync PRIVATE WIIMOTE_SYNC_DLL)

add_executable(WiimoteSyncCli src/native/main.cpp src/native/WiimoteSync.cpp)
set_target_properties(WiimoteSyncCli PROPERTIES OUTPUT_NAME "WiimoteSync")

# Link against the Bluetooth API library
target_link_libraries(WiimoteSync Bthprops.lib)
target_link_libraries(WiimoteSyncCli Bthprops.lib)

if (MINGW)
  target_link_options(WiimoteSync PRIVATE -static-libgcc -static-libstdc++ -Wl,--kill-at)
  target_link_options(WiimoteSyncCli PRIVATE -static-libgcc -static-libstdc++ -Wl,--kill-at)
endif()
