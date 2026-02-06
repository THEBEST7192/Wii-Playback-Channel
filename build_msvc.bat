@echo off
setlocal enabledelayedexpansion

:: Try to find vcvarsall.bat dynamically
set "VCVARS="

:: Check if already in environment
if defined VCINSTALLDIR (
    if exist "%VCINSTALLDIR%Auxiliary\Build\vcvarsall.bat" (
        set "VCVARS=%VCINSTALLDIR%Auxiliary\Build\vcvarsall.bat"
    )
)

:: Search common locations
if not defined VCVARS (
    for %%d in (C D E F) do (
        if exist "%%d:\VisualStudio\VC\Auxiliary\Build\vcvarsall.bat" (
            set "VCVARS=%%d:\VisualStudio\VC\Auxiliary\Build\vcvarsall.bat"
            goto :found
        )
        for %%v in (2022 2019 2017) do (
            for %%e in (Community Professional Enterprise) do (
                if exist "%%d:\Program Files\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" (
                    set "VCVARS=%%d:\Program Files\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat"
                    goto :found
                )
                if exist "%%d:\Program Files (x86)\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat" (
                    set "VCVARS=%%d:\Program Files (x86)\Microsoft Visual Studio\%%v\%%e\VC\Auxiliary\Build\vcvarsall.bat"
                    goto :found
                )
            )
        )
    )
)

:found
if not defined VCVARS (
    echo Error: vcvarsall.bat not found.
    echo Please set the path to vcvarsall.bat or install Visual Studio with C++ support.
    exit /b 1
)

echo Using: %VCVARS%
call "%VCVARS%" x64

:: Build with CMake
if not exist build_msvc mkdir build_msvc
cd build_msvc

:: Use -j for parallel build and --log-level=ERROR to reduce noise
cmake .. -A x64 --log-level=ERROR
cmake --build . --config Release --parallel %NUMBER_OF_PROCESSORS%

if %ERRORLEVEL% neq 0 (
    echo Build failed!
    exit /b %ERRORLEVEL%
)

cd ..

:: Copy results to bin/Release
if not exist bin\Release mkdir bin\Release
:: Use /d to only copy if source is newer
xcopy /y /d build_msvc\Release\WiimoteSync.exe bin\Release\
xcopy /y /d build_msvc\Release\WiimoteSync.dll bin\Release\

echo Build completed successfully.
