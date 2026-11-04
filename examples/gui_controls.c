#include "raylib.h"

#define RAYGUI_IMPLEMENTATION
#include "raygui.h"

int main(void)
{
    const int screenWidth = 800;
    const int screenHeight = 450;

    InitWindow(screenWidth, screenHeight, "raylib [gui] example - immediate-mode controls (raygui.h)");
    SetTargetFPS(60);

    // GUI state variables
    int clickCount = 0;
    bool showBox = true;
    float circleRadius = 40.0f;
    int spinnerValue = 5;
    bool spinnerEditMode = false;
    Color shapeColor = MAROON;

    while (!WindowShouldClose())
    {
        BeginDrawing();
            ClearBackground(GetColor(GuiGetStyle(DEFAULT, BACKGROUND_COLOR)));

            // Header
            DrawText("raylib-wasi: Immediate-Mode GUI with raygui.h", 20, 20, 20, DARKBLUE);
            DrawText("Self-contained header-only GUI widgets running on wasm32-wasi", 20, 48, 14, GRAY);

            // Container Panel
            GuiGroupBox((Rectangle){ 20, 80, 420, 340 }, "UI Controls");

            // 1. Button
            if (GuiButton((Rectangle){ 40, 110, 140, 32 }, "#191#Click Me!"))
            {
                clickCount++;
            }
            GuiLabel((Rectangle){ 200, 110, 220, 32 }, TextFormat("Button clicks: %d", clickCount));

            // 2. CheckBox
            GuiCheckBox((Rectangle){ 40, 160, 24, 24 }, "Show Animated Element", &showBox);

            // 3. Slider
            GuiLabel((Rectangle){ 40, 205, 120, 24 }, "Shape Radius:");
            GuiSlider((Rectangle){ 160, 205, 200, 24 }, "10", "100", &circleRadius, 10.0f, 100.0f);
            GuiLabel((Rectangle){ 370, 205, 50, 24 }, TextFormat("%.0f px", circleRadius));

            // 4. Spinner
            GuiLabel((Rectangle){ 40, 255, 120, 24 }, "Step Count:");
            if (GuiSpinner((Rectangle){ 160, 255, 120, 24 }, NULL, &spinnerValue, 1, 20, spinnerEditMode))
            {
                spinnerEditMode = !spinnerEditMode;
            }

            // 5. Color toggles
            GuiLabel((Rectangle){ 40, 305, 120, 24 }, "Shape Theme:");
            if (GuiButton((Rectangle){ 160, 305, 70, 28 }, "Red")) shapeColor = MAROON;
            if (GuiButton((Rectangle){ 240, 305, 70, 28 }, "Blue")) shapeColor = DARKBLUE;
            if (GuiButton((Rectangle){ 320, 305, 70, 28 }, "Green")) shapeColor = DARKGREEN;

            // Interactive Preview Canvas on the right side
            GuiGroupBox((Rectangle){ 460, 80, 320, 340 }, "Live Preview");
            if (showBox)
            {
                DrawCircle(620, 240, circleRadius, shapeColor);
                DrawCircleLines(620, 240, circleRadius + 4, Fade(shapeColor, 0.4f));

                for (int i = 0; i < spinnerValue; i++)
                {
                    float angle = (float)i * (2.0f * 3.14159265f / (float)spinnerValue) + (float)GetTime();
                    float ox = 620 + (circleRadius + 20) * cosf(angle);
                    float oy = 240 + (circleRadius + 20) * sinf(angle);
                    DrawCircle((int)ox, (int)oy, 5, DARKGRAY);
                }
            }
            else
            {
                DrawText("Element hidden (toggle checkbox)", 480, 235, 14, GRAY);
            }

            // Status bar at bottom
            DrawText("raygui v4.5 immediate mode - zero external linker flags", 20, 428, 12, DARKGRAY);
        EndDrawing();
    }

    CloseWindow();
    return 0;
}
