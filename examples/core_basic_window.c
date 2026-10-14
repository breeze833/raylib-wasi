#include "raylib.h"

int main(void)
{
    const int screenWidth = 800;
    const int screenHeight = 450;

    InitWindow(screenWidth, screenHeight, "raylib [core] example - basic window (wasm32-wasi)");
    SetTargetFPS(60);

    while (!WindowShouldClose())
    {
        BeginDrawing();
            ClearBackground(RAYWHITE);
            DrawText("Congrats! You created your first window on wasm32-wasi!", 120, 200, 20, DARKGRAY);
            DrawText("Running 60 FPS in Web Worker via SharedArrayBuffer & Atomics.wait", 120, 240, 16, GRAY);
        EndDrawing();
    }

    CloseWindow();
    return 0;
}
