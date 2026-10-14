#include "raylib.h"

int main(void)
{
    const int screenWidth = 800;
    const int screenHeight = 450;

    InitWindow(screenWidth, screenHeight, "raylib [core] example - keyboard input (wasm32-wasi)");
    SetTargetFPS(60);

    Vector2 ballPosition = { (float)screenWidth / 2, (float)screenHeight / 2 };

    while (!WindowShouldClose())
    {
        if (IsKeyDown(KEY_RIGHT) || IsKeyDown(KEY_D)) ballPosition.x += 4.0f;
        if (IsKeyDown(KEY_LEFT) || IsKeyDown(KEY_A))  ballPosition.x -= 4.0f;
        if (IsKeyDown(KEY_UP) || IsKeyDown(KEY_W))    ballPosition.y -= 4.0f;
        if (IsKeyDown(KEY_DOWN) || IsKeyDown(KEY_S))  ballPosition.y += 4.0f;

        // Mouse click teleports ball
        if (IsMouseButtonDown(MOUSE_BUTTON_LEFT))
        {
            ballPosition = GetMousePosition();
        }

        BeginDrawing();
            ClearBackground(RAYWHITE);

            DrawText("Move the ball with ARROW KEYS or WASD (or click with mouse)", 10, 10, 20, DARKGRAY);
            DrawCircleV(ballPosition, 40, MAROON);
        EndDrawing();
    }

    CloseWindow();
    return 0;
}
