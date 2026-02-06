cmake -S . -B build -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build

mkdir -p bin/Release
cp build/WiimoteSync.exe bin/Release/WiimoteSync.exe
cp build/libWiimoteSync.dll bin/Release/WiimoteSync.dll
cp /mingw64/bin/libstdc++-6.dll bin/Release/
cp /mingw64/bin/libgcc_s_seh-1.dll bin/Release/
cp /mingw64/bin/libwinpthread-1.dll bin/Release/