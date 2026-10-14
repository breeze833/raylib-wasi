#include "raylib.h"
#include "rlgl.h"
#include "gl_wasi.h"
#include "utils.h"

#include <time.h>
#include <string.h>
#include <stdlib.h>

#define MAX_KEYBOARD_KEYS          512
#define MAX_MOUSE_BUTTONS            8
#define MAX_GAMEPADS                 4
#define MAX_GAMEPAD_AXIS             8
#define MAX_GAMEPAD_BUTTONS         32
#define MAX_TOUCH_POINTS             8
#define MAX_KEY_PRESSED_QUEUE       16
#define MAX_CHAR_PRESSED_QUEUE      16

typedef struct { int x; int y; } Point;
typedef struct { unsigned int width; unsigned int height; } Size;

// Mirror internal CoreData structure from rcore.c
typedef struct CoreData {
    struct {
        const char *title;
        unsigned int flags;
        bool ready;
        bool fullscreen;
        bool shouldClose;
        bool resizedLastFrame;
        bool eventWaiting;
        bool usingFbo;

        Point position;
        Point previousPosition;
        Size display;
        Size screen;
        Size previousScreen;
        Size currentFbo;
        Size render;
        Point renderOffset;
        Size screenMin;
        Size screenMax;
        Matrix screenScale;

        char **dropFilepaths;
        unsigned int dropFileCount;

    } Window;
    struct {
        const char *basePath;

    } Storage;
    struct {
        struct {
            int exitKey;
            char currentKeyState[MAX_KEYBOARD_KEYS];
            char previousKeyState[MAX_KEYBOARD_KEYS];
            char keyRepeatInFrame[MAX_KEYBOARD_KEYS];
            int keyPressedQueue[MAX_KEY_PRESSED_QUEUE];
            int keyPressedQueueCount;
            int charPressedQueue[MAX_CHAR_PRESSED_QUEUE];
            int charPressedQueueCount;

        } Keyboard;
        struct {
            Vector2 offset;
            Vector2 scale;
            Vector2 currentPosition;
            Vector2 previousPosition;

            int cursor;
            bool cursorHidden;
            bool cursorOnScreen;

            char currentButtonState[MAX_MOUSE_BUTTONS];
            char previousButtonState[MAX_MOUSE_BUTTONS];
            Vector2 currentWheelMove;
            Vector2 previousWheelMove;

        } Mouse;
        struct {
            int pointCount;
            int pointId[MAX_TOUCH_POINTS];
            Vector2 position[MAX_TOUCH_POINTS];
            char currentTouchState[MAX_TOUCH_POINTS];
            char previousTouchState[MAX_TOUCH_POINTS];

        } Touch;
        struct {
            int lastButtonPressed;
            int axisCount[MAX_GAMEPADS];
            bool ready[MAX_GAMEPADS];
            char name[MAX_GAMEPADS][64];
            char currentButtonState[MAX_GAMEPADS][MAX_GAMEPAD_BUTTONS];
            char previousButtonState[MAX_GAMEPADS][MAX_GAMEPAD_BUTTONS];
            float axisState[MAX_GAMEPADS][MAX_GAMEPAD_AXIS];

        } Gamepad;
    } Input;
    struct {
        double current;
        double previous;
        double update;
        double draw;
        double frame;
        double target;
        unsigned long long int base;
        unsigned int frameCounter;

    } Time;
} CoreData;

extern CoreData CORE;

// Shared input state structure synchronized with raylib-host.js
typedef struct WasiInputState {
    int windowWidth;
    int windowHeight;
    int renderWidth;
    int renderHeight;
    float dpiScale;
    int shouldClose;

    float mouseX;
    float mouseY;
    float mouseWheelX;
    float mouseWheelY;
    unsigned int mouseButtons;

    unsigned int keysDown[16];

    int keyPressedQueueCount;
    int keyPressedQueue[32];
    int charPressedQueueCount;
    int charPressedQueue[32];
} WasiInputState;

static WasiInputState s_wasi_input = { 0 };

#define RAYLIB_HOST_IMPORT(name) __attribute__((import_module("raylib"), import_name(#name)))

RAYLIB_HOST_IMPORT(raylib_host_init_window)
int raylib_host_init_window(int width, int height, const char *title);

RAYLIB_HOST_IMPORT(raylib_host_close_window)
void raylib_host_close_window(void);

RAYLIB_HOST_IMPORT(raylib_host_swap_buffers)
void raylib_host_swap_buffers(void);

RAYLIB_HOST_IMPORT(raylib_host_poll_input)
void raylib_host_poll_input(void *state_ptr);

RAYLIB_HOST_IMPORT(raylib_host_sleep)
void raylib_host_sleep(double ms);

RAYLIB_HOST_IMPORT(raylib_host_set_title)
void raylib_host_set_title(const char *title);

RAYLIB_HOST_IMPORT(raylib_host_open_url)
void raylib_host_open_url(const char *url);

static void InitTimer(void)
{
    struct timespec ts = { 0 };
    clock_gettime(CLOCK_MONOTONIC, &ts);
    CORE.Time.base = (unsigned long long int)ts.tv_sec * 1000000000ULL + (unsigned long long int)ts.tv_nsec;
    CORE.Time.previous = GetTime();
}

int InitPlatform(void)
{
    s_wasi_input.windowWidth = (int)CORE.Window.screen.width;
    s_wasi_input.windowHeight = (int)CORE.Window.screen.height;
    s_wasi_input.dpiScale = 1.0f;

    raylib_host_init_window((int)CORE.Window.screen.width, (int)CORE.Window.screen.height, CORE.Window.title);
    raylib_host_poll_input(&s_wasi_input);

    if (s_wasi_input.windowWidth > 0 && s_wasi_input.windowHeight > 0)
    {
        CORE.Window.screen.width = (unsigned int)s_wasi_input.windowWidth;
        CORE.Window.screen.height = (unsigned int)s_wasi_input.windowHeight;
    }

    CORE.Window.render.width = (s_wasi_input.renderWidth > 0) ? (unsigned int)s_wasi_input.renderWidth : CORE.Window.screen.width;
    CORE.Window.render.height = (s_wasi_input.renderHeight > 0) ? (unsigned int)s_wasi_input.renderHeight : CORE.Window.screen.height;
    CORE.Window.currentFbo.width = CORE.Window.render.width;
    CORE.Window.currentFbo.height = CORE.Window.render.height;
    CORE.Window.display.width = CORE.Window.screen.width;
    CORE.Window.display.height = CORE.Window.screen.height;

    CORE.Window.ready = true;
    CORE.Window.shouldClose = false;

    rlLoadExtensions(NULL);
    InitTimer();

    CORE.Storage.basePath = GetWorkingDirectory();

    TRACELOG(LOG_INFO, "PLATFORM: WASI: Platform initialized successfully");
    return 0;
}

void ClosePlatform(void)
{
    raylib_host_close_window();
    CORE.Window.ready = false;
}

void SwapScreenBuffer(void)
{
    glFlush();
    raylib_host_swap_buffers();
}

void PollInputEvents(void)
{
#if defined(SUPPORT_GESTURES_SYSTEM)
    UpdateGestures();
#endif

    CORE.Input.Keyboard.keyPressedQueueCount = 0;
    CORE.Input.Keyboard.charPressedQueueCount = 0;

    for (int i = 0; i < MAX_KEYBOARD_KEYS; i++)
    {
        CORE.Input.Keyboard.previousKeyState[i] = CORE.Input.Keyboard.currentKeyState[i];
        CORE.Input.Keyboard.keyRepeatInFrame[i] = 0;
    }

    for (int i = 0; i < MAX_MOUSE_BUTTONS; i++)
    {
        CORE.Input.Mouse.previousButtonState[i] = CORE.Input.Mouse.currentButtonState[i];
    }
    CORE.Input.Mouse.previousPosition = CORE.Input.Mouse.currentPosition;
    CORE.Input.Mouse.previousWheelMove = CORE.Input.Mouse.currentWheelMove;

    raylib_host_poll_input(&s_wasi_input);

    if (s_wasi_input.shouldClose)
    {
        CORE.Window.shouldClose = true;
    }

    if (s_wasi_input.windowWidth > 0 && s_wasi_input.windowHeight > 0 &&
        ((unsigned int)s_wasi_input.windowWidth != CORE.Window.screen.width ||
         (unsigned int)s_wasi_input.windowHeight != CORE.Window.screen.height))
    {
        CORE.Window.screen.width = (unsigned int)s_wasi_input.windowWidth;
        CORE.Window.screen.height = (unsigned int)s_wasi_input.windowHeight;
        CORE.Window.render.width = (s_wasi_input.renderWidth > 0) ? (unsigned int)s_wasi_input.renderWidth : CORE.Window.screen.width;
        CORE.Window.render.height = (s_wasi_input.renderHeight > 0) ? (unsigned int)s_wasi_input.renderHeight : CORE.Window.screen.height;
        CORE.Window.currentFbo.width = CORE.Window.render.width;
        CORE.Window.currentFbo.height = CORE.Window.render.height;
        CORE.Window.resizedLastFrame = true;
    }
    else
    {
        CORE.Window.resizedLastFrame = false;
    }

    CORE.Input.Mouse.currentPosition = (Vector2){ s_wasi_input.mouseX, s_wasi_input.mouseY };
    CORE.Input.Mouse.currentWheelMove = (Vector2){ s_wasi_input.mouseWheelX, s_wasi_input.mouseWheelY };
    for (int i = 0; i < 3 && i < MAX_MOUSE_BUTTONS; i++)
    {
        CORE.Input.Mouse.currentButtonState[i] = (s_wasi_input.mouseButtons & (1U << i)) ? 1 : 0;
    }

    for (int k = 0; k < MAX_KEYBOARD_KEYS; k++)
    {
        int word = k / 32;
        int bit = k % 32;
        CORE.Input.Keyboard.currentKeyState[k] = (s_wasi_input.keysDown[word] & (1U << bit)) ? 1 : 0;
    }

    int k_count = s_wasi_input.keyPressedQueueCount;
    if (k_count > MAX_KEY_PRESSED_QUEUE) k_count = MAX_KEY_PRESSED_QUEUE;
    CORE.Input.Keyboard.keyPressedQueueCount = k_count;
    for (int i = 0; i < k_count; i++)
    {
        CORE.Input.Keyboard.keyPressedQueue[i] = s_wasi_input.keyPressedQueue[i];
    }

    int c_count = s_wasi_input.charPressedQueueCount;
    if (c_count > MAX_CHAR_PRESSED_QUEUE) c_count = MAX_CHAR_PRESSED_QUEUE;
    CORE.Input.Keyboard.charPressedQueueCount = c_count;
    for (int i = 0; i < c_count; i++)
    {
        CORE.Input.Keyboard.charPressedQueue[i] = s_wasi_input.charPressedQueue[i];
    }

    if (CORE.Input.Keyboard.exitKey > 0 &&
        CORE.Input.Keyboard.currentKeyState[CORE.Input.Keyboard.exitKey] &&
        !CORE.Input.Keyboard.previousKeyState[CORE.Input.Keyboard.exitKey])
    {
        CORE.Window.shouldClose = true;
    }
}

// Active WaitTime implementation (rcore.c compiled with -DWaitTime=Raylib_Internal_WaitTime)
#undef WaitTime
void WaitTime(double seconds)
{
    if (seconds <= 0.0) return;
    raylib_host_sleep(seconds * 1000.0);
}

double GetTime(void)
{
    struct timespec ts = { 0 };
    clock_gettime(CLOCK_MONOTONIC, &ts);
    unsigned long long int nanoSeconds = (unsigned long long int)ts.tv_sec * 1000000000ULL + (unsigned long long int)ts.tv_nsec;
    return (double)(nanoSeconds - CORE.Time.base) * 1e-9;
}

bool WindowShouldClose(void)
{
    if (CORE.Window.ready) return CORE.Window.shouldClose;
    return true;
}

void ToggleFullscreen(void) { TRACELOG(LOG_WARNING, "ToggleFullscreen() not available on target platform"); }
void ToggleBorderlessWindowed(void) { TRACELOG(LOG_WARNING, "ToggleBorderlessWindowed() not available on target platform"); }
void MaximizeWindow(void) { TRACELOG(LOG_WARNING, "MaximizeWindow() not available on target platform"); }
void MinimizeWindow(void) { TRACELOG(LOG_WARNING, "MinimizeWindow() not available on target platform"); }
void RestoreWindow(void) { TRACELOG(LOG_WARNING, "RestoreWindow() not available on target platform"); }
void SetWindowState(unsigned int flags) { (void)flags; TRACELOG(LOG_WARNING, "SetWindowState() not available on target platform"); }
void ClearWindowState(unsigned int flags) { (void)flags; TRACELOG(LOG_WARNING, "ClearWindowState() not available on target platform"); }
void SetWindowIcon(Image image) { (void)image; TRACELOG(LOG_WARNING, "SetWindowIcon() not available on target platform"); }
void SetWindowIcons(Image *images, int count) { (void)images; (void)count; TRACELOG(LOG_WARNING, "SetWindowIcons() not available on target platform"); }

void SetWindowTitle(const char *title)
{
    CORE.Window.title = title;
    if (title) raylib_host_set_title(title);
}

void SetWindowPosition(int x, int y) { (void)x; (void)y; TRACELOG(LOG_WARNING, "SetWindowPosition() not available on target platform"); }
void SetWindowMonitor(int monitor) { (void)monitor; TRACELOG(LOG_WARNING, "SetWindowMonitor() not available on target platform"); }

void SetWindowMinSize(int width, int height)
{
    CORE.Window.screenMin.width = (unsigned int)width;
    CORE.Window.screenMin.height = (unsigned int)height;
}

void SetWindowMaxSize(int width, int height)
{
    CORE.Window.screenMax.width = (unsigned int)width;
    CORE.Window.screenMax.height = (unsigned int)height;
}

void SetWindowSize(int width, int height) { (void)width; (void)height; TRACELOG(LOG_WARNING, "SetWindowSize() not available on target platform"); }
void SetWindowOpacity(float opacity) { (void)opacity; TRACELOG(LOG_WARNING, "SetWindowOpacity() not available on target platform"); }
void SetWindowFocused(void) { TRACELOG(LOG_WARNING, "SetWindowFocused() not available on target platform"); }
void *GetWindowHandle(void) { return NULL; }
Vector2 GetWindowPosition(void) { return (Vector2){ 0.0f, 0.0f }; }

Vector2 GetWindowScaleDPI(void)
{
    float s = (s_wasi_input.dpiScale > 0.0f) ? s_wasi_input.dpiScale : 1.0f;
    return (Vector2){ s, s };
}

int GetMonitorCount(void) { return 1; }
int GetCurrentMonitor(void) { return 0; }
Vector2 GetMonitorPosition(int monitor) { (void)monitor; return (Vector2){ 0.0f, 0.0f }; }
int GetMonitorWidth(int monitor) { (void)monitor; return (int)CORE.Window.screen.width; }
int GetMonitorHeight(int monitor) { (void)monitor; return (int)CORE.Window.screen.height; }
int GetMonitorPhysicalWidth(int monitor) { (void)monitor; return (int)CORE.Window.screen.width; }
int GetMonitorPhysicalHeight(int monitor) { (void)monitor; return (int)CORE.Window.screen.height; }
int GetMonitorRefreshRate(int monitor) { (void)monitor; return 60; }
const char *GetMonitorName(int monitor) { (void)monitor; return "WASI Canvas"; }

void SetClipboardText(const char *text) { (void)text; TRACELOG(LOG_WARNING, "SetClipboardText() not implemented on target platform"); }
const char *GetClipboardText(void) { return NULL; }

void ShowCursor(void) { CORE.Input.Mouse.cursorHidden = false; }
void HideCursor(void) { CORE.Input.Mouse.cursorHidden = true; }
void EnableCursor(void) { CORE.Input.Mouse.cursorHidden = false; }
void DisableCursor(void) { CORE.Input.Mouse.cursorHidden = true; }

int SetGamepadMappings(const char *mappings) { (void)mappings; return 0; }

void SetMousePosition(int x, int y)
{
    CORE.Input.Mouse.currentPosition = (Vector2){ (float)x, (float)y };
    CORE.Input.Mouse.previousPosition = CORE.Input.Mouse.currentPosition;
}

void SetMouseCursor(int cursor)
{
    CORE.Input.Mouse.cursor = cursor;
}

const char *GetKeyName(int key)
{
    (void)key;
    return "";
}

void OpenURL(const char *url)
{
    if (url) raylib_host_open_url(url);
}
